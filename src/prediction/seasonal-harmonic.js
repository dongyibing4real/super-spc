import { registerProvider, MIN_POINTS, EMPTY_PREDICTION } from "./provider.js";
import { computeDriftScore, estimateOOC } from "./drift-score.js";

function sampleStdDev(values) {
  if (!values || values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function median(values) {
  if (!values.length) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function solveLinearSystem(matrix, vector) {
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let pivot = 0; pivot < size; pivot++) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < size; row++) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[maxRow][pivot])) {
        maxRow = row;
      }
    }
    if (Math.abs(augmented[maxRow][pivot]) < 1e-10) {
      return null;
    }
    if (maxRow !== pivot) {
      [augmented[pivot], augmented[maxRow]] = [augmented[maxRow], augmented[pivot]];
    }

    const divisor = augmented[pivot][pivot];
    for (let col = pivot; col <= size; col++) {
      augmented[pivot][col] /= divisor;
    }

    for (let row = 0; row < size; row++) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      for (let col = pivot; col <= size; col++) {
        augmented[row][col] -= factor * augmented[pivot][col];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function fitSeasonalModel(xs, ys, period) {
  const n = xs.length;
  const omega = (2 * Math.PI) / period;
  const featureCount = 5;
  const xtx = Array.from({ length: featureCount }, () => Array(featureCount).fill(0));
  const xty = Array(featureCount).fill(0);

  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const features = [
      1,
      x,
      x * x,
      Math.sin(omega * x),
      Math.cos(omega * x),
    ];
    for (let r = 0; r < featureCount; r++) {
      xty[r] += features[r] * ys[i];
      for (let c = 0; c < featureCount; c++) {
        xtx[r][c] += features[r] * features[c];
      }
    }
  }

  const coefficients = solveLinearSystem(xtx, xty);
  if (!coefficients) return null;

  let sse = 0;
  for (let i = 0; i < n; i++) {
    const fitted = evaluateSeasonal(coefficients, xs[i], period);
    const residual = ys[i] - fitted;
    sse += residual * residual;
  }

  const residualSE = n > featureCount ? Math.sqrt(sse / (n - featureCount)) : 0;
  const amplitude = Math.sqrt(coefficients[3] ** 2 + coefficients[4] ** 2);
  return { coefficients, residualSE, amplitude, period, sse };
}

function evaluateSeasonal(coefficients, x, period) {
  const omega = (2 * Math.PI) / period;
  return coefficients[0]
    + coefficients[1] * x
    + coefficients[2] * x * x
    + coefficients[3] * Math.sin(omega * x)
    + coefficients[4] * Math.cos(omega * x);
}

function estimateDominantPeriod(xs, ys) {
  const n = xs.length;
  const minPeriod = 4;
  const maxPeriod = Math.min(Math.max(minPeriod + 1, Math.floor(n / 2)), 48);
  let best = null;

  for (let period = minPeriod; period <= maxPeriod; period++) {
    const fit = fitSeasonalModel(xs, ys, period);
    if (!fit) continue;
    if (!best || fit.sse < best.sse) {
      best = fit;
    }
  }

  return best;
}

const SeasonalHarmonicProvider = {
  predict(points, config) {
    const { horizon = 10, limits } = config;
    const valid = points.filter((point) => !point.excluded && point.y != null);
    if (valid.length < MIN_POINTS) return EMPTY_PREDICTION;

    const xs = valid.map((_, index) => index);
    const ys = valid.map((point) => point.y);
    const fit = estimateDominantPeriod(xs, ys);
    if (!fit) return EMPTY_PREDICTION;

    const spacings = [];
    for (let i = 1; i < valid.length; i++) {
      spacings.push(valid[i].x - valid[i - 1].x);
    }
    const step = median(spacings) || 1;
    const lastX = valid[valid.length - 1].x;
    const lastRelX = xs[xs.length - 1];
    const processSigma = limits?.ucl != null && limits?.center != null
      ? Math.abs((limits.ucl - limits.center) / 3)
      : sampleStdDev(ys);
    const residualSigma = Math.max(fit.residualSE, processSigma * 0.15, 1e-6);

    const projected = [];
    const confidence = [];
    for (let h = 1; h <= horizon; h++) {
      const xPred = lastX + h * step;
      const xRel = lastRelX + h * step;
      const yPred = evaluateSeasonal(fit.coefficients, xRel, fit.period);
      const width = 1.96 * residualSigma * Math.sqrt(1 + h / Math.max(xs.length / 2, 1));
      projected.push({ x: xPred, y: yPred });
      confidence.push({ x: xPred, upper: yPred + width, lower: yPred - width });
    }

    const period = fit.period;
    const omega = (2 * Math.PI) / period;
    const slope = fit.coefficients[1]
      + 2 * fit.coefficients[2] * lastRelX
      + fit.coefficients[3] * omega * Math.cos(omega * lastRelX)
      - fit.coefficients[4] * omega * Math.sin(omega * lastRelX);
    const driftScore = computeDriftScore(slope, processSigma, xs.length);
    const oocEstimate = estimateOOC(projected, limits);

    return { projected, confidence, driftScore, oocEstimate };
  },
};

registerProvider("seasonal-harmonic", SeasonalHarmonicProvider);
export default SeasonalHarmonicProvider;

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

function solve3x3(matrix, vector) {
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  const size = 3;

  for (let pivot = 0; pivot < size; pivot++) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < size; row++) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[maxRow][pivot])) {
        maxRow = row;
      }
    }
    if (Math.abs(augmented[maxRow][pivot]) < 1e-12) {
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

function fitQuadratic(xs, ys) {
  const n = xs.length;
  let sumX = 0;
  let sumX2 = 0;
  let sumX3 = 0;
  let sumX4 = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2Y = 0;

  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const x2 = x * x;
    sumX += x;
    sumX2 += x2;
    sumX3 += x2 * x;
    sumX4 += x2 * x2;
    sumY += ys[i];
    sumXY += x * ys[i];
    sumX2Y += x2 * ys[i];
  }

  const coefficients = solve3x3(
    [
      [n, sumX, sumX2],
      [sumX, sumX2, sumX3],
      [sumX2, sumX3, sumX4],
    ],
    [sumY, sumXY, sumX2Y],
  );

  if (!coefficients) {
    return null;
  }

  const [a, b, c] = coefficients;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const residual = ys[i] - (a + b * xs[i] + c * xs[i] * xs[i]);
    sse += residual * residual;
  }
  const residualSE = n > 3 ? Math.sqrt(sse / (n - 3)) : 0;

  return { a, b, c, residualSE };
}

const QuadraticTrendProvider = {
  predict(points, config) {
    const { horizon = 10, limits } = config;
    const valid = points.filter((point) => !point.excluded && point.y != null);
    if (valid.length < MIN_POINTS) return EMPTY_PREDICTION;

    const windowSize = valid.length;
    const window = valid;
    const xs = window.map((_, index) => index);
    const ys = window.map((point) => point.y);
    const fit = fitQuadratic(xs, ys);
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
      const yPred = fit.a + fit.b * xRel + fit.c * xRel * xRel;
      const width = 1.96 * residualSigma * Math.sqrt(1 + h / Math.max(windowSize / 2, 1));
      projected.push({ x: xPred, y: yPred });
      confidence.push({ x: xPred, upper: yPred + width, lower: yPred - width });
    }

    const localSlope = fit.b + 2 * fit.c * lastRelX;
    const driftScore = computeDriftScore(localSlope, processSigma, windowSize);
    const oocEstimate = estimateOOC(projected, limits);

    return { projected, confidence, driftScore, oocEstimate };
  },
};

registerProvider("quadratic-trend", QuadraticTrendProvider);
export default QuadraticTrendProvider;

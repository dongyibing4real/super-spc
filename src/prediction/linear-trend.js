import { registerProvider, MIN_POINTS, EMPTY_PREDICTION } from './provider.js';
import { computeDriftScore, estimateOOC } from './drift-score.js';

/**
 * LinearTrendProvider — weighted linear regression on last N points.
 * Projects forward `horizon` points with expanding prediction intervals.
 *
 * Confidence interval: ±t(α/2) × s_e × √(1 + 1/n + (x_pred - x̄)² / Σ(xᵢ-x̄)²)
 * where s_e is residual standard error.
 */

/** t-critical values for 95% confidence (two-tailed), indexed by df (≥2) */
function tCritical(df) {
  // Approximation good enough for SPC visualization
  if (df <= 2) return 4.303;
  if (df <= 5) return 2.571;
  if (df <= 10) return 2.228;
  if (df <= 20) return 2.086;
  if (df <= 30) return 2.042;
  return 1.96;
}

function linearRegression(xs, ys) {
  const n = xs.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
  }
  const xMean = sumX / n;
  const yMean = sumY / n;
  const sxx = sumX2 - n * xMean * xMean;
  if (sxx === 0) return { slope: 0, intercept: yMean, xMean, sxx, residualSE: 0 };

  const slope = (sumXY - n * xMean * yMean) / sxx;
  const intercept = yMean - slope * xMean;

  // Residual standard error
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const residual = ys[i] - (slope * xs[i] + intercept);
    sse += residual * residual;
  }
  const residualSE = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;

  return { slope, intercept, xMean, sxx, residualSE };
}

const LinearTrendProvider = {
  predict(points, config) {
    const { horizon = 10, limits } = config;

    // Filter non-excluded points
    const valid = points.filter(p => !p.excluded && p.y != null);
    if (valid.length < MIN_POINTS) return EMPTY_PREDICTION;

    // Use last N points (default 20, or all if fewer)
    const windowSize = Math.min(20, valid.length);
    const window = valid.slice(-windowSize);

    const xs = window.map((_, i) => i);
    const ys = window.map(p => p.y);
    const n = xs.length;

    const reg = linearRegression(xs, ys);
    const lastX = points[points.length - 1].x;

    // Compute spacing between points (use median spacing from data)
    const spacings = [];
    for (let i = 1; i < valid.length; i++) {
      spacings.push(valid[i].x - valid[i - 1].x);
    }
    spacings.sort((a, b) => a - b);
    const step = spacings.length > 0 ? spacings[Math.floor(spacings.length / 2)] : 1;

    const t = tCritical(n - 2);
    const projected = [];
    const confidence = [];

    for (let h = 1; h <= horizon; h++) {
      const xPred = lastX + h * step;
      const xPredRel = xs[n - 1] + h * step;
      const yPred = reg.slope * xPredRel + reg.intercept;

      // Prediction interval width
      const xDev = xPredRel - reg.xMean;
      const piWidth = reg.residualSE > 0
        ? t * reg.residualSE * Math.sqrt(1 + 1 / n + (xDev * xDev) / reg.sxx)
        : 0;

      projected.push({ x: xPred, y: yPred });
      confidence.push({ x: xPred, upper: yPred + piWidth, lower: yPred - piWidth });
    }

    // Process standard deviation from valid points
    const mean = ys.reduce((a, b) => a + b, 0) / n;
    const sigma = limits?.ucl != null && limits?.center != null
      ? Math.abs((limits.ucl - limits.center) / 3)
      : Math.sqrt(ys.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));

    const driftScore = computeDriftScore(reg.slope, sigma, n);
    const oocEstimate = estimateOOC(projected, limits);

    return { projected, confidence, driftScore, oocEstimate };
  },
};

registerProvider('linear-trend', LinearTrendProvider);
export default LinearTrendProvider;

import { registerProvider, MIN_POINTS, EMPTY_PREDICTION } from './provider.js';
import { computeDriftScore, estimateOOC } from './drift-score.js';

/**
 * EWMAProjectionProvider — EWMA smoothing with expanding confidence bounds.
 *
 * Forward projection: last EWMA value is the point forecast for all future points
 * (EWMA is a level estimator).
 *
 * Confidence bounds: ±L × σ × √(λ/(2-λ) × [1-(1-λ)^(2*h)])
 * where h = steps ahead, L = control limit width (default 3), σ = process std dev.
 * Reference: Montgomery, Introduction to Statistical Quality Control, Ch. 9.
 */

const EWMAProjectionProvider = {
  predict(points, config) {
    const { horizon = 10, limits } = config;
    const lambda = config.lambda ?? 0.2;
    const L = 3; // control limit width multiplier

    // Filter non-excluded points
    const valid = points.filter(p => !p.excluded && p.y != null);
    if (valid.length < MIN_POINTS) return EMPTY_PREDICTION;

    const ys = valid.map(p => p.y);
    const n = ys.length;

    // Process sigma should come from the in-control limits when available.
    const mean = ys.reduce((a, b) => a + b, 0) / n;
    const sigma = limits?.ucl != null && limits?.center != null
      ? Math.abs((limits.ucl - limits.center) / 3)
      : Math.sqrt(ys.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));

    // Compute EWMA series
    let ewma = limits?.center ?? mean;
    for (let i = 0; i < n; i++) {
      ewma = lambda * ys[i] + (1 - lambda) * ewma;
    }

    // The last EWMA value is the point forecast
    const lastX = points[points.length - 1].x;

    // Compute spacing
    const spacings = [];
    for (let i = 1; i < valid.length; i++) {
      spacings.push(valid[i].x - valid[i - 1].x);
    }
    spacings.sort((a, b) => a - b);
    const step = spacings.length > 0 ? spacings[Math.floor(spacings.length / 2)] : 1;

    const projected = [];
    const confidence = [];

    for (let h = 1; h <= horizon; h++) {
      const xPred = lastX + h * step;

      // EWMA level estimate — flat projection
      const yPred = ewma;

      // Expanding confidence bounds (Montgomery formula)
      const boundWidth = L * sigma * Math.sqrt(
        (lambda / (2 - lambda)) * (1 - Math.pow(1 - lambda, 2 * h))
      );

      projected.push({ x: xPred, y: yPred });
      confidence.push({ x: xPred, upper: yPred + boundWidth, lower: yPred - boundWidth });
    }

    // Drift score: use slope from last 20 points via simple regression
    const windowSize = Math.min(20, n);
    const window = ys.slice(-windowSize);
    const xs = window.map((_, i) => i);
    const xMean = (windowSize - 1) / 2;
    const yMean = window.reduce((a, b) => a + b, 0) / windowSize;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < windowSize; i++) {
      sxy += (xs[i] - xMean) * (window[i] - yMean);
      sxx += (xs[i] - xMean) ** 2;
    }
    const slope = sxx > 0 ? sxy / sxx : 0;

    const driftScore = computeDriftScore(slope, sigma, windowSize);
    const oocEstimate = estimateOOC(projected, limits);

    return { projected, confidence, driftScore, oocEstimate };
  },
};

registerProvider('ewma-projection', EWMAProjectionProvider);
export default EWMAProjectionProvider;

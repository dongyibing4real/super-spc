/**
 * Drift score computation + OOC estimation.
 *
 * driftScore = min(1, |slope| / (σ / √n))
 * Essentially the t-statistic magnitude, capped at 1.0.
 *
 * Thresholds: < 0.3 = green (low), 0.3-0.7 = amber (approaching), > 0.7 = red (high drift)
 */

export function computeDriftScore(slope, sigma, n) {
  if (sigma === 0 || n < 2) return 0;
  const sem = sigma / Math.sqrt(n);
  return Math.min(1, Math.abs(slope) / sem);
}

/**
 * Estimate how many samples until projection crosses UCL or LCL.
 * Returns the index (1-based from projection start) of the first breach, or null.
 */
export function estimateOOC(projected, limits) {
  if (!limits || limits.ucl == null || limits.lcl == null) return null;
  for (let i = 0; i < projected.length; i++) {
    if (projected[i].y >= limits.ucl || projected[i].y <= limits.lcl) {
      return i + 1; // 1-based: "~N samples to OOC"
    }
  }
  return null;
}

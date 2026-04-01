/**
 * PredictionProvider interface + registry.
 *
 * Each provider implements: predict(points, config) → PredictionResult
 *
 * Input:
 *   { points: [{x, y, excluded}], config: {horizon, chartType, limits} }
 *
 * Output:
 *   {
 *     projected: [{x, y}],           // predicted center points
 *     confidence: [{x, upper, lower}], // cone boundaries
 *     driftScore: 0.0-1.0,           // 0 = stable, 1 = strong drift
 *     oocEstimate: number | null     // samples until projected OOC, null if none
 *   }
 */

const registry = new Map();

export function registerProvider(name, provider) {
  registry.set(name, provider);
}

export function getProvider(name) {
  return registry.get(name) || null;
}

export function listProviders() {
  return [...registry.keys()];
}

/**
 * Run prediction using the named provider.
 * Returns null if provider not found or insufficient data.
 */
export function predict(providerName, points, config) {
  const provider = registry.get(providerName);
  if (!provider) return null;
  return provider.predict(points, config);
}

/** Minimum historical points required for any prediction */
export const MIN_POINTS = 10;

/**
 * Empty prediction result — used as fallback.
 */
export const EMPTY_PREDICTION = {
  projected: [],
  confidence: [],
  driftScore: 0,
  oocEstimate: null,
};

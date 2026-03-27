import { scaleLinear } from 'd3-scale';

/**
 * Compute y-axis range from data — encompasses all points, limits, and spec limits
 * with some headroom so nothing sits right at the edge.
 */
function computeYRange(data, seriesKey) {
  const values = data.points.map(p => p[seriesKey]).filter(v => v != null);
  const limitsArr = [data.limits.ucl, data.limits.lcl, data.limits.center];
  if (data.limits.usl != null) limitsArr.push(data.limits.usl);
  if (data.limits.lsl != null) limitsArr.push(data.limits.lsl);

  const allValues = [...values, ...limitsArr];
  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);
  const range = dataMax - dataMin;
  const headroom = range * 0.12; // 12% padding above and below

  return {
    yMin: dataMin - headroom,
    yMax: dataMax + headroom,
  };
}

/**
 * Generate nice y-axis tick values for the given range.
 */
function computeYTicks(yMin, yMax, targetCount = 6) {
  const range = yMax - yMin;
  const rawStep = range / (targetCount - 1);

  // Find a "nice" step size (1, 2, 5 × 10^n)
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  let niceStep;
  if (residual <= 1.5) niceStep = 1 * magnitude;
  else if (residual <= 3.5) niceStep = 2 * magnitude;
  else if (residual <= 7.5) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  const start = Math.ceil(yMin / niceStep) * niceStep;
  const ticks = [];
  for (let v = start; v <= yMax + niceStep * 0.01; v += niceStep) {
    ticks.push(parseFloat(v.toFixed(6)));
  }
  return ticks;
}

/**
 * Create D3 scales for the chart coordinate system.
 * Supports domain overrides for JMP-style axis pan/scale.
 *
 * @param {object} data - Chart data (points, limits)
 * @param {object} config - Chart config (width, height, padding, xDomainOverride, yDomainOverride)
 * @param {string} [seriesKey='primaryValue'] - Which value key to use for y-range
 * @returns {{ x: Function, y: Function, sigma: object, yTicks: number[], yMin: number, yMax: number, xMin: number, xMax: number }}
 */
export function createScales(data, config, seriesKey = 'primaryValue') {
  const { width, height, padding } = config;
  const n = data.points.length;

  // X domain: default is [0, n-1], overridable by axis drag
  const xDefault = { min: 0, max: n - 1 };
  const { min: xMin, max: xMax } = config.xDomainOverride ?? xDefault;

  // Y domain: default is auto-computed from data, overridable by axis drag
  const { yMin, yMax } = config.yDomainOverride ?? computeYRange(data, seriesKey);
  const yTicks = computeYTicks(yMin, yMax);

  const x = scaleLinear()
    .domain([xMin, xMax])
    .range([padding.left, width - padding.right]);

  const y = scaleLinear()
    .domain([yMin, yMax])
    .range([height - padding.bottom, padding.top]);

  // Sigma calculations from limits
  const sigmaVal = (data.limits.ucl - data.limits.center) / 3;
  const sigma = {
    value: sigmaVal,
    s1u: data.limits.center + sigmaVal,
    s2u: data.limits.center + 2 * sigmaVal,
    s1l: data.limits.center - sigmaVal,
    s2l: data.limits.center - 2 * sigmaVal,
  };

  return { x, y, sigma, yTicks, yMin, yMax, xMin, xMax };
}

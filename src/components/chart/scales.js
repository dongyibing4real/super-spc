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
  if (data.limits.target != null) limitsArr.push(data.limits.target);

  const allValues = [...values, ...limitsArr];
  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);
  const range = dataMax - dataMin;
  const headroom = range * 0.06; // 6% padding — tight, data-dense SPC style

  return {
    yMin: dataMin - headroom,
    yMax: dataMax + headroom,
  };
}

/**
 * Generate nice y-axis tick values for the given range.
 */
/**
 * Nice step candidates in the 1-2-5 progression.
 * Same sequence used by the x-axis niceStride — unified philosophy.
 */
const NICE_SEQUENCE = [1, 2, 5];

function computeYTicks(yMin, yMax, targetCount = 6) {
  const range = yMax - yMin;
  if (range <= 0) return [yMin];

  const rawStep = range / (targetCount - 1);

  // Find a "nice" step size (1, 2, 5 × 10^n)
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  let niceStep;
  if (residual <= 1.5) niceStep = 1 * magnitude;
  else if (residual <= 3.5) niceStep = 2 * magnitude;
  else if (residual <= 7.5) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  // Generate ticks
  let ticks = generateTicks(yMin, yMax, niceStep);

  // If we got too few ticks, try the next smaller nice step.
  // This handles narrow ranges where the nice step overshoots.
  // Threshold: want at least 3 ticks, or half the target — whichever is larger.
  if (ticks.length < Math.max(3, Math.ceil(targetCount / 2))) {
    const smallerStep = niceStep / 2;
    ticks = generateTicks(yMin, yMax, smallerStep);
  }

  return ticks;
}

function generateTicks(yMin, yMax, step) {
  const start = Math.ceil(yMin / step) * step;
  const ticks = [];
  for (let v = start; v <= yMax + step * 0.01; v += step) {
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

  // X domain: default is [0, n-1] — fits all data points in the chart.
  const xDefault = config.xDefaultDomain ?? { min: 0, max: n - 1 };
  const { min: xMin, max: xMax } = config.xDomainOverride ?? xDefault;

  // Y domain: default is auto-computed from data, overridable by axis drag
  const { yMin, yMax } = config.yDomainOverride ?? computeYRange(data, seriesKey);

  // Always recompute nice ticks for the CURRENT domain (including after pan/scale).
  // Target tick count adapts to available pixel height — same tickPixelInterval
  // philosophy as the x-axis (Highcharts-style), adapted for compact SPC charts.
  const plotHeight = height - padding.top - padding.bottom;
  const tickPixelInterval = 35; // minimum px between y-axis ticks (compact analytical charts)
  const targetTickCount = Math.max(3, Math.min(12, Math.floor(plotHeight / tickPixelInterval) + 1));
  const yTicks = computeYTicks(yMin, yMax, targetTickCount);

  // Inset x range by half a point spacing so edge points don't sit on the padding border
  const plotWidth = width - padding.left - padding.right;
  const pointInset = n > 1 ? Math.min(plotWidth * 0.02, 8) : 0;
  const x = scaleLinear()
    .domain([xMin, xMax])
    .range([padding.left + pointInset, width - padding.right - pointInset]);

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

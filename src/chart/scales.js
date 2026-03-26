import { scaleLinear } from 'd3-scale';

/**
 * Create D3 scales for the chart coordinate system.
 * @param {object} data - Chart data (points, limits)
 * @param {object} config - Chart config (dimensions, padding, range)
 * @returns {{ x: Function, y: Function, sigma: object }}
 */
export function createScales(data, config) {
  const { width, height, padding, yMin, yMax } = config;
  const n = data.points.length;

  const x = scaleLinear()
    .domain([0, n - 1])
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

  return { x, y, sigma };
}

import { line } from 'd3-shape';

/**
 * Render a data series line connecting data points.
 *
 * Uses d3Line to generate an SVG path. The line generator maps each
 * point's array index to x (categorical axis) and its value to y.
 *
 * Visual weight: the series line is the heaviest element in the chart
 * (1.5px via CSS). Limit lines and grid lines are thinner to keep the
 * data as the dominant visual signal.
 *
 * Note: currently does not use defined() to skip gaps — all points are
 * assumed to have valid values for the active seriesKey. If null values
 * are introduced, add `.defined(d => d[valueKey] != null)` to handle gaps.
 *
 * @param {Selection} layer - D3 group to render into
 * @param {object} scales - { x, y } scales
 * @param {Array} points - Data points array
 * @param {string} valueKey - data field to plot (e.g. 'primaryValue')
 * @param {string} type - series identifier (determines CSS class: '{type}-path')
 */
export function renderSeries(layer, scales, points, valueKey, type) {
  const { x, y } = scales;

  const lineGen = line()
    .x((d, i) => x(i))
    .y(d => y(d[valueKey]));

  const pathClass = `${type}-path`;
  const path = layer.selectAll(`path.${pathClass}`).data([points]);

  path.enter()
    .append('path')
    .attr('class', `${pathClass} primary-path`)
    .merge(path)
    .attr('d', lineGen);

  path.exit().remove();
}

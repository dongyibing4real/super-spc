import { line } from 'd3-shape';

/**
 * Render a data series line.
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

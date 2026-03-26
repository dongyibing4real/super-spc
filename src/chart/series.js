import { line } from 'd3-shape';

/**
 * Render a data series line (primary or challenger).
 * @param {Selection} layer - D3 group to render into
 * @param {object} scales - { x, y } scales
 * @param {Array} points - Data points array
 * @param {string} valueKey - 'primaryValue' or 'challengerValue'
 * @param {string} type - 'primary' or 'challenger' (determines CSS class)
 */
export function renderSeries(layer, scales, points, valueKey, type) {
  const { x, y } = scales;

  const lineGen = line()
    .x((d, i) => x(i))
    .y(d => y(d[valueKey]));

  const pathClass = type === 'primary' ? 'primary-path' : 'challenger-path';
  const path = layer.selectAll(`path.${pathClass}`).data([points]);

  path.enter()
    .append('path')
    .attr('class', pathClass)
    .merge(path)
    .attr('d', lineGen);

  path.exit().remove();
}

import { fmt } from './utils.js';

/**
 * Render Y-axis grid lines and value labels.
 */
export function renderGrid(layer, scales, config) {
  const { y } = scales;
  const L = config.padding.left;
  const R = config.width - config.padding.right;

  // Grid lines
  const lines = layer.selectAll('line.grid-line').data(config.yTicks);
  lines.enter()
    .append('line')
    .attr('class', 'grid-line')
    .merge(lines)
    .attr('x1', L).attr('x2', R)
    .attr('y1', d => y(d)).attr('y2', d => y(d));
  lines.exit().remove();

  // Grid labels
  const labels = layer.selectAll('text.grid-label').data(config.yTicks);
  labels.enter()
    .append('text')
    .attr('class', 'grid-label')
    .merge(labels)
    .attr('x', 6)
    .attr('y', d => y(d) + 3)
    .text(d => fmt(d));
  labels.exit().remove();
}

/**
 * Render confidence band (light blue shading).
 */
export function renderConfidenceBand(layer, scales, config) {
  const { y } = scales;
  const L = config.padding.left;
  const R = config.width - config.padding.right;
  const [lo, hi] = config.confidenceBandRange;

  const band = layer.selectAll('rect').data([1]);
  band.enter()
    .append('rect')
    .merge(band)
    .attr('x', L)
    .attr('y', y(hi))
    .attr('width', R - L)
    .attr('height', y(lo) - y(hi))
    .attr('fill', 'rgba(45,114,210,0.04)');
}

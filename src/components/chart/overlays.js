import { fmt } from './utils.js';

/**
 * Render Y-axis grid lines (clipped) and value labels (unclipped).
 * yTicks now come from scales (computed dynamically).
 */
export function renderGrid(layer, labelLayer, scales, config) {
  const { y, yTicks } = scales;
  const L = config.padding.left;
  const R = config.width - config.padding.right;

  // Grid lines (stay in clipped layer)
  const lines = layer.selectAll('line.grid-line').data(yTicks);
  lines.enter()
    .append('line')
    .attr('class', 'grid-line')
    .merge(lines)
    .attr('x1', L).attr('x2', R)
    .attr('y1', d => y(d)).attr('y2', d => y(d));
  lines.exit().remove();

  // Grid labels (unclipped layer — positioned left of clip area)
  const fontSize = config.yLabelFontSize || 10;
  const labels = labelLayer.selectAll('text.grid-label').data(yTicks);
  labels.enter()
    .append('text')
    .attr('class', 'grid-label')
    .merge(labels)
    .attr('x', L - 4)
    .attr('y', d => y(d) + 3)
    .attr('text-anchor', 'end')
    .style('font-size', `${fontSize}px`)
    .text(d => fmt(d));
  labels.exit().remove();
}

/**
 * Render confidence band (light blue shading around the center line ±1σ).
 * Computed from limits data rather than hardcoded config.
 */
export function renderConfidenceBand(layer, scales, config, data) {
  const { y, sigma } = scales;
  const L = config.padding.left;
  const R = config.width - config.padding.right;

  // Confidence band spans ±2σ from center
  const hi = sigma.s2u;
  const lo = sigma.s2l;

  const band = layer.selectAll('rect').data([1]);
  band.enter()
    .append('rect')
    .merge(band)
    .attr('x', L)
    .attr('y', y(hi))
    .attr('width', R - L)
    .attr('height', y(lo) - y(hi))
    .attr('fill', 'rgba(45,114,210,0.10)');
}

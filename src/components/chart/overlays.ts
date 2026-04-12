import type { Selection } from 'd3-selection';
import type { ChartScales } from './scales.js';
import { fmt } from './utils.js';

interface GridConfig {
  padding: { top: number; right: number; bottom: number; left: number };
  width: number;
  yLabelFontSize?: number;
}

interface ConfidenceData {
  limits: { ucl: number; center: number; lcl: number };
}

/**
 * Render Y-axis grid lines (clipped) and value labels (unclipped).
 */
export function renderGrid(
  layer: Selection<SVGGElement, unknown, null, undefined>,
  labelLayer: Selection<SVGGElement, unknown, null, undefined>,
  scales: ChartScales,
  config: GridConfig
): void {
  const { y, yTicks } = scales;
  const L = config.padding.left;
  const R = config.width - config.padding.right;

  // Grid lines (stay in clipped layer)
  const lines = layer.selectAll<SVGLineElement, number>('line.grid-line').data(yTicks);
  lines.enter()
    .append('line')
    .attr('class', 'grid-line')
    .merge(lines)
    .attr('x1', L).attr('x2', R)
    .attr('y1', (d: number) => y(d)).attr('y2', (d: number) => y(d));
  lines.exit().remove();

  // Grid labels (unclipped layer — positioned left of clip area)
  const fontSize = config.yLabelFontSize || 10;
  const labels = labelLayer.selectAll<SVGTextElement, number>('text.grid-label').data(yTicks);
  labels.enter()
    .append('text')
    .attr('class', 'grid-label')
    .merge(labels)
    .attr('x', L - 4)
    .attr('y', (d: number) => y(d) + 3)
    .attr('text-anchor', 'end')
    .style('font-size', `${fontSize}px`)
    .text((d: number) => fmt(d));
  labels.exit().remove();
}

/**
 * Render confidence band (light blue shading around the center line +/-2sigma).
 */
export function renderConfidenceBand(
  layer: Selection<SVGGElement, unknown, null, undefined>,
  scales: ChartScales,
  config: GridConfig,
  _data: ConfidenceData
): void {
  const { y, sigma } = scales;
  const L = config.padding.left;
  const R = config.width - config.padding.right;

  // Confidence band spans +/-2sigma from center
  const hi = sigma.s2u;
  const lo = sigma.s2l;

  const band = layer.selectAll<SVGRectElement, number>('rect').data([1]);
  band.enter()
    .append('rect')
    .merge(band)
    .attr('x', L)
    .attr('y', y(hi))
    .attr('width', R - L)
    .attr('height', y(lo) - y(hi))
    .attr('fill', 'rgba(45,114,210,0.10)');
}

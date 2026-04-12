import type { Selection } from 'd3-selection';
import type { ChartScales } from './scales.js';
import { line } from 'd3-shape';

interface SeriesPoint {
  [key: string]: unknown;
}

/**
 * Render a data series line connecting data points.
 */
export function renderSeries(
  layer: Selection<SVGGElement, unknown, null, undefined>,
  scales: ChartScales,
  points: SeriesPoint[],
  valueKey: string,
  type: string
): void {
  const { x, y } = scales;

  const lineGen = line<SeriesPoint>()
    .x((_d: SeriesPoint, i: number) => x(i))
    .y((d: SeriesPoint) => y(d[valueKey] as number));

  const pathClass = `${type}-path`;
  const path = layer.selectAll<SVGPathElement, SeriesPoint[]>(`path.${pathClass}`).data([points]);

  path.enter()
    .append('path')
    .attr('class', `${pathClass} primary-path`)
    .merge(path)
    .attr('d', lineGen);

  path.exit().remove();
}

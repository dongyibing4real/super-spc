import type { Selection } from 'd3-selection';
import type { ChartScales } from './scales.js';

interface EventPoint {
  annotation: string | null;
  [key: string]: unknown;
}

interface EventData {
  points: EventPoint[];
}

interface EventConfig {
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

/**
 * Render event annotation lines and chips.
 */
export function renderEvents(
  layer: Selection<SVGGElement, unknown, null, undefined>,
  scales: ChartScales,
  data: EventData,
  config: EventConfig
): void {
  const { x } = scales;
  const B = config.height - config.padding.bottom;

  layer.selectAll('*').remove();

  data.points.forEach((p: EventPoint, i: number) => {
    if (!p.annotation) return;
    const cx = x(i);

    // Vertical event line
    layer.append('line')
      .attr('class', 'event-line')
      .attr('x1', cx).attr('x2', cx)
      .attr('y1', 22).attr('y2', B);

    // Event chip
    const g = layer.append('g')
      .attr('transform', `translate(${cx + 6}, 48)`);

    g.append('rect')
      .attr('class', 'event-chip')
      .attr('width', 120).attr('height', 18)
      .attr('rx', 3);

    g.append('text')
      .attr('class', 'event-text')
      .attr('x', 6).attr('y', 12)
      .text(p.annotation);
  });
}

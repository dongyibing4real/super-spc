/**
 * Render event annotation lines and chips.
 *
 * Event markers represent external occurrences (tool changes, lot boundaries,
 * recipe updates) that may explain process shifts visible in the SPC chart.
 * Each marker is a vertical line from the header area to the x-axis, with
 * a small chip label describing the event.
 *
 * In SPC context, event annotations help engineers correlate assignable
 * causes with statistical signals (e.g., a rule violation coinciding with
 * a known equipment change).
 */
export function renderEvents(layer, scales, data, config) {
  const { x } = scales;
  const B = config.height - config.padding.bottom;

  layer.selectAll('*').remove();

  data.points.forEach((p, i) => {
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

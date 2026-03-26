/**
 * Render event annotation lines and chips.
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

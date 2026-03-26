/**
 * Render phase boundary lines and phase label chips.
 */
export function renderPhases(layer, scales, data, config) {
  const { x } = scales;
  const T = config.padding.top;
  const B = config.height - config.padding.bottom;

  layer.selectAll('*').remove();

  // Phase boundary vertical lines (for all phases except the first)
  data.phases.slice(1).forEach(ph => {
    const bx = x(ph.start);
    layer.append('line')
      .attr('class', 'phase-line')
      .attr('x1', bx).attr('x2', bx)
      .attr('y1', T).attr('y2', B);
  });

  // Phase label chips
  data.phases.forEach(ph => {
    const sx = x(ph.start);
    const ex = x(ph.end);
    const cx = (sx + ex) / 2;
    const labelText = ph.id;
    const w = labelText.length * 6 + 12;

    const g = layer.append('g');

    g.append('rect')
      .attr('x', cx - w / 2).attr('y', 6)
      .attr('width', w).attr('height', 16)
      .attr('rx', 3)
      .attr('fill', 'rgba(209,152,11,0.08)')
      .attr('stroke', 'rgba(209,152,11,0.2)')
      .attr('stroke-width', 0.5);

    g.append('text')
      .attr('class', 'phase-label')
      .attr('x', cx).attr('y', 17)
      .attr('text-anchor', 'middle')
      .text(labelText);
  });
}

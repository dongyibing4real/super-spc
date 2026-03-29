/**
 * Render phase boundary lines (clipped) and phase label chips (unclipped).
 */
export function renderPhases(layer, labelLayer, scales, data, config) {
  const { x } = scales;
  const T = config.padding.top;
  const B = config.height - config.padding.bottom;

  layer.selectAll('*').remove();
  labelLayer.selectAll('*').remove();

  if (!data.phases || data.phases.length <= 1) return;

  // Phase boundary vertical lines (clipped — for all phases except the first)
  data.phases.slice(1).forEach(ph => {
    const bx = x(ph.start);
    layer.append('line')
      .attr('class', 'phase-line')
      .attr('x1', bx).attr('x2', bx)
      .attr('y1', T).attr('y2', B);
  });

  // Phase label chips (unclipped — sit above plot area)
  data.phases.forEach(ph => {
    const sx = x(ph.start);
    const ex = x(ph.end);
    if (Math.abs(ex - sx) < 2) return; // skip degenerate zero-width phases
    const cx = (sx + ex) / 2;
    const labelText = ph.label || ph.id;
    const w = labelText.length * 6 + 12;

    const g = labelLayer.append('g');

    g.append('rect')
      .attr('x', cx - w / 2).attr('y', 2)
      .attr('width', w).attr('height', 14)
      .attr('rx', 3)
      .attr('fill', 'rgba(209,152,11,0.08)')
      .attr('stroke', 'rgba(209,152,11,0.2)')
      .attr('stroke-width', 0.5);

    g.append('text')
      .attr('class', 'phase-label')
      .attr('x', cx).attr('y', 13)
      .attr('text-anchor', 'middle')
      .text(labelText);
  });
}

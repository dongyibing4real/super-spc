/**
 * Render phase boundaries and labels.
 *
 * Design: solid vertical boundary line + plain text label at top.
 * No background bands, no chip rects — minimal structural markers.
 * Dashes are avoided because they read as "tentative" which is wrong
 * for phase boundaries (they are definitive structural breaks).
 */
export function renderPhases(layer, labelLayer, scales, data, config) {
  const { x } = scales;
  const T = config.padding.top;
  const B = config.height - config.padding.bottom;

  layer.selectAll('*').remove();
  labelLayer.selectAll('*').remove();

  if (!data.phases || data.phases.length <= 1) return;

  // Solid boundary lines between phases (clipped)
  data.phases.slice(1).forEach(ph => {
    const bx = x(ph.start);
    layer.append('line')
      .attr('class', 'phase-line')
      .attr('x1', bx).attr('x2', bx)
      .attr('y1', T).attr('y2', B);
  });

  // Plain text phase labels (unclipped — centered above each phase region)
  data.phases.forEach(ph => {
    const sx = x(ph.start);
    const ex = x(ph.end);
    if (Math.abs(ex - sx) < 20) return;
    const cx = (sx + ex) / 2;
    const labelText = ph.label || ph.id;

    labelLayer.append('text')
      .attr('class', 'phase-label')
      .attr('x', cx).attr('y', T - 4)
      .attr('text-anchor', 'middle')
      .text(labelText);
  });
}

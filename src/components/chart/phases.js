/**
 * Render phase boundaries and labels.
 *
 * Design: solid vertical boundary line + subtle background band per phase +
 * integrated label chip at top. No dashes — dashes read as "tentative" which
 * is wrong for phase boundaries (they are definitive structural breaks).
 *
 * The background band gives each phase its own visual territory, making
 * multi-phase charts read as segmented regions rather than a flat line with
 * orphan markers.
 */
export function renderPhases(layer, labelLayer, scales, data, config) {
  const { x } = scales;
  const T = config.padding.top;
  const B = config.height - config.padding.bottom;
  const L = config.padding.left;
  const R = config.width - config.padding.right;

  layer.selectAll('*').remove();
  labelLayer.selectAll('*').remove();

  if (!data.phases || data.phases.length <= 1) return;

  // Alternating subtle background bands per phase (clipped layer)
  data.phases.forEach((ph, i) => {
    if (i % 2 === 0) return; // only shade odd-indexed phases for alternation
    const sx = Math.max(x(ph.start), L);
    const ex = Math.min(x(ph.end), R);
    if (ex - sx < 2) return;
    layer.append('rect')
      .attr('class', 'phase-band')
      .attr('x', sx).attr('y', T)
      .attr('width', ex - sx).attr('height', B - T);
  });

  // Solid boundary lines between phases (clipped)
  data.phases.slice(1).forEach(ph => {
    const bx = x(ph.start);
    layer.append('line')
      .attr('class', 'phase-line')
      .attr('x1', bx).attr('x2', bx)
      .attr('y1', T).attr('y2', B);
  });

  // Phase label chips (unclipped — sit just above the plot area)
  data.phases.forEach(ph => {
    const sx = x(ph.start);
    const ex = x(ph.end);
    if (Math.abs(ex - sx) < 20) return; // skip if too narrow for a label
    const cx = (sx + ex) / 2;
    const labelText = ph.label || ph.id;
    const w = labelText.length * 5.5 + 10;

    const g = labelLayer.append('g');

    g.append('rect')
      .attr('x', cx - w / 2).attr('y', T - 1)
      .attr('width', w).attr('height', 14)
      .attr('rx', 2)
      .attr('fill', 'rgba(209,152,11,0.08)')
      .attr('stroke', 'rgba(209,152,11,0.20)')
      .attr('stroke-width', 0.5);

    g.append('text')
      .attr('class', 'phase-label')
      .attr('x', cx).attr('y', T + 10)
      .attr('text-anchor', 'middle')
      .text(labelText);
  });
}

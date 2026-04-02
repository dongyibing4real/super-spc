/**
 * Render phase boundaries and labels (JMP-style).
 *
 * JMP convention: a horizontal header band sits above the plot area,
 * spanning each phase's width. Each phase gets a labeled strip with
 * alternating subtle backgrounds so users instantly see the chart has
 * phases and which region belongs to which phase. Vertical divider
 * lines extend from the header through the chart plot area.
 */
export function renderPhases(layer, labelLayer, scales, data, config) {
  const { x } = scales;
  const T = config.padding.top;
  const B = config.height - config.padding.bottom;
  const L = config.padding.left;
  const R = config.width - config.padding.right;
  const headerH = config.phaseHeaderHeight || 0;

  layer.selectAll('*').remove();
  labelLayer.selectAll('*').remove();

  if (!data.phases || data.phases.length <= 1) return;

  // ── Header band background strips (unclipped — above plot area) ──
  // The header band sits in the space between (T - headerH) and T.
  const bandTop = T - headerH;
  const bandBot = T;

  data.phases.forEach((ph, i) => {
    const sx = Math.max(x(ph.start), L);
    const ex = Math.min(x(ph.end), R);
    const pw = ex - sx;
    if (pw < 2) return;

    // Alternating background: odd phases get a slightly darker fill
    const fill = i % 2 === 0
      ? 'rgba(147,153,163,0.06)'   // even — lighter
      : 'rgba(147,153,163,0.12)';  // odd — slightly darker

    // Header band rect
    labelLayer.append('rect')
      .attr('class', 'phase-header-band')
      .attr('x', sx).attr('y', bandTop)
      .attr('width', pw).attr('height', headerH)
      .attr('fill', fill);

    // Phase label text — centered in the header band
    const labelText = ph.label || ph.id;
    const cx = (sx + ex) / 2;
    const cy = bandTop + headerH / 2;

    labelLayer.append('text')
      .attr('class', 'phase-label')
      .attr('x', cx).attr('y', cy)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .text(labelText);
  });

  // ── Bottom border of header band ──
  labelLayer.append('line')
    .attr('class', 'phase-header-border')
    .attr('x1', L).attr('x2', R)
    .attr('y1', bandBot).attr('y2', bandBot)
    .attr('stroke', 'rgba(147,153,163,0.25)')
    .attr('stroke-width', 0.5);

  // ── Vertical boundary lines between phases (extend from header top through chart) ──
  data.phases.slice(1).forEach(ph => {
    const bx = x(ph.start);

    // Line through header band (unclipped)
    labelLayer.append('line')
      .attr('class', 'phase-header-divider')
      .attr('x1', bx).attr('x2', bx)
      .attr('y1', bandTop).attr('y2', bandBot)
      .attr('stroke', 'rgba(147,153,163,0.30)')
      .attr('stroke-width', 0.5);

    // Line through plot area (clipped)
    layer.append('line')
      .attr('class', 'phase-line')
      .attr('x1', bx).attr('x2', bx)
      .attr('y1', T).attr('y2', B);
  });
}

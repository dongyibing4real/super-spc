/**
 * Render X-axis baseline and lot labels.
 * Tick density is emergent — determined by how many points are in the visible domain
 * relative to available pixel width. When the user pans/scales the x-axis via drag,
 * the domain changes and ticks automatically get sparser or denser.
 */
export function renderAxes(layer, scales, data, config) {
  const { x } = scales;
  const L = config.padding.left;
  const R = config.width - config.padding.right;
  const B = config.height - config.padding.bottom;

  // ── Determine visible range from the x scale domain ─────────────────
  const [domainMin, domainMax] = x.domain();
  const visibleMin = Math.max(0, Math.floor(domainMin));
  const visibleMax = Math.min(data.points.length - 1, Math.ceil(domainMax));
  const visibleCount = visibleMax - visibleMin + 1;

  // ── Dynamic stride from visible density ─────────────────────────────
  const availWidth = R - L;
  const pointSpacing = visibleCount > 1 ? availWidth / (visibleCount - 1) : availWidth;
  const minGap = Math.max(18, 9 * 3); // auto: minimum px between label centers
  const stride = Math.max(1, Math.ceil(minGap / pointSpacing));

  // ── Determine if rotation needed ────────────────────────────────────
  const labelWidth = 24;
  const rotate = pointSpacing * stride < labelWidth * 0.9;
  const smallFont = rotate && (pointSpacing * stride < labelWidth * 0.6);

  layer.selectAll('*').remove();

  // X-axis baseline
  layer.append('line')
    .attr('x1', L).attr('x2', R)
    .attr('y1', B).attr('y2', B)
    .attr('stroke', 'var(--chart-grid)')
    .attr('stroke-width', 0.5);

  // X-axis lot labels — only render points in the visible domain
  const selectedX = data.selectedIndex != null ? x(data.selectedIndex) : null;

  for (let i = visibleMin; i <= visibleMax; i++) {
    const p = data.points[i];
    if (!p) continue;
    const label = p.lot.replace('LOT-', '');
    const isSelected = i === data.selectedIndex;
    const relIdx = i - visibleMin; // index relative to visible window for stride calc

    if (!isSelected && relIdx % stride !== 0) continue;
    // Suppress fixed stride label if it would collide with the selected point's label
    if (!isSelected && selectedX != null && Math.abs(x(i) - selectedX) < labelWidth * 1.2) continue;

    const px = x(i);
    // Skip labels that would render outside the plot area
    if (px < L - 5 || px > R + 5) continue;

    const yPos = B + (rotate ? 14 : 16);
    const text = layer.append('text')
      .attr('class', 'x-axis-label')
      .attr('x', px)
      .attr('y', yPos)
      .attr('text-anchor', rotate ? 'end' : 'middle')
      .text(label);

    if (rotate) text.attr('transform', `rotate(-45, ${px}, ${yPos})`);
    if (smallFont) text.style('font-size', '8px');
    if (isSelected) text.style('fill', 'var(--blue)').style('font-weight', '600');
  }
}

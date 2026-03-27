/**
 * Render X-axis baseline and lot labels.
 *
 * AXIS LABEL SYSTEM (inspired by Highcharts tickPixelInterval + D3-FC collision adapters):
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * 1. Compute available pixel space per data point from the CURRENT domain (not static count).
 * 2. Derive stride from tickPixelInterval — minimum px between label centers.
 *    This auto-adapts as the user pans/scales the x-axis.
 * 3. Measure-first collision avoidance: estimate label width from character count,
 *    then decide rotation (0° → -45° → -90°) and font-size reduction.
 * 4. Selected-point label always wins — suppress any stride label within collision distance.
 * 5. Labels that fall outside the plot area (after pan) are clipped.
 *
 * Sources:
 *   Highcharts tickPixelInterval: https://www.highcharts.com/docs/chart-concepts/axes
 *   D3-FC label adapters: https://github.com/d3fc/d3fc/tree/master/packages/d3fc-axis
 *   Talbot/Lin/Hanrahan "nice numbers": http://vis.stanford.edu/files/2010-TickLabels-InfoVis.pdf
 */
export function renderAxes(layer, scales, data, config) {
  const { x } = scales;
  const L = config.padding.left;
  const R = config.width - config.padding.right;
  const B = config.height - config.padding.bottom;
  const plotWidth = R - L;

  // ── 1. Determine visible range from the x scale domain ─────────────
  const [domainMin, domainMax] = x.domain();
  const visibleMin = Math.max(0, Math.floor(domainMin));
  const visibleMax = Math.min(data.points.length - 1, Math.ceil(domainMax));
  const visibleCount = visibleMax - visibleMin + 1;

  // ── 2. Pixel-based tick density (Highcharts-style) ─────────────────
  //    pointSpacing = pixels between adjacent data points at current zoom
  //    tickPixelInterval = minimum distance between label centers
  const pointSpacing = visibleCount > 1 ? plotWidth / (domainMax - domainMin) : plotWidth;
  const TICK_PIXEL_INTERVAL = 42; // minimum px between label centers

  // Stride = how many data points to skip between labels
  const stride = Math.max(1, Math.ceil(TICK_PIXEL_INTERVAL / pointSpacing));

  // ── 3. Measure-first collision detection ───────────────────────────
  //    Estimate label width from typical lot label character count
  //    then decide rotation angle and font size
  const sampleLabel = data.points[visibleMin]?.lot?.replace('LOT-', '') ?? '';
  const charWidth = 6.5; // approximate px per character at 10px IBM Plex Mono
  const estLabelWidth = sampleLabel.length * charWidth;
  const spaceBetween = pointSpacing * stride;

  // Rotation tiers: upright → 45° → 90° (only if extremely tight)
  const rotate45 = spaceBetween < estLabelWidth * 1.0;
  const rotate90 = spaceBetween < estLabelWidth * 0.35;
  const smallFont = rotate45 && spaceBetween < estLabelWidth * 0.5;

  // ── 4. Clear and render ────────────────────────────────────────────
  layer.selectAll('*').remove();

  // X-axis baseline
  layer.append('line')
    .attr('x1', L).attr('x2', R)
    .attr('y1', B).attr('y2', B)
    .attr('stroke', 'var(--chart-grid)')
    .attr('stroke-width', 0.5);

  // ── 5. Render labels with collision avoidance ──────────────────────
  const selectedX = data.selectedIndex != null ? x(data.selectedIndex) : null;
  const fontSize = smallFont ? 8 : 10;
  const effectiveLabelWidth = sampleLabel.length * (smallFont ? 5 : charWidth);

  // Collision radius: how close (px) a stride label can be to the selected label
  const collisionRadius = rotate45
    ? effectiveLabelWidth * 0.6  // rotated labels are narrower horizontally
    : effectiveLabelWidth * 1.1; // upright labels need more horizontal space

  for (let i = visibleMin; i <= visibleMax; i++) {
    const p = data.points[i];
    if (!p) continue;

    const label = p.lot.replace('LOT-', '');
    const isSelected = i === data.selectedIndex;
    const relIdx = i - visibleMin;

    // Skip non-stride, non-selected points
    if (!isSelected && relIdx % stride !== 0) continue;

    // Suppress stride label if it collides with the selected point's label
    if (!isSelected && selectedX != null && Math.abs(x(i) - selectedX) < collisionRadius) continue;

    const px = x(i);
    // Clip labels outside the plot area (with small bleed allowance)
    if (px < L - 8 || px > R + 8) continue;

    // Position
    const yPos = B + (rotate45 ? 12 : 16);
    const text = layer.append('text')
      .attr('class', 'x-axis-label')
      .attr('x', px)
      .attr('y', yPos)
      .attr('text-anchor', rotate45 ? 'end' : 'middle')
      .style('font-size', `${fontSize}px`)
      .text(label);

    if (rotate90) {
      text.attr('transform', `rotate(-90, ${px}, ${yPos})`);
    } else if (rotate45) {
      text.attr('transform', `rotate(-45, ${px}, ${yPos})`);
    }

    if (isSelected) {
      text.style('fill', 'var(--blue)').style('font-weight', '600');
    }
  }
}

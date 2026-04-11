/**
 * Set up JMP-style axis drag interaction on a hit element.
 *
 * Both axes use identical interaction logic:
 *   drag ALONG the axis    -> PAN  (translate visible range)
 *   drag PERPENDICULAR     -> SCALE (zoom in/out)
 * Only differs in: which mouse axis is "along" vs "perpendicular",
 * data bounds for clamping, and the output event shape.
 *
 *   X-axis: horizontal = along (pan), vertical = perpendicular (scale)
 *   Y-axis: vertical = along (pan), horizontal = perpendicular (scale)
 *
 * @param {Selection} hitElement - D3 selection for the invisible drag target rect
 * @param {'x'|'y'} axisType - which axis this controls
 * @param {Function} getContext - returns { scales, sizedConfig, width, height }
 * @param {object} callbacks - { onAxisDrag, onForecastActivity }
 * @returns {Function} cleanup function to remove active drag listeners
 */
export function setupAxisDrag(hitElement, axisType, getContext, callbacks) {
  let activeDragCleanup = null;

  hitElement.on('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const { scales, sizedConfig, width, height } = getContext();
    if (!scales) return;
    callbacks.onForecastActivity?.();

    const startClientX = event.clientX;
    const startClientY = event.clientY;

    // Read current domain bounds for this axis
    const startMin = axisType === 'x' ? scales.xMin : scales.yMin;
    const startMax = axisType === 'x' ? scales.xMax : scales.yMax;
    const range = startMax - startMin;

    // Pixel range for this axis direction
    const activePadding = sizedConfig?.padding;
    const pixelRange = axisType === 'x'
      ? width - activePadding.left - activePadding.right
      : height - activePadding.top - activePadding.bottom;

    // Clamping — identical for both axes: generous range, no position walls
    const minRange = range * 0.05;   // can zoom to 5% of original range
    const maxRange = range * 5;      // can zoom out to 5x original range

    document.body.style.cursor = 'grabbing';
    hitElement.style('cursor', 'grabbing');

    let lastLo = startMin;
    let lastHi = startMax;

    const onMove = (e) => {
      callbacks.onForecastActivity?.();
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;

      // Along-axis -> PAN, perpendicular -> SCALE
      const panDelta = axisType === 'x'
        ? -dx * (range / pixelRange)    // drag right -> see later data
        :  dy * (range / pixelRange);   // drag up -> see higher values (SVG y inverted)
      const scaleFactor = Math.max(0.1, axisType === 'x'
        ? 1 + dy * 0.005               // drag down -> zoom out
        : 1 - dx * 0.005);             // drag right -> zoom in

      const center = (startMin + startMax) / 2 + panDelta;
      let halfRange = range / 2 * scaleFactor;

      // Clamp range only — no position walls, free pan like y-axis
      halfRange = Math.max(minRange / 2, Math.min(maxRange / 2, halfRange));
      lastLo = center - halfRange;
      lastHi = center + halfRange;

      // Live re-render in D3 directly — bypass React/Zustand store
      if (axisType === 'x') {
        callbacks.onAxisDragLive?.({ axis: 'x', min: lastLo, max: lastHi });
      } else {
        callbacks.onAxisDragLive?.({ axis: 'y', yMin: lastLo, yMax: lastHi });
      }
    };

    const onUp = () => {
      document.body.style.cursor = '';
      hitElement.style('cursor', 'grab');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      activeDragCleanup = null;
      // Commit final position to store only on drag end
      if (axisType === 'x') {
        callbacks.onAxisDrag?.({ axis: 'x', min: lastLo, max: lastHi });
      } else {
        callbacks.onAxisDrag?.({ axis: 'y', yMin: lastLo, yMax: lastHi });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    activeDragCleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
    };
  });

  // Return cleanup function
  return () => {
    if (activeDragCleanup) { activeDragCleanup(); activeDragCleanup = null; }
  };
}

/**
 * Compute a "nice stride" for categorical axis labels.
 * This is the categorical equivalent of the y-axis "nice numbers" algorithm:
 *   y-axis: snap to 1, 2, 5 × 10^n  (value steps)
 *   x-axis: snap to 1, 2, 5 × 10^n  (index strides)
 *
 * Both follow the same 1-2-5 progression from the Heckbert/Wilkinson algorithm.
 * @param {number} raw - the raw (fractional) stride from pixel density
 * @returns {number} the nearest nice integer stride (≥1)
 */
function niceStride(raw) {
  if (raw <= 1) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const residual = raw / magnitude;
  if (residual <= 1.5) return Math.round(1 * magnitude);
  if (residual <= 3.5) return Math.round(2 * magnitude);
  if (residual <= 7.5) return Math.round(5 * magnitude);
  return Math.round(10 * magnitude);
}

/**
 * Render X-axis baseline and lot labels.
 *
 * ALGORITHM (rotation-aware, same philosophy as y-axis nice ticks):
 * ─────────────────────────────────────────────────────────────────
 * 1. Compute pointSpacing from current domain (adapts to pan/scale)
 * 2. Estimate label dimensions from character count + font size
 * 3. Determine rotation FIRST from raw density vs label width
 * 4. Compute effective horizontal footprint for that rotation
 * 5. Derive stride from footprint / pointSpacing → snap to nice stride
 * 6. Render with selected-point collision suppression
 *
 * The stride is responsive to label dimensions AND rotation state,
 * so labels never overlap at any zoom level.
 */
export function renderAxes(layer, scales, data, config) {
  const { x } = scales;
  const L = config.padding.left;
  const R = config.width - config.padding.right;
  const B = config.height - config.padding.bottom;
  const plotWidth = R - L;

  // ── 1. Visible range from current domain ──────────────────────────
  const [domainMin, domainMax] = x.domain();
  const visibleMin = Math.max(0, Math.floor(domainMin));
  const visibleMax = Math.min(data.points.length - 1, Math.ceil(domainMax));
  const visibleCount = visibleMax - visibleMin + 1;
  const pointSpacing = visibleCount > 1 ? plotWidth / (domainMax - domainMin) : plotWidth;

  // ── 2. Estimate label dimensions ──────────────────────────────────
  const sampleLabel = data.points[visibleMin]?.label?.replace('LOT-', '') ?? '';
  const MONOSPACE_CHAR_WIDTH_RATIO = 0.6; // char width / font size for IBM Plex Mono
  const baseFontSize = sampleLabel.length > 10 ? 8 : sampleLabel.length > 6 ? 9 : 10;
  const baseCharW = baseFontSize * MONOSPACE_CHAR_WIDTH_RATIO;
  const labelWidth = sampleLabel.length * baseCharW;

  // ── 3. Determine rotation from RAW density (before stride) ────────
  //    If labels at stride=1 would overlap, rotation is needed
  const rotate45 = pointSpacing < labelWidth * 0.8;
  const rotate90 = pointSpacing < labelWidth * 0.2;
  const smallFont = rotate45 && pointSpacing < labelWidth * 0.35;
  const fontSize = smallFont ? Math.max(7, baseFontSize - 2) : baseFontSize;
  const effectiveCharW = fontSize * MONOSPACE_CHAR_WIDTH_RATIO;

  // ── 4. Effective horizontal footprint per label ───────────────────
  //    Conservative estimates that guarantee no visual overlap AND readability.
  //    The floor (MIN_LABEL_GAP) ensures labels never get denser than the y-axis
  //    tick interval — same philosophy, both axes respect the same density bound.
  const MIN_LABEL_GAP = 24; // px — readability floor, analogous to y-axis tickPixelInterval
  let footprint;
  if (rotate90) {
    footprint = fontSize * 2 + 4; // vertical text needs breathing room
  } else if (rotate45) {
    footprint = sampleLabel.length * effectiveCharW * 0.75 + 6;
  } else {
    footprint = sampleLabel.length * effectiveCharW + 12;
  }
  footprint = Math.max(footprint, MIN_LABEL_GAP);

  // ── 5. Compute stride from footprint ──────────────────────────────
  const rawStride = footprint / pointSpacing;
  const stride = niceStride(rawStride);

  // ── 6. Clear and render ───────────────────────────────────────────
  layer.selectAll('*').remove();

  // X-axis baseline
  layer.append('line')
    .attr('x1', L).attr('x2', R)
    .attr('y1', B).attr('y2', B)
    .attr('stroke', 'var(--chart-grid)')
    .attr('stroke-width', 0.5);

  // ── 7. Labels with collision avoidance ────────────────────────────
  const selectedX = data.selectedIndex != null ? x(data.selectedIndex) : null;
  const collisionRadius = rotate45
    ? sampleLabel.length * effectiveCharW * 0.5
    : sampleLabel.length * effectiveCharW * 0.9;

  for (let i = visibleMin; i <= visibleMax; i++) {
    const p = data.points[i];
    if (!p) continue;

    const label = p.label.replace('LOT-', '');
    const isSelected = i === data.selectedIndex;
    const relIdx = i - visibleMin;

    // Skip non-stride, non-selected points
    if (!isSelected && relIdx % stride !== 0) continue;

    // Suppress stride label if it collides with the selected point's label
    if (!isSelected && selectedX != null && Math.abs(x(i) - selectedX) < collisionRadius) continue;

    const px = x(i);
    // Clip labels outside the plot area (with small bleed)
    if (px < L - 8 || px > R + 8) continue;

    // Position
    const yPos = B + (rotate45 || rotate90 ? 12 : 16);
    const text = layer.append('text')
      .attr('class', 'x-axis-label')
      .attr('x', px)
      .attr('y', yPos)
      .attr('text-anchor', rotate45 || rotate90 ? 'end' : 'middle')
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

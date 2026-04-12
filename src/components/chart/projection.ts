import { line as d3Line } from 'd3-shape';
import { clamp } from './utils.js';

/**
 * Ghost zone renderer — the "ghost" metaphor: predicted future points
 * appear as translucent echoes of real data, fading into uncertainty.
 *
 * Three states drive the projection UI:
 *   1. Prompt — empty gap to the right of data shows a "Forecast" hint
 *      area. Clicking it activates forecasting (renderProjectionPrompt).
 *   2. Active (shell) — forecast is enabled but no result yet. A
 *      clickable shell fills the gap (renderProjectionShell).
 *   3. Result — algorithm has produced projected points + confidence
 *      bands. The full ghost zone renders (renderProjection).
 *
 * Dual-clip color split: two SVG clipPaths divide the plot area at
 * the UCL and LCL boundaries. All ghost elements (cone, line, points)
 * are rendered twice — once clipped to "within limits" (blue) and once
 * clipped to "beyond limits" (red). This avoids per-point color logic
 * and produces clean color transitions at the limit boundaries.
 *
 * Visual spec:
 *   Within limits: Blue #2D72D2 at reduced opacity
 *   Beyond limits: Red #CD4246 at slightly higher opacity
 *   Cone: 12%/18% fill, 20%/25% stroke
 *   Line + Points: 35%/40% opacity
 */

const COLOR_WITHIN_LIMITS = '#2D72D2';
const COLOR_BEYOND_LIMITS = '#CD4246';

export function renderProjectionPrompt(layer, scales, data, config) {
  layer.selectAll('*').remove();
  if (!data.points?.length) return null;

  // Fill exactly the available gap: from last data point to right edge of x-scale range
  const p = config.padding;
  const lastIdx = data.points.length - 1;
  const plotRight = scales.x(scales.xMax);  // use actual x-scale endpoint, not padding edge
  const plotTop = p.top;
  const plotHeight = config.height - p.top - p.bottom;
  const x0 = clamp(scales.x(lastIdx), p.left, plotRight);
  const width = Math.max(0, plotRight - x0);

  if (width < 6 || plotHeight < 16) return null;

  // Ghost area — fills the actual gap, click target with subtle glow
  layer.append('rect')
    .attr('class', 'ghost-hint-area forecast-prompt-hit')
    .attr('x', x0)
    .attr('y', plotTop)
    .attr('width', width)
    .attr('height', plotHeight)
    .attr('rx', 3)
    .attr('fill', COLOR_WITHIN_LIMITS)
    .attr('fill-opacity', 0.04)
    .attr('stroke', COLOR_WITHIN_LIMITS)
    .attr('stroke-opacity', 0.14)
    .attr('stroke-dasharray', '4 4');

  // Left boundary dashed line
  layer.append('line')
    .attr('class', 'ghost-hint-boundary')
    .attr('x1', x0)
    .attr('x2', x0)
    .attr('y1', plotTop)
    .attr('y2', plotTop + plotHeight)
    .attr('stroke', COLOR_WITHIN_LIMITS)
    .attr('stroke-opacity', 0.14)
    .attr('stroke-dasharray', '3 5');

  // Inline label — centered inside the ghost area
  // Wide (>=60px): horizontal "Forecast"
  // Medium (>=20px): vertical stacked characters with auto-scaled font size
  // Narrow (<20px): no label
  if (plotHeight >= 28) {
    const isWide = width >= 60;
    const isMedium = width >= 20;
    const cx = x0 + width / 2;
    const cy = plotTop + plotHeight / 2;

    if (isWide) {
      const fontSize = clamp(Math.min(width * 0.18, plotHeight * 0.1), 9, 13);
      layer.append('text')
        .attr('class', 'ghost-hint-label')
        .attr('x', cx)
        .attr('y', cy)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', COLOR_WITHIN_LIMITS)
        .attr('fill-opacity', 0.28)
        .style('font-size', `${fontSize}px`)
        .style('font-weight', '500')
        .style('letter-spacing', '0.06em')
        .style('pointer-events', 'none')
        .text('Forecast');
    } else if (isMedium) {
      // Vertical stacked characters — auto-scale font to fit available height
      const word = 'Forecast';
      const charCount = word.length;
      // Each character needs ~1.4x its font-size in vertical space (line height)
      const maxFontFromHeight = plotHeight * 0.85 / (charCount * 1.4);
      const maxFontFromWidth = width * 0.6;
      const fontSize = clamp(Math.min(maxFontFromHeight, maxFontFromWidth), 7, 12);
      const lineHeight = fontSize * 1.4;
      const totalHeight = charCount * lineHeight;
      const startY = cy - totalHeight / 2 + lineHeight / 2;

      word.split('').forEach((char, ci) => {
        layer.append('text')
          .attr('class', 'ghost-hint-label')
          .attr('x', cx)
          .attr('y', startY + ci * lineHeight)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('fill', COLOR_WITHIN_LIMITS)
          .attr('fill-opacity', 0.28)
          .style('font-size', `${fontSize}px`)
          .style('font-weight', '500')
          .style('pointer-events', 'none')
          .text(char);
      });
    }
  }

  return { lastIdx, x0, x1: plotRight, width, top: plotTop, height: plotHeight };
}

export function renderProjectionShell(layer, scales, data, config) {
  layer.selectAll('*').remove();

  // Shell fills the entire gap from the last data point to the right plot edge,
  // not just the forecast horizon width. This ensures the interaction area is
  // usable even when many data points make the per-index pixel width very small.
  if (!data.points?.length) return null;
  const lastIdx = data.points.length - 1;
  const plotRight = config.width - config.padding.right;
  const x0 = clamp(scales.x(lastIdx), config.padding.left, plotRight);
  const x1 = plotRight;
  const bounds = {
    lastIdx,
    x0,
    x1,
    width: Math.max(0, x1 - x0),
    top: config.padding.top,
    height: config.height - config.padding.top - config.padding.bottom,
  };
  if (bounds.width < 8) return null;

  const isLoading = config.forecastMode === "loading";
  const shell = layer.append('g')
    .attr('class', `forecast-shell${isLoading ? ' is-loading' : ''}`);

  shell.append('rect')
    .attr('class', 'forecast-shell-hit')
    .attr('x', bounds.x0)
    .attr('y', bounds.top)
    .attr('width', bounds.width)
    .attr('height', bounds.height)
    .attr('rx', 3);

  // Cancel button (top-right) — shown in loading and active states
  const btnX = bounds.x1 - 14;
  const btnY = bounds.top + 14;
  const cancel = shell.append('g')
    .attr('class', 'forecast-cancel')
    .attr('transform', `translate(${btnX},${btnY})`);
  cancel.append('circle').attr('r', 9);
  cancel.append('path')
    .attr('d', 'M -3 -3 L 3 3 M 3 -3 L -3 3');

  // Loading indicator — pulsing text
  if (isLoading && bounds.width >= 40 && bounds.height >= 28) {
    const cx = bounds.x0 + bounds.width / 2;
    const cy = bounds.top + bounds.height / 2;
    shell.append('text')
      .attr('class', 'forecast-loading-label')
      .attr('x', cx)
      .attr('y', cy)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', COLOR_WITHIN_LIMITS)
      .attr('fill-opacity', 0.45)
      .style('font-size', '11px')
      .style('font-weight', '500')
      .style('font-family', 'var(--font-mono)')
      .style('letter-spacing', '0.06em')
      .style('pointer-events', 'none')
      .text('Fitting\u2026');
  }

  return bounds;
}

/**
 * Render ghost zone elements from a prepared forecast result.
 *
 * @param {Selection} layer - D3 group to render into (inside plotClip)
 * @param {Selection} defs - SVG defs for clip paths
 * @param {object} scales - { x, y, xMin, xMax, yMin, yMax }
 * @param {object} data - chart data { points, limits, toggles }
 * @param {object} config - sized config { padding, width, height }
 * @returns {null}
 */
export function renderProjection(layer, defs, scales, data, config) {
  layer.selectAll('*').remove();

  const { points } = data;
  const result = data.forecast?.result;
  if (!result || result.projected.length === 0) return null;

  // Use forecast-specific limits (last phase's limits when phases exist)
  const limits = data.forecast?.limits ?? data.limits;

  const { x, y } = scales;
  const p = config.padding;
  const plotLeft = p.left;
  const plotRight = config.width - p.right;
  const plotTop = p.top;
  const plotBottom = config.height - p.bottom;

  // UCL/LCL pixel positions
  const uclY = y(limits.ucl);
  const lclY = y(limits.lcl);

  // ── Clip paths for within/beyond limits ──
  const clipIdWithin = `ghost-clip-within-${Math.random().toString(36).slice(2, 8)}`;
  const clipIdBeyond = `ghost-clip-beyond-${Math.random().toString(36).slice(2, 8)}`;

  // Remove old ghost clip paths
  defs.selectAll('.ghost-clip').remove();

  // Within limits: rectangle from UCL to LCL
  defs.append('clipPath')
    .attr('class', 'ghost-clip')
    .attr('id', clipIdWithin)
    .append('rect')
    .attr('x', plotLeft)
    .attr('y', uclY)
    .attr('width', plotRight - plotLeft)
    .attr('height', Math.max(0, lclY - uclY));

  // Beyond limits: two rectangles (above UCL + below LCL)
  const beyondClip = defs.append('clipPath')
    .attr('class', 'ghost-clip')
    .attr('id', clipIdBeyond);
  // Above UCL
  beyondClip.append('rect')
    .attr('x', plotLeft)
    .attr('y', plotTop)
    .attr('width', plotRight - plotLeft)
    .attr('height', Math.max(0, uclY - plotTop));
  // Below LCL
  beyondClip.append('rect')
    .attr('x', plotLeft)
    .attr('y', lclY)
    .attr('width', plotRight - plotLeft)
    .attr('height', Math.max(0, plotBottom - lclY));

  // ── Build polygon points for cone ──
  const lastIdx = points.length - 1;
  const startX = x(lastIdx);
  const startY = y(points[lastIdx].primaryValue ?? points[lastIdx].value);

  // Cone polygon: start at pinch point, trace upper bound forward, then lower bound back
  const upperPath = [{ px: startX, py: startY }];
  const lowerPath = [{ px: startX, py: startY }];

  for (const c of result.confidence) {
    const px = x(c.x);
    upperPath.push({ px, py: y(c.upper) });
    lowerPath.push({ px, py: y(c.lower) });
  }

  const conePoints = [
    ...upperPath.map(p => `${p.px},${p.py}`),
    ...[...lowerPath].reverse().map(p => `${p.px},${p.py}`),
  ].join(' ');

  // ── Render cone (within limits — blue) ──
  layer.append('polygon')
    .attr('class', 'ghost-cone ghost-cone-within')
    .attr('points', conePoints)
    .attr('clip-path', `url(#${clipIdWithin})`)
    .attr('fill', COLOR_WITHIN_LIMITS)
    .attr('fill-opacity', 0.12)
    .attr('stroke', COLOR_WITHIN_LIMITS)
    .attr('stroke-opacity', 0.20)
    .attr('stroke-width', 1);

  // ── Render cone (beyond limits — red) ──
  layer.append('polygon')
    .attr('class', 'ghost-cone ghost-cone-beyond')
    .attr('points', conePoints)
    .attr('clip-path', `url(#${clipIdBeyond})`)
    .attr('fill', COLOR_BEYOND_LIMITS)
    .attr('fill-opacity', 0.18)
    .attr('stroke', COLOR_BEYOND_LIMITS)
    .attr('stroke-opacity', 0.25)
    .attr('stroke-width', 1);

  // ── Ghost line (connecting predicted points) ──
  const linePoints = [
    { x: lastIdx, y: points[lastIdx].primaryValue ?? points[lastIdx].value },
    ...result.projected,
  ];

  const lineGen = d3Line()
    .x(d => x(d.x))
    .y(d => y(d.y));

  // Within limits (blue)
  layer.append('path')
    .attr('class', 'ghost-line ghost-line-within')
    .attr('d', lineGen(linePoints))
    .attr('clip-path', `url(#${clipIdWithin})`)
    .attr('fill', 'none')
    .attr('stroke', COLOR_WITHIN_LIMITS)
    .attr('stroke-opacity', 0.35)
    .attr('stroke-width', 1.5);

  // Beyond limits (red)
  layer.append('path')
    .attr('class', 'ghost-line ghost-line-beyond')
    .attr('d', lineGen(linePoints))
    .attr('clip-path', `url(#${clipIdBeyond})`)
    .attr('fill', 'none')
    .attr('stroke', COLOR_BEYOND_LIMITS)
    .attr('stroke-opacity', 0.40)
    .attr('stroke-width', 1.5);

  // ── Ghost points ──
  for (const pt of result.projected) {
    const px = x(pt.x);
    const py = y(pt.y);
    const beyondUCL = pt.y >= limits.ucl;
    const beyondLCL = pt.y <= limits.lcl;
    const isBeyond = beyondUCL || beyondLCL;

    layer.append('circle')
      .attr('class', `ghost-point ${isBeyond ? 'ghost-point-beyond' : 'ghost-point-within'}`)
      .attr('cx', px)
      .attr('cy', py)
      .attr('r', 3)
      .attr('fill', isBeyond ? COLOR_BEYOND_LIMITS : COLOR_WITHIN_LIMITS)
      .attr('fill-opacity', isBeyond ? 0.40 : 0.35)
      .style('pointer-events', 'none');
  }
  return null;
}

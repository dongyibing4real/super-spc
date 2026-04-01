import { line as d3Line } from 'd3-shape';

/**
 * Ghost zone renderer — renders prediction cone, line, and points
 * with SVG clipPath-based color split at control limit boundaries.
 *
 * Visual spec:
 *   Within limits: Blue #2D72D2 at reduced opacity
 *   Beyond limits: Red #CD4246 at slightly higher opacity
 *   Cone: 12%/18% fill, 20%/25% stroke
 *   Line + Points: 35%/40% opacity
 */

const BLUE = '#2D72D2';
const RED = '#CD4246';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function visibleForecastHorizon(config) {
  return Math.max(0, config.visibleForecastHorizon || 0);
}

function forecastBounds(scales, data, config) {
  const horizon = visibleForecastHorizon(config);
  if (horizon <= 0 || !data.points?.length) return null;
  const lastIdx = data.points.length - 1;
  const plotLeft = config.padding.left;
  const plotRight = config.width - config.padding.right;
  const x0 = clamp(scales.x(lastIdx), plotLeft, plotRight);
  const x1 = clamp(scales.x(lastIdx + horizon), plotLeft, plotRight);
  return {
    lastIdx,
    x0,
    x1,
    width: Math.max(0, x1 - x0),
    top: config.padding.top,
    height: config.height - config.padding.top - config.padding.bottom,
  };
}

export function renderProjectionPrompt(layer, scales, data, config) {
  layer.selectAll('*').remove();

  const bounds = forecastBounds(scales, data, config);
  if (!bounds || bounds.width < 12) return null;
  const labelLines = ['Click To Open', 'Forecast'];
  const calloutWidth = 118;
  const halfW = calloutWidth / 2;
  const plotLeft = config.padding.left + 8;
  const plotRight = config.width - config.padding.right - 8;
  const desiredX = bounds.x0 + bounds.width / 2;
  const labelX = Math.max(plotLeft + halfW, Math.min(plotRight - halfW, desiredX));
  const labelY = Math.max(18, bounds.top - 10);

  layer.append('rect')
    .attr('class', 'ghost-hint-area forecast-prompt-hit')
    .attr('x', bounds.x0)
    .attr('y', bounds.top)
    .attr('width', bounds.width)
    .attr('height', bounds.height)
    .attr('rx', 3)
    .attr('fill', BLUE)
    .attr('fill-opacity', 0.06)
    .attr('stroke', BLUE)
    .attr('stroke-opacity', 0.28)
    .attr('stroke-dasharray', '4 4');

  layer.append('line')
    .attr('class', 'ghost-hint-boundary')
    .attr('x1', bounds.x0)
    .attr('x2', bounds.x0)
    .attr('y1', bounds.top)
    .attr('y2', bounds.top + bounds.height)
    .attr('stroke', BLUE)
    .attr('stroke-opacity', 0.22)
    .attr('stroke-dasharray', '3 5');

  const callout = layer.append('g')
    .attr('class', 'forecast-prompt-callout')
    .attr('transform', `translate(${labelX},${labelY})`);

  callout.append('rect')
    .attr('x', -halfW)
    .attr('y', -18)
    .attr('width', calloutWidth)
    .attr('height', 32)
    .attr('rx', 10);

  const text = callout.append('text')
    .attr('class', 'ghost-hint-label')
    .attr('text-anchor', 'middle');

  labelLines.forEach((line, i) => {
    text.append('tspan')
      .attr('x', 0)
      .attr('y', i === 0 ? -3 : 7)
      .text(line);
  });

  callout.append('line')
    .attr('x1', 0)
    .attr('x2', 0)
    .attr('y1', 15)
    .attr('y2', Math.min(bounds.height * 0.35, 28));

  return bounds;
}

export function renderProjectionShell(layer, scales, data, config) {
  layer.selectAll('*').remove();

  const bounds = forecastBounds(scales, data, config);
  if (!bounds || bounds.width < 12) return null;

  const selected = !!config.forecastSelected;
  const shell = layer.append('g')
    .attr('class', `forecast-shell${selected ? ' is-selected' : ''}`);

  shell.append('rect')
    .attr('class', 'forecast-shell-hit')
    .attr('x', bounds.x0)
    .attr('y', bounds.top)
    .attr('width', bounds.width)
    .attr('height', bounds.height)
    .attr('rx', 3);

  if (bounds.width >= 96) {
    shell.append('text')
      .attr('class', 'forecast-shell-label')
      .attr('x', bounds.x0 + bounds.width / 2)
      .attr('y', bounds.top + Math.min(28, bounds.height * 0.22))
      .attr('text-anchor', 'middle')
      .text('Forecast view');
  }

  if (selected) {
    const btnX = bounds.x1 - 14;
    const btnY = bounds.top + 14;
    const cancel = shell.append('g')
      .attr('class', 'forecast-cancel')
      .attr('transform', `translate(${btnX},${btnY})`);

    cancel.append('circle').attr('r', 9);
    cancel.append('path')
      .attr('d', 'M -3 -3 L 3 3 M 3 -3 L -3 3');
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

  const { points, limits } = data;
  const result = data.forecast?.result;
  if (!result || result.projected.length === 0) return null;

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
    .attr('fill', BLUE)
    .attr('fill-opacity', 0.12)
    .attr('stroke', BLUE)
    .attr('stroke-opacity', 0.20)
    .attr('stroke-width', 1);

  // ── Render cone (beyond limits — red) ──
  layer.append('polygon')
    .attr('class', 'ghost-cone ghost-cone-beyond')
    .attr('points', conePoints)
    .attr('clip-path', `url(#${clipIdBeyond})`)
    .attr('fill', RED)
    .attr('fill-opacity', 0.18)
    .attr('stroke', RED)
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
    .attr('stroke', BLUE)
    .attr('stroke-opacity', 0.35)
    .attr('stroke-width', 1.5);

  // Beyond limits (red)
  layer.append('path')
    .attr('class', 'ghost-line ghost-line-beyond')
    .attr('d', lineGen(linePoints))
    .attr('clip-path', `url(#${clipIdBeyond})`)
    .attr('fill', 'none')
    .attr('stroke', RED)
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
      .attr('fill', isBeyond ? RED : BLUE)
      .attr('fill-opacity', isBeyond ? 0.40 : 0.35)
      .style('pointer-events', 'none');
  }
  return null;
}

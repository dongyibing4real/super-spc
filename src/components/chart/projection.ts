import type { Selection } from 'd3-selection';
import type { ChartScales } from './scales.js';
import { line as d3Line } from 'd3-shape';
import { clamp } from './utils.js';

interface ProjectionPoint {
  primaryValue?: number;
  value?: number;
  [key: string]: unknown;
}

interface ForecastConfidencePoint {
  x: number;
  upper: number;
  lower: number;
}

interface ForecastProjectedPoint {
  x: number;
  y: number;
}

interface ForecastResult {
  projected: ForecastProjectedPoint[];
  confidence: ForecastConfidencePoint[];
}

interface ForecastLimits {
  ucl: number;
  lcl: number;
  center: number;
}

interface ProjectionData {
  points: ProjectionPoint[];
  limits: { ucl: number; lcl: number; center: number };
  forecast?: {
    result?: ForecastResult | null;
    limits?: ForecastLimits;
    visibleHorizon?: number;
    mode?: string;
  };
  toggles?: Record<string, unknown>;
}

interface ProjectionConfig {
  padding: { top: number; right: number; bottom: number; left: number };
  width: number;
  height: number;
  forecastMode?: string;
}

interface PromptBounds {
  lastIdx: number;
  x0: number;
  x1: number;
  width: number;
  top: number;
  height: number;
}

interface ShellBounds {
  lastIdx: number;
  x0: number;
  x1: number;
  width: number;
  top: number;
  height: number;
}

const COLOR_WITHIN_LIMITS = '#2D72D2';
const COLOR_BEYOND_LIMITS = '#CD4246';

export function renderProjectionPrompt(
  layer: Selection<SVGGElement, unknown, null, undefined>,
  scales: ChartScales,
  data: ProjectionData,
  config: ProjectionConfig
): PromptBounds | null {
  layer.selectAll('*').remove();
  if (!data.points?.length) return null;

  // Fill exactly the available gap
  const p = config.padding;
  const lastIdx = data.points.length - 1;
  const plotRight = scales.x(scales.xMax);
  const plotTop = p.top;
  const plotHeight = config.height - p.top - p.bottom;
  const x0 = clamp(scales.x(lastIdx), p.left, plotRight);
  const width = Math.max(0, plotRight - x0);

  if (width < 6 || plotHeight < 16) return null;

  // Ghost area
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

  // Inline label
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
      const word = 'Forecast';
      const charCount = word.length;
      const maxFontFromHeight = plotHeight * 0.85 / (charCount * 1.4);
      const maxFontFromWidth = width * 0.6;
      const fontSize = clamp(Math.min(maxFontFromHeight, maxFontFromWidth), 7, 12);
      const lineHeight = fontSize * 1.4;
      const totalHeight = charCount * lineHeight;
      const startY = cy - totalHeight / 2 + lineHeight / 2;

      word.split('').forEach((char: string, ci: number) => {
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

export function renderProjectionShell(
  layer: Selection<SVGGElement, unknown, null, undefined>,
  scales: ChartScales,
  data: ProjectionData,
  config: ProjectionConfig
): ShellBounds | null {
  layer.selectAll('*').remove();

  if (!data.points?.length) return null;
  const lastIdx = data.points.length - 1;
  const plotRight = config.width - config.padding.right;
  const x0 = clamp(scales.x(lastIdx), config.padding.left, plotRight);
  const x1 = plotRight;
  const bounds: ShellBounds = {
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

  // Cancel button
  const btnX = bounds.x1 - 14;
  const btnY = bounds.top + 14;
  const cancel = shell.append('g')
    .attr('class', 'forecast-cancel')
    .attr('transform', `translate(${btnX},${btnY})`);
  cancel.append('circle').attr('r', 9);
  cancel.append('path')
    .attr('d', 'M -3 -3 L 3 3 M 3 -3 L -3 3');

  // Loading indicator
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
 */
export function renderProjection(
  layer: Selection<SVGGElement, unknown, null, undefined>,
  defs: Selection<SVGDefsElement, unknown, null, undefined>,
  scales: ChartScales,
  data: ProjectionData,
  config: ProjectionConfig
): null {
  layer.selectAll('*').remove();

  const { points } = data;
  const result = data.forecast?.result;
  if (!result || result.projected.length === 0) return null;

  // Use forecast-specific limits
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
  beyondClip.append('rect')
    .attr('x', plotLeft)
    .attr('y', plotTop)
    .attr('width', plotRight - plotLeft)
    .attr('height', Math.max(0, uclY - plotTop));
  beyondClip.append('rect')
    .attr('x', plotLeft)
    .attr('y', lclY)
    .attr('width', plotRight - plotLeft)
    .attr('height', Math.max(0, plotBottom - lclY));

  // ── Build polygon points for cone ──
  const lastIdx = points.length - 1;
  const startX = x(lastIdx);
  const startY = y(points[lastIdx].primaryValue ?? points[lastIdx].value ?? 0);

  interface PathPoint { px: number; py: number }

  const upperPath: PathPoint[] = [{ px: startX, py: startY }];
  const lowerPath: PathPoint[] = [{ px: startX, py: startY }];

  for (const c of result.confidence) {
    const px = x(c.x);
    upperPath.push({ px, py: y(c.upper) });
    lowerPath.push({ px, py: y(c.lower) });
  }

  const conePoints = [
    ...upperPath.map((pt: PathPoint) => `${pt.px},${pt.py}`),
    ...[...lowerPath].reverse().map((pt: PathPoint) => `${pt.px},${pt.py}`),
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
  const linePoints: ForecastProjectedPoint[] = [
    { x: lastIdx, y: (points[lastIdx].primaryValue ?? points[lastIdx].value ?? 0) as number },
    ...result.projected,
  ];

  const lineGen = d3Line<ForecastProjectedPoint>()
    .x((d: ForecastProjectedPoint) => x(d.x))
    .y((d: ForecastProjectedPoint) => y(d.y));

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

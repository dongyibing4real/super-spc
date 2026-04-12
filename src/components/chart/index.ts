import type { Selection } from 'd3-selection';
import type { ChartScales } from './scales.js';
import type { SizedConfig, ChartCallbacks, AxisDragInfo, AdaptivePadding } from './config.js';
import type { ChartLayers, SvgSkeleton } from './svg-setup.js';

import { createScales } from './scales.js';
import { renderZones } from './zones.js';
import { renderLimits } from './limits.js';
import { renderGrid, renderConfidenceBand } from './overlays.js';
import { renderPhases } from './phases.js';
import { renderSeries } from './series.js';
import { renderPoints } from './points.js';
import { renderAxes, setupAxisDrag } from './axes.js';
import { renderEvents } from './events.js';
import { renderProjection, renderProjectionPrompt, renderProjectionShell } from './projection.js';
import { DEFAULT_CHART_OPTIONS, computeAdaptivePadding } from './config.js';
import { renderAxisTitles } from './y-labels.js';
import { createSvgSkeleton } from './svg-setup.js';
import { setupContextMenu } from './context-menu.js';
import { setupMarquee } from './marquee.js';

interface ChartData {
  points: Record<string, unknown>[];
  limits: { ucl: number; lcl: number; center: number; usl?: number | null; lsl?: number | null; target?: number | null };
  phases?: { start: number; end: number; limits: { ucl: number; lcl: number; center: number }; id: string; label?: string }[];
  forecast?: {
    mode?: string;
    horizon?: number;
    visibleHorizon?: number;
    result?: { projected: { x: number; y: number }[]; confidence: { x: number; upper: number; lower: number }[] } | null;
    driftSummary?: string | null;
    predicting?: boolean;
    limits?: { ucl: number; lcl: number; center: number };
  };
  toggles: {
    overlay: boolean;
    specLimits: boolean;
    grid: boolean;
    phaseTags: boolean;
    events: boolean;
    excludedMarkers: boolean;
    confidenceBand: boolean;
    xDomainOverride?: { min: number; max: number } | null;
    xDefaultDomain?: { min: number; max: number } | null;
    yDomainOverride?: { yMin: number; yMax: number } | null;
  };
  selectedIndex: number | null;
  selectedIndices: number[] | null;
  selectedPhaseIndex?: number | null;
  violations: Map<number, string[]>;
  capability: { cp: number; cpk: number; ppk: number } | null;
  metric: { id?: string | null; label?: string; unit?: string };
  subgroup: { id?: string | null; label?: string; detail?: string };
  phase?: { id?: string | null; label?: string; detail?: string };
  chartType?: { id?: string | null; label?: string; detail?: string };
  seriesKey?: string;
  seriesType?: string;
}

interface ChartOptions extends ChartCallbacks {
  padding?: AdaptivePadding;
}

export interface ChartInstance {
  update: (data: ChartData) => void;
  destroy: () => void;
  svg: Selection<SVGSVGElement, unknown, null, undefined>;
  remount: (newContainer: HTMLElement) => void;
}

/**
 * Create a D3-powered SPC control chart that auto-sizes to its container.
 */
export function createChart(container: HTMLElement, options: ChartOptions = {}): ChartInstance {
  const config: ChartOptions = { ...DEFAULT_CHART_OPTIONS, ...options };

  // ── SVG skeleton (layers, clip path, axis hit regions) ────────────
  const { svg, defs, clipRect, layers, xAxisHit, yAxisHit }: SvgSkeleton = createSvgSkeleton(container);

  // ── Closure state ─────────────────────────────────────────────────
  let currentWidth = 0;
  let currentHeight = 0;
  let currentScales: ChartScales | null = null;
  let currentSizedConfig: SizedConfig | null = null;
  let lastData: ChartData | null = null;

  const getContext = () => ({
    scales: currentScales,
    sizedConfig: currentSizedConfig,
    width: currentWidth,
    height: currentHeight,
    lastData,
  });

  // ── Forecast activity listeners ───────────────────────────────────
  function handleForecastActivity(event: Event): void {
    const target = (event as PointerEvent)?.target as Element | null;
    if (target?.closest?.('.forecast-prompt-hit, .forecast-prompt-callout, .forecast-shell-hit, .forecast-cancel, .forecast-handle')) {
      return;
    }
    (config as ChartCallbacks).onForecastActivity?.();
  }

  function attachActivityListeners(target: HTMLElement): void {
    target.addEventListener('pointerdown', handleForecastActivity, true);
    target.addEventListener('wheel', handleForecastActivity, { passive: true, capture: true });
    target.addEventListener('keydown', handleForecastActivity, true);
  }

  function detachActivityListeners(target: HTMLElement): void {
    target.removeEventListener('pointerdown', handleForecastActivity, true);
    target.removeEventListener('wheel', handleForecastActivity, true);
    target.removeEventListener('keydown', handleForecastActivity, true);
  }

  attachActivityListeners(container);

  // ── Context menu ──────────────────────────────────────────────────
  setupContextMenu(svg, container, getContext, config.onContextMenu);

  // ── Axis drag (JMP-style pan/scale) ───────────────────────────────
  const onAxisDragLive = (info: AxisDragInfo): void => {
    if (!lastData) return;
    const liveData: ChartData = { ...lastData, toggles: { ...lastData.toggles } };
    if (info.axis === 'x') {
      liveData.toggles.xDomainOverride = { min: info.min!, max: info.max! };
    } else {
      liveData.toggles.yDomainOverride = { yMin: info.yMin!, yMax: info.yMax! };
    }
    renderAll(liveData);
  };
  const axisCallbacks = { onAxisDrag: config.onAxisDrag, onAxisDragLive, onForecastActivity: config.onForecastActivity };
  const getAxisContext = () => ({ scales: currentScales, sizedConfig: currentSizedConfig, width: currentWidth, height: currentHeight });
  const cleanupXDrag = setupAxisDrag(xAxisHit, 'x', getAxisContext, axisCallbacks);
  const cleanupYDrag = setupAxisDrag(yAxisHit, 'y', getAxisContext, axisCallbacks);

  xAxisHit.on('dblclick', () => (config as ChartCallbacks).onAxisReset?.('x'));
  yAxisHit.on('dblclick', () => (config as ChartCallbacks).onAxisReset?.('y'));

  // ── Marquee selection ─────────────────────────────────────────────
  const marquee = setupMarquee(svg, container, layers.marquee, getContext, {
    onSelectPoints: config.onSelectPoints,
  });

  // ── Click: deselect / forecast toggle ─────────────────────────────
  svg.on('click', (_event: MouseEvent) => {
    if (marquee.wasMarqueeJustFinished()) return;
    config.onSelectPoint?.(null);
    config.onSelectPhase?.(null);
  });

  // ── ResizeObserver ────────────────────────────────────────────────
  const resizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0 && (Math.abs(width - currentWidth) > 2 || Math.abs(height - currentHeight) > 2)) {
        currentWidth = width;
        currentHeight = height;
        svg.attr('width', currentWidth).attr('height', currentHeight);
        if (lastData) renderAll(lastData);
      }
    }
  });
  resizeObserver.observe(container);

  // ── Render orchestrator ───────────────────────────────────────────
  function renderAll(data: ChartData): void {
    if (currentWidth < 10 || currentHeight < 10) return;
    const seriesKey = data.seriesKey || 'primaryValue';
    const seriesType = data.seriesType || 'primary';

    const layout = computeAdaptivePadding(data, currentWidth, currentHeight);
    const sizedConfig: SizedConfig = {
      ...config,
      padding: layout.padding,
      yLabelFontSize: layout.yLabelFontSize,
      edgeLabelFontSize: layout.edgeLabelFontSize,
      showAxisTitles: layout.showAxisTitles,
      phaseHeaderHeight: layout.phaseHeaderHeight,
      width: currentWidth,
      height: currentHeight,
      xDomainOverride: data.toggles.xDomainOverride ?? null,
      xDefaultDomain: data.toggles.xDefaultDomain ?? null,
      yDomainOverride: data.toggles.yDomainOverride ?? null,
      visibleForecastHorizon: data.forecast?.visibleHorizon ?? 0,
      forecastMode: data.forecast?.mode ?? "hidden",
    };
    currentSizedConfig = sizedConfig;
    const scales = createScales(data, sizedConfig, seriesKey);
    currentScales = scales;

    // Zone shading
    if (data.toggles.specLimits) renderZones(layers.zones, scales, data, sizedConfig);
    else layers.zones.selectAll('*').remove();

    // Confidence band
    if (data.toggles.confidenceBand) renderConfidenceBand(layers.confidenceBand, scales, sizedConfig, data);
    else layers.confidenceBand.selectAll('*').remove();

    // Grid lines + Y-axis labels
    if (data.toggles.grid) renderGrid(layers.grid, layers.gridLabels, scales, sizedConfig);
    else { layers.grid.selectAll('*').remove(); layers.gridLabels.selectAll('*').remove(); }

    // Phase boundaries + label chips
    renderPhases(layers.phases, layers.phaseLabels, scales, data, sizedConfig);

    // Limit lines + edge labels
    if (data.toggles.specLimits) renderLimits(layers.limits, layers.limitLabels, scales, data, sizedConfig);
    else { layers.limits.selectAll('*').remove(); layers.limitLabels.selectAll('*').remove(); }

    // Secondary overlay (reserved)
    layers.secondary.selectAll('*').remove();

    // Main series line
    renderSeries(layers.primary, scales, data.points, seriesKey, seriesType);

    // Forecast prompt / shell / loading
    const forecastMode = data.forecast?.mode;
    if (forecastMode === 'prompt') {
      renderProjectionPrompt(layers.projectionUi, scales, data, sizedConfig);
      layers.projectionUi.selectAll('.forecast-prompt-hit, .forecast-prompt-callout')
        .style('cursor', 'pointer')
        .on('pointerdown', (event: Event) => event.stopPropagation())
        .on('click', (event: Event) => { event.preventDefault(); event.stopPropagation(); (config as ChartCallbacks).onActivateForecast?.(); });
    } else if (forecastMode === 'loading' || forecastMode === 'active') {
      renderProjectionShell(layers.projectionUi, scales, data, sizedConfig);
      layers.projectionUi.select('.forecast-cancel')
        .style('cursor', 'pointer')
        .on('pointerdown', (event: Event) => event.stopPropagation())
        .on('click', (event: Event) => { event.preventDefault(); event.stopPropagation(); (config as ChartCallbacks).onCancelForecast?.(); });
    } else {
      layers.projectionUi.selectAll('*').remove();
    }

    // Predicting indicator
    layers.projectionUi.selectAll('.forecast-predicting').remove();
    if (data.forecast?.predicting && (forecastMode === 'active' || forecastMode === 'loading')) {
      const p = sizedConfig.padding;
      const indicatorX = sizedConfig.width - p.right - 8;
      const indicatorY = p.top + 28;
      layers.projectionUi.append('text')
        .attr('class', 'forecast-predicting')
        .attr('x', indicatorX)
        .attr('y', indicatorY)
        .attr('text-anchor', 'end')
        .attr('fill', '#2D72D2')
        .attr('fill-opacity', 0.6)
        .style('font-size', '10px')
        .style('font-family', 'var(--font-mono)')
        .style('font-weight', '500')
        .style('pointer-events', 'none')
        .text('Predicting\u2026');
    }

    // Ghost zone projection
    if (data.forecast?.result) {
      renderProjection(layers.projection, defs, scales, data, sizedConfig);
    } else {
      layers.projection.selectAll('*').remove();
      defs.selectAll('.ghost-clip').remove();
    }

    // Event annotations
    if (data.toggles.events) renderEvents(layers.events, scales, data as unknown as Parameters<typeof renderEvents>[2], sizedConfig);
    else layers.events.selectAll('*').remove();

    // Data points
    renderPoints(layers.points, scales, data as unknown as Parameters<typeof renderPoints>[2], sizedConfig, seriesKey);

    // X-axis labels
    renderAxes(layers.xAxis, scales, data as unknown as Parameters<typeof renderAxes>[2], sizedConfig);

    // Axis titles
    renderAxisTitles(layers.xTitle, layers.yTitle, data as unknown as Parameters<typeof renderAxisTitles>[2], sizedConfig);

    // Update clip rect
    const p = sizedConfig.padding;
    clipRect
      .attr('x', p.left)
      .attr('y', p.top)
      .attr('width', Math.max(0, currentWidth - p.left - p.right))
      .attr('height', Math.max(0, currentHeight - p.top - p.bottom));

    // Position axis hit regions
    xAxisHit
      .attr('x', p.left)
      .attr('y', currentHeight - p.bottom)
      .attr('width', currentWidth - p.left - p.right)
      .attr('height', p.bottom);

    yAxisHit
      .attr('x', 0)
      .attr('y', p.top)
      .attr('width', p.left)
      .attr('height', currentHeight - p.top - p.bottom);

    // Forecast prompt eligibility
    const lastIdx = data.points.length - 1;
    const plotRight = sizedConfig.width - sizedConfig.padding.right;
    const lastPointX = data.points?.length ? scales.x(lastIdx) : plotRight;
    const gapPx = Math.max(0, plotRight - lastPointX);
    const plotWidth = Math.max(0, sizedConfig.width - sizedConfig.padding.left - sizedConfig.padding.right);
    const minPromptGap = Math.max(12, Math.min(40, plotWidth * 0.04));
    (config as ChartCallbacks).onForecastPromptEligibilityChange?.({ eligible: gapPx >= minPromptGap });
  }

  function syncSize(): void {
    const cs = getComputedStyle(container);
    const w = container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = container.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (w > 0 && h > 0) {
      currentWidth = w;
      currentHeight = h;
      svg.attr('width', w).attr('height', h);
    }
  }

  function update(data: ChartData): void {
    lastData = data;
    syncSize();
    renderAll(data);
  }

  function remount(newContainer: HTMLElement): void {
    cleanupXDrag();
    cleanupYDrag();
    detachActivityListeners(container);
    container = newContainer;
    resizeObserver.disconnect();
    resizeObserver.observe(newContainer);
    attachActivityListeners(newContainer);
  }

  function destroy(): void {
    cleanupXDrag();
    cleanupYDrag();
    marquee.destroy();
    detachActivityListeners(container);
    resizeObserver.disconnect();
    svg.remove();
  }

  return { update, destroy, svg, remount };
}

import { select } from 'd3-selection';
import { createScales } from './scales.js';
import { renderZones } from './zones.js';
import { renderLimits } from './limits.js';
import { renderGrid, renderConfidenceBand } from './overlays.js';
import { renderPhases } from './phases.js';
import { renderSeries } from './series.js';
import { renderPoints } from './points.js';
import { renderSelection } from './selection.js';
import { renderAxes } from './axes.js';
import { renderEvents } from './events.js';
import { renderProjection, renderProjectionPrompt, renderProjectionShell } from './projection.js';
import { DEFAULT_CONFIG, computeLayout } from './config.js';

/**
 * JMP-style y-axis label: function(measurement) depending on chart type.
 * e.g., "Average of Thickness" for X-Bar, "Range of Thickness" for R chart.
 */
const CHART_Y_LABELS = {
  imr:            (m) => m,                          // Individual chart — just the metric
  mr:             (m) => `Moving Range of ${m}`,
  xbar_r:         (m) => `Average of ${m}`,
  xbar_s:         (m) => `Average of ${m}`,
  r:              (m) => `Range of ${m}`,
  s:              (m) => `Std Dev of ${m}`,
  p:              (_) => 'Proportion',
  np:             (_) => 'Count',
  c:              (_) => 'Count',
  u:              (_) => 'Rate',
  laney_p:        (_) => 'Proportion',
  laney_u:        (_) => 'Rate',
  cusum:          (m) => `Cumulative Sum of ${m}`,
  cusum_vmask:    (m) => `Cumulative Sum of ${m}`,
  ewma:           (m) => `EWMA of ${m}`,
  levey_jennings: (m) => m,
  hotelling_t2:   (_) => 'T\u00B2 Statistic',
  mewma:          (_) => 'MEWMA Statistic',
  g:              (_) => 'Count Between Events',
  t:              (_) => 'Time Between Events',
  run:            (m) => m,
  short_run:      (m) => m,
  three_way:      (m) => m,
  presummarize:   (m) => `Average of ${m}`,
};

function getYAxisLabel(chartTypeId, metricLabel) {
  const fn = CHART_Y_LABELS[chartTypeId];
  return fn ? fn(metricLabel) : metricLabel;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Render axis title labels.
 *   X-axis: subgroup variable name (JMP convention)
 *   Y-axis: function(measurement) (JMP convention)
 */
function renderAxisTitles(xTitleLayer, yTitleLayer, data, config) {
  const p = config.padding;
  const W = config.width;
  const H = config.height;
  const plotCenterX = p.left + (W - p.left - p.right) / 2;
  const plotCenterY = p.top + (H - p.top - p.bottom) / 2;

  xTitleLayer.selectAll('*').remove();
  yTitleLayer.selectAll('*').remove();

  // Hide axis titles when pane is too small — space is better used for data
  if (!config.showAxisTitles) return;

  // X-axis title — subgroup variable name (JMP: shows the grouping column)
  const xLabel = data.subgroup?.id === 'individual'
    ? 'Observation'
    : (data.subgroup?.label || 'Observation');
  xTitleLayer.append('text')
    .attr('x', plotCenterX)
    .attr('y', H - 12)
    .attr('text-anchor', 'middle')
    .style('font-size', '10px')
    .style('font-family', 'Inter, system-ui, sans-serif')
    .style('font-weight', '500')
    .style('fill', 'var(--chart-text-3)')
    .text(xLabel);

  // Y-axis title — function(measurement) (JMP convention)
  const metricName = data.metric?.label || 'Value';
  const chartId = data.chartType?.id || 'imr';
  const yLabel = getYAxisLabel(chartId, metricName);
  yTitleLayer.append('text')
    .attr('x', -plotCenterY)
    .attr('y', 12)
    .attr('transform', 'rotate(-90)')
    .attr('text-anchor', 'middle')
    .style('font-size', '10px')
    .style('font-family', 'Inter, system-ui, sans-serif')
    .style('font-weight', '500')
    .style('fill', 'var(--chart-text-3)')
    .text(yLabel);
}

/**
 * Create a D3-powered SPC control chart that auto-sizes to its container.
 *
 * @param {HTMLElement} container - DOM element to mount the SVG into
 * @param {object} options - Config overrides + callbacks (onSelectPoint, onContextMenu, onAxisDrag, onAxisReset, onForecastDrag, onForecastActivity, onForecastPromptEligibilityChange, onActivateForecast, onSelectForecast, onCancelForecast)
 * @returns {{ update: Function, destroy: Function, svg: Selection }}
 */
export function createChart(container, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  // Clear any existing SVG
  select(container).select('svg').remove();

  // Track current measured size. Starts at 0 — first real render
  // happens when update() is called (which calls syncSize()).
  let currentWidth = 0;
  let currentHeight = 0;

  // Track current scales and config for axis drag computations
  let currentScales = null;
  let currentSizedConfig = null;

  // Track active drag session for cleanup on destroy/remount
  let activeDragCleanup = null;

  const svg = select(container)
    .append('svg')
    .attr('role', 'img')
    .attr('aria-label', 'Control chart')
    .style('display', 'block')
    .style('overflow', 'visible');

  // ── Clip path: constrains all plot content to the inner plot area ──
  const clipId = `plot-clip-${Math.random().toString(36).slice(2, 8)}`;
  const defs = svg.append('defs');
  const clipRect = defs.append('clipPath').attr('id', clipId)
    .append('rect');

  // Plot content group — everything inside gets clipped to the plot area
  const plotClip = svg.append('g').attr('clip-path', `url(#${clipId})`);

  // Create layer groups in correct z-order (back to front)
  // Clipped layers go inside plotClip; labels stay outside for visibility
  const layers = {
    zones: plotClip.append('g').attr('class', 'layer-zones'),
    confidenceBand: plotClip.append('g').attr('class', 'layer-confidence'),
    grid: plotClip.append('g').attr('class', 'layer-grid'),
    gridLabels: svg.append('g').attr('class', 'layer-grid-labels'),   // outside clip — y-axis labels visible
    phases: plotClip.append('g').attr('class', 'layer-phases'),
    phaseLabels: svg.append('g').attr('class', 'layer-phase-labels'), // outside clip — phase chips visible
    limits: plotClip.append('g').attr('class', 'layer-limits'),
    limitLabels: svg.append('g').attr('class', 'layer-limit-labels'), // outside clip — edge labels visible
    challenger: plotClip.append('g').attr('class', 'layer-challenger'),
    primary: plotClip.append('g').attr('class', 'layer-primary'),
    projection: plotClip.append('g').attr('class', 'layer-projection'),
    events: plotClip.append('g').attr('class', 'layer-events'),
    points: plotClip.append('g').attr('class', 'layer-points'),
    projectionUi: svg.append('g').attr('class', 'layer-projection-ui'),
    xAxis: svg.append('g').attr('class', 'layer-x-axis'),       // outside clip — labels visible
    xTitle: svg.append('g').attr('class', 'layer-x-title'),     // x-axis title
    yTitle: svg.append('g').attr('class', 'layer-y-title'),     // y-axis title
    forecastHandle: svg.append('g').attr('class', 'layer-forecast-handle'),
    selection: plotClip.append('g').attr('class', 'layer-selection'),
  };

  function handleForecastActivity(event) {
    const target = event?.target;
    if (target?.closest?.('.forecast-prompt-hit, .forecast-prompt-callout, .forecast-shell-hit, .forecast-cancel, .forecast-handle')) {
      return;
    }
    config.onForecastActivity?.();
  }

  function attachActivityListeners(target) {
    target.addEventListener('pointerdown', handleForecastActivity, true);
    target.addEventListener('wheel', handleForecastActivity, { passive: true, capture: true });
    target.addEventListener('keydown', handleForecastActivity, true);
  }

  function detachActivityListeners(target) {
    target.removeEventListener('pointerdown', handleForecastActivity, true);
    target.removeEventListener('wheel', handleForecastActivity, true);
    target.removeEventListener('keydown', handleForecastActivity, true);
  }

  attachActivityListeners(container);

  // ── Axis hit regions (invisible rects for drag + right-click) ──────
  const xAxisHit = svg.append('rect')
    .attr('class', 'axis-hit axis-hit-x')
    .attr('fill', 'transparent')
    .style('cursor', 'grab');

  const yAxisHit = svg.append('rect')
    .attr('class', 'axis-hit axis-hit-y')
    .attr('fill', 'transparent')
    .style('cursor', 'grab');

  /** Detect which axis region a click falls in based on padding */
  function hitTestAxis(localX, localY) {
    if (!currentSizedConfig) return null;
    const p = currentSizedConfig.padding;
    const w = currentWidth;
    const h = currentHeight;
    if (localY > h - p.bottom) return 'x';
    if (localX < p.left) return 'y';
    return null;
  }

  // ── Context menu: route to point / line / axis / canvas menu ───────
  svg.on('contextmenu', (event) => {
    event.preventDefault();
    if (!config.onContextMenu) return;
    const rect = container.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const axis = hitTestAxis(localX, localY);
    const el = event.target;
    const pointGroup = el.closest?.('.point-group') || el.parentNode?.closest?.('.point-group');
    const isLine = el.classList?.contains('primary-path') || el.classList?.contains('challenger-path');
    const target = axis ? 'axis' : pointGroup ? 'point' : isLine ? 'line' : 'canvas';
    config.onContextMenu(localX, localY, { axis, target });
  });

  // ── Unified axis drag: JMP-style ────────────────────────────────────
  //   Both axes use identical interaction logic:
  //     drag ALONG the axis    → PAN  (translate visible range)
  //     drag PERPENDICULAR     → SCALE (zoom in/out)
  //   Only differs in: which mouse axis is "along" vs "perpendicular",
  //   data bounds for clamping, and the output event shape.
  //
  //   X-axis: horizontal = along (pan), vertical = perpendicular (scale)
  //   Y-axis: vertical = along (pan), horizontal = perpendicular (scale)
  // ───────────────────────────────────────────────────────────────────
  function setupAxisDrag(hitElement, axisType) {
    hitElement.on('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (!currentScales) return;
      config.onForecastActivity?.();

      const startClientX = event.clientX;
      const startClientY = event.clientY;

      // Read current domain bounds for this axis
      const startMin = axisType === 'x' ? currentScales.xMin : currentScales.yMin;
      const startMax = axisType === 'x' ? currentScales.xMax : currentScales.yMax;
      const range = startMax - startMin;

      // Pixel range for this axis direction
      const activePadding = currentSizedConfig?.padding || config.padding;
      const pixelRange = axisType === 'x'
        ? currentWidth - activePadding.left - activePadding.right
        : currentHeight - activePadding.top - activePadding.bottom;

      // Clamping — identical for both axes: generous range, no position walls
      const minRange = range * 0.05;   // can zoom to 5% of original range
      const maxRange = range * 5;      // can zoom out to 5x original range

      document.body.style.cursor = 'grabbing';
      hitElement.style('cursor', 'grabbing');

      const onMove = (e) => {
        config.onForecastActivity?.();
        const dx = e.clientX - startClientX;
        const dy = e.clientY - startClientY;

        // Along-axis → PAN, perpendicular → SCALE
        // X-axis: dx = pan (inverted), dy = scale
        // Y-axis: dy = pan, dx = scale (inverted)
        const panDelta = axisType === 'x'
          ? -dx * (range / pixelRange)    // drag right → see later data
          :  dy * (range / pixelRange);   // drag up → see higher values (SVG y inverted)
        const scaleFactor = Math.max(0.1, axisType === 'x'
          ? 1 + dy * 0.005               // drag down → zoom out
          : 1 - dx * 0.005);             // drag right → zoom in

        const center = (startMin + startMax) / 2 + panDelta;
        let halfRange = range / 2 * scaleFactor;

        // Clamp range only — no position walls, free pan like y-axis
        halfRange = Math.max(minRange / 2, Math.min(maxRange / 2, halfRange));
        const lo = center - halfRange;
        const hi = center + halfRange;

        // Emit unified event
        if (axisType === 'x') {
          config.onAxisDrag?.({ axis: 'x', min: lo, max: hi });
        } else {
          config.onAxisDrag?.({ axis: 'y', yMin: lo, yMax: hi });
        }
      };

      const onUp = () => {
        document.body.style.cursor = '';
        hitElement.style('cursor', 'grab');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        activeDragCleanup = null;
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      activeDragCleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
      };
    });
  }

  setupAxisDrag(xAxisHit, 'x');
  setupAxisDrag(yAxisHit, 'y');

  function renderForecastHandle(data, scales, sizedConfig) {
    const layer = layers.forecastHandle;
    layer.selectAll('*').remove();
    // Forecast handle chrome removed — prediction renders without visible drag handle
  }

  // ── Double-click to reset ──────────────────────────────────────────
  xAxisHit.on('dblclick', () => config.onAxisReset?.('x'));
  yAxisHit.on('dblclick', () => config.onAxisReset?.('y'));

  svg.on('click', (event) => {
    const target = event.target;

    // Click empty space to deselect points (JMP convention)
    config.onSelectPoint?.(null);

    // Forecast deselection
    if (lastData?.forecast?.mode === 'active') {
      if (target?.closest?.('.forecast-shell-hit') || target?.closest?.('.forecast-cancel')) return;
      config.onSelectForecast?.(false);
    }
  });

  // Track last data for re-rendering on resize and axis drag clamping
  let lastData = null;
  let currentData = null;

  // ResizeObserver — re-render when container size changes
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0 && (Math.abs(width - currentWidth) > 2 || Math.abs(height - currentHeight) > 2)) {
        currentWidth = width;
        currentHeight = height;
        svg.attr('width', currentWidth).attr('height', currentHeight);
        if (lastData) {
          renderAll(lastData);
        }
      }
    }
  });
  resizeObserver.observe(container);

  /**
   * Internal render — paints all layers with current dimensions.
   */
  function renderAll(data) {
    currentData = data; // store for axis drag clamping
    if (currentWidth < 10 || currentHeight < 10) return; // Skip if too small
    const seriesKey = data.seriesKey || 'primaryValue';
    const seriesType = data.seriesType || 'primary';

    // Compute dynamic padding + font sizes from actual data values
    const layout = computeLayout(data, currentWidth, currentHeight);

    const sizedConfig = {
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
      forecastSelected: !!data.forecast?.selected,
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

    // Grid lines (clipped) + Y-axis labels (unclipped)
    if (data.toggles.grid) renderGrid(layers.grid, layers.gridLabels, scales, sizedConfig);
    else { layers.grid.selectAll('*').remove(); layers.gridLabels.selectAll('*').remove(); }

    // Phase boundaries (clipped) + label chips (unclipped)
    renderPhases(layers.phases, layers.phaseLabels, scales, data, sizedConfig);

    // Limit lines (clipped) + edge labels (unclipped, separate layer)
    if (data.toggles.specLimits) renderLimits(layers.limits, layers.limitLabels, scales, data, sizedConfig);
    else { layers.limits.selectAll('*').remove(); layers.limitLabels.selectAll('*').remove(); }

    // Overlay line (only if overlay toggle is on AND this chart is primary)
    if (data.toggles.overlay && seriesType === 'primary') {
      renderSeries(layers.challenger, scales, data.points, 'challengerValue', 'challenger');
    } else {
      layers.challenger.selectAll('*').remove();
    }

    // Main series line (uses configurable seriesKey)
    renderSeries(layers.primary, scales, data.points, seriesKey, seriesType);

    // Forecast prompt / shell
    if (data.forecast?.mode === 'prompt') {
      renderProjectionPrompt(layers.projectionUi, scales, data, sizedConfig);
      layers.projectionUi.selectAll('.forecast-prompt-hit, .forecast-prompt-callout')
        .style('cursor', 'pointer')
        .on('pointerdown', (event) => {
          event.stopPropagation();
        })
        .on('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          config.onActivateForecast?.();
        });
    } else if (data.forecast?.mode === 'active') {
      renderProjectionShell(layers.projectionUi, scales, data, sizedConfig);
      layers.projectionUi.select('.forecast-shell-hit')
        .style('cursor', 'pointer')
        .on('pointerdown', (event) => {
          event.stopPropagation();
        })
        .on('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          config.onSelectForecast?.(true);
        });
      layers.projectionUi.select('.forecast-cancel')
        .style('cursor', 'pointer')
        .on('pointerdown', (event) => {
          event.stopPropagation();
        })
        .on('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          config.onCancelForecast?.();
        });
    } else {
      layers.projectionUi.selectAll('*').remove();
    }

    // Ghost zone projection (between series and points in z-order)
    if (data.forecast?.result) {
      renderProjection(layers.projection, defs, scales, data, sizedConfig);
    } else {
      layers.projection.selectAll('*').remove();
      defs.selectAll('.ghost-clip').remove();
    }

    // Event annotations
    if (data.toggles.events) renderEvents(layers.events, scales, data, sizedConfig);
    else layers.events.selectAll('*').remove();

    // Data points (always rendered, using configurable seriesKey)
    renderPoints(layers.points, scales, data, sizedConfig, seriesKey, seriesType);

    // X-axis labels
    renderAxes(layers.xAxis, scales, data, sizedConfig);

    // Axis titles
    renderAxisTitles(layers.xTitle, layers.yTitle, data, sizedConfig);

    // Selection halo (using configurable seriesKey)
    renderSelection(layers.selection, scales, data, seriesKey, sizedConfig);

    // ── Update clip rect to match plot area ────────────────────────
    const p = sizedConfig.padding;
    clipRect
      .attr('x', p.left)
      .attr('y', p.top)
      .attr('width', Math.max(0, currentWidth - p.left - p.right))
      .attr('height', Math.max(0, currentHeight - p.top - p.bottom));

    // ── Position axis hit regions ──────────────────────────────────
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

    renderForecastHandle(data, scales, sizedConfig);
    // Forecast prompt eligibility: measure the visible empty space between
    // the last data point and the right edge of the plot area.
    const lastIdx = data.points.length - 1;
    const plotRight = sizedConfig.width - sizedConfig.padding.right;
    const lastPointX = data.points?.length ? scales.x(lastIdx) : plotRight;
    const gapPx = Math.max(0, plotRight - lastPointX);
    const plotWidth = Math.max(0, sizedConfig.width - sizedConfig.padding.left - sizedConfig.padding.right);
    const minPromptGap = Math.max(12, Math.min(40, plotWidth * 0.04));
    config.onForecastPromptEligibilityChange?.({
      eligible: gapPx >= minPromptGap,
    });
  }

  /** Sync SVG dimensions to container's content box (excludes padding) */
  function syncSize() {
    const cs = getComputedStyle(container);
    const w = container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = container.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (w > 0 && h > 0) {
      currentWidth = w;
      currentHeight = h;
      svg.attr('width', w).attr('height', h);
    }
  }

  /**
   * Update the chart with new data.
   * Re-measures container size before each render to handle layout changes.
   * Also schedules a deferred re-render for when CSS Grid settles.
   * @param {object} data
   */
  function update(data) {
    lastData = data;
    syncSize();
    renderAll(data);

    // Deferred re-render: CSS Grid may not have settled yet after layout changes.
    // requestAnimationFrame runs after the browser paints the new layout.
    requestAnimationFrame(() => {
      const cs = getComputedStyle(container);
      const w = (container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) || 400;
      const h = (container.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) || 300;
      if (w !== currentWidth || h !== currentHeight) {
        currentWidth = w;
        currentHeight = h;
        svg.attr('width', w).attr('height', h);
        renderAll(data);
      }
    });
  }

  /** Update container reference after SVG is reattached to a new DOM element */
  function remount(newContainer) {
    if (activeDragCleanup) { activeDragCleanup(); activeDragCleanup = null; }
    detachActivityListeners(container);
    container = newContainer;
    resizeObserver.disconnect();
    resizeObserver.observe(newContainer);
    attachActivityListeners(newContainer);
  }

  /** Remove the chart SVG from the DOM and disconnect observer */
  function destroy() {
    if (activeDragCleanup) { activeDragCleanup(); activeDragCleanup = null; }
    detachActivityListeners(container);
    resizeObserver.disconnect();
    svg.remove();
  }

  return { update, destroy, svg, remount };
}

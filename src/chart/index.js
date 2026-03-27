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
import { DEFAULT_CONFIG } from './config.js';

/**
 * Create a D3-powered SPC control chart that auto-sizes to its container.
 *
 * @param {HTMLElement} container - DOM element to mount the SVG into
 * @param {object} options - Config overrides + callbacks (onSelectPoint, onContextMenu, onAxisDrag, onAxisReset)
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

  const svg = select(container)
    .append('svg')
    .attr('preserveAspectRatio', 'none')
    .attr('role', 'img')
    .attr('aria-label', 'Control chart')
    .style('width', '100%')
    .style('height', '100%')
    .style('display', 'block');

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
    phases: plotClip.append('g').attr('class', 'layer-phases'),
    limits: plotClip.append('g').attr('class', 'layer-limits'),
    limitLabels: svg.append('g').attr('class', 'layer-limit-labels'), // outside clip — edge labels visible
    challenger: plotClip.append('g').attr('class', 'layer-challenger'),
    primary: plotClip.append('g').attr('class', 'layer-primary'),
    events: plotClip.append('g').attr('class', 'layer-events'),
    points: plotClip.append('g').attr('class', 'layer-points'),
    xAxis: svg.append('g').attr('class', 'layer-x-axis'),       // outside clip — labels visible
    selection: plotClip.append('g').attr('class', 'layer-selection'),
  };

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

  // ── Context menu: route to axis or point menu ──────────────────────
  svg.on('contextmenu', (event) => {
    event.preventDefault();
    if (!config.onContextMenu) return;
    const rect = container.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const axis = hitTestAxis(localX, localY);
    config.onContextMenu(localX, localY, { axis });
  });

  // ── X-axis drag: JMP-style ──────────────────────────────────────────
  //   drag along axis (left/right) → PAN x domain
  //   drag perpendicular (up/down) → SCALE x domain
  xAxisHit.on('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (!currentScales) return;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startXMin = currentScales.xMin;
    const startXMax = currentScales.xMax;
    const xRange = startXMax - startXMin;
    const pixelRange = currentWidth - config.padding.left - config.padding.right;

    document.body.style.cursor = 'grabbing';
    xAxisHit.style('cursor', 'grabbing');

    const onMove = (e) => {
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;

      // Pan: drag left/right moves the visible window
      // Scale: drag up/down zooms (up = zoom in, down = zoom out)
      const panDelta = -dx * (xRange / pixelRange); // invert: drag right = see later data
      const scaleFactor = Math.max(0.1, 1 + dy * 0.005); // drag down = zoom out

      const center = (startXMin + startXMax) / 2 + panDelta;
      const halfRange = xRange / 2 * scaleFactor;
      config.onAxisDrag?.({ axis: 'x', min: center - halfRange, max: center + halfRange });
    };
    const onUp = () => {
      document.body.style.cursor = '';
      xAxisHit.style('cursor', 'grab');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  // ── Y-axis drag: JMP-style ──────────────────────────────────────────
  //   drag along axis (up/down) → PAN y domain
  //   drag perpendicular (left/right) → SCALE y domain
  yAxisHit.on('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (!currentScales) return;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startYMin = currentScales.yMin;
    const startYMax = currentScales.yMax;
    const yRange = startYMax - startYMin;
    const pixelRange = currentHeight - config.padding.top - config.padding.bottom;

    document.body.style.cursor = 'grabbing';
    yAxisHit.style('cursor', 'grabbing');

    const onMove = (e) => {
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;

      // Pan: drag up/down moves the visible range (inverted: SVG y increases downward)
      const panDelta = dy * (yRange / pixelRange); // drag up = see higher values
      // Scale: drag left/right zooms (right = zoom in, left = zoom out)
      const scaleFactor = Math.max(0.1, 1 - dx * 0.005); // drag right = zoom in

      const center = (startYMin + startYMax) / 2 + panDelta;
      const halfRange = yRange / 2 * scaleFactor;
      config.onAxisDrag?.({ axis: 'y', yMin: center - halfRange, yMax: center + halfRange });
    };
    const onUp = () => {
      document.body.style.cursor = '';
      yAxisHit.style('cursor', 'grab');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  // ── Double-click to reset ──────────────────────────────────────────
  xAxisHit.on('dblclick', () => config.onAxisReset?.('x'));
  yAxisHit.on('dblclick', () => config.onAxisReset?.('y'));

  // Track last data for re-rendering on resize
  let lastData = null;

  // ResizeObserver — re-render when container size changes
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0 && (Math.abs(width - currentWidth) > 2 || Math.abs(height - currentHeight) > 2)) {
        currentWidth = width;
        currentHeight = height;
        svg.attr('viewBox', `0 0 ${currentWidth} ${currentHeight}`);
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
    if (currentWidth < 10 || currentHeight < 10) return; // Skip if too small
    const seriesKey = data.seriesKey || 'primaryValue';
    const seriesType = data.seriesType || 'primary';
    const sizedConfig = {
      ...config,
      width: currentWidth,
      height: currentHeight,
      xDomainOverride: data.toggles.xDomainOverride ?? null,
      yDomainOverride: data.toggles.yDomainOverride ?? null,
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
    if (data.toggles.grid) renderGrid(layers.grid, scales, sizedConfig);
    else layers.grid.selectAll('*').remove();

    // Phase boundaries + label chips
    renderPhases(layers.phases, scales, data, sizedConfig);

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

    // Event annotations
    if (data.toggles.events) renderEvents(layers.events, scales, data, sizedConfig);
    else layers.events.selectAll('*').remove();

    // Data points (always rendered, using configurable seriesKey)
    renderPoints(layers.points, scales, data, sizedConfig, seriesKey, seriesType);

    // X-axis labels
    renderAxes(layers.xAxis, scales, data, sizedConfig);

    // Selection halo (using configurable seriesKey)
    renderSelection(layers.selection, scales, data, seriesKey);

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
  }

  /** Sync viewBox to current container size */
  function syncSize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 0 && h > 0) {
      currentWidth = w;
      currentHeight = h;
      svg.attr('viewBox', `0 0 ${w} ${h}`);
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
      const w = container.clientWidth || 400;
      const h = container.clientHeight || 300;
      if (w !== currentWidth || h !== currentHeight) {
        currentWidth = w;
        currentHeight = h;
        svg.attr('viewBox', `0 0 ${w} ${h}`);
        renderAll(data);
      }
    });
  }

  /** Update container reference after SVG is reattached to a new DOM element */
  function remount(newContainer) {
    container = newContainer;
    resizeObserver.disconnect();
    resizeObserver.observe(newContainer);
  }

  /** Remove the chart SVG from the DOM and disconnect observer */
  function destroy() {
    resizeObserver.disconnect();
    svg.remove();
  }

  return { update, destroy, svg, remount };
}

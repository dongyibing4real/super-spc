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
 * @param {object} options - Config overrides + callbacks (onSelectPoint, onContextMenu)
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

  const svg = select(container)
    .append('svg')
    .attr('preserveAspectRatio', 'none')
    .attr('role', 'img')
    .attr('aria-label', 'Control chart')
    .style('width', '100%')
    .style('height', '100%')
    .style('display', 'block');

  // Create layer groups in correct z-order (back to front)
  const layers = {
    zones: svg.append('g').attr('class', 'layer-zones'),
    confidenceBand: svg.append('g').attr('class', 'layer-confidence'),
    grid: svg.append('g').attr('class', 'layer-grid'),
    phases: svg.append('g').attr('class', 'layer-phases'),
    limits: svg.append('g').attr('class', 'layer-limits'),
    challenger: svg.append('g').attr('class', 'layer-challenger'),
    primary: svg.append('g').attr('class', 'layer-primary'),
    events: svg.append('g').attr('class', 'layer-events'),
    points: svg.append('g').attr('class', 'layer-points'),
    xAxis: svg.append('g').attr('class', 'layer-x-axis'),
    selection: svg.append('g').attr('class', 'layer-selection'),
  };

  // Context menu handler on the SVG
  svg.on('contextmenu', (event) => {
    event.preventDefault();
    if (config.onContextMenu) {
      const rect = container.getBoundingClientRect();
      config.onContextMenu(
        event.clientX - rect.left,
        event.clientY - rect.top
      );
    }
  });

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
    const sizedConfig = { ...config, width: currentWidth, height: currentHeight };
    const scales = createScales(data, sizedConfig, seriesKey);

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

    // Limit lines + edge labels
    if (data.toggles.specLimits) renderLimits(layers.limits, scales, data, sizedConfig);
    else layers.limits.selectAll('*').remove();

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

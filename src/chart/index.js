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
 * Create a D3-powered SPC control chart.
 *
 * @param {HTMLElement} container - DOM element to mount the SVG into
 * @param {object} options - Config overrides + callbacks (onSelectPoint, onContextMenu)
 * @returns {{ update: Function, destroy: Function, svg: Selection }}
 */
export function createChart(container, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  // Clear any existing SVG
  select(container).select('svg').remove();

  const svg = select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${config.width} ${config.height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('role', 'img')
    .attr('aria-label', 'XBar control chart');

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

  /**
   * Update the chart with new data. Surgically updates only changed elements.
   * @param {object} data
   */
  function update(data) {
    const scales = createScales(data, config);

    // Zone shading
    if (data.toggles.specLimits) renderZones(layers.zones, scales, data, config);
    else layers.zones.selectAll('*').remove();

    // Confidence band
    if (data.toggles.confidenceBand) renderConfidenceBand(layers.confidenceBand, scales, config);
    else layers.confidenceBand.selectAll('*').remove();

    // Grid lines + Y-axis labels
    if (data.toggles.grid) renderGrid(layers.grid, scales, config);
    else layers.grid.selectAll('*').remove();

    // Phase boundaries + label chips
    renderPhases(layers.phases, scales, data, config);

    // Limit lines + edge labels
    if (data.toggles.specLimits) renderLimits(layers.limits, scales, data, config);
    else layers.limits.selectAll('*').remove();

    // Challenger overlay line
    if (data.toggles.overlay) renderSeries(layers.challenger, scales, data.points, 'challengerValue', 'challenger');
    else layers.challenger.selectAll('*').remove();

    // Primary series line
    renderSeries(layers.primary, scales, data.points, 'primaryValue', 'primary');

    // Event annotations
    if (data.toggles.events) renderEvents(layers.events, scales, data, config);
    else layers.events.selectAll('*').remove();

    // Data points (always rendered)
    renderPoints(layers.points, scales, data, config);

    // X-axis labels
    renderAxes(layers.xAxis, scales, data, config);

    // Selection halo
    renderSelection(layers.selection, scales, data);
  }

  /** Remove the chart SVG from the DOM */
  function destroy() {
    svg.remove();
  }

  return { update, destroy, svg };
}

import { select } from 'd3-selection';

/**
 * Create the SVG skeleton: root element, clip path, layer groups, and axis hit regions.
 * Returns all the D3 selections needed by the chart orchestrator.
 */
export function createSvgSkeleton(container) {
  select(container).select('svg').remove();

  const svg = select(container)
    .append('svg')
    .attr('role', 'img')
    .attr('aria-label', 'Control chart')
    .style('display', 'block')
    .style('overflow', 'visible');

  const clipId = `plot-clip-${Math.random().toString(36).slice(2, 8)}`;
  const defs = svg.append('defs');
  const clipRect = defs.append('clipPath').attr('id', clipId)
    .append('rect');

  const plotClip = svg.append('g').attr('clip-path', `url(#${clipId})`);

  const layers = {
    zones: plotClip.append('g').attr('class', 'layer-zones'),
    confidenceBand: plotClip.append('g').attr('class', 'layer-confidence'),
    grid: plotClip.append('g').attr('class', 'layer-grid'),
    gridLabels: svg.append('g').attr('class', 'layer-grid-labels'),
    phases: plotClip.append('g').attr('class', 'layer-phases'),
    phaseLabels: svg.append('g').attr('class', 'layer-phase-labels'),
    limits: plotClip.append('g').attr('class', 'layer-limits'),
    limitLabels: svg.append('g').attr('class', 'layer-limit-labels'),
    secondary: plotClip.append('g').attr('class', 'layer-secondary'),
    primary: plotClip.append('g').attr('class', 'layer-primary'),
    projection: plotClip.append('g').attr('class', 'layer-projection'),
    events: plotClip.append('g').attr('class', 'layer-events'),
    points: plotClip.append('g').attr('class', 'layer-points'),
    projectionUi: svg.append('g').attr('class', 'layer-projection-ui'),
    xAxis: svg.append('g').attr('class', 'layer-x-axis'),
    xTitle: svg.append('g').attr('class', 'layer-x-title'),
    yTitle: svg.append('g').attr('class', 'layer-y-title'),
    forecastHandle: svg.append('g').attr('class', 'layer-forecast-handle'),
    marquee: svg.append('g').attr('class', 'layer-marquee'),
  };

  const xAxisHit = svg.append('rect')
    .attr('class', 'axis-hit axis-hit-x')
    .attr('fill', 'transparent')
    .style('cursor', 'grab');

  const yAxisHit = svg.append('rect')
    .attr('class', 'axis-hit axis-hit-y')
    .attr('fill', 'transparent')
    .style('cursor', 'grab');

  return { svg, defs, clipRect, layers, xAxisHit, yAxisHit };
}

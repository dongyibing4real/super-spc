import type { Selection } from 'd3-selection';
import { select } from 'd3-selection';

export interface ChartLayers {
  zones: Selection<SVGGElement, unknown, null, undefined>;
  confidenceBand: Selection<SVGGElement, unknown, null, undefined>;
  grid: Selection<SVGGElement, unknown, null, undefined>;
  gridLabels: Selection<SVGGElement, unknown, null, undefined>;
  phases: Selection<SVGGElement, unknown, null, undefined>;
  phaseLabels: Selection<SVGGElement, unknown, null, undefined>;
  limits: Selection<SVGGElement, unknown, null, undefined>;
  limitLabels: Selection<SVGGElement, unknown, null, undefined>;
  secondary: Selection<SVGGElement, unknown, null, undefined>;
  primary: Selection<SVGGElement, unknown, null, undefined>;
  projection: Selection<SVGGElement, unknown, null, undefined>;
  events: Selection<SVGGElement, unknown, null, undefined>;
  points: Selection<SVGGElement, unknown, null, undefined>;
  projectionUi: Selection<SVGGElement, unknown, null, undefined>;
  xAxis: Selection<SVGGElement, unknown, null, undefined>;
  xTitle: Selection<SVGGElement, unknown, null, undefined>;
  yTitle: Selection<SVGGElement, unknown, null, undefined>;
  forecastHandle: Selection<SVGGElement, unknown, null, undefined>;
  marquee: Selection<SVGGElement, unknown, null, undefined>;
}

export interface SvgSkeleton {
  svg: Selection<SVGSVGElement, unknown, null, undefined>;
  defs: Selection<SVGDefsElement, unknown, null, undefined>;
  clipRect: Selection<SVGRectElement, unknown, null, undefined>;
  layers: ChartLayers;
  xAxisHit: Selection<SVGRectElement, unknown, null, undefined>;
  yAxisHit: Selection<SVGRectElement, unknown, null, undefined>;
}

/**
 * Create the SVG skeleton: root element, clip path, layer groups, and axis hit regions.
 * Returns all the D3 selections needed by the chart orchestrator.
 */
export function createSvgSkeleton(container: HTMLElement): SvgSkeleton {
  select(container).select('svg').remove();

  const svg = select(container)
    .append('svg')
    .attr('role', 'img')
    .attr('aria-label', 'Control chart')
    .style('display', 'block')
    .style('overflow', 'visible') as Selection<SVGSVGElement, unknown, null, undefined>;

  const clipId = `plot-clip-${Math.random().toString(36).slice(2, 8)}`;
  const defs = svg.append('defs') as Selection<SVGDefsElement, unknown, null, undefined>;
  const clipRect = defs.append('clipPath').attr('id', clipId)
    .append('rect') as Selection<SVGRectElement, unknown, null, undefined>;

  const plotClip = svg.append('g').attr('clip-path', `url(#${clipId})`);

  const layers: ChartLayers = {
    zones: plotClip.append('g').attr('class', 'layer-zones') as Selection<SVGGElement, unknown, null, undefined>,
    confidenceBand: plotClip.append('g').attr('class', 'layer-confidence') as Selection<SVGGElement, unknown, null, undefined>,
    grid: plotClip.append('g').attr('class', 'layer-grid') as Selection<SVGGElement, unknown, null, undefined>,
    gridLabels: svg.append('g').attr('class', 'layer-grid-labels') as Selection<SVGGElement, unknown, null, undefined>,
    phases: plotClip.append('g').attr('class', 'layer-phases') as Selection<SVGGElement, unknown, null, undefined>,
    phaseLabels: svg.append('g').attr('class', 'layer-phase-labels') as Selection<SVGGElement, unknown, null, undefined>,
    limits: plotClip.append('g').attr('class', 'layer-limits') as Selection<SVGGElement, unknown, null, undefined>,
    limitLabels: svg.append('g').attr('class', 'layer-limit-labels') as Selection<SVGGElement, unknown, null, undefined>,
    secondary: plotClip.append('g').attr('class', 'layer-secondary') as Selection<SVGGElement, unknown, null, undefined>,
    primary: plotClip.append('g').attr('class', 'layer-primary') as Selection<SVGGElement, unknown, null, undefined>,
    projection: plotClip.append('g').attr('class', 'layer-projection') as Selection<SVGGElement, unknown, null, undefined>,
    events: plotClip.append('g').attr('class', 'layer-events') as Selection<SVGGElement, unknown, null, undefined>,
    points: plotClip.append('g').attr('class', 'layer-points') as Selection<SVGGElement, unknown, null, undefined>,
    projectionUi: svg.append('g').attr('class', 'layer-projection-ui') as Selection<SVGGElement, unknown, null, undefined>,
    xAxis: svg.append('g').attr('class', 'layer-x-axis') as Selection<SVGGElement, unknown, null, undefined>,
    xTitle: svg.append('g').attr('class', 'layer-x-title') as Selection<SVGGElement, unknown, null, undefined>,
    yTitle: svg.append('g').attr('class', 'layer-y-title') as Selection<SVGGElement, unknown, null, undefined>,
    forecastHandle: svg.append('g').attr('class', 'layer-forecast-handle') as Selection<SVGGElement, unknown, null, undefined>,
    marquee: svg.append('g').attr('class', 'layer-marquee') as Selection<SVGGElement, unknown, null, undefined>,
  };

  const xAxisHit = svg.append('rect')
    .attr('class', 'axis-hit axis-hit-x')
    .attr('fill', 'transparent')
    .style('cursor', 'grab') as Selection<SVGRectElement, unknown, null, undefined>;

  const yAxisHit = svg.append('rect')
    .attr('class', 'axis-hit axis-hit-y')
    .attr('fill', 'transparent')
    .style('cursor', 'grab') as Selection<SVGRectElement, unknown, null, undefined>;

  return { svg, defs, clipRect, layers, xAxisHit, yAxisHit };
}

import { fmt } from './utils.js';
import { select as _d3Select } from 'd3-selection';

/**
 * Render data point circles with rule violation markers and exclusion marks.
 * @param {string} [seriesKey='primaryValue'] - Which value key to plot
 * @param {string} [seriesType='primary'] - CSS class for point styling
 */
export function renderPoints(layer, scales, data, config, seriesKey = 'primaryValue', seriesType = 'primary') {
  const { x, y } = scales;
  const { points, violations, toggles, selectedIndex } = data;

  // Scale point radii to density — shrink when packed, but stay visible
  const plotWidth = config.width - config.padding.left - config.padding.right;
  const spacing = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;
  const scale = Math.max(0.4, Math.min(1, spacing / 12));
  const rNormal   = Math.max(3, 4 * scale);
  const rOOC      = Math.max(3.5, 5 * scale);
  const rSelected = Math.max(4, 6 * scale);
  // Ring + hit stay prominent — decoupled from point scaling
  const rRing     = Math.max(6, 8 * scale);
  const rHit      = Math.max(8, 10 * scale);
  const xSize     = Math.max(2.5, 3 * scale);

  // Bind point groups
  const groups = layer.selectAll('g.point-group')
    .data(points, (d, i) => d.id || i);

  const enter = groups.enter().append('g').attr('class', 'point-group');
  const merged = enter.merge(groups);

  // Update group attributes
  merged
    .attr('data-point-index', (d, i) => i)
    .classed('is-excluded', d => d.excluded);

  // Clear inner elements on each update (simpler than nested join for complex conditional children)
  merged.selectAll('*').remove();

  merged.each(function (d, i) {
    const g = _d3Select(this);
    const val = d[seriesKey];
    const cx = x(i);
    const cy = y(val);
    // Use phase-specific limits when phases are defined; each phase can have
    // distinct UCL/LCL, so checking against the dataset-level limits is wrong
    // for points that fall in a later phase.
    const activePhase = data.phases && data.phases.length > 0
      ? data.phases.find(p => i >= p.start && i <= p.end)
      : null;
    const effectiveLimits = activePhase ? activePhase.limits : data.limits;
    const ooc = val >= effectiveLimits.ucl || val <= effectiveLimits.lcl;
    const rules = violations.get(i);
    const hasViolation = rules && rules.length > 0;

    // Excluded X-mark
    if (d.excluded && toggles.excludedMarkers) {
      g.append('line').attr('class', 'excluded-mark')
        .attr('x1', cx - xSize).attr('y1', cy - xSize).attr('x2', cx + xSize).attr('y2', cy + xSize);
      g.append('line').attr('class', 'excluded-mark')
        .attr('x1', cx + xSize).attr('y1', cy - xSize).attr('x2', cx - xSize).attr('y2', cy + xSize);
    }

    // Rule violation ring — subtle indicator, not dominant
    if (hasViolation && !d.excluded) {
      const ringStroke = Math.max(1, 1.5 * scale);
      g.append('circle').attr('class', 'rule-violation-ring')
        .attr('cx', cx).attr('cy', cy).attr('r', rRing)
        .attr('stroke', ooc ? 'rgba(205,66,70,0.4)' : 'rgba(200,118,25,0.4)')
        .attr('stroke-width', ringStroke);
    }

    // Invisible hit circle — expands click target
    g.append('circle')
      .attr('class', 'point-hit')
      .attr('cx', cx).attr('cy', cy).attr('r', rHit)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', `${d.label}, ${fmt(val)} ${data.metric.unit}${hasViolation ? `, rules: ${rules.join(',')}` : ''}`)
      .on('click', (event) => {
        event.stopPropagation();
        if (config.onSelectPoint) config.onSelectPoint(i);
      });

    // Main data point circle (visual only — hit target is the invisible circle above)
    const pointClass = seriesType === 'challenger' ? 'chart-point challenger-point' : 'chart-point';
    const r = i === selectedIndex ? rSelected : ooc ? rOOC : rNormal;
    g.append('circle')
      .attr('class', `${pointClass}${ooc ? ' ooc' : ''}`)
      .attr('cx', cx).attr('cy', cy).attr('r', r)
      .style('pointer-events', 'none');
  });

  groups.exit().remove();
}

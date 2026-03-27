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
    const ooc = val >= data.limits.ucl || val <= data.limits.lcl;
    const rules = violations.get(i);
    const hasViolation = rules && rules.length > 0;

    // Excluded X-mark
    if (d.excluded && toggles.excludedMarkers) {
      g.append('line').attr('class', 'excluded-mark')
        .attr('x1', cx - 3).attr('y1', cy - 3).attr('x2', cx + 3).attr('y2', cy + 3);
      g.append('line').attr('class', 'excluded-mark')
        .attr('x1', cx + 3).attr('y1', cy - 3).attr('x2', cx - 3).attr('y2', cy + 3);
    }

    // Rule violation ring — subtle indicator, not dominant
    if (hasViolation && !d.excluded) {
      g.append('circle').attr('class', 'rule-violation-ring')
        .attr('cx', cx).attr('cy', cy).attr('r', 6)
        .attr('stroke', ooc ? 'rgba(205,66,70,0.4)' : 'rgba(200,118,25,0.4)')
        .attr('stroke-width', 1);
    }

    // Invisible hit circle — expands click target to 16px diameter
    g.append('circle')
      .attr('class', 'point-hit')
      .attr('cx', cx).attr('cy', cy).attr('r', 8)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', `${d.lot}, ${fmt(val)} ${data.metric.unit}${hasViolation ? `, rules: ${rules.join(',')}` : ''}`)
      .on('click', (event) => {
        event.stopPropagation();
        if (config.onSelectPoint) config.onSelectPoint(i);
      });

    // Main data point circle (visual only — hit target is the invisible circle above)
    const pointClass = seriesType === 'challenger' ? 'chart-point challenger-point' : 'chart-point';
    const r = i === selectedIndex ? 6 : ooc ? 5 : 4;
    g.append('circle')
      .attr('class', `${pointClass}${ooc ? ' ooc' : ''}`)
      .attr('cx', cx).attr('cy', cy).attr('r', r)
      .style('pointer-events', 'none');
  });

  groups.exit().remove();
}

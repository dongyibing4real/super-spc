import { fmt } from './utils.js';

/**
 * Render data point circles with rule violation markers and exclusion marks.
 */
export function renderPoints(layer, scales, data, config) {
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
    const cx = x(i);
    const cy = y(d.primaryValue);
    const ooc = d.primaryValue >= data.limits.ucl || d.primaryValue <= data.limits.lcl;
    const rules = violations.get(i);
    const hasViolation = rules && rules.length > 0;

    // Excluded X-mark
    if (d.excluded && toggles.excludedMarkers) {
      g.append('line').attr('class', 'excluded-mark')
        .attr('x1', cx - 3).attr('y1', cy - 3).attr('x2', cx + 3).attr('y2', cy + 3);
      g.append('line').attr('class', 'excluded-mark')
        .attr('x1', cx + 3).attr('y1', cy - 3).attr('x2', cx - 3).attr('y2', cy + 3);
    }

    // Rule violation ring
    if (hasViolation && !d.excluded) {
      g.append('circle').attr('class', 'rule-violation-ring')
        .attr('cx', cx).attr('cy', cy).attr('r', 8)
        .attr('stroke', ooc ? 'rgba(205,66,70,0.6)' : 'rgba(200,118,25,0.6)');
    }

    // Main data point circle
    const r = i === selectedIndex ? 6 : ooc ? 5 : 4;
    g.append('circle')
      .attr('class', `chart-point${ooc ? ' ooc' : ''}`)
      .attr('cx', cx).attr('cy', cy).attr('r', r)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', `${d.lot}, ${fmt(d.primaryValue)} ${data.metric.unit}${hasViolation ? `, rules: ${rules.join(',')}` : ''}`)
      .on('click', (event) => {
        event.stopPropagation();
        if (config.onSelectPoint) config.onSelectPoint(i);
      });
  });

  groups.exit().remove();
}

// Lazy import to avoid circular — d3-selection is imported at module level
import { select as _d3Select } from 'd3-selection';

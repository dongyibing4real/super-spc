import { fmt } from './utils.js';
import { select as _d3Select } from 'd3-selection';

/**
 * Render data point circles with rule violation markers and exclusion marks.
 * @param {string} [seriesKey='primaryValue'] - Which value key to plot
 */
export function renderPoints(layer, scales, data, config, seriesKey = 'primaryValue') {
  const { x, y } = scales;
  const { points, violations, toggles, selectedIndex, selectedIndices } = data;

  // Scale point radii to density: shrink when packed, but stay visible.
  // Industry standard (JMP/Minitab): small points, color is the signal, not size.
  const plotWidth = config.width - config.padding.left - config.padding.right;
  const spacing = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;
  const scale = Math.max(0.4, Math.min(1, spacing / 12));
  const rNormal = Math.max(2.5, 3.5 * scale);
  const rOOC = Math.max(2.5, 3.5 * scale);        // same size as normal — color is the differentiator
  const rSelected = Math.max(3.0, 4.0 * scale);   // slightly larger when selected
  const rHit = Math.max(8, 10 * scale);
  const xSize = Math.max(2, 2.5 * scale);

  const groups = layer.selectAll('g.point-group')
    .data(points, (d, i) => d.id || i);

  const enter = groups.enter().append('g').attr('class', 'point-group');
  const merged = enter.merge(groups);

  merged
    .attr('data-point-index', (d, i) => i)
    .classed('is-excluded', d => d.excluded);

  merged.selectAll('*').remove();

  merged.each(function (d, i) {
    const g = _d3Select(this);
    const val = d[seriesKey];
    const cx = x(i);
    const cy = y(val);
    const activePhase = data.phases && data.phases.length > 0
      ? data.phases.find(p => i >= p.start && i <= p.end)
      : null;
    const effectiveLimits = activePhase ? activePhase.limits : data.limits;
    const ooc = val >= effectiveLimits.ucl || val <= effectiveLimits.lcl;
    const rules = violations.get(i);
    const hasViolation = rules && rules.length > 0;
    // Rule ring only for non-limit rules (2+). Rule "1" (beyond limits) is already shown by red fill.
    const hasRuleViolation = rules && rules.some(r => r !== '1');

    if (d.excluded && toggles.excludedMarkers) {
      g.append('line').attr('class', 'excluded-mark')
        .attr('x1', cx - xSize).attr('y1', cy - xSize).attr('x2', cx + xSize).attr('y2', cy + xSize);
      g.append('line').attr('class', 'excluded-mark')
        .attr('x1', cx + xSize).attr('y1', cy - xSize).attr('x2', cx - xSize).attr('y2', cy + xSize);
    }

    // Larger invisible hit target keeps interaction easy without bloating the visual mark.
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

    const pointClass = 'chart-point';
    // Support both single and multi-point selection
    const hasMultiSelection = selectedIndices && selectedIndices.length > 0;
    const isMultiSelected = hasMultiSelection && selectedIndices.includes(i);
    const isSelected = hasMultiSelection ? isMultiSelected : (i === selectedIndex);
    const r = isSelected ? rSelected : ooc ? rOOC : rNormal;
    const hasSelection = hasMultiSelection || (selectedIndex != null && selectedIndex >= 0 && selectedIndex < points.length);

    // Rule violation ring — subtle ring behind the point (rules 2+ only)
    if (hasRuleViolation) {
      g.append('circle')
        .attr('class', 'violation-ring')
        .attr('cx', cx).attr('cy', cy).attr('r', r + 2.5)
        .style('pointer-events', 'none');
    }

    const circle = g.append('circle')
      .attr('class', `${pointClass}${ooc ? ' ooc' : ''}`)
      .attr('cx', cx).attr('cy', cy).attr('r', r)
      .style('pointer-events', 'none');
    // JMP-style selection: selected point(s) full opacity, others dim
    if (hasSelection && !isSelected) {
      circle.style('opacity', 0.35);
      if (hasRuleViolation) g.select('.violation-ring').style('opacity', 0.35);
    }
  });

  groups.exit().remove();
}

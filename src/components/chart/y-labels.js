/**
 * JMP-style y-axis label: function(measurement) depending on chart type.
 * e.g., "Average of Thickness" for X-Bar, "Range of Thickness" for R chart.
 */
const CHART_Y_LABELS = {
  imr:            (m) => m,
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

export function getYAxisLabel(chartTypeId, metricLabel) {
  const fn = CHART_Y_LABELS[chartTypeId];
  return fn ? fn(metricLabel) : metricLabel;
}

/**
 * Render axis title labels.
 *   X-axis: subgroup variable name (JMP convention)
 *   Y-axis: function(measurement) (JMP convention)
 */
export function renderAxisTitles(xTitleLayer, yTitleLayer, data, config) {
  const p = config.padding;
  const W = config.width;
  const H = config.height;
  const plotCenterX = p.left + (W - p.left - p.right) / 2;
  const plotCenterY = p.top + (H - p.top - p.bottom) / 2;

  xTitleLayer.selectAll('*').remove();
  yTitleLayer.selectAll('*').remove();

  if (!config.showAxisTitles) return;

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

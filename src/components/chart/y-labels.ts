import type { Selection } from 'd3-selection';

/**
 * JMP-style y-axis label: function(measurement) depending on chart type.
 * e.g., "Average of Thickness" for X-Bar, "Range of Thickness" for R chart.
 */
const CHART_Y_LABELS: Record<string, (m: string) => string> = {
  imr:            (m: string) => m,
  mr:             (m: string) => `Moving Range of ${m}`,
  xbar_r:         (m: string) => `Average of ${m}`,
  xbar_s:         (m: string) => `Average of ${m}`,
  r:              (m: string) => `Range of ${m}`,
  s:              (m: string) => `Std Dev of ${m}`,
  p:              (_: string) => 'Proportion',
  np:             (_: string) => 'Count',
  c:              (_: string) => 'Count',
  u:              (_: string) => 'Rate',
  laney_p:        (_: string) => 'Proportion',
  laney_u:        (_: string) => 'Rate',
  cusum:          (m: string) => `Cumulative Sum of ${m}`,
  cusum_vmask:    (m: string) => `Cumulative Sum of ${m}`,
  ewma:           (m: string) => `EWMA of ${m}`,
  levey_jennings: (m: string) => m,
  hotelling_t2:   (_: string) => 'T\u00B2 Statistic',
  mewma:          (_: string) => 'MEWMA Statistic',
  g:              (_: string) => 'Count Between Events',
  t:              (_: string) => 'Time Between Events',
  run:            (m: string) => m,
  short_run:      (m: string) => m,
  three_way:      (m: string) => m,
  presummarize:   (m: string) => `Average of ${m}`,
};

export function getYAxisLabel(chartTypeId: string, metricLabel: string): string {
  const fn = CHART_Y_LABELS[chartTypeId];
  return fn ? fn(metricLabel) : metricLabel;
}

interface AxisTitleData {
  subgroup?: { id?: string; label?: string };
  metric?: { label?: string };
  chartType?: { id?: string };
}

interface AxisTitleConfig {
  padding: { top: number; right: number; bottom: number; left: number };
  width: number;
  height: number;
  showAxisTitles: boolean;
}

/**
 * Render axis title labels.
 *   X-axis: subgroup variable name (JMP convention)
 *   Y-axis: function(measurement) (JMP convention)
 */
export function renderAxisTitles(
  xTitleLayer: Selection<SVGGElement, unknown, null, undefined>,
  yTitleLayer: Selection<SVGGElement, unknown, null, undefined>,
  data: AxisTitleData,
  config: AxisTitleConfig
): void {
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

/**
 * params.js — Param-domain functions that transform chart params into UI context.
 */
import { CHART_TYPE_LABELS, SIGMA_METHOD_LABELS } from "../constants.js";

export function applyParamsToContext(context, params) {
  const chartLabel = params.chart_type
    ? (CHART_TYPE_LABELS[params.chart_type] || params.chart_type)
    : "Select\u2026";
  const result = {
    ...context,
    chartType: {
      id: params.chart_type || null,
      label: chartLabel,
      detail: params.chart_type ? "" : "No chart type selected",
    },
    sigma: {
      label: `${params.k_sigma} Sigma`,
      detail: SIGMA_METHOD_LABELS[params.sigma_method] || params.sigma_method,
    },
    methodBadge: params.chart_type ? chartLabel : "",
  };
  // Per-chart column overrides
  if (params.value_column) {
    result.metric = { id: params.value_column, label: params.value_column, unit: "" };
  }
  if (params.subgroup_column) {
    result.subgroup = { id: params.subgroup_column, label: params.subgroup_column, detail: `Grouped by ${params.subgroup_column}` };
  } else {
    result.subgroup = { id: "individual", label: "Individual", detail: "n=1" };
  }
  if (params.phase_column) {
    result.phase = { id: params.phase_column, label: params.phase_column, detail: `By ${params.phase_column}` };
  } else {
    result.phase = { id: "single", label: "Single phase", detail: "No phase boundaries" };
  }
  return result;
}

/**
 * Returns a Set of chart type keys that are invalid given current params and columns.
 * Used by recipe-rail to disable unselectable <option> elements.
 */
export function getDisabledChartTypes(params, columns) {
  const disabled = new Set();

  if (!params.value_column) {
    return new Set(Object.keys(CHART_TYPE_LABELS));
  }
  // Subgroup-required charts are NOT disabled when subgroup is null.
  // reconcileParams handles cascading; the UI shows a warning chip instead.
  const numericCount = columns.filter((c) => c.dtype === "numeric").length;
  if (numericCount < 2) {
    disabled.add("hotelling_t2");
    disabled.add("mewma");
  }
  return disabled;
}

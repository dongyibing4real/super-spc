/**
 * helpers.js 鈥?Shared utility functions and constants.
 * Pure functions, no side effects, no mutable state.
 */

export function toneClass(tone) {
  return { critical: "critical", info: "info", neutral: "neutral", positive: "positive", warning: "warning" }[tone] || "neutral";
}

export function getCapability(state, id = null) {
  if (!id) id = state.focusedChartId || state.chartOrder[0];
  return state.charts[id]?.capability || { cpk: null, ppk: null, cp: null };
}

export function capClass(val, threshold = 1.33, marginal = 1.0) {
  const v = parseFloat(val);
  if (v >= threshold) return "good";
  if (v >= marginal) return "marginal";
  return "poor";
}

export function detectRuleViolations(state, id = null) {
  if (!id) id = state.focusedChartId || state.chartOrder[0];
  const violations = new Map();
  const stateViolations = state.charts[id]?.violations || [];
  stateViolations.forEach(v => {
    v.indices.forEach(idx => {
      if (!violations.has(idx)) violations.set(idx, []);
      violations.get(idx).push(v.testId);
    });
  });
  return violations;
}

export const NAV = [
  ["workspace", "WK", "Workspace"],
  ["dataprep", "DP", "Data Prep"],
  ["methodlab", "ML", "Method Lab"],
  ["findings", "FD", "Findings"]
];

export const CHART_TYPE_LABELS = {
  imr: "IMR", xbar_r: "X-Bar R", xbar_s: "X-Bar S",
  r: "R", s: "S", mr: "MR",
  p: "P", np: "NP", c: "C", u: "U", laney_p: "Laney P", laney_u: "Laney U",
  cusum: "CUSUM", ewma: "EWMA", levey_jennings: "Levey-Jennings",
  cusum_vmask: "CUSUM V-Mask", three_way: "Three-Way",
  presummarize: "Presummarize", run: "Run Chart",
  short_run: "Short Run", g: "G", t: "T",
  hotelling_t2: "Hotelling T\u00B2", mewma: "MEWMA",
};

/** Chart types that only accept individual measurements (n=1). Subgroup must be cleared. */
export const INDIVIDUAL_ONLY = new Set(["imr", "mr", "levey_jennings", "run", "g", "t"]);

/** Chart types that require a subgroup column. */
export const SUBGROUP_REQUIRED = new Set([
  "xbar_r", "xbar_s", "r", "s",
  "p", "np", "c", "u", "laney_p", "laney_u",
  "three_way", "presummarize",
]);

export const SIGMA_METHOD_LABELS = {
  moving_range: "Moving Range", median_moving_range: "Median MR",
  range: "Range", stddev: "Std Dev", levey_jennings: "Levey-Jennings",
};

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

export function computeStats(points) {
  if (!points || !points.length) return null;
  const values = points.map(p => p.value).filter(v => v != null && !isNaN(v));
  const n = values.length;
  if (n === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((s, v) => s + v, 0);
  const mean = sum / n;
  const variance = n > 1 ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  const std = Math.sqrt(variance);
  const median = n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const subgroups = new Set(points.map(p => p.subgroup).filter(Boolean));
  return { n, mean, std, min: sorted[0], max: sorted[n - 1], median, subgroupCount: subgroups.size };
}

export function formatDate(isoStr) {
  if (!isoStr) return "\u2014";
  const d = new Date(isoStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}


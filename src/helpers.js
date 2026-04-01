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

export function capClass(val) {
  const v = parseFloat(val);
  if (v >= 1.33) return "good";
  if (v >= 1.0) return "marginal";
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

export const SIGMA_METHOD_LABELS = {
  moving_range: "Moving Range", median_moving_range: "Median MR",
  range: "Range", stddev: "Std Dev", levey_jennings: "Levey-Jennings",
};

export function applyParamsToContext(context, params) {
  const result = {
    ...context,
    chartType: {
      id: params.chart_type,
      label: CHART_TYPE_LABELS[params.chart_type] || params.chart_type,
      detail: "",
    },
    sigma: {
      label: `${params.k_sigma} Sigma`,
      detail: SIGMA_METHOD_LABELS[params.sigma_method] || params.sigma_method,
    },
    methodBadge: CHART_TYPE_LABELS[params.chart_type] || params.chart_type,
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


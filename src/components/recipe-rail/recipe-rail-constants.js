export const CHART_TYPES = [
  ["Variables", [["imr","IMR"],["xbar_r","X-Bar R"],["xbar_s","X-Bar S"],["r","R"],["s","S"],["mr","MR"]]],
  ["Attributes", [["p","P"],["np","NP"],["c","C"],["u","U"],["laney_p","Laney P\u2019"],["laney_u","Laney U\u2019"]]],
  ["Advanced", [["cusum","CUSUM"],["ewma","EWMA"],["levey_jennings","Levey-Jennings"],["cusum_vmask","CUSUM V-Mask"],["three_way","Three-Way"],["presummarize","Presummarize"],["run","Run Chart"]]],
  ["Short Run", [["short_run","Short Run"]]],
  ["Rare Event", [["g","G"],["t","T"]]],
  ["Multivariate", [["hotelling_t2","Hotelling T\u00B2"],["mewma","MEWMA"]]],
];
export const SIGMA_METHODS = [["moving_range","Moving Range"],["median_moving_range","Median MR"],["range","Range"],["stddev","Std Dev"],["levey_jennings","Levey-Jennings"]];
export const NELSON_RULES = [[1,"1: Beyond 3\u03c3"],[2,"2: 9 same side"],[3,"3: 6 trending"],[4,"4: 14 alternating"],[5,"5: 2/3 beyond 2\u03c3"],[6,"6: 4/5 beyond 1\u03c3"],[7,"7: 15 within 1\u03c3"],[8,"8: 8 beyond 1\u03c3"]];

export const SIGMA_METHOD_CHARTS = new Set(["imr"]);
export const NO_SIGMA_CHARTS = new Set(["p","np","c","u","laney_p","laney_u","cusum","ewma","cusum_vmask","hotelling_t2","mewma","run"]);

export const RECIPE_KEYS = new Set(["chart_type", "value_column", "subgroup_column", "phase_column"]);

export function parseNullableNumber(value) {
  const trimmed = value.trim();
  return trimmed !== "" ? parseFloat(trimmed) : null;
}

export function specSummary(params) {
  const parts = [];
  if (params.lsl != null) parts.push(`LSL ${params.lsl}`);
  if (params.target != null) parts.push(`T ${params.target}`);
  if (params.usl != null) parts.push(`USL ${params.usl}`);
  return parts.length > 0 ? parts.join(" \u2013 ") : "Not set";
}

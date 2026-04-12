/**
 * constants.js — Domain constants for SPC chart types, navigation, and labels.
 * Pure data, no logic, no side effects.
 */

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

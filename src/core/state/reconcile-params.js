/**
 * reconcile-params.js -- Single source of truth for recipe parameter constraints.
 *
 * Every param mutation in the app routes through reconcileParams() before
 * hitting the store.  This eliminates scattered validation logic and the
 * circular-lock bug where INDIVIDUAL_ONLY charts blocked switching to
 * SUBGROUP_REQUIRED charts.
 *
 * Cascade rules (single forward pass, no loops -- the cascade is a DAG):
 *
 *   1. Merge patch into old params
 *   2. Value cleared  → reset subgroup + chart_type to null
 *   3. Chart type changed →
 *        INDIVIDUAL_ONLY   : save previous to lastSubgroupedType, clear subgroup
 *        SUBGROUP_REQUIRED : do nothing (warn + block analysis)
 *        null              : no constraint
 *   4. Subgroup changed →
 *        null  + SUBGROUP_REQUIRED : cascade to lastIndividualType || "imr"
 *        set   + INDIVIDUAL_ONLY   : cascade to lastSubgroupedType || "xbar_r"
 *        set   + FLEXIBLE          : keep chart_type
 *        set   + null              : keep null
 *   5. Validate column references exist in columns array
 */

import { INDIVIDUAL_ONLY, SUBGROUP_REQUIRED } from "../../helpers.js";

const DEFAULT_CASCADE_MEMORY = {
  lastIndividualType: null,
  lastSubgroupedType: null,
};

/**
 * @param {object}  oldParams       Current complete params object
 * @param {object}  patch           The user's intended change (e.g. { chart_type: "xbar_r" })
 * @param {Array}   columns         Column config array with { name, dtype, role }
 * @param {object}  [cascadeMemory] Previous cascade memory (lastIndividualType, lastSubgroupedType)
 * @returns {{ params: object, cascadeMemory: object }}
 */
export function reconcileParams(oldParams, patch, columns, cascadeMemory) {
  const p = { ...oldParams, ...patch };
  const mem = { ...(cascadeMemory || DEFAULT_CASCADE_MEMORY) };
  const colNames = new Set(columns.map((c) => c.name));

  // -- Step 2: value cleared → reset everything -------------------------
  if (!p.value_column) {
    p.subgroup_column = null;
    p.chart_type = null;
    return { params: p, cascadeMemory: mem };
  }

  // -- Step 3: chart_type changed → fix subgroup ------------------------
  if ("chart_type" in patch) {
    if (INDIVIDUAL_ONLY.has(p.chart_type)) {
      // Save previous type for cascade memory if it was subgroup-required
      if (oldParams.chart_type && SUBGROUP_REQUIRED.has(oldParams.chart_type)) {
        mem.lastSubgroupedType = oldParams.chart_type;
      }
      p.subgroup_column = null;
    }
    // SUBGROUP_REQUIRED + no subgroup: do nothing here. Warning shows in UI,
    // analysis blocked in validatedRunAnalysis, chart data cleared by caller.

    // Save to memory when explicitly choosing a chart type
    if (p.chart_type && INDIVIDUAL_ONLY.has(p.chart_type)) {
      mem.lastIndividualType = p.chart_type;
    }
    if (p.chart_type && SUBGROUP_REQUIRED.has(p.chart_type)) {
      mem.lastSubgroupedType = p.chart_type;
    }
  }

  // -- Step 4: subgroup_column changed → fix chart_type -----------------
  if ("subgroup_column" in patch) {
    if (!p.subgroup_column && SUBGROUP_REQUIRED.has(p.chart_type)) {
      // Clearing subgroup on a chart that needs it: cascade to individual
      mem.lastSubgroupedType = p.chart_type;
      p.chart_type = mem.lastIndividualType || "imr";
    } else if (p.subgroup_column && INDIVIDUAL_ONLY.has(p.chart_type)) {
      // Setting subgroup on an individual chart: cascade to subgrouped
      mem.lastIndividualType = p.chart_type;
      p.chart_type = mem.lastSubgroupedType || "xbar_r";
    }
    // FLEXIBLE or null chart_type: keep as-is
  }

  // -- Step 5: validate column references still exist -------------------
  if (p.subgroup_column && !colNames.has(p.subgroup_column)) {
    p.subgroup_column = null;
    if (SUBGROUP_REQUIRED.has(p.chart_type)) {
      mem.lastSubgroupedType = p.chart_type;
      p.chart_type = mem.lastIndividualType || "imr";
    }
  }
  if (p.phase_column && !colNames.has(p.phase_column)) {
    p.phase_column = null;
  }
  if (p.value_column && !colNames.has(p.value_column)) {
    p.value_column = null;
    p.subgroup_column = null;
    p.chart_type = null;
  }

  return { params: p, cascadeMemory: mem };
}

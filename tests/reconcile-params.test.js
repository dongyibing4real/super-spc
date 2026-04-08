import test from "node:test";
import assert from "node:assert/strict";

import { reconcileParams } from "../src/core/state/reconcile-params.js";

// ---------------------------------------------------------------------------
// Test columns fixture
// ---------------------------------------------------------------------------

const COLS = [
  { name: "value", dtype: "numeric", role: "value" },
  { name: "batch", dtype: "string", role: "subgroup" },
  { name: "phase", dtype: "string", role: "phase" },
  { name: "extra", dtype: "numeric", role: null },
];

const BASE = {
  chart_type: null,
  sigma_method: "moving_range",
  k_sigma: 3.0,
  nelson_tests: [1, 2, 5],
  value_column: "value",
  subgroup_column: null,
  phase_column: null,
  n_trials: null,
  usl: null,
  lsl: null,
  target: null,
};

// ---------------------------------------------------------------------------
// Step 2: value cleared -> reset everything
// ---------------------------------------------------------------------------

test("clearing value_column resets chart_type and subgroup to null", () => {
  const old = { ...BASE, chart_type: "imr", subgroup_column: "batch" };
  const { params } = reconcileParams(old, { value_column: null }, COLS, null);
  assert.equal(params.value_column, null);
  assert.equal(params.chart_type, null);
  assert.equal(params.subgroup_column, null);
});

// ---------------------------------------------------------------------------
// Step 3: chart_type changed -> fix subgroup
// ---------------------------------------------------------------------------

test("switching to INDIVIDUAL_ONLY clears subgroup_column", () => {
  const old = { ...BASE, chart_type: "xbar_r", subgroup_column: "batch" };
  const { params } = reconcileParams(old, { chart_type: "imr" }, COLS, null);
  assert.equal(params.chart_type, "imr");
  assert.equal(params.subgroup_column, null);
});

test("switching to SUBGROUP_REQUIRED without subgroup keeps subgroup null (warning state)", () => {
  const old = { ...BASE, chart_type: "imr", subgroup_column: null };
  const { params } = reconcileParams(old, { chart_type: "xbar_r" }, COLS, null);
  assert.equal(params.chart_type, "xbar_r");
  assert.equal(params.subgroup_column, null);
});

test("switching to SUBGROUP_REQUIRED with subgroup already set keeps it", () => {
  const old = { ...BASE, chart_type: "imr", subgroup_column: "batch" };
  // This is a weird state (IMR + subgroup) but reconcile should handle the chart_type change
  const { params } = reconcileParams(old, { chart_type: "xbar_r" }, COLS, null);
  assert.equal(params.chart_type, "xbar_r");
  assert.equal(params.subgroup_column, "batch");
});

test("switching to FLEXIBLE chart keeps subgroup as-is", () => {
  const old = { ...BASE, chart_type: "imr", subgroup_column: null };
  const { params } = reconcileParams(old, { chart_type: "cusum" }, COLS, null);
  assert.equal(params.chart_type, "cusum");
  assert.equal(params.subgroup_column, null);
});

test("switching to null chart_type is allowed", () => {
  const old = { ...BASE, chart_type: "imr" };
  const { params } = reconcileParams(old, { chart_type: null }, COLS, null);
  assert.equal(params.chart_type, null);
});

// ---------------------------------------------------------------------------
// Step 4: subgroup changed -> fix chart_type
// ---------------------------------------------------------------------------

test("clearing subgroup on SUBGROUP_REQUIRED cascades to imr", () => {
  const old = { ...BASE, chart_type: "xbar_r", subgroup_column: "batch" };
  const { params } = reconcileParams(old, { subgroup_column: null }, COLS, null);
  assert.equal(params.chart_type, "imr");
  assert.equal(params.subgroup_column, null);
});

test("setting subgroup on INDIVIDUAL_ONLY cascades to xbar_r", () => {
  const old = { ...BASE, chart_type: "imr", subgroup_column: null };
  const { params } = reconcileParams(old, { subgroup_column: "batch" }, COLS, null);
  assert.equal(params.chart_type, "xbar_r");
  assert.equal(params.subgroup_column, "batch");
});

test("setting subgroup on FLEXIBLE keeps chart_type", () => {
  const old = { ...BASE, chart_type: "cusum", subgroup_column: null };
  const { params } = reconcileParams(old, { subgroup_column: "batch" }, COLS, null);
  assert.equal(params.chart_type, "cusum");
  assert.equal(params.subgroup_column, "batch");
});

test("setting subgroup when chart_type is null keeps null", () => {
  const old = { ...BASE, chart_type: null, subgroup_column: null };
  const { params } = reconcileParams(old, { subgroup_column: "batch" }, COLS, null);
  assert.equal(params.chart_type, null);
  assert.equal(params.subgroup_column, "batch");
});

// ---------------------------------------------------------------------------
// Cascade memory
// ---------------------------------------------------------------------------

test("cascade memory: clearing subgroup on P chart saves to lastSubgroupedType", () => {
  const old = { ...BASE, chart_type: "p", subgroup_column: "batch" };
  const { params, cascadeMemory } = reconcileParams(old, { subgroup_column: null }, COLS, null);
  assert.equal(params.chart_type, "imr");
  assert.equal(cascadeMemory.lastSubgroupedType, "p");
});

test("cascade memory: re-setting subgroup restores lastSubgroupedType", () => {
  const old = { ...BASE, chart_type: "imr", subgroup_column: null };
  const mem = { lastIndividualType: null, lastSubgroupedType: "p" };
  const { params } = reconcileParams(old, { subgroup_column: "batch" }, COLS, mem);
  assert.equal(params.chart_type, "p");
});

test("cascade memory: round-trip preserves both directions", () => {
  // Start on Run Chart (individual), set subgroup -> should cascade to lastSubgroupedType
  const old = { ...BASE, chart_type: "run", subgroup_column: null };
  const mem = { lastIndividualType: null, lastSubgroupedType: "three_way" };
  const { params, cascadeMemory } = reconcileParams(old, { subgroup_column: "batch" }, COLS, mem);
  assert.equal(params.chart_type, "three_way");
  assert.equal(cascadeMemory.lastIndividualType, "run");

  // Now clear subgroup -> should go back to run
  const { params: p2 } = reconcileParams(params, { subgroup_column: null }, COLS, cascadeMemory);
  assert.equal(p2.chart_type, "run");
});

// ---------------------------------------------------------------------------
// Step 5: column validation
// ---------------------------------------------------------------------------

test("invalid subgroup_column is cleared", () => {
  const old = { ...BASE, chart_type: "xbar_r", subgroup_column: "deleted_col" };
  const { params } = reconcileParams(old, {}, COLS, null);
  assert.equal(params.subgroup_column, null);
  assert.equal(params.chart_type, "imr"); // cascaded because xbar_r needs subgroup
});

test("invalid phase_column is cleared", () => {
  const old = { ...BASE, chart_type: "imr", phase_column: "gone" };
  const { params } = reconcileParams(old, {}, COLS, null);
  assert.equal(params.phase_column, null);
});

test("invalid value_column clears everything", () => {
  const old = { ...BASE, chart_type: "imr", value_column: "deleted", subgroup_column: "batch" };
  const { params } = reconcileParams(old, {}, COLS, null);
  assert.equal(params.value_column, null);
  assert.equal(params.chart_type, null);
  assert.equal(params.subgroup_column, null);
});

// ---------------------------------------------------------------------------
// No-op / passthrough
// ---------------------------------------------------------------------------

test("empty patch returns params unchanged", () => {
  const old = { ...BASE, chart_type: "imr", value_column: "value" };
  const { params } = reconcileParams(old, {}, COLS, null);
  assert.equal(params.chart_type, "imr");
  assert.equal(params.value_column, "value");
});

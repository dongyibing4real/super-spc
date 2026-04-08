import test from "node:test";
import assert from "node:assert/strict";

import { createInitialState, createSlot } from "../../src/core/state/init.js";
import { focusChart, addChart, removeChart, moveSelection, setChartParams, setActiveChipEditor, selectPhase, selectPoint } from "../../src/core/state/chart.js";
import { collectChartIds } from "../../src/core/state/layout.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a state with two charts so add/remove tests start populated. */
function twoChartState() {
  const s = createInitialState();
  return addChart(s, { chartType: "xbar_r" });
}

/** Deep-clone via structuredClone for immutability checks. */
function snap(state) {
  return structuredClone(state);
}

// ---------------------------------------------------------------------------
// focusChart
// ---------------------------------------------------------------------------

test("focusChart changes focusedChartId to an existing chart", () => {
  const state = twoChartState();
  // state has chart-1 (focused initially by addChart -> chart-2)
  const next = focusChart(state, "chart-1");
  assert.equal(next.focusedChartId, "chart-1");
});

test("focusChart returns same state when chartId is already focused", () => {
  const state = twoChartState(); // focused = chart-2
  const next = focusChart(state, "chart-2");
  assert.equal(next, state, "should return the exact same reference");
});

test("focusChart returns same state for non-existent chartId", () => {
  const state = createInitialState();
  const next = focusChart(state, "chart-999");
  assert.equal(next, state, "should return the exact same reference");
});

test("focusChart does not mutate original state", () => {
  const state = twoChartState();
  const before = snap(state);
  focusChart(state, "chart-1");
  assert.deepEqual(state, before);
});

// ---------------------------------------------------------------------------
// addChart
// ---------------------------------------------------------------------------

test("addChart creates a new chart slot", () => {
  const state = createInitialState();
  // Set up columns and value on focused chart so reconcileParams doesn't clear
  let withCols = {
    ...state,
    columnConfig: { columns: [
      { name: "val", dtype: "numeric", role: "value" },
      { name: "batch", dtype: "string", role: "subgroup" },
    ] },
  };
  withCols = setChartParams(withCols, "chart-1", { value_column: "val", subgroup_column: "batch" });
  const next = addChart(withCols, { chartType: "p" });
  const newId = "chart-2";
  assert.ok(next.charts[newId], "new slot should exist");
  assert.equal(next.charts[newId].params.chart_type, "p");
});

test("addChart appends to chartOrder", () => {
  const state = createInitialState();
  const next = addChart(state, { chartType: "c" });
  assert.deepEqual(next.chartOrder, ["chart-1", "chart-2"]);
});

test("addChart increments nextChartId", () => {
  const state = createInitialState();
  assert.equal(state.nextChartId, 2);
  const next = addChart(state);
  assert.equal(next.nextChartId, 3);
});

test("addChart focuses the new chart", () => {
  const state = createInitialState();
  const next = addChart(state);
  assert.equal(next.focusedChartId, "chart-2");
});

test("addChart updates chartLayout", () => {
  const state = createInitialState();
  const next = addChart(state);
  const ids = collectChartIds(next.chartLayout);
  assert.ok(ids.includes("chart-2"), "layout should contain new chart");
});

test("addChart inherits column selections from focused chart", () => {
  const state = createInitialState();
  // Set columnConfig BEFORE setChartParams so reconcileParams can validate the column
  const withCols = { ...state, columnConfig: { columns: [{ name: "weight", dtype: "numeric", role: "value" }] } };
  const withCol = setChartParams(withCols, "chart-1", { value_column: "weight" });
  const next = addChart(withCol, { chartType: "ewma" });
  assert.equal(next.charts["chart-2"].params.value_column, "weight");
});

test("addChart defaults to null when no chartType given", () => {
  const state = createInitialState();
  const next = addChart(state);
  assert.equal(next.charts["chart-2"].params.chart_type, null);
});

test("addChart does not mutate original state", () => {
  const state = createInitialState();
  const before = snap(state);
  addChart(state, { chartType: "np" });
  assert.deepEqual(state, before);
});

// ---------------------------------------------------------------------------
// removeChart
// ---------------------------------------------------------------------------

test("removeChart removes the chart slot and order entry", () => {
  const state = twoChartState(); // chart-1, chart-2
  const next = removeChart(state, "chart-2");
  assert.equal(next.charts["chart-2"], undefined);
  assert.ok(!next.chartOrder.includes("chart-2"));
});

test("removeChart updates chartLayout to exclude removed chart", () => {
  const state = twoChartState();
  const next = removeChart(state, "chart-2");
  const ids = collectChartIds(next.chartLayout);
  assert.ok(!ids.includes("chart-2"));
});

test("removeChart adjusts focus when focused chart is removed", () => {
  const state = twoChartState(); // focused = chart-2
  assert.equal(state.focusedChartId, "chart-2");
  const next = removeChart(state, "chart-2");
  assert.equal(next.focusedChartId, "chart-1");
});

test("removeChart keeps focus when non-focused chart is removed", () => {
  const state = twoChartState(); // focused = chart-2
  const next = removeChart(state, "chart-1");
  assert.equal(next.focusedChartId, "chart-2");
});

test("removeChart returns same state when only 1 chart remains", () => {
  const state = createInitialState(); // only chart-1
  const next = removeChart(state, "chart-1");
  assert.equal(next, state, "should return same reference -- cannot remove last chart");
});

test("removeChart returns same state for non-existent chartId", () => {
  const state = twoChartState();
  const next = removeChart(state, "chart-999");
  assert.equal(next, state);
});

test("removeChart does not mutate original state", () => {
  const state = twoChartState();
  const before = snap(state);
  removeChart(state, "chart-2");
  assert.deepEqual(state, before);
});

// ---------------------------------------------------------------------------
// moveSelection
// ---------------------------------------------------------------------------

test("moveSelection moves selectedPointIndex by positive delta", () => {
  let state = createInitialState();
  // Populate points so clamp has room
  state = { ...state, points: Array.from({ length: 10 }, (_, i) => ({ label: `p${i}`, primaryValue: i, excluded: false })) };
  state = { ...state, selectedPointIndex: 3 };
  const next = moveSelection(state, 2);
  assert.equal(next.selectedPointIndex, 5);
});

test("moveSelection moves selectedPointIndex by negative delta", () => {
  let state = createInitialState();
  state = { ...state, points: Array.from({ length: 10 }, (_, i) => ({ label: `p${i}`, primaryValue: i, excluded: false })) };
  state = { ...state, selectedPointIndex: 5 };
  const next = moveSelection(state, -3);
  assert.equal(next.selectedPointIndex, 2);
});

test("moveSelection clamps at 0 when delta would go negative", () => {
  let state = createInitialState();
  state = { ...state, points: Array.from({ length: 5 }, (_, i) => ({ label: `p${i}`, primaryValue: i, excluded: false })) };
  state = { ...state, selectedPointIndex: 1 };
  const next = moveSelection(state, -10);
  assert.equal(next.selectedPointIndex, 0);
});

test("moveSelection clamps at last index when delta exceeds length", () => {
  let state = createInitialState();
  state = { ...state, points: Array.from({ length: 5 }, (_, i) => ({ label: `p${i}`, primaryValue: i, excluded: false })) };
  state = { ...state, selectedPointIndex: 3 };
  const next = moveSelection(state, 100);
  assert.equal(next.selectedPointIndex, 4);
});

test("moveSelection with delta 0 returns index unchanged", () => {
  let state = createInitialState();
  state = { ...state, points: Array.from({ length: 5 }, (_, i) => ({ label: `p${i}`, primaryValue: i, excluded: false })) };
  state = { ...state, selectedPointIndex: 2 };
  const next = moveSelection(state, 0);
  assert.equal(next.selectedPointIndex, 2);
});

test("moveSelection does not mutate original state", () => {
  let state = createInitialState();
  state = { ...state, points: Array.from({ length: 5 }, (_, i) => ({ label: `p${i}`, primaryValue: i, excluded: false })) };
  state = { ...state, selectedPointIndex: 2 };
  const before = snap(state);
  moveSelection(state, 1);
  assert.deepEqual(state, before);
});

// ---------------------------------------------------------------------------
// setChartParams
// ---------------------------------------------------------------------------

test("setChartParams merges params into the chart slot", () => {
  const state = createInitialState();
  const next = setChartParams(state, "chart-1", { k_sigma: 2.0, nelson_tests: [1] });
  assert.equal(next.charts["chart-1"].params.k_sigma, 2.0);
  assert.deepEqual(next.charts["chart-1"].params.nelson_tests, [1]);
  // Other params unchanged (chart_type defaults to null now)
  assert.equal(next.charts["chart-1"].params.chart_type, null);
});

test("setChartParams does not affect other chart slots", () => {
  const state = twoChartState();
  const next = setChartParams(state, "chart-1", { k_sigma: 1.5 });
  assert.equal(next.charts["chart-2"].params.k_sigma, 3.0);
});

test("setChartParams does not mutate original state", () => {
  const state = createInitialState();
  const before = snap(state);
  setChartParams(state, "chart-1", { chart_type: "p" });
  assert.deepEqual(state, before);
});

// ---------------------------------------------------------------------------
// setActiveChipEditor
// ---------------------------------------------------------------------------

test("setActiveChipEditor sets activeChipEditor to the given chipId", () => {
  const state = createInitialState();
  const next = setActiveChipEditor(state, "sigma");
  assert.equal(next.activeChipEditor, "sigma");
});

test("setActiveChipEditor toggles to null when same chipId is passed", () => {
  const state = createInitialState();
  const s1 = setActiveChipEditor(state, "sigma");
  const s2 = setActiveChipEditor(s1, "sigma");
  assert.equal(s2.activeChipEditor, null);
});

test("setActiveChipEditor switches to new chipId when different id is passed", () => {
  const state = createInitialState();
  const s1 = setActiveChipEditor(state, "sigma");
  const s2 = setActiveChipEditor(s1, "tests");
  assert.equal(s2.activeChipEditor, "tests");
});

test("setActiveChipEditor does not mutate original state", () => {
  const state = createInitialState();
  const before = snap(state);
  setActiveChipEditor(state, "sigma");
  assert.deepEqual(state, before);
});

// ---------------------------------------------------------------------------
// selectPhase
// ---------------------------------------------------------------------------

test("selectPhase sets selectedPhaseIndex on the chart slot", () => {
  const state = createInitialState();
  const next = selectPhase(state, 2, "chart-1");
  assert.equal(next.charts["chart-1"].selectedPhaseIndex, 2);
});

test("selectPhase toggles off when same phaseIndex is passed", () => {
  const state = createInitialState();
  const s1 = selectPhase(state, 2, "chart-1");
  const s2 = selectPhase(s1, 2, "chart-1");
  assert.equal(s2.charts["chart-1"].selectedPhaseIndex, null);
});

test("selectPhase with null deselects", () => {
  const state = createInitialState();
  const s1 = selectPhase(state, 1, "chart-1");
  const s2 = selectPhase(s1, null, "chart-1");
  assert.equal(s2.charts["chart-1"].selectedPhaseIndex, null);
});

test("selectPhase falls back to global selectedPhaseIndex without id", () => {
  const state = createInitialState();
  const next = selectPhase(state, 3);
  assert.equal(next.selectedPhaseIndex, 3);
});

test("selectPhase closes context menu", () => {
  let state = createInitialState();
  state = { ...state, ui: { ...state.ui, contextMenu: { x: 10, y: 20 } } };
  const next = selectPhase(state, 0, "chart-1");
  assert.equal(next.ui.contextMenu, null);
});

test("selectPhase does not mutate original state", () => {
  const state = createInitialState();
  const before = snap(state);
  selectPhase(state, 1, "chart-1");
  assert.deepEqual(state, before);
});

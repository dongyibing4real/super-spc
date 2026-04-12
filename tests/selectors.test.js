import { test } from "vitest";
import assert from "node:assert/strict";

import {
  getFailedTransformCount,
  getCapability,
  detectRuleViolations,
  getFirstChart,
  getFocused,
  buildMethodLabComparison,
  buildDisagreements,
  deriveWorkspace,
} from "../src/core/state/selectors.js";

/* ── Helper: builds a minimal SPCState ── */

function makeSlot(overrides = {}) {
  return {
    params: { chart_type: "imr", sigma_method: "moving_range", k_sigma: 3, nelson_tests: [1, 2, 5], value_column: "thickness", subgroup_column: null, phase_column: null, n_trials: null, usl: null, lsl: null, target: null },
    context: { title: "", metric: { id: "thickness", label: "Thickness" }, subgroup: { id: "default", label: "Individual", detail: "n=1" }, phase: { id: "default", label: "All data" }, chartType: { id: "imr", label: "I-MR" }, sigma: { label: "3 Sigma", detail: "Moving range" }, tests: { label: "Nelson", detail: "Rule 1,2,5" }, compare: { label: "None", detail: "Single method" }, window: "", methodBadge: "I-MR", status: "Ready" },
    limits: { center: 10, ucl: 15, lcl: 5, usl: null, lsl: null, version: "", scope: "Dataset" },
    capability: null,
    violations: [],
    sigma: null,
    zones: null,
    overrides: { x: null, y: null },
    chartValues: [],
    chartLabels: [],
    phases: [],
    selectedPointIndex: null,
    selectedPointIndices: null,
    selectedPhaseIndex: null,
    showDataTable: false,
    accentIdx: 0,
    _cascadeMemory: { lastIndividualType: null, lastSubgroupedType: null },
    forecast: { mode: "hidden", horizon: 6, timeBudget: 3, result: null, driftSummary: null, visibleHorizon: 6 },
    ...overrides,
  };
}

function makeState(overrides = {}) {
  const { slotOverrides, ...stateOverrides } = overrides;
  const slot = makeSlot(slotOverrides);
  return {
    charts: { "chart-1": slot },
    chartOrder: ["chart-1"],
    focusedChartId: "chart-1",
    points: [],
    selectedPointIndex: 0,
    selectedPointIndices: null,
    transforms: [],
    pipeline: { status: "ready" },
    ...stateOverrides,
  };
}

/* ── getFailedTransformCount ── */

test("getFailedTransformCount returns 0 when no transforms", () => {
  const state = makeState();
  assert.equal(getFailedTransformCount(state), 0);
});

test("getFailedTransformCount counts only failed transforms", () => {
  const state = makeState({
    transforms: [
      { id: "t1", status: "applied", active: true },
      { id: "t2", status: "failed", active: true },
      { id: "t3", status: "applied", active: false },
      { id: "t4", status: "failed", active: true },
    ],
  });
  assert.equal(getFailedTransformCount(state), 2);
});

/* ── getCapability ── */

test("getCapability returns default when slot has no capability", () => {
  const state = makeState();
  const cap = getCapability(state);
  assert.deepEqual(cap, { cpk: null, ppk: null, cp: null });
});

test("getCapability returns slot capability when present", () => {
  const capability = { cpk: 1.5, ppk: 1.4, cp: 1.6 };
  const state = makeState({ slotOverrides: { capability } });
  const cap = getCapability(state);
  assert.deepEqual(cap, capability);
});

test("getCapability returns capability for a specific chart id", () => {
  const state = makeState();
  const cap2 = { cpk: 2.0, ppk: 1.8, cp: 2.1 };
  state.charts["chart-2"] = makeSlot({ capability: cap2 });
  state.chartOrder.push("chart-2");
  assert.deepEqual(getCapability(state, "chart-2"), cap2);
  // focused chart still returns default
  assert.deepEqual(getCapability(state), { cpk: null, ppk: null, cp: null });
});

/* ── detectRuleViolations ── */

test("detectRuleViolations returns empty Map when no violations", () => {
  const state = makeState();
  const result = detectRuleViolations(state);
  assert.equal(result.size, 0);
});

test("detectRuleViolations maps point indices to testIds", () => {
  const state = makeState({
    slotOverrides: {
      violations: [
        { testId: "1", description: "Beyond control limits", indices: [2, 5] },
        { testId: "2", description: "9 points same side", indices: [5, 6, 7] },
      ],
    },
  });
  const result = detectRuleViolations(state);
  assert.deepEqual(result.get(2), ["1"]);
  assert.deepEqual(result.get(5), ["1", "2"]);
  assert.deepEqual(result.get(6), ["2"]);
  assert.equal(result.has(0), false);
});

/* ── getFirstChart ── */

test("getFirstChart returns the first chart in chartOrder", () => {
  const state = makeState();
  const first = getFirstChart(state);
  assert.equal(first, state.charts["chart-1"]);
});

test("getFirstChart returns first even when focusedChartId differs", () => {
  const state = makeState();
  state.charts["chart-2"] = makeSlot();
  state.chartOrder = ["chart-2", "chart-1"];
  state.focusedChartId = "chart-1";
  const first = getFirstChart(state);
  assert.equal(first, state.charts["chart-2"]);
});

/* ── getFocused ── */

test("getFocused returns focused chart by focusedChartId", () => {
  const state = makeState();
  state.charts["chart-2"] = makeSlot({ capability: { cpk: 1.0, ppk: 1.0, cp: 1.0 } });
  state.chartOrder.push("chart-2");
  state.focusedChartId = "chart-2";
  const focused = getFocused(state);
  assert.deepEqual(focused.capability, { cpk: 1.0, ppk: 1.0, cp: 1.0 });
});

test("getFocused falls back to first chart if focusedChartId is invalid", () => {
  const state = makeState();
  state.focusedChartId = "nonexistent";
  const focused = getFocused(state);
  assert.equal(focused, state.charts["chart-1"]);
});

/* ── buildMethodLabComparison ── */

test("buildMethodLabComparison returns summary for each chart", () => {
  const state = makeState();
  const result = buildMethodLabComparison(state);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "chart-1");
  assert.equal(result[0].chartType, "I-MR");
  assert.equal(result[0].oocCount, 0);
  assert.equal(result[0].ruleCount, 0);
  assert.equal(result[0].kSigma, 3);
});

test("buildMethodLabComparison reports violations correctly", () => {
  const state = makeState({
    slotOverrides: {
      violations: [
        { testId: "1", description: "Beyond limits", indices: [0, 3] },
        { testId: "2", description: "9 same side", indices: [4, 5, 6] },
      ],
    },
  });
  const result = buildMethodLabComparison(state);
  assert.equal(result[0].oocCount, 5);
  assert.equal(result[0].ruleCount, 2);
  assert.equal(result[0].ruleBreakdown.length, 2);
  // sorted by count descending
  assert.equal(result[0].ruleBreakdown[0].testId, "2");
  assert.equal(result[0].ruleBreakdown[0].count, 3);
});

/* ── buildDisagreements ── */

test("buildDisagreements returns empty for single chart", () => {
  const state = makeState();
  const result = buildDisagreements(state);
  assert.deepEqual(result, { items: [], summary: null });
});

test("buildDisagreements finds points where charts disagree", () => {
  const state = makeState();
  // Chart-1: flags points 0, 2, 5
  state.charts["chart-1"] = makeSlot({
    violations: [
      { testId: "1", description: "Beyond limits", indices: [0, 2, 5] },
    ],
  });
  // Chart-2: flags points 2, 3
  state.charts["chart-2"] = makeSlot({
    context: { title: "", metric: { id: "thickness", label: "Thickness" }, subgroup: { id: "default", label: "Individual", detail: "n=1" }, phase: { id: "default", label: "All data" }, chartType: { id: "xbar_r", label: "X-Bar R" }, sigma: { label: "3 Sigma", detail: "Range" }, tests: { label: "Nelson", detail: "Rule 1" }, compare: { label: "None", detail: "Single method" }, window: "", methodBadge: "X-Bar R", status: "Ready" },
    violations: [
      { testId: "1", description: "Beyond limits", indices: [2, 3] },
    ],
  });
  state.chartOrder = ["chart-1", "chart-2"];
  state.points = Array.from({ length: 10 }, (_, i) => ({
    label: `pt-${i + 1}`,
    primaryValue: 10 + i * 0.5,
    excluded: false,
  }));

  const result = buildDisagreements(state);
  // Point 2 is flagged by both => unanimous, not a disagreement
  // Points 0, 5 flagged by chart-1 only; point 3 flagged by chart-2 only => 3 disagreements
  assert.equal(result.items.length, 3);
  const indices = result.items.map(d => d.pointIndex);
  assert.ok(indices.includes(0));
  assert.ok(indices.includes(3));
  assert.ok(indices.includes(5));
  assert.equal(result.summary.unanimousOOC, 1); // point 2
  assert.equal(result.summary.disagreementCount, 3);
});

test("buildDisagreements respects chartIds filter", () => {
  const state = makeState();
  state.charts["chart-1"] = makeSlot({ violations: [{ testId: "1", description: "Beyond limits", indices: [0] }] });
  state.charts["chart-2"] = makeSlot({ violations: [] });
  state.charts["chart-3"] = makeSlot({ violations: [{ testId: "1", description: "Beyond limits", indices: [0] }] });
  state.chartOrder = ["chart-1", "chart-2", "chart-3"];
  state.points = [{ label: "pt-1", primaryValue: 20, excluded: false }];

  // Comparing only chart-1 and chart-3: both flag point 0 => no disagreement
  const unanimous = buildDisagreements(state, ["chart-1", "chart-3"]);
  assert.equal(unanimous.items.length, 0);

  // Comparing chart-1 and chart-2: only chart-1 flags point 0 => 1 disagreement
  const disagree = buildDisagreements(state, ["chart-1", "chart-2"]);
  assert.equal(disagree.items.length, 1);
});

/* ── deriveWorkspace ── */

test("deriveWorkspace basic case with no violations", () => {
  const state = makeState({
    slotOverrides: {
      chartValues: [10, 11, 9.5, 12],
      chartLabels: ["A", "B", "C", "D"],
      selectedPointIndex: 0,
    },
  });
  state.selectedPointIndex = 0;
  const ws = deriveWorkspace(state);
  assert.ok(ws.signal);
  // Point is within limits (10 is between lcl=5 and ucl=15)
  assert.ok(
    ws.signal.title.includes("within control limits") || ws.signal.title.includes("in control"),
    `Expected in-control signal, got: ${ws.signal.title}`
  );
  assert.equal(ws.signal.statusTone, "info");
  assert.ok(Array.isArray(ws.evidence));
  assert.ok(Array.isArray(ws.recommendations));
  assert.ok(ws.recommendations.some(r => r.includes("in statistical control")));
});

test("deriveWorkspace with violations flags rule violation", () => {
  const state = makeState({
    slotOverrides: {
      chartValues: [10, 20, 9],
      chartLabels: ["A", "B", "C"],
      selectedPointIndex: 1,
      violations: [
        { testId: "1", description: "Beyond control limits", indices: [1] },
      ],
    },
  });
  state.selectedPointIndex = 1;
  const ws = deriveWorkspace(state);
  assert.ok(ws.signal.title.includes("Rule violation"), `Expected rule violation, got: ${ws.signal.title}`);
  assert.equal(ws.signal.statusTone, "critical");
  assert.ok(ws.whyTriggered.length > 0);
  assert.ok(ws.rulesAtPoint.length > 0);
  assert.equal(ws.rulesAtPoint[0].testId, "1");
});

test("deriveWorkspace with excluded point", () => {
  const state = makeState();
  state.points = [
    { label: "L-1", primaryValue: 10, excluded: true, annotation: null, raw: {} },
    { label: "L-2", primaryValue: 11, excluded: false, annotation: null, raw: {} },
  ];
  // Use points array path (no chartValues)
  state.charts["chart-1"] = makeSlot({ chartValues: [], chartLabels: [] });
  state.selectedPointIndex = 0;
  const ws = deriveWorkspace(state);
  assert.ok(ws.signal.title.includes("excluded"), `Expected excluded signal, got: ${ws.signal.title}`);
  assert.equal(ws.signal.statusTone, "warning");
  assert.equal(ws.excludedCount, 1);
});

test("deriveWorkspace with no point selection shows pending", () => {
  const state = makeState({
    slotOverrides: {
      chartValues: [10, 11],
      chartLabels: ["A", "B"],
      selectedPointIndex: null,
    },
  });
  state.selectedPointIndex = null;
  const ws = deriveWorkspace(state);
  assert.ok(ws.signal.title.includes("Select a point"), `Expected pending signal, got: ${ws.signal.title}`);
  assert.equal(ws.signal.statusTone, "neutral");
  assert.equal(ws.hasPointSelection, false);
});

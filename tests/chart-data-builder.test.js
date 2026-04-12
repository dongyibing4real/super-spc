import { test } from "vitest";
import assert from "node:assert/strict";
import {
  getChartPoints,
  ensureForecastVisible,
  growForecastHorizonToFit,
  buildChartData,
} from "../src/data/chart-data-builder.js";

function makeSlot(overrides = {}) {
  return {
    params: { chart_type: "imr", sigma_method: "moving_range", k_sigma: 3, nelson_tests: [1, 2, 5], value_column: "v", subgroup_column: null, phase_column: null, n_trials: null, usl: null, lsl: null, target: null },
    context: { metric: { id: "v", label: "V" }, subgroup: { id: "default", label: "Individual" }, phase: { id: "default", label: "All" }, chartType: { id: "imr", label: "I-MR" } },
    limits: { center: 10, ucl: 15, lcl: 5, usl: null, lsl: null, version: "", scope: "Dataset" },
    capability: null,
    violations: [],
    sigma: null,
    zones: null,
    overrides: { x: null, y: null },
    chartValues: [8, 10, 12, 9, 11],
    chartLabels: ["p1", "p2", "p3", "p4", "p5"],
    phases: [],
    selectedPointIndex: 0,
    selectedPointIndices: null,
    selectedPhaseIndex: null,
    showDataTable: false,
    accentIdx: 0,
    _cascadeMemory: { lastIndividualType: null, lastSubgroupedType: null },
    forecast: { mode: "hidden", horizon: 6, timeBudget: 3, result: null, driftSummary: null, visibleHorizon: 6 },
    ...overrides,
  };
}

function makeState(slotOverrides = {}, stateOverrides = {}) {
  const slot = makeSlot(slotOverrides);
  return {
    charts: { "chart-1": slot },
    chartOrder: ["chart-1"],
    focusedChartId: "chart-1",
    points: [],
    selectedPointIndex: 0,
    selectedPointIndices: null,
    chartToggles: { overlay: true, specLimits: true, grid: true, phaseTags: true, events: true, excludedMarkers: true, confidenceBand: false },
    chartLayout: { rows: [["chart-1"]], colWeights: [[1]], rowWeights: [1] },
    ...stateOverrides,
  };
}

// ---------------------------------------------------------------------------
// getChartPoints
// ---------------------------------------------------------------------------

test("getChartPoints returns mapped points when slot has chartValues", () => {
  const slot = makeSlot();
  const result = getChartPoints(slot, []);
  assert.equal(result.length, 5);
  assert.equal(result[0].primaryValue, 8);
  assert.equal(result[0].label, "p1");
  assert.equal(result[2].primaryValue, 12);
  assert.equal(result[2].label, "p3");
  assert.equal(result[0].excluded, false);
  assert.equal(result[0].annotation, null);
});

test("getChartPoints returns globalPoints when chartValues is empty", () => {
  const slot = makeSlot({ chartValues: [] });
  const globalPoints = [{ primaryValue: 99, label: "g1" }];
  const result = getChartPoints(slot, globalPoints);
  assert.deepEqual(result, globalPoints);
});

test("getChartPoints returns globalPoints when chartValues is null", () => {
  const slot = makeSlot({ chartValues: null });
  const globalPoints = [{ primaryValue: 42, label: "g2" }];
  const result = getChartPoints(slot, globalPoints);
  assert.deepEqual(result, globalPoints);
});

// ---------------------------------------------------------------------------
// ensureForecastVisible
// ---------------------------------------------------------------------------

test("ensureForecastVisible returns state unchanged when no x override", () => {
  const state = makeState();
  const result = ensureForecastVisible(state, "chart-1");
  assert.equal(result, state);
});

test("ensureForecastVisible returns state unchanged when override already covers forecast", () => {
  // 5 points -> lastIdx=4, horizon=6, requiredMax=10. Override max=20 covers it.
  const state = makeState({ overrides: { x: { min: 0, max: 20 }, y: null } });
  const result = ensureForecastVisible(state, "chart-1");
  assert.equal(result, state);
});

test("ensureForecastVisible expands x domain when override max is too small", () => {
  // 5 points -> lastIdx=4, horizon=6, requiredMax=10. Override max=7 is too small.
  const state = makeState({ overrides: { x: { min: 0, max: 7 }, y: null } });
  const result = ensureForecastVisible(state, "chart-1");
  const override = result.charts["chart-1"].overrides.x;
  assert.equal(override.min, 0);
  assert.equal(override.max, 10);
});

test("ensureForecastVisible returns state for missing chart id", () => {
  const state = makeState();
  const result = ensureForecastVisible(state, "no-such-chart");
  assert.equal(result, state);
});

// ---------------------------------------------------------------------------
// growForecastHorizonToFit
// ---------------------------------------------------------------------------

test("growForecastHorizonToFit returns unchanged when forecast mode is hidden", () => {
  const state = makeState({ forecast: { mode: "hidden", horizon: 6 } });
  const result = growForecastHorizonToFit(state, "chart-1", 20);
  assert.equal(result, state);
});

test("growForecastHorizonToFit grows horizon when active and nextXMax exceeds current", () => {
  // 5 points -> lastIdx=4, horizon=6. nextXMax=15 -> requiredHorizon=11
  const state = makeState({ forecast: { mode: "active", horizon: 6, result: null, driftSummary: null } });
  const result = growForecastHorizonToFit(state, "chart-1", 15);
  assert.equal(result.charts["chart-1"].forecast.horizon, 11);
});

test("growForecastHorizonToFit returns unchanged when nextXMax fits current horizon", () => {
  // 5 points -> lastIdx=4, horizon=6. nextXMax=8 -> requiredHorizon=4, fits in 6
  const state = makeState({ forecast: { mode: "active", horizon: 6, result: null, driftSummary: null } });
  const result = growForecastHorizonToFit(state, "chart-1", 8);
  assert.equal(result, state);
});

test("growForecastHorizonToFit works in loading mode too", () => {
  const state = makeState({ forecast: { mode: "loading", horizon: 3, result: null, driftSummary: null } });
  // 5 points -> lastIdx=4, nextXMax=12 -> requiredHorizon=8
  const result = growForecastHorizonToFit(state, "chart-1", 12);
  assert.equal(result.charts["chart-1"].forecast.horizon, 8);
});

// ---------------------------------------------------------------------------
// buildChartData
// ---------------------------------------------------------------------------

test("buildChartData returns null when slot does not exist", () => {
  const state = makeState();
  const result = buildChartData("no-such-chart", state);
  assert.equal(result, null);
});

test("buildChartData returns null when no chart_type", () => {
  const state = makeState({ params: { chart_type: null, sigma_method: "moving_range", k_sigma: 3, nelson_tests: [], value_column: "v", subgroup_column: null, phase_column: null, n_trials: null, usl: null, lsl: null, target: null } });
  const result = buildChartData("chart-1", state);
  assert.equal(result, null);
});

test("buildChartData returns valid payload with chart type set", () => {
  const state = makeState();
  const result = buildChartData("chart-1", state);
  assert.notEqual(result, null);
  assert.equal(result.points.length, 5);
  assert.equal(result.limits.center, 10);
  assert.equal(result.limits.ucl, 15);
  assert.equal(result.limits.lcl, 5);
  assert.equal(result.chartType.id, "imr");
  assert.equal(result.metric.id, "v");
  assert.equal(result.seriesKey, "primaryValue");
  assert.equal(result.seriesType, "chart-1");
  assert.equal(result.forecast.mode, "hidden");
  assert.deepEqual(result.phases, []);
  assert.equal(result.toggles.overlay, false);
  assert.equal(result.selectedIndex, 0);
});

test("buildChartData includes forecast data when mode is active", () => {
  const forecastResult = {
    predicted: [12, 13, 14],
    lower: [10, 11, 12],
    upper: [14, 15, 16],
  };
  const state = makeState({
    forecast: {
      mode: "active",
      horizon: 6,
      result: forecastResult,
      driftSummary: { slope: 0.5 },
      visibleHorizon: 6,
    },
  });
  const result = buildChartData("chart-1", state);
  assert.equal(result.forecast.mode, "active");
  assert.equal(result.forecast.horizon, 6);
  assert.deepEqual(result.forecast.result, forecastResult);
  assert.deepEqual(result.forecast.driftSummary, { slope: 0.5 });
  // x domain should extend to lastIdx + horizon = 4 + 6 = 10
  assert.equal(result.toggles.xDefaultDomain.max, 10);
});

test("buildChartData uses last phase limits for forecast when phases exist", () => {
  const state = makeState({
    phases: [
      { id: "phase-1", label: "Phase 1", limits: { ucl: 20, lcl: 2, center: 11 }, startIdx: 0, endIdx: 2 },
      { id: "phase-2", label: "Phase 2", limits: { ucl: 18, lcl: 4, center: 12 }, startIdx: 3, endIdx: 4 },
    ],
    forecast: { mode: "active", horizon: 3, result: null, driftSummary: null, visibleHorizon: 3 },
  });
  const result = buildChartData("chart-1", state);
  assert.equal(result.forecast.limits.ucl, 18);
  assert.equal(result.forecast.limits.lcl, 4);
  assert.equal(result.forecast.limits.center, 12);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  activateForecast,
  cancelForecast,
  clearNotice,
  createInitialState,
  createSlot,
  deriveWorkspace,
  failTransformStep,
  getPrimary,
  loadDataset,
  navigate,
  recoverTransformStep,
  resetAxis,
  selectForecast,
  selectPoint,
  setForecastHorizon,
  setForecastPrompt,
  setChallengerStatus,
  setDatasets,
  setError,
  setLoadingState,
  setXDomainOverride,
  setYDomainOverride,
  toggleChartOption,
  togglePointExclusion,
  toggleTransform,
} from "../src/core/state.js";

/* 鈺愨晲鈺?Test fixture 鈥?builds a populated state like the old mock 鈺愨晲鈺?*/

function createPopulatedState() {
  const base = createInitialState();
  const points = Array.from({ length: 28 }, (_, i) => ({
    id: `pt-${i}`,
    label: `L-${2840 + i}`,
    subgroupLabel: `Hour ${i + 1}`,
    phaseId: i < 9 ? "P1" : i < 18 ? "P2" : "P3",
    primaryValue: 8.042 + i * 0.004,
    challengerValue: 8.041 + i * 0.004,
    excluded: [13, 17, 20, 23].includes(i),
    annotation: i === 18 ? "M-204 chamber clean" : null,
    raw: {},
  }));

  const primaryLimits = {
    center: 8.078, ucl: 8.145, lcl: 8.011, usl: 8.165, lsl: 8.025,
    version: "limits-v12.4", scope: "Phase-specific",
  };
  const challengerLimits = {
    center: 8.074, ucl: 8.138, lcl: 8.018, usl: null, lsl: null,
    version: "ra-2.1-cal-7", scope: "Dataset",
  };

  return {
    ...base,
    loading: false,
    charts: {
      "chart-1": {
        ...base.charts["chart-1"],
        context: {
          ...base.charts["chart-1"].context,
          title: "Etch Rate Stability",
          metric: { id: "thickness", label: "Thickness", unit: "nm" },
          subgroup: { id: "hour", label: "Hour / n=5", detail: "5 wafers per lot" },
        },
        limits: primaryLimits,
        violations: [],
        sigma: { sigma_hat: 0.042, method: "moving_range", n_used: 27 },
        zones: { zone_a_upper: 8.162, zone_b_upper: 8.12, cl: 8.078, zone_b_lower: 8.036, zone_a_lower: 7.994 },
        phases: [
          { id: "P1", label: "Pre-clean baseline", start: 0, end: 8 },
          { id: "P2", label: "Ramp and cavity split", start: 9, end: 17 },
          { id: "P3", label: "Post-maintenance shift", start: 18, end: 27 },
        ],
      },
      "chart-2": {
        ...createSlot(),
        limits: challengerLimits,
        violations: [],
        sigma: null,
        phases: [],
      },
    },
    chartOrder: ["chart-1", "chart-2"],
    focusedChartId: "chart-1",
    points,
    transforms: [
      { id: "ingest", title: "CSV ingest", status: "complete", active: true, detail: "Validated.", rescue: "" },
      { id: "winsorize", title: "Winsorize", status: "active", active: true, detail: "Discount spikes.", rescue: "" },
      { id: "normalize", title: "Normalize", status: "active", active: true, detail: "Target norm.", rescue: "" },
      { id: "phase-tag", title: "Phase tag", status: "active", active: true, detail: "Boundaries.", rescue: "" },
    ],
    selectedPointIndex: 24,
  };
}

// 鈹€鈹€ New API integration actions 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

test("createInitialState returns loading empty state", () => {
  const s = createInitialState();
  assert.equal(s.loading, true);
  assert.equal(s.error, null);
  assert.deepEqual(s.datasets, []);
  assert.deepEqual(s.points, []);
  assert.equal(s.activeDatasetId, null);
});

test("setDatasets stores dataset list", () => {
  const s = createInitialState();
  const datasets = [{ id: "d1", name: "Test" }, { id: "d2", name: "Test2" }];
  const next = setDatasets(s, datasets);
  assert.deepEqual(next.datasets, datasets);
  assert.equal(next.loading, true); // loading unchanged
});

test("loadDataset populates state and clears loading", () => {
  const s = createInitialState();
  const points = [
    { id: "pt-0", lot: "pt-0", primaryValue: 10, excluded: false, phaseId: "P1" },
    { id: "pt-1", lot: "pt-1", primaryValue: 12, excluded: false, phaseId: "P1" },
  ];
  const limits = { center: 11, ucl: 15, lcl: 7, usl: null, lsl: null, version: "v1", scope: "Dataset" };
  const next = loadDataset(s, { points, slots: { "chart-1": { limits } }, datasetId: "d1" });

  assert.equal(next.loading, false);
  assert.equal(next.error, null);
  assert.equal(next.activeDatasetId, "d1");
  assert.equal(next.points.length, 2);
  assert.equal(next.charts["chart-1"].limits.center, 11);
  assert.equal(next.selectedPointIndex, 1); // last point
  assert.equal(next.charts["chart-1"].overrides.x, null); // reset
});

test("loadDataset preserves chartToggles and resets overrides", () => {
  let s = createInitialState();
  s = toggleChartOption(s, "grid"); // turn off grid
  const points = [{ id: "pt-0", lot: "pt-0", primaryValue: 10, excluded: false, phaseId: "P1" }];
  const next = loadDataset(s, { points, slots: {}, datasetId: "d1" });

  assert.equal(next.chartToggles.grid, false); // preserved
  assert.equal(next.charts["chart-1"].overrides.x, null); // reset
});

test("setLoadingState toggles loading flag", () => {
  const s = createInitialState();
  const loaded = setLoadingState(s, false);
  assert.equal(loaded.loading, false);
  const loading = setLoadingState(loaded, true);
  assert.equal(loading.loading, true);
  assert.equal(loading.error, null); // cleared when loading
});

test("setError sets error and clears loading", () => {
  const s = createInitialState();
  const errored = setError(s, "Backend unavailable");
  assert.equal(errored.loading, false);
  assert.equal(errored.error, "Backend unavailable");
});

// 鈹€鈹€ Existing actions with populated state 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

test("selecting a point updates the evidence ledger to the selected lot", () => {
  const initial = createPopulatedState();
  const next = selectPoint(initial, 26);
  const workspace = deriveWorkspace(next);

  // selectedPoint carries the label
  assert.equal(workspace.selectedPoint.label, "L-2866");
  // evidence[0] is the point-category "Value" item 鈥?numeric value of the selected point
  assert.equal(workspace.evidence[0].category, "point");
  assert.match(workspace.evidence[0].value, /\d+\.\d+/);
});

test("excluding a point keeps it visible and updates exclusion count", () => {
  const initial = createPopulatedState();
  const next = togglePointExclusion(initial, 10);
  const workspace = deriveWorkspace(next);

  assert.equal(next.points[10].excluded, true);
  assert.equal(workspace.excludedCount, 5);
  assert.match(next.ui.notice.body, /remains visible/i);
});

test("failed transform keeps the prior chart result while marking pipeline partial", () => {
  const initial = createPopulatedState();
  const before = deriveWorkspace(initial).signal.title;
  const next = failTransformStep(initial, "normalize");
  const after = deriveWorkspace(next).signal.title;

  assert.equal(next.pipeline.status, "partial");
  assert.equal(next.pipeline.rescueMode, "retain-previous-compute");
  assert.equal(before, after);
});

// 鈹€鈹€ Axis interaction state tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

test("setXDomainOverride stores custom x-axis range", () => {
  const initial = createInitialState();
  const next = setXDomainOverride(initial, 5, 20);
  assert.deepEqual(next.charts["chart-1"].overrides.x, { min: 5, max: 20 });
});

test("setYDomainOverride stores custom y-axis range", () => {
  const initial = createInitialState();
  const next = setYDomainOverride(initial, 10, 50);
  assert.deepEqual(next.charts["chart-1"].overrides.y, { yMin: 10, yMax: 50 });
});

test("resetAxis('x') clears xDomainOverride", () => {
  const initial = createInitialState();
  const panned = setXDomainOverride(initial, 3, 15);
  const reset = resetAxis(panned, "x");
  assert.equal(reset.charts["chart-1"].overrides.x, null);
});

test("resetAxis('y') clears yDomainOverride", () => {
  const initial = createInitialState();
  const scaled = setYDomainOverride(initial, 5, 100);
  const reset = resetAxis(scaled, "y");
  assert.equal(reset.charts["chart-1"].overrides.y, null);
});

test("setXDomainOverride does not mutate original state", () => {
  const initial = createInitialState();
  const next = setXDomainOverride(initial, 2, 18);
  assert.equal(initial.charts["chart-1"].overrides.x, null);
  assert.notEqual(initial, next);
});

// 鈹€鈹€ Immutability tests (selective cloning) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

test("selectPoint does not mutate original state", () => {
  const initial = createPopulatedState();
  const next = selectPoint(initial, 5);
  assert.equal(initial.selectedPointIndex, 24);
  assert.equal(next.selectedPointIndex, 5);
});

test("togglePointExclusion does not mutate original points array", () => {
  const initial = createPopulatedState();
  const next = togglePointExclusion(initial, 5);
  assert.equal(initial.points[5].excluded, false);
  assert.equal(next.points[5].excluded, true);
  assert.notEqual(initial.points, next.points);
});

test("navigate does not mutate original state", () => {
  const initial = createPopulatedState();
  const next = navigate(initial, "dataprep");
  assert.equal(initial.route, "workspace");
  assert.equal(next.route, "dataprep");
});

test("toggleChartOption does not mutate original chartToggles", () => {
  const initial = createPopulatedState();
  const next = toggleChartOption(initial, "grid");
  assert.equal(initial.chartToggles.grid, true);
  assert.equal(next.chartToggles.grid, false);
  assert.notEqual(initial.chartToggles, next.chartToggles);
});

test("toggleTransform does not mutate original transforms", () => {
  const initial = createPopulatedState();
  const next = toggleTransform(initial, "winsorize");
  assert.equal(initial.transforms[1].active, true);
  assert.equal(next.transforms[1].active, false);
  assert.notEqual(initial.transforms, next.transforms);
});

test("clearNotice clears the notice", () => {
  let s = createPopulatedState();
  s = togglePointExclusion(s, 5); // sets a notice
  assert.notEqual(s.ui.notice, null);
  const cleared = clearNotice(s);
  assert.equal(cleared.ui.notice, null);
});

test("createInitialState uses row-grid chart layout", () => {
  const s = createInitialState();
  assert.deepEqual(s.chartLayout.rows, [["chart-1"]]);
  assert.deepEqual(s.chartLayout.colWeights, [[1]]);
  assert.deepEqual(s.chartLayout.rowWeights, [1]);
});

// 鈹€鈹€ Per-slot phases tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

test("createSlot includes empty phases array", () => {
  const slot = createSlot();
  assert.deepEqual(slot.phases, []);
});

test("createSlot initializes forecast state", () => {
  const slot = createSlot();
  assert.deepEqual(slot.forecast, {
    mode: "hidden",
    selected: false,
    horizon: 6,
  });
});

test("activateForecast preserves x override and selects the forecast", () => {
  let s = createInitialState();
  s = setXDomainOverride(s, 3, 19);
  const next = activateForecast(s);

  assert.equal(next.charts["chart-1"].forecast.mode, "active");
  assert.equal(next.charts["chart-1"].forecast.selected, true);
  assert.deepEqual(next.charts["chart-1"].overrides.x, { min: 3, max: 19 });
});

test("cancelForecast hides the forecast without clearing x override", () => {
  let s = createInitialState();
  s = setXDomainOverride(s, 4, 22);
  s = activateForecast(s);
  const next = cancelForecast(s);

  assert.equal(next.charts["chart-1"].forecast.mode, "hidden");
  assert.equal(next.charts["chart-1"].forecast.selected, false);
  assert.deepEqual(next.charts["chart-1"].overrides.x, { min: 4, max: 22 });
});

test("setForecastPrompt ignores active forecasts", () => {
  const s = activateForecast(createInitialState());
  const next = setForecastPrompt(s, true);
  assert.equal(next.charts["chart-1"].forecast.mode, "active");
});

test("selectForecast only affects active forecasts", () => {
  const hidden = selectForecast(createInitialState(), true);
  assert.equal(hidden.charts["chart-1"].forecast.selected, false);

  const active = activateForecast(createInitialState());
  const deselected = selectForecast(active, false);
  assert.equal(deselected.charts["chart-1"].forecast.selected, false);
});

test("setForecastHorizon stores a positive integer horizon", () => {
  const s = createInitialState();
  const next = setForecastHorizon(s, 9.2);
  assert.equal(next.charts["chart-1"].forecast.horizon, 10);
});

test("loadDataset stores phases per chart slot", () => {
  const s = {
    ...createInitialState(),
    charts: { "chart-1": createSlot(), "chart-2": createSlot() },
    chartOrder: ["chart-1", "chart-2"],
  };
  const points = [{ id: "pt-0", label: "pt-0", primaryValue: 10, excluded: false }];
  const primaryPhases = [{ id: "A", start: 0, end: 0, limits: { center: 10, ucl: 12, lcl: 8 } }];
  const challengerPhases = [{ id: "X", start: 0, end: 0, limits: { center: 11, ucl: 13, lcl: 9 } }];
  const limits = { center: 10, ucl: 12, lcl: 8, usl: null, lsl: null, version: "v1", scope: "Dataset" };

  const next = loadDataset(s, {
    points,
    slots: {
      "chart-1": { limits, phases: primaryPhases },
      "chart-2": { limits, phases: challengerPhases },
    },
    datasetId: "d1",
  });

  assert.deepEqual(next.charts["chart-1"].phases, primaryPhases);
  assert.deepEqual(next.charts["chart-2"].phases, challengerPhases);
});

test("challenger phases are independent from primary phases", () => {
  const s = {
    ...createInitialState(),
    charts: { "chart-1": createSlot(), "chart-2": createSlot() },
    chartOrder: ["chart-1", "chart-2"],
  };
  const points = [{ id: "pt-0", label: "pt-0", primaryValue: 10, excluded: false }];
  const primaryPhases = [
    { id: "P1", start: 0, end: 0, limits: { center: 10, ucl: 12, lcl: 8 } },
  ];
  const limits = { center: 10, ucl: 12, lcl: 8, usl: null, lsl: null, version: "v1", scope: "Dataset" };

  const next = loadDataset(s, {
    points,
    slots: {
      "chart-1": { limits, phases: primaryPhases },
      "chart-2": { limits }, // no phases provided
    },
    datasetId: "d1",
  });

  assert.equal(next.charts["chart-1"].phases.length, 1);
  assert.equal(next.charts["chart-1"].phases[0].id, "P1");
  // Challenger keeps its default empty phases (from createSlot)
  assert.deepEqual(next.charts["chart-2"].phases, []);
});

test("getPhaseLabel reads from primary slot phases", () => {
  const s = createPopulatedState();
  // getPrimary(s).phases has P1, P2, P3
  const primary = getPrimary(s);
  assert.equal(primary.phases.length, 3);
  assert.equal(primary.phases[0].label, "Pre-clean baseline");
  // State no longer has top-level phases
  assert.equal(s.phases, undefined);
});

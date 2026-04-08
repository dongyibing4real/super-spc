import test from "node:test";
import assert from "node:assert/strict";

import { createInitialState, createSlot } from "../src/core/state/init.js";
import {
  applyColumnRolesToChartParams,
  buildSuccessfulAnalysisSlots,
  finalizeDatasetLoad,
  finalizeReanalysis,
} from "../src/core/state/analysis.js";

function createAnalysisResult({
  id = "analysis-1",
  center = 10,
  ucl = 12,
  lcl = 8,
  chartValues = [10, 11, 9],
  chartLabels = ["A", "B", "C"],
  testId = 1,
} = {}) {
  return {
    id,
    sigma: { sigma_hat: 1.25, method: "moving_range", n_used: 3 },
    limits: { cl: [center], ucl: [ucl], lcl: [lcl], k_sigma: 3 },
    zones: {
      zone_a_upper: 11.5,
      zone_b_upper: 10.75,
      cl: center,
      zone_b_lower: 9.25,
      zone_a_lower: 8.5,
    },
    capability: { cp: 1.2, cpk: 1.1, ppk: 1.05 },
    violations: [{ test_id: testId, point_indices: [1], description: "Rule fired" }],
    phases: [{ phase_id: "P1", start_index: 0, end_index: 2, limits: { cl: [center], ucl: [ucl], lcl: [lcl] } }],
    chart_values: chartValues,
    chart_labels: chartLabels,
  };
}

function createDatasetRows() {
  return [
    { sequence_index: 0, raw_data: { reading: "10", lot: "L1", phase: "P1" } },
    { sequence_index: 1, raw_data: { reading: "11", lot: "L2", phase: "P1" } },
    { sequence_index: 2, raw_data: { reading: "9", lot: "L3", phase: "P1" } },
  ];
}

function createColumns() {
  return [
    { name: "reading", ordinal: 0, dtype: "float", role: "value" },
    { name: "lot", ordinal: 1, dtype: "string", role: "subgroup" },
    { name: "phase", ordinal: 2, dtype: "string", role: "phase" },
  ];
}

function createTwoChartState() {
  const base = createInitialState();
  return {
    ...base,
    datasets: [{ id: "ds-1", name: "Wafer Width" }],
    charts: {
      "chart-1": createSlot(),
      "chart-2": createSlot({
        params: { ...createSlot().params, value_column: "existing_metric" },
      }),
    },
    chartOrder: ["chart-1", "chart-2"],
    focusedChartId: "chart-1",
    nextChartId: 3,
  };
}

test("applyColumnRolesToChartParams fills missing chart params but preserves existing manual values", () => {
  const state = createTwoChartState();
  const columns = createColumns();

  const next = applyColumnRolesToChartParams(state, columns);

  assert.deepEqual(next.columnConfig.columns, columns);
  assert.equal(next.charts["chart-1"].params.value_column, "reading");
  // IMR is an individual chart type — subgroup_column is null for individual-only types
  assert.equal(next.charts["chart-1"].params.subgroup_column, null);
  assert.equal(next.charts["chart-1"].params.phase_column, "phase");
  assert.equal(next.charts["chart-2"].params.value_column, "existing_metric");
});

test("buildSuccessfulAnalysisSlots only includes fulfilled charts and carries transformed slot data", () => {
  const state = createTwoChartState();
  const prepared = applyColumnRolesToChartParams(state, createColumns());
  const baseContext = { title: "Dataset", metric: { id: "reading", label: "reading", unit: "" } };
  const results = [
    { status: "fulfilled", value: createAnalysisResult({ id: "analysis-a", center: 15 }) },
    { status: "rejected", reason: new Error("backend timeout") },
  ];

  const slots = buildSuccessfulAnalysisSlots(prepared, results, baseContext);

  assert.deepEqual(Object.keys(slots), ["chart-1"]);
  assert.equal(slots["chart-1"].limits.center, 15);
  assert.equal(slots["chart-1"].capability.cpk, 1.1);
  assert.deepEqual(slots["chart-1"].chartLabels, ["A", "B", "C"]);
  assert.equal(slots["chart-1"].context.metric.id, "reading");
});

test("finalizeDatasetLoad preserves successful charts and sets warning notice on partial analysis failure", () => {
  const state = createTwoChartState();
  const columns = createColumns();
  const points = createDatasetRows();
  const analysisResults = [
    { status: "fulfilled", value: createAnalysisResult({ id: "analysis-a", center: 14 }) },
    { status: "rejected", reason: new Error("chart-2 failed") },
  ];

  const { nextState, failedCharts } = finalizeDatasetLoad(state, {
    datasetId: "ds-1",
    datasets: state.datasets,
    points,
    columns,
    analysisResults,
  });

  assert.deepEqual(failedCharts, ["chart-2"]);
  assert.equal(nextState.activeDatasetId, "ds-1");
  assert.equal(nextState.loading, false);
  assert.equal(nextState.points.length, 3);
  assert.equal(nextState.charts["chart-1"].limits.center, 14);
  assert.deepEqual(nextState.charts["chart-2"].chartValues, []);
  assert.equal(nextState.ui.notice.title, "Analysis failed");
  assert.equal(nextState.ui.notice.body, "chart-2 failed");
});

test("finalizeReanalysis keeps previous slot data for rejected charts", () => {
  const base = createTwoChartState();
  const columns = createColumns();
  const prepared = applyColumnRolesToChartParams(base, columns);
  const state = {
    ...prepared,
    activeDatasetId: "ds-1",
    points: createDatasetRows().map((row, index) => ({
      id: `pt-${index}`,
      label: `pt-${index}`,
      subgroupLabel: `pt-${index}`,
      phaseId: row.raw_data.phase,
      primaryValue: Number(row.raw_data.reading),
      excluded: false,
      annotation: null,
      raw: row.raw_data,
    })),
    charts: {
      ...prepared.charts,
      "chart-1": createSlot({
        params: prepared.charts["chart-1"].params,
        limits: { center: 10, ucl: 12, lcl: 8, usl: null, lsl: null, version: "old-1", scope: "Dataset" },
        chartValues: [10, 11, 9],
        chartLabels: ["old-a", "old-b", "old-c"],
      }),
      "chart-2": createSlot({
        params: prepared.charts["chart-2"].params,
        limits: { center: 99, ucl: 100, lcl: 98, usl: null, lsl: null, version: "old-2", scope: "Dataset" },
        chartValues: [99, 99.5],
        chartLabels: ["keep-a", "keep-b"],
      }),
    },
    columnConfig: { ...prepared.columnConfig, columns },
  };

  const { nextState, failedCharts } = finalizeReanalysis(state, {
    points: createDatasetRows(),
    analysisResults: [
      { status: "fulfilled", value: createAnalysisResult({ id: "analysis-new", center: 21, chartLabels: ["new-a", "new-b", "new-c"] }) },
      { status: "rejected", reason: new Error("still failing") },
    ],
  });

  assert.deepEqual(failedCharts, ["chart-2"]);
  assert.equal(nextState.charts["chart-1"].limits.center, 21);
  assert.deepEqual(nextState.charts["chart-1"].chartLabels, ["new-a", "new-b", "new-c"]);
  assert.equal(nextState.charts["chart-2"].limits.center, 99);
  assert.deepEqual(nextState.charts["chart-2"].chartLabels, ["keep-a", "keep-b"]);
  assert.equal(nextState.ui.notice.title, "Analysis failed");
});

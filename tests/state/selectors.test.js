import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialState,
  getFocused,
  loadDataset,
} from "../../src/core/state.js";

/* --- getFocused --- */

test("getFocused returns the focused chart slot", () => {
  const state = createInitialState();
  const focused = getFocused(state);

  assert.equal(focused, state.charts["chart-1"]);
});

test("getFocused returns the slot matching focusedChartId", () => {
  const state = createInitialState();
  // Default focusedChartId is "chart-1"
  assert.equal(state.focusedChartId, "chart-1");

  const focused = getFocused(state);
  assert.ok(focused);
  assert.ok(focused.params);
  assert.equal(focused.params.chart_type, null);
});

test("getFocused falls back to primary when focusedChartId is invalid", () => {
  const state = {
    ...createInitialState(),
    focusedChartId: "chart-nonexistent",
  };
  const focused = getFocused(state);
  // Falls back to getPrimary which is chartOrder[0] = "chart-1"
  assert.equal(focused, state.charts["chart-1"]);
});

test("getFocused returns slot with loaded data after loadDataset", () => {
  let state = createInitialState();
  const points = [
    { id: "p1", label: "Pt 1", primaryValue: 10, excluded: false },
    { id: "p2", label: "Pt 2", primaryValue: 20, excluded: false },
  ];
  const slotData = {
    "chart-1": {
      limits: { center: 15, ucl: 25, lcl: 5, usl: null, lsl: null, version: "v1", scope: "Dataset" },
      violations: [],
      sigma: { sigma_hat: 3.5, method: "moving_range" },
      context: {
        title: "Test",
        metric: { id: "value", label: "Value", unit: "" },
        subgroup: { id: "default", label: "Individual", detail: "n=1" },
        phase: { id: "default", label: "All data", detail: "No phases" },
        chartType: { id: "imr", label: "IMR", detail: "Individual + Moving Range" },
        sigma: { label: "3 Sigma", detail: "Moving range" },
        tests: { label: "Nelson", detail: "Rule 1, 2, 5" },
        compare: { label: "None", detail: "Single method" },
        window: "",
        methodBadge: "IMR",
        status: "Ready",
      },
    },
  };

  state = loadDataset(state, { points, slots: slotData, datasetId: "ds-1" });

  const focused = getFocused(state);
  assert.equal(focused.limits.center, 15);
  assert.equal(focused.limits.ucl, 25);
  assert.equal(focused.sigma.sigma_hat, 3.5);
});

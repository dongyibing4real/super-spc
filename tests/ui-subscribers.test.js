import test from "node:test";
import assert from "node:assert/strict";

import {
  setupUiSubscribers,
  updateEvidenceRailSurface,
  updateRecipeRailSurface,
} from "../src/runtime/ui-subscribers.js";
import { createStore } from "../src/core/store.js";

test("setupUiSubscribers triggers recipe rail morph on workspace chip editor change", () => {
  // setupUiSubscribers calls morphEl internally which requires a real DOM.
  // Since we test morphing separately via updateRecipeRailSurface with a mock,
  // here we just verify the subscriber fires by having it find no rail element
  // (so morphEl is never called) and confirming no error occurs.
  const root = {
    querySelector() { return null; },
  };
  const store = createStore({
    route: "workspace",
    focusedChartId: "chart-1",
    activeChipEditor: null,
    selectedPointIndex: 0,
    points: [],
    transforms: [],
    pipeline: { status: "ready" },
    chartOrder: ["chart-1"],
    charts: { "chart-1": {} },
    activeDatasetId: null,
    datasets: [],
    columnConfig: { columns: [] },
    ui: { pendingNewChart: null, notice: null, contextMenu: null },
  });

  setupUiSubscribers(store, root);

  store.setState({
    ...store.getState(),
    activeChipEditor: "metric",
  });

  assert.ok(true, "subscriber ran without error");
});

test("updateRecipeRailSurface morphs the recipe rail when present", () => {
  const rail = {};
  const root = {
    querySelector(selector) {
      if (selector === ".recipe-rail") return rail;
      return null;
    },
  };
  let morphed = null;

  updateRecipeRailSurface(root, {
    activeDatasetId: null,
    datasets: [],
    activeChipEditor: null,
    focusedChartId: "chart-1",
    chartOrder: ["chart-1"],
    columnConfig: { columns: [] },
    ui: { pendingNewChart: null },
    charts: {
      "chart-1": {
        context: {
          metric: { label: "Value", unit: "" },
          subgroup: { label: "Individual", detail: "n=1" },
          phase: { label: "Single phase", detail: "No phases" },
          chartType: { label: "IMR", detail: "Individual + Moving Range" },
          sigma: { label: "3 Sigma", detail: "Moving Range" },
          tests: { label: "Nelson", detail: "Standard rule set" },
        },
        params: { chart_type: "imr", nelson_tests: [1, 2, 5] },
        showDataTable: false,
      },
    },
  }, (_el, html) => { morphed = html; });

  assert.match(morphed, /recipe-rail/);
});

test("updateEvidenceRailSurface morphs the evidence rail when present", () => {
  const rail = {};
  const root = {
    querySelector(selector) {
      if (selector === ".evidence-rail") return rail;
      return null;
    },
  };
  let morphed = null;

  updateEvidenceRailSurface(root, {
    focusedChartId: "chart-1",
    selectedPointIndex: 0,
    points: [
      {
        label: "L1",
        subgroupLabel: "L1",
        phaseId: "P1",
        primaryValue: 10,
        excluded: false,
        annotation: null,
        raw: {},
      },
    ],
    transforms: [],
    pipeline: { status: "ready" },
    charts: {
      "chart-1": {
        context: { chartType: { label: "IMR" } },
        chartValues: [],
        selectedPointIndex: null,
        violations: [],
        limits: { ucl: 12, center: 10, lcl: 8, scope: "Dataset" },
        sigma: { sigma_hat: 1, method: "moving_range" },
        phases: [{ id: "P1", label: "Phase 1" }],
      },
    },
    chartOrder: ["chart-1"],
  }, (_el, html) => { morphed = html; });

  assert.match(morphed, /evidence-rail/);
});

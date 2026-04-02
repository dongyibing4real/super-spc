import test from "node:test";
import assert from "node:assert/strict";

import {
  setupUiSubscribers,
  updateContextMenuSurface,
  updateEvidenceRailSurface,
  updateNoticeSurface,
  updateRecipeRailSurface,
} from "../src/runtime/ui-subscribers.js";
import { createStore } from "../src/core/store.js";

test("updateNoticeSurface removes existing notice and inserts the new one into main shell", () => {
  let removed = false;
  let inserted = null;
  const existing = { remove() { removed = true; } };
  const main = { insertAdjacentHTML(position, html) { inserted = { position, html }; } };
  const root = {
    querySelector(selector) {
      if (selector === ".notice") return existing;
      if (selector === ".main-shell") return main;
      return null;
    },
  };

  updateNoticeSurface(root, {
    ui: { notice: { tone: "warning", title: "Heads up", body: "Something changed" } },
  });

  assert.equal(removed, true);
  assert.equal(inserted.position, "afterbegin");
  assert.match(inserted.html, /Heads up/);
});

test("updateContextMenuSurface clears stale menus and focuses stage when menu is closed", () => {
  let removedCount = 0;
  let focused = false;
  const root = {
    querySelectorAll(selector) {
      if (selector === ".chart-stage .context-menu") {
        return [{ remove() { removedCount += 1; } }, { remove() { removedCount += 1; } }];
      }
      return [];
    },
    querySelector(selector) {
      if (selector === "#chart-mount-chart-1") {
        return {
          focus() { focused = true; },
          querySelector() { return null; },
        };
      }
      return null;
    },
  };

  updateContextMenuSurface(root, {
    focusedChartId: "chart-1",
    ui: { contextMenu: null },
    points: [],
    chartToggles: {},
  });

  assert.equal(removedCount, 2);
  assert.equal(focused, true);
});

test("updateContextMenuSurface appends rendered menu when context menu is open", () => {
  const originalDocument = globalThis.document;
  let appended = null;
  let focused = false;

  globalThis.document = {
    createElement() {
      return {
        set innerHTML(value) {
          this.firstElementChild = { html: value };
        },
      };
    },
  };

  const stage = {
    appendChild(node) { appended = node; },
    querySelector(selector) {
      if (selector === ".context-menu [role='menuitem']") {
        return { focus() { focused = true; } };
      }
      return null;
    },
    focus() {},
  };

  const root = {
    querySelectorAll() { return []; },
    querySelector(selector) {
      if (selector === "#chart-mount-chart-2") return stage;
      return null;
    },
  };

  try {
    updateContextMenuSurface(root, {
      focusedChartId: "chart-2",
      selectedPointIndex: 0,
      points: [{ excluded: false }],
      chartToggles: { grid: true },
      ui: { contextMenu: { x: 10, y: 20, target: "canvas", role: "chart-2" } },
    });
  } finally {
    globalThis.document = originalDocument;
  }

  assert.ok(appended);
  assert.match(appended.html, /context-menu/);
  assert.equal(focused, true);
});

test("setupUiSubscribers reacts to store updates for notice and context menu surfaces", () => {
  const originalDocument = globalThis.document;
  const calls = [];
  globalThis.document = {
    createElement() {
      return {
        set innerHTML(value) {
          this.firstElementChild = { html: value };
        },
      };
    },
  };
  const root = {
    querySelector(selector) {
      if (selector === ".notice") return null;
      if (selector === ".main-shell") {
        return { insertAdjacentHTML(position, html) { calls.push(["notice", position, html]); } };
      }
      if (selector === "#chart-mount-chart-1") {
        return { appendChild() { calls.push(["menu", "append"]); }, querySelector() { return null; }, focus() { calls.push(["menu", "focus"]); } };
      }
      return null;
    },
    querySelectorAll() { return []; },
  };
  const store = createStore({
    route: "workspace",
    focusedChartId: "chart-1",
    selectedPointIndex: 0,
    points: [{ excluded: false }],
    chartToggles: { grid: true },
    ui: { notice: null, contextMenu: null },
  });

  try {
    setupUiSubscribers(store, root);

    store.setState({
      ...store.getState(),
      ui: {
        ...store.getState().ui,
        notice: { tone: "info", title: "Notice", body: "Updated" },
        contextMenu: { x: 1, y: 2, target: "canvas", role: "chart-1" },
      },
    });
  } finally {
    globalThis.document = originalDocument;
  }

  assert.ok(calls.some(([kind]) => kind === "notice"));
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

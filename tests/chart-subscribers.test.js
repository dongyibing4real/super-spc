import test from "node:test";
import assert from "node:assert/strict";

import { createStore } from "../src/core/store.js";
import {
  setupChartSubscribers,
  updateChartPaneSurface,
} from "../src/runtime/chart-subscribers.js";

test("updateChartPaneSurface updates method labels, capability badges, and focus class", () => {
  const originalDocument = globalThis.document;
  let insertedCaps = null;
  const paneMethod = { textContent: "" };
  const paneActions = {
    before(node) { insertedCaps = node; },
  };
  const titlebar = {
    querySelector(selector) {
      if (selector === ".pane-caps") return null;
      if (selector === ".pane-actions") return paneActions;
      return null;
    },
  };
  const pane = {
    dataset: { chartId: "chart-1" },
    classList: {
      toggles: [],
      toggle(name, value) { this.toggles.push([name, value]); },
    },
  };

  globalThis.document = {
    createElement() {
      return { className: "", innerHTML: "" };
    },
  };

  const root = {
    querySelector(selector) {
      if (selector === '.chart-pane[data-chart-id="chart-1"] .pane-method') return paneMethod;
      if (selector === '.chart-pane[data-chart-id="chart-1"] .chart-pane-titlebar') return titlebar;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ".chart-pane") return [pane];
      return [];
    },
  };

  try {
    updateChartPaneSurface(root, {
      focusedChartId: "chart-1",
      chartOrder: ["chart-1"],
      charts: {
        "chart-1": {
          context: { chartType: { label: "IMR" } },
        },
      },
    }, {
      getCapability() {
        return { cpk: 1.2, ppk: 1.1 };
      },
      capClass(value) {
        return value > 1 ? "cap-good" : "cap-bad";
      },
    });
  } finally {
    globalThis.document = originalDocument;
  }

  assert.equal(paneMethod.textContent, "IMR");
  assert.ok(insertedCaps);
  assert.match(insertedCaps.innerHTML, /Cpk/);
  assert.deepEqual(pane.classList.toggles, [["pane-focused", true]]);
});

test("setupChartSubscribers updates visible charts and pane surface on relevant state changes", () => {
  const calls = [];
  const store = createStore({
    route: "workspace",
    focusedChartId: "chart-1",
    selectedPointIndex: 0,
    points: [],
    chartToggles: {},
    chartOrder: ["chart-1"],
    charts: { "chart-1": { context: { chartType: { label: "IMR" } } } },
  });
  const root = {
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };

  setupChartSubscribers(store, root, {
    chartRuntime: {
      updateVisibleCharts(state) { calls.push(["updateVisibleCharts", state.focusedChartId]); },
    },
    getCapability() { return {}; },
    capClass() { return ""; },
  });

  store.setState({
    ...store.getState(),
    points: [{ primaryValue: 10 }],
    charts: { "chart-1": { context: { chartType: { label: "XBar-R" } } } },
  });

  assert.ok(calls.some(([kind]) => kind === "updateVisibleCharts"));
});

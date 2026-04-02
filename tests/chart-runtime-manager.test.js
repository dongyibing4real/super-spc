import test from "node:test";
import assert from "node:assert/strict";

import { createChartRuntimeManager } from "../src/runtime/chart-runtime-manager.js";

test("chart runtime manager creates charts for visible ids and updates them", () => {
  const created = [];
  const updates = [];
  const mounts = new Map([
    ["chart-mount-chart-1", {}],
    ["chart-mount-chart-2", {}],
  ]);
  const originalDocument = globalThis.document;
  const originalRAF = globalThis.requestAnimationFrame;

  globalThis.document = {
    getElementById(id) {
      return mounts.get(id) || null;
    },
  };
  globalThis.requestAnimationFrame = (cb) => cb();

  const manager = createChartRuntimeManager({
    root: {},
    createChart(_mount, _options) {
      const chart = {
        update(data) { updates.push(data); },
        destroy() {},
        svg: { node() { return { isConnected: true }; } },
      };
      created.push(chart);
      return chart;
    },
    collectChartIds(layout) { return layout.rows.flat(); },
    clearForecastPromptTimer() {},
    forecastPromptEligibility: new Map(),
    buildChartData(id) { return { id }; },
    onSelectPoint() {},
    onContextMenu() {},
    onAxisDrag() {},
    onForecastDrag() {},
    onForecastActivity() {},
    onForecastPromptEligibilityChange() {},
    onActivateForecast() {},
    onSelectForecast() {},
    onCancelForecast() {},
    onAxisReset() {},
  });

  try {
    manager.syncWorkspace({
      chartLayout: { rows: [["chart-1", "chart-2"]] },
    });
  } finally {
    globalThis.document = originalDocument;
    globalThis.requestAnimationFrame = originalRAF;
  }

  assert.equal(created.length, 2);
  assert.deepEqual(updates.map((item) => item.id), ["chart-1", "chart-2", "chart-1", "chart-2"]);
});

test("chart runtime manager destroys charts that are no longer visible", () => {
  const destroyed = [];
  const mounts = new Map([["chart-mount-chart-1", {}]]);
  const originalDocument = globalThis.document;
  const originalRAF = globalThis.requestAnimationFrame;

  globalThis.document = {
    getElementById(id) {
      return mounts.get(id) || null;
    },
  };
  globalThis.requestAnimationFrame = (cb) => cb();

  const manager = createChartRuntimeManager({
    root: {},
    createChart() {
      return {
        update() {},
        destroy() { destroyed.push("chart-1"); },
        svg: { node() { return { isConnected: true }; } },
      };
    },
    collectChartIds(layout) { return layout.rows.flat(); },
    clearForecastPromptTimer() {},
    forecastPromptEligibility: new Map(),
    buildChartData(id) { return { id }; },
    onSelectPoint() {},
    onContextMenu() {},
    onAxisDrag() {},
    onForecastDrag() {},
    onForecastActivity() {},
    onForecastPromptEligibilityChange() {},
    onActivateForecast() {},
    onSelectForecast() {},
    onCancelForecast() {},
    onAxisReset() {},
  });

  try {
    manager.syncWorkspace({ chartLayout: { rows: [["chart-1"]] } });
    mounts.clear();
    manager.syncWorkspace({ chartLayout: { rows: [] } });
  } finally {
    globalThis.document = originalDocument;
    globalThis.requestAnimationFrame = originalRAF;
  }

  assert.deepEqual(destroyed, ["chart-1"]);
});

test("chart runtime manager can destroy an individual chart explicitly", () => {
  let destroyCount = 0;
  const mounts = new Map([["chart-mount-chart-9", {}]]);
  const originalDocument = globalThis.document;
  const originalRAF = globalThis.requestAnimationFrame;

  globalThis.document = {
    getElementById(id) {
      return mounts.get(id) || null;
    },
  };
  globalThis.requestAnimationFrame = (cb) => cb();

  const manager = createChartRuntimeManager({
    root: {},
    createChart() {
      return {
        update() {},
        destroy() { destroyCount += 1; },
        svg: { node() { return { isConnected: true }; } },
      };
    },
    collectChartIds(layout) { return layout.rows.flat(); },
    clearForecastPromptTimer() {},
    forecastPromptEligibility: new Map(),
    buildChartData(id) { return { id }; },
    onSelectPoint() {},
    onContextMenu() {},
    onAxisDrag() {},
    onForecastDrag() {},
    onForecastActivity() {},
    onForecastPromptEligibilityChange() {},
    onActivateForecast() {},
    onSelectForecast() {},
    onCancelForecast() {},
    onAxisReset() {},
  });

  try {
    manager.syncWorkspace({ chartLayout: { rows: [["chart-9"]] } });
    manager.destroyChart("chart-9");
  } finally {
    globalThis.document = originalDocument;
    globalThis.requestAnimationFrame = originalRAF;
  }

  assert.equal(destroyCount, 1);
});

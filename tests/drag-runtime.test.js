import test from "node:test";
import assert from "node:assert/strict";

import { getDropZone, setupDragInteractions } from "../src/runtime/drag-runtime.js";

function createRect(left, top, width, height) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

test("getDropZone resolves edge zones and center", () => {
  const pane = { getBoundingClientRect: () => createRect(100, 100, 200, 200) };

  assert.equal(getDropZone(pane, 150, 110), "top");
  assert.equal(getDropZone(pane, 150, 290), "bottom");
  assert.equal(getDropZone(pane, 110, 180), "left");
  assert.equal(getDropZone(pane, 290, 180), "right");
  assert.equal(getDropZone(pane, 200, 200), "center");
});

test("getDropZone preserves previous zone near hysteresis boundaries", () => {
  const pane = { getBoundingClientRect: () => createRect(0, 0, 200, 200) };

  assert.equal(getDropZone(pane, 48, 100, "center"), "center");
});

test("setupDragInteractions wires dblclick divider reset to commitLayout", () => {
  const listeners = new Map();
  const root = {
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    querySelectorAll() {
      return [];
    },
  };
  const documentRef = {
    addEventListener() {},
    body: { style: {} },
    createElement() { return {}; },
  };

  const calls = [];
  setupDragInteractions({
    root,
    documentRef,
    getState: () => ({ chartLayout: {} }),
    chartRuntime: { getCharts: () => ({}) },
    collectChartIds() { return []; },
    renderGhostRows() { return ""; },
    computeGridPreview() { return null; },
    commitLayout(next) { calls.push(["commitLayout", next]); },
    saveLayout() { calls.push(["saveLayout"]); },
    setColWeight(state, row, col, ratio) { return { ...state, row, col, ratio }; },
    setRowWeight() { return {}; },
    buildChartData() { return {}; },
    insertChart() { return {}; },
    chartTypeLabels: {},
  });

  const dblclick = listeners.get("dblclick");
  dblclick({
    target: {
      closest(selector) {
        if (selector !== ".grid-divider") return null;
        return {
          classList: { contains(name) { return name === "grid-divider-col"; } },
          dataset: { row: "1", col: "2" },
        };
      },
    },
  });

  assert.deepEqual(calls[0], ["commitLayout", { chartLayout: {}, row: 1, col: 2, ratio: 0.5 }]);
  assert.deepEqual(calls[1], ["saveLayout"]);
});

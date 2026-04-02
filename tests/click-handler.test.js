import test from "node:test";
import assert from "node:assert/strict";

import { handleWorkspaceClick } from "../src/events/click-handler.js";

function mockStore(initialState) {
  let state = initialState;
  return {
    getState() { return state; },
    setState(next) { state = next; return state; },
  };
}

function createPane(chartId) {
  return {
    dataset: { chartId },
    classList: {
      toggled: [],
      toggle(name, value) {
        this.toggled.push([name, value]);
      },
    },
  };
}

test("handleWorkspaceClick focuses clicked pane and updates store", () => {
  const panes = [createPane("chart-1"), createPane("chart-2")];
  const store = mockStore({
    focusedChartId: "chart-1",
    charts: { "chart-1": {}, "chart-2": {} },
    ui: { contextMenu: null, pendingNewChart: null },
  });
  const event = {
    target: {
      closest(selector) {
        if (selector === '.chart-pane[data-chart-id]') return { dataset: { chartId: "chart-2" } };
        if (selector === "[data-action]") return null;
        if (selector === ".rail-card--pending") return null;
        return null;
      },
    },
  };

  const handled = handleWorkspaceClick(event, {
    store,
    root: {
      querySelectorAll(selector) {
        return selector === ".chart-pane" ? panes : [];
      },
    },
    render() {},
    saveLayout() {},
    reanalyze() {},
    chartRuntime: { destroyChart() {} },
    snapshotRailPositions() {},
    playRailFlip() {},
    isWorkspaceFull() { return false; },
  });

  assert.equal(handled, false);
  const finalState = store.getState();
  assert.equal(finalState.focusedChartId, "chart-2");
  assert.deepEqual(panes[0].classList.toggled[0], ["pane-focused", false]);
  assert.deepEqual(panes[1].classList.toggled[0], ["pane-focused", true]);
});

test("handleWorkspaceClick clears pending new chart when clicking outside pending rail card", () => {
  const store = mockStore({
    activeChipEditor: null,
    charts: {},
    ui: { contextMenu: null, pendingNewChart: { chart_type: "imr" } },
  });
  const event = {
    target: {
      closest(selector) {
        if (selector === '.chart-pane[data-chart-id]') return null;
        if (selector === "[data-action]") return null;
        if (selector === ".rail-card--pending") return null;
        return null;
      },
    },
  };

  const handled = handleWorkspaceClick(event, {
    store,
    root: { querySelectorAll() { return []; } },
    render() {},
    saveLayout() {},
    reanalyze() {},
    chartRuntime: { destroyChart() {} },
    snapshotRailPositions() {},
    playRailFlip() {},
    isWorkspaceFull() { return false; },
  });

  assert.equal(handled, true);
  assert.equal(store.getState().ui.pendingNewChart, null);
});

test("handleWorkspaceClick seeds pending chart from focused chart on open-add-chart", () => {
  const initialState = {
    focusedChartId: "chart-1",
    charts: { "chart-1": { params: { chart_type: "xbar-r", value_column: "value", subgroup_column: "group", phase_column: "phase" } } },
    chartOrder: ["chart-1"],
    ui: { contextMenu: null, pendingNewChart: null },
  };
  const store = mockStore(initialState);
  const event = {
    target: {
      closest(selector) {
        if (selector === '.chart-pane[data-chart-id]') return null;
        if (selector === "[data-action]") return { dataset: { action: "open-add-chart" } };
        return null;
      },
    },
  };

  const handled = handleWorkspaceClick(event, {
    store,
    root: { querySelectorAll() { return []; } },
    render() {},
    saveLayout() {},
    reanalyze() {},
    chartRuntime: { destroyChart() {} },
    snapshotRailPositions() {},
    playRailFlip() {},
    isWorkspaceFull() { return false; },
  });

  assert.equal(handled, true);
  const pending = store.getState().ui.pendingNewChart;
  assert.equal(pending.chart_type, "xbar-r");
  assert.equal(pending.value_column, "value");
  assert.equal(pending.subgroup_column, "group");
  assert.equal(pending.phase_column, "phase");
});

test("handleWorkspaceClick removes chart and destroys runtime instance", () => {
  const calls = [];
  const initialState = {
    focusedChartId: "chart-1",
    charts: { "chart-1": {}, "chart-2": {} },
    chartOrder: ["chart-1", "chart-2"],
    chartLayout: {
      rows: [["chart-1", "chart-2"]],
      colWeights: [[0.5, 0.5]],
      rowWeights: [1],
    },
    nextChartId: 3,
    ui: { contextMenu: null, pendingNewChart: null },
  };
  const store = mockStore(initialState);
  const event = {
    target: {
      closest(selector) {
        if (selector === '.chart-pane[data-chart-id]') return null;
        if (selector === "[data-action]") return { dataset: { action: "remove-chart", chartId: "chart-2" } };
        return null;
      },
    },
  };

  const handled = handleWorkspaceClick(event, {
    store,
    root: { querySelectorAll() { return []; } },
    render() {},
    saveLayout() { calls.push("saveLayout"); },
    reanalyze() {},
    chartRuntime: {
      destroyChart(chartId) { calls.push(["destroyChart", chartId]); },
    },
    snapshotRailPositions() {},
    playRailFlip() {},
    isWorkspaceFull() { return false; },
  });

  assert.equal(handled, true);
  assert.deepEqual(calls[0], ["destroyChart", "chart-2"]);
  assert.equal(calls[1], "saveLayout");
  // chart-2 should be removed from state
  const finalState = store.getState();
  assert.ok(!finalState.charts["chart-2"], "chart-2 should be removed");
});

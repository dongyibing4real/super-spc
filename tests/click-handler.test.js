import test from "node:test";
import assert from "node:assert/strict";

import { handleWorkspaceClick } from "../src/events/click-handler.js";

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

test("handleWorkspaceClick focuses clicked pane and updates recipe/evidence rails", () => {
  const recipeCalls = [];
  const evidenceCalls = [];
  const panes = [createPane("chart-1"), createPane("chart-2")];
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
    state: {
      focusedChartId: "chart-1",
      charts: { "chart-1": {}, "chart-2": {} },
      ui: { contextMenu: null, pendingNewChart: null },
    },
    root: {
      querySelectorAll(selector) {
        return selector === ".chart-pane" ? panes : [];
      },
    },
    commit() {},
    commitChart() {},
    commitContextMenu() {},
    commitRecipeRail(next) { recipeCalls.push(next); },
    commitEvidenceRail(next) { evidenceCalls.push(next); },
    commitNotice() {},
    patchUi() {},
    setActiveChipEditor() {},
    clearNotice() {},
    closeContextMenu() {},
    selectPoint() {},
    toggleChartOption() {},
    togglePointExclusion() {},
    toggleTransform() {},
    failTransformStep() {},
    recoverTransformStep() {},
    setChallengerStatus() {},
    selectStructuralFinding() {},
    setFindingsChart() {},
    setStructuralFindings() {},
    generateFindings() {},
    togglePaneDataTable() {},
    focusChart(state, chartId) {
      return { ...state, focusedChartId: chartId };
    },
    snapshotRailPositions() {},
    playRailFlip() {},
    isWorkspaceFull() { return false; },
    getFocused() {},
    DEFAULT_PARAMS: {},
    addChart() {},
    removeChart() {},
    saveLayout() {},
    reanalyze() {},
    chartRuntime: { destroyChart() {} },
  });

  assert.equal(handled, false);
  assert.equal(recipeCalls[0].focusedChartId, "chart-2");
  assert.equal(evidenceCalls[0].focusedChartId, "chart-2");
  assert.deepEqual(panes[0].classList.toggled[0], ["pane-focused", false]);
  assert.deepEqual(panes[1].classList.toggled[0], ["pane-focused", true]);
});

test("handleWorkspaceClick clears pending new chart when clicking outside pending rail card", () => {
  const recipeCalls = [];
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
    state: {
      activeChipEditor: null,
      charts: {},
      ui: { contextMenu: null, pendingNewChart: { chart_type: "imr" } },
    },
    root: { querySelectorAll() { return []; } },
    commit() {},
    commitChart() {},
    commitContextMenu() {},
    commitRecipeRail(next) { recipeCalls.push(next); },
    commitEvidenceRail() {},
    commitNotice() {},
    patchUi(nextUi) { return { ui: nextUi }; },
    setActiveChipEditor() {},
    clearNotice() {},
    closeContextMenu() {},
    selectPoint() {},
    toggleChartOption() {},
    togglePointExclusion() {},
    toggleTransform() {},
    failTransformStep() {},
    recoverTransformStep() {},
    setChallengerStatus() {},
    selectStructuralFinding() {},
    setFindingsChart() {},
    setStructuralFindings() {},
    generateFindings() {},
    togglePaneDataTable() {},
    focusChart(state) { return state; },
    snapshotRailPositions() {},
    playRailFlip() {},
    isWorkspaceFull() { return false; },
    getFocused() {},
    DEFAULT_PARAMS: {},
    addChart() {},
    removeChart() {},
    saveLayout() {},
    reanalyze() {},
    chartRuntime: { destroyChart() {} },
  });

  assert.equal(handled, true);
  assert.equal(recipeCalls[0].ui.pendingNewChart, null);
});

test("handleWorkspaceClick seeds pending chart from focused chart on open-add-chart", () => {
  let committed = null;
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
    state: {
      charts: {},
      ui: { contextMenu: null, pendingNewChart: null },
    },
    root: { querySelectorAll() { return []; } },
    commit() {},
    commitChart() {},
    commitContextMenu() {},
    commitRecipeRail(next) { committed = next; },
    commitEvidenceRail() {},
    commitNotice() {},
    patchUi(nextUi) { return { ui: nextUi }; },
    setActiveChipEditor() {},
    clearNotice() {},
    closeContextMenu() {},
    selectPoint() {},
    toggleChartOption() {},
    togglePointExclusion() {},
    toggleTransform() {},
    failTransformStep() {},
    recoverTransformStep() {},
    setChallengerStatus() {},
    selectStructuralFinding() {},
    setFindingsChart() {},
    setStructuralFindings() {},
    generateFindings() {},
    togglePaneDataTable() {},
    focusChart(state) { return state; },
    snapshotRailPositions() {},
    playRailFlip() {},
    isWorkspaceFull() { return false; },
    getFocused() {
      return {
        params: {
          chart_type: "xbar-r",
          value_column: "value",
          subgroup_column: "group",
          phase_column: "phase",
        },
      };
    },
    DEFAULT_PARAMS: { sigma_method: "moving_range" },
    addChart() {},
    removeChart() {},
    saveLayout() {},
    reanalyze() {},
    chartRuntime: { destroyChart() {} },
  });

  assert.equal(handled, true);
  assert.deepEqual(committed.ui.pendingNewChart, {
    sigma_method: "moving_range",
    chart_type: "xbar-r",
    value_column: "value",
    subgroup_column: "group",
    phase_column: "phase",
  });
});

test("handleWorkspaceClick removes chart and destroys runtime instance", () => {
  const calls = [];
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
    state: {
      charts: { "chart-2": {} },
      ui: { contextMenu: null, pendingNewChart: null },
    },
    root: { querySelectorAll() { return []; } },
    commit(next) { calls.push(["commit", next]); },
    commitChart() {},
    commitContextMenu() {},
    commitRecipeRail() {},
    commitEvidenceRail() {},
    commitNotice() {},
    patchUi() {},
    setActiveChipEditor() {},
    clearNotice() {},
    closeContextMenu() {},
    selectPoint() {},
    toggleChartOption() {},
    togglePointExclusion() {},
    toggleTransform() {},
    failTransformStep() {},
    recoverTransformStep() {},
    setChallengerStatus() {},
    selectStructuralFinding() {},
    setFindingsChart() {},
    setStructuralFindings() {},
    generateFindings() {},
    togglePaneDataTable() {},
    focusChart(state) { return state; },
    snapshotRailPositions() {},
    playRailFlip() {},
    isWorkspaceFull() { return false; },
    getFocused() {},
    DEFAULT_PARAMS: {},
    addChart() {},
    removeChart(state, chartId) {
      calls.push(["removeChart", chartId]);
      return { ...state, removed: chartId };
    },
    saveLayout() { calls.push(["saveLayout"]); },
    reanalyze() {},
    chartRuntime: {
      destroyChart(chartId) { calls.push(["destroyChart", chartId]); },
    },
  });

  assert.equal(handled, true);
  assert.deepEqual(calls[0], ["removeChart", "chart-2"]);
  assert.deepEqual(calls[1], ["destroyChart", "chart-2"]);
  assert.deepEqual(calls[2], ["commit", { charts: { "chart-2": {} }, ui: { contextMenu: null, pendingNewChart: null }, removed: "chart-2" }]);
  assert.deepEqual(calls[3], ["saveLayout"]);
});

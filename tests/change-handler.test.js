import test from "node:test";
import assert from "node:assert/strict";

import {
  handleAppChange,
  parseActionTarget,
} from "../src/events/change-handler.js";

test("parseActionTarget splits chart-prefixed actions", () => {
  assert.deepEqual(parseActionTarget("chart-2-set-chart-type"), {
    chartId: "chart-2",
    baseAction: "set-chart-type",
  });
  assert.deepEqual(parseActionTarget("switch-dataset"), {
    chartId: null,
    baseAction: "switch-dataset",
  });
});

test("handleAppChange updates pending new chart metric and closes chip editor", async () => {
  const commits = [];
  const event = {
    target: {
      value: "length_of_stay",
      dataset: { action: "_pending-set-metric-column" },
      matches(selector) {
        return false;
      },
    },
  };

  const handled = await handleAppChange(event, {
    state: {
      ui: {
        pendingNewChart: { chart_type: "xbar-r", value_column: null },
      },
    },
    root: {},
    setState() {},
    commit() {},
    commitRecipeRail(next) {
      commits.push(next);
    },
    patchUi(nextUi) {
      return {
        ui: {
          pendingNewChart: nextUi.pendingNewChart,
        },
      };
    },
    setActiveChipEditor(next, activeChipEditor) {
      return { ...next, activeChipEditor };
    },
    setChartParams() {},
    setDatasets() {},
    setLoadingState() {},
    setError() {},
    createSlot() {},
    loadDatasetById() {},
    restoreLayout() { return null; },
    fetchDatasets() {},
    reanalyze() {},
  });

  assert.equal(handled, true);
  assert.equal(commits.length, 1);
  assert.equal(commits[0].ui.pendingNewChart.value_column, "length_of_stay");
  assert.equal(commits[0].activeChipEditor, null);
});

test("handleAppChange updates chart params and reanalyzes for chart action", async () => {
  const calls = [];
  const event = {
    target: {
      value: "u-chart",
      dataset: { action: "chart-1-set-chart-type" },
      matches() {
        return false;
      },
    },
  };

  const handled = await handleAppChange(event, {
    state: {
      activeDatasetId: "ds-1",
      chartOrder: ["chart-1"],
      charts: {
        "chart-1": {
          params: { chart_type: "imr" },
        },
      },
    },
    root: {},
    setState() {},
    commit(next) {
      calls.push(["commit", next]);
    },
    commitRecipeRail() {},
    patchUi() {},
    setActiveChipEditor(next, activeChipEditor) {
      return { ...next, activeChipEditor };
    },
    setChartParams(state, chartId, params) {
      calls.push(["setChartParams", chartId, params]);
      return {
        ...state,
        charts: {
          ...state.charts,
          [chartId]: {
            ...state.charts[chartId],
            params: { ...state.charts[chartId].params, ...params },
          },
        },
      };
    },
    setDatasets() {},
    setLoadingState() {},
    setError() {},
    createSlot() {},
    loadDatasetById() {},
    restoreLayout() { return null; },
    fetchDatasets() {},
    async reanalyze() {
      calls.push(["reanalyze"]);
    },
  });

  assert.equal(handled, true);
  assert.deepEqual(calls[0], ["setChartParams", "chart-1", { chart_type: "u-chart" }]);
  assert.equal(calls[1][0], "commit");
  assert.equal(calls[1][1].charts["chart-1"].params.chart_type, "u-chart");
  assert.equal(calls[1][1].activeChipEditor, null);
  assert.deepEqual(calls[2], ["reanalyze"]);
});

test("handleAppChange delegates dataset switch to loadDatasetById after loading commit", async () => {
  const calls = [];
  const datasets = [{ id: "ds-1" }, { id: "ds-2" }];
  const event = {
    target: {
      value: "ds-2",
      dataset: { action: "switch-dataset" },
      matches(selector) {
        return selector === '[data-action="switch-dataset"]';
      },
    },
  };

  const handled = await handleAppChange(event, {
    state: {
      chartOrder: [],
      charts: {},
    },
    root: {},
    setState(next) {
      calls.push(["setState", next]);
    },
    commit(next) {
      calls.push(["commit", next]);
    },
    commitRecipeRail() {},
    patchUi() {},
    setActiveChipEditor() {},
    setChartParams() {},
    setDatasets(state, nextDatasets) {
      return { ...state, datasets: nextDatasets };
    },
    setLoadingState(state, loading) {
      return { ...state, loading };
    },
    setError(state, message) {
      return { ...state, error: message };
    },
    createSlot() {
      return { params: {} };
    },
    async loadDatasetById(datasetId) {
      calls.push(["loadDatasetById", datasetId]);
    },
    restoreLayout() { return null; },
    async fetchDatasets() {
      return datasets;
    },
    reanalyze() {},
  });

  assert.equal(handled, true);
  assert.deepEqual(calls[0], ["setState", { chartOrder: [], charts: {}, loading: true }]);
  assert.deepEqual(calls[1], ["commit", { chartOrder: [], charts: {}, datasets }]);
  assert.deepEqual(calls[2], ["loadDatasetById", "ds-2"]);
});

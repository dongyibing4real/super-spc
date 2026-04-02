import test from "node:test";
import assert from "node:assert/strict";

import {
  handleAppChange,
  parseActionTarget,
} from "../src/events/change-handler.js";

function mockStore(initialState) {
  let state = initialState;
  return {
    getState() { return state; },
    setState(next) { state = next; return state; },
  };
}

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
  const store = mockStore({
    ui: {
      pendingNewChart: { chart_type: "xbar-r", value_column: null },
    },
  });

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
    store,
    root: {},
    render() {},
    loadDatasetById() {},
    restoreLayout() { return null; },
    reanalyze() {},
  });

  assert.equal(handled, true);
  const finalState = store.getState();
  assert.equal(finalState.ui.pendingNewChart.value_column, "length_of_stay");
  assert.equal(finalState.activeChipEditor, null);
});

test("handleAppChange updates chart params and reanalyzes for chart action", async () => {
  const calls = [];
  const store = mockStore({
    activeDatasetId: "ds-1",
    chartOrder: ["chart-1"],
    charts: {
      "chart-1": {
        params: { chart_type: "imr" },
      },
    },
  });

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
    store,
    root: {},
    render() { calls.push(["render"]); },
    loadDatasetById() {},
    restoreLayout() { return null; },
    async reanalyze() {
      calls.push(["reanalyze"]);
    },
  });

  assert.equal(handled, true);
  const finalState = store.getState();
  assert.equal(finalState.charts["chart-1"].params.chart_type, "u-chart");
  assert.equal(finalState.activeChipEditor, null);
  assert.deepEqual(calls[0], ["render"]);
  assert.deepEqual(calls[1], ["reanalyze"]);
});

test("handleAppChange delegates dataset switch to loadDatasetById after loading commit", async () => {
  const calls = [];
  const datasets = [{ id: "ds-1" }, { id: "ds-2" }];
  const store = mockStore({
    chartOrder: [],
    charts: {},
  });

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
    store,
    root: {},
    render() { calls.push(["render"]); },
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
  const finalState = store.getState();
  assert.deepEqual(finalState.datasets, datasets);
  assert.deepEqual(calls[0], ["render"]);
  assert.deepEqual(calls[1], ["loadDatasetById", "ds-2"]);
});

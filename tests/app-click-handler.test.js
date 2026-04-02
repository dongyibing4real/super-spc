import test from "node:test";
import assert from "node:assert/strict";

import { handleAppClick } from "../src/events/app-click-handler.js";

test("handleAppClick closes shortcut overlay", async () => {
  const calls = [];
  const event = {
    target: {
      closest(selector) {
        return selector === "[data-action]" ? { dataset: { action: "close-shortcut-overlay" } } : null;
      },
    },
  };

  const handled = await handleAppClick(event, {
    state: {},
    root: {},
    setState(next) { calls.push(["setState", next]); },
    render() { calls.push(["render"]); },
    commit() {},
    commitChart() {},
    commitContextMenu() {},
    commitRecipeRail() {},
    patchUi(nextUi) { return { ui: nextUi }; },
    navigate() {},
    fetchPoints() {},
    fetchColumns() {},
    createTable() {},
    setPrepParsedData() {},
    loadPrepPoints() {},
    setPrepError() {},
    resetAxis() {},
    closeContextMenu() {},
    setActiveChipEditor() {},
    selectPrepDataset() {},
    setColumns() {},
    deleteDataset() {},
    fetchDatasets() {},
    deletePrepDataset() {},
    setDatasets() {},
    loadDatasetById() {},
    setExpandedProfileColumn() {},
  });

  assert.equal(handled, true);
  assert.deepEqual(calls, [["setState", { ui: { shortcutOverlay: false } }], ["render"]]);
});

test("handleAppClick routes reset-axis through chart and context menu commits", async () => {
  const calls = [];
  const event = {
    target: {
      closest(selector) {
        return selector === "[data-action]"
          ? { dataset: { action: "reset-axis", axis: "x" } }
          : null;
      },
    },
  };

  const handled = await handleAppClick(event, {
    state: { focusedChartId: "chart-1", ui: { contextMenu: { role: "chart-2" } } },
    root: {},
    setState() {},
    render() {},
    commit() {},
    commitChart(next) { calls.push(["commitChart", next]); },
    commitContextMenu(next) { calls.push(["commitContextMenu", next]); },
    commitRecipeRail() {},
    patchUi() {},
    navigate() {},
    fetchPoints() {},
    fetchColumns() {},
    createTable() {},
    setPrepParsedData() {},
    loadPrepPoints() {},
    setPrepError() {},
    resetAxis(state, axis, role) {
      return { ...state, axis, role };
    },
    closeContextMenu(state) { return { ...state, ui: { contextMenu: null } }; },
    setActiveChipEditor() {},
    selectPrepDataset() {},
    setColumns() {},
    deleteDataset() {},
    fetchDatasets() {},
    deletePrepDataset() {},
    setDatasets() {},
    loadDatasetById() {},
    setExpandedProfileColumn() {},
  });

  assert.equal(handled, true);
  assert.deepEqual(calls[0], ["commitChart", { focusedChartId: "chart-1", ui: { contextMenu: { role: "chart-2" } }, axis: "x", role: "chart-2" }]);
  assert.deepEqual(calls[1], ["commitContextMenu", { focusedChartId: "chart-1", ui: { contextMenu: null } }]);
});

test("handleAppClick selects prep dataset and hydrates prep table", async () => {
  const calls = [];
  const pts = [{ raw_data: { a: "1" } }];
  const cols = [{ name: "a" }];
  const event = {
    target: {
      closest(selector) {
        return selector === "[data-action]"
          ? { dataset: { action: "select-prep-dataset", datasetId: "ds-2" } }
          : null;
      },
    },
  };

  const handled = await handleAppClick(event, {
    state: {},
    root: {},
    setState(next) { calls.push(["setState", next]); },
    render() { calls.push(["render"]); },
    commit(next) { calls.push(["commit", next]); },
    commitChart() {},
    commitContextMenu() {},
    commitRecipeRail() {},
    patchUi() {},
    navigate() {},
    async fetchPoints() { return pts; },
    async fetchColumns() { return cols; },
    createTable(rows, tableCols) {
      calls.push(["createTable", rows, tableCols]);
      return { rows, cols: tableCols };
    },
    setPrepParsedData(state, payload) {
      return { ...state, parsed: payload };
    },
    loadPrepPoints(state, nextPts) {
      return { ...state, datasetPoints: nextPts };
    },
    setPrepError() {},
    resetAxis() {},
    closeContextMenu() {},
    setActiveChipEditor() {},
    selectPrepDataset(state, dsId) {
      return { ...state, selectedDatasetId: dsId };
    },
    setColumns(state, nextCols) {
      return { ...state, columns: nextCols };
    },
    deleteDataset() {},
    fetchDatasets() {},
    deletePrepDataset() {},
    setDatasets() {},
    loadDatasetById() {},
    setExpandedProfileColumn() {},
  });

  assert.equal(handled, true);
  assert.deepEqual(calls[0], ["commit", { selectedDatasetId: "ds-2" }]);
  assert.equal(calls[1][0], "createTable");
  assert.equal(calls[2][0], "setState");
  assert.equal(calls[2][1].columns[0].name, "a");
  assert.equal(calls[2][1].parsed.columns[0].name, "a");
  assert.deepEqual(calls[3], ["render"]);
});

test("handleAppClick hydrates dataprep after navigate when selected dataset comes from activeDatasetId", async () => {
  const calls = [];
  const pts = [{ raw_data: { a: "1" } }, { raw_data: { a: "2" } }];
  const cols = [{ name: "a" }];
  const event = {
    target: {
      closest(selector) {
        return selector === "[data-action]"
          ? { dataset: { action: "navigate", route: "dataprep" } }
          : null;
      },
    },
  };

  const handled = await handleAppClick(event, {
    state: {
      activeDatasetId: "ds-1",
      dataPrep: { selectedDatasetId: null, datasetPoints: [] },
      columnConfig: { columns: [{ name: "fallback" }] },
    },
    root: {},
    setState(next) { calls.push(["setState", next]); },
    render() { calls.push(["render"]); },
    commit(next) { calls.push(["commit", next]); },
    commitChart() {},
    commitContextMenu() {},
    commitRecipeRail() {},
    patchUi() {},
    navigate(state, route) {
      return {
        ...state,
        route,
        dataPrep: { ...state.dataPrep, selectedDatasetId: state.activeDatasetId },
      };
    },
    async fetchPoints() { return pts; },
    async fetchColumns() { return cols; },
    createTable(rows, tableCols) {
      calls.push(["createTable", rows, tableCols]);
      return { rows, cols: tableCols };
    },
    setPrepParsedData(state, payload) {
      return { ...state, parsed: payload };
    },
    loadPrepPoints(state, nextPts) {
      return { ...state, dataPrep: { ...state.dataPrep, datasetPoints: nextPts } };
    },
    setPrepError() {},
    resetAxis() {},
    closeContextMenu() {},
    setActiveChipEditor() {},
    selectPrepDataset() {},
    setColumns() {},
    deleteDataset() {},
    fetchDatasets() {},
    deletePrepDataset() {},
    setDatasets() {},
    loadDatasetById() {},
    setExpandedProfileColumn() {},
  });

  assert.equal(handled, true);
  assert.equal(calls[0][0], "commit");
  assert.equal(calls[0][1].route, "dataprep");
  assert.equal(calls[0][1].dataPrep.selectedDatasetId, "ds-1");
  assert.equal(calls[1][0], "createTable");
  assert.equal(calls[2][0], "setState");
  assert.deepEqual(calls[2][1].dataPrep.datasetPoints, pts);
  assert.deepEqual(calls[3], ["render"]);
});

test("handleAppClick toggles delete confirmation on first delete click", async () => {
  let committed = null;
  const event = {
    target: {
      closest(selector) {
        return selector === "[data-action]"
          ? { dataset: { action: "delete-dataset", datasetId: "ds-9" } }
          : null;
      },
    },
  };

  const handled = await handleAppClick(event, {
    state: { dataPrep: { confirmingDeleteId: null } },
    root: {},
    setState() {},
    render() {},
    commit(next) { committed = next; },
    commitChart() {},
    commitContextMenu() {},
    commitRecipeRail() {},
    patchUi() {},
    navigate() {},
    fetchPoints() {},
    fetchColumns() {},
    createTable() {},
    setPrepParsedData() {},
    loadPrepPoints() {},
    setPrepError() {},
    resetAxis() {},
    closeContextMenu() {},
    setActiveChipEditor() {},
    selectPrepDataset() {},
    setColumns() {},
    deleteDataset() {},
    fetchDatasets() {},
    deletePrepDataset() {},
    setDatasets() {},
    loadDatasetById() {},
    setExpandedProfileColumn() {},
  });

  assert.equal(handled, true);
  assert.deepEqual(committed, { dataPrep: { confirmingDeleteId: "ds-9" } });
});

test("handleAppClick loads prep dataset into workspace and applies excluded rows", async () => {
  let committed = null;
  const event = {
    target: {
      closest(selector) {
        return selector === "[data-action]"
          ? { dataset: { action: "load-prep-to-chart" } }
          : null;
      },
    },
  };

  const handled = await handleAppClick(event, {
    state: {
      dataPrep: { selectedDatasetId: "ds-1", excludedRows: [1] },
      points: [{ excluded: false }, { excluded: false }],
    },
    root: {},
    setState() {},
    render() {},
    commit(next) { committed = next; },
    commitChart() {},
    commitContextMenu() {},
    commitRecipeRail() {},
    patchUi() {},
    navigate(state, route) { return { ...state, route }; },
    fetchPoints() {},
    fetchColumns() {},
    createTable() {},
    setPrepParsedData() {},
    loadPrepPoints() {},
    setPrepError() {},
    resetAxis() {},
    closeContextMenu() {},
    setActiveChipEditor() {},
    selectPrepDataset() {},
    setColumns() {},
    deleteDataset() {},
    fetchDatasets() {},
    deletePrepDataset() {},
    setDatasets() {},
    async loadDatasetById() {},
    setExpandedProfileColumn() {},
  });

  assert.equal(handled, true);
  assert.equal(committed.route, "workspace");
  assert.equal(committed.points[0].excluded, false);
  assert.equal(committed.points[1].excluded, true);
});

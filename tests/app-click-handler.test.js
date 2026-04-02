import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

function mockStore(initialState) {
  let state = initialState;
  return {
    getState() { return state; },
    setState(next) { state = next; return state; },
  };
}

// We need to mock the module-level imports before importing the handler.
// Use node:test's mock.module to stub state.js, api.js, and data-prep-engine.js.

let stubs;

function resetStubs() {
  stubs = {
    navigate: (state, route) => ({ ...state, route }),
    setPrepParsedData: (state, payload) => ({ ...state, parsed: payload }),
    loadPrepPoints: (state, pts) => ({ ...state, datasetPoints: pts }),
    setPrepError: (state, msg) => ({ ...state, prepError: msg }),
    resetAxis: (state, axis, role) => ({ ...state, axis, role }),
    closeContextMenu: (state) => ({ ...state, ui: { ...state.ui, contextMenu: null } }),
    setActiveChipEditor: (state, chipId) => ({ ...state, activeChipEditor: chipId }),
    selectPrepDataset: (state, dsId) => ({ ...state, selectedDatasetId: dsId }),
    setColumns: (state, cols) => ({ ...state, columns: cols }),
    deletePrepDataset: (state, dsId) => ({ ...state, deletedDataset: dsId }),
    setDatasets: (state, datasets) => ({ ...state, datasets }),
    setExpandedProfileColumn: (state, col) => ({ ...state, expandedColumn: col }),
    fetchPoints: async () => [],
    fetchColumns: async () => [],
    fetchDatasets: async () => [],
    deleteDataset: async () => {},
    createTable: (rows, cols) => ({ rows, cols }),
  };
}

resetStubs();

mock.module("../src/core/state.js", {
  namedExports: {
    navigate: (...args) => stubs.navigate(...args),
    setPrepParsedData: (...args) => stubs.setPrepParsedData(...args),
    loadPrepPoints: (...args) => stubs.loadPrepPoints(...args),
    setPrepError: (...args) => stubs.setPrepError(...args),
    resetAxis: (...args) => stubs.resetAxis(...args),
    closeContextMenu: (...args) => stubs.closeContextMenu(...args),
    setActiveChipEditor: (...args) => stubs.setActiveChipEditor(...args),
    selectPrepDataset: (...args) => stubs.selectPrepDataset(...args),
    setColumns: (...args) => stubs.setColumns(...args),
    deletePrepDataset: (...args) => stubs.deletePrepDataset(...args),
    setDatasets: (...args) => stubs.setDatasets(...args),
    setExpandedProfileColumn: (...args) => stubs.setExpandedProfileColumn(...args),
  },
});

mock.module("../src/data/api.js", {
  namedExports: {
    fetchPoints: (...args) => stubs.fetchPoints(...args),
    fetchColumns: (...args) => stubs.fetchColumns(...args),
    fetchDatasets: (...args) => stubs.fetchDatasets(...args),
    deleteDataset: (...args) => stubs.deleteDataset(...args),
  },
});

mock.module("../src/data/data-prep-engine.js", {
  namedExports: {
    createTable: (...args) => stubs.createTable(...args),
  },
});

const { handleAppClick } = await import("../src/events/app-click-handler.js");

test("handleAppClick closes shortcut overlay", async () => {
  resetStubs();
  const calls = [];
  const store = mockStore({ ui: { shortcutOverlay: true } });
  const event = {
    target: {
      closest(selector) {
        return selector === "[data-action]" ? { dataset: { action: "close-shortcut-overlay" } } : null;
      },
    },
  };

  const handled = await handleAppClick(event, {
    store,
    root: {},
    render() { calls.push(["render"]); },
    loadDatasetById() {},
  });

  assert.equal(handled, true);
  assert.deepEqual(store.getState().ui, { shortcutOverlay: false });
  assert.deepEqual(calls, [["render"]]);
});

test("handleAppClick routes reset-axis through store.setState", async () => {
  resetStubs();
  const setStateCalls = [];
  const initialState = { focusedChartId: "chart-1", ui: { contextMenu: { role: "chart-2" } } };
  const store = mockStore(initialState);
  const origSetState = store.setState.bind(store);
  store.setState = (next) => { setStateCalls.push(next); return origSetState(next); };

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
    store,
    root: {},
    render() {},
    loadDatasetById() {},
  });

  assert.equal(handled, true);
  // First setState: resetAxis result
  assert.deepEqual(setStateCalls[0], {
    focusedChartId: "chart-1",
    ui: { contextMenu: { role: "chart-2" } },
    axis: "x",
    role: "chart-2",
  });
  // Second setState: closeContextMenu result (uses getState which now has axis/role)
  assert.equal(setStateCalls[1].ui.contextMenu, null);
});

test("handleAppClick selects prep dataset and hydrates prep table", async () => {
  const pts = [{ raw_data: { a: "1" } }];
  const cols = [{ name: "a" }];
  resetStubs();
  stubs.fetchPoints = async () => pts;
  stubs.fetchColumns = async () => cols;

  const calls = [];
  const store = mockStore({});
  const origSetState = store.setState.bind(store);
  store.setState = (next) => { calls.push(["setState", next]); return origSetState(next); };

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
    store,
    root: {},
    render() { calls.push(["render"]); },
    loadDatasetById() {},
  });

  assert.equal(handled, true);
  // First setState: selectPrepDataset
  assert.equal(calls[0][0], "setState");
  assert.equal(calls[0][1].selectedDatasetId, "ds-2");
  // First render after selectPrepDataset
  assert.deepEqual(calls[1], ["render"]);
  // Second setState: final hydrated state
  assert.equal(calls[2][0], "setState");
  assert.equal(calls[2][1].columns[0].name, "a");
  assert.equal(calls[2][1].parsed.columns[0].name, "a");
  // Second render after hydration
  assert.deepEqual(calls[3], ["render"]);
});

test("handleAppClick hydrates dataprep after navigate when selected dataset comes from activeDatasetId", async () => {
  const pts = [{ raw_data: { a: "1" } }, { raw_data: { a: "2" } }];
  const cols = [{ name: "a" }];
  resetStubs();
  stubs.fetchPoints = async () => pts;
  stubs.fetchColumns = async () => cols;
  stubs.navigate = (state, route) => ({
    ...state,
    route,
    dataPrep: { ...state.dataPrep, selectedDatasetId: state.activeDatasetId },
  });
  stubs.loadPrepPoints = (state, nextPts) => ({
    ...state,
    dataPrep: { ...state.dataPrep, datasetPoints: nextPts },
  });

  const calls = [];
  const store = mockStore({
    activeDatasetId: "ds-1",
    dataPrep: { selectedDatasetId: null, datasetPoints: [] },
    columnConfig: { columns: [{ name: "fallback" }] },
  });
  const origSetState = store.setState.bind(store);
  store.setState = (next) => { calls.push(["setState", next]); return origSetState(next); };

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
    store,
    root: {},
    render() { calls.push(["render"]); },
    loadDatasetById() {},
  });

  assert.equal(handled, true);
  // First setState + render: navigate commit
  assert.equal(calls[0][0], "setState");
  assert.equal(calls[0][1].route, "dataprep");
  assert.equal(calls[0][1].dataPrep.selectedDatasetId, "ds-1");
  assert.deepEqual(calls[1], ["render"]);
  // Second setState + render: hydration
  assert.equal(calls[2][0], "setState");
  assert.deepEqual(calls[2][1].dataPrep.datasetPoints, pts);
  assert.deepEqual(calls[3], ["render"]);
});

test("handleAppClick toggles delete confirmation on first delete click", async () => {
  resetStubs();
  const store = mockStore({ dataPrep: { confirmingDeleteId: null } });
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
    store,
    root: {},
    render() {},
    loadDatasetById() {},
  });

  assert.equal(handled, true);
  assert.deepEqual(store.getState(), { dataPrep: { confirmingDeleteId: "ds-9" } });
});

test("handleAppClick loads prep dataset into workspace and applies excluded rows", async () => {
  resetStubs();
  const store = mockStore({
    dataPrep: { selectedDatasetId: "ds-1", excludedRows: [1] },
    points: [{ excluded: false }, { excluded: false }],
  });
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
    store,
    root: {},
    render() {},
    async loadDatasetById() {},
  });

  assert.equal(handled, true);
  const final = store.getState();
  assert.equal(final.route, "workspace");
  assert.equal(final.points[0].excluded, false);
  assert.equal(final.points[1].excluded, true);
});

import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

// Track calls to key functions
const calls = [];

// Mock state reducers
const stateReducers = {
  setPrepError(state, msg) { return { ...state, prepError: msg }; },
  clearPrepTransforms(state) { return { ...state, dataPrep: { ...state.dataPrep, transforms: [] } }; },
  setActivePanel(state, panel) { return { ...state, activePanel: panel }; },
  closeActivePanel(state) { return { ...state, activePanel: null }; },
  toggleRowExclusion(state, idx) { return { ...state, toggledRow: idx }; },
  updateColumnMeta(state, col, updates) { return { ...state, updatedCol: col, colUpdates: updates }; },
  addColumnMeta(state, cols) { return { ...state, addedCols: cols }; },
  addPrepTransform(state, transform) {
    calls.push(["addPrepTransform", transform]);
    return { ...state, lastTransform: transform };
  },
  setPrepTable(state, table) {
    calls.push(["setPrepTable", table]);
    return { ...state, table };
  },
  setColumns(state, columns) { return { ...state, columns }; },
  setProfileCache(state, cache) { return { ...state, cache }; },
  markPrepSaved(state) { return { ...state, markedSaved: true }; },
  undoPrepTransform(state) {
    calls.push(["undoPrepTransform"]);
    return { ...state, dataPrep: { ...state.dataPrep, transforms: [] } };
  },
  undoPrepTransformTo(state, idx) { return { ...state, dataPrep: { ...state.dataPrep, transforms: state.dataPrep.transforms.slice(0, idx) } }; },
  setDatasets(state, datasets) { return { ...state, datasets }; },
};

const dataFunctions = {
  filterRows(table, column, operator, filterVal) {
    calls.push(["filterRows", column, operator, filterVal]);
    return { table, filtered: true };
  },
  findReplace() {},
  removeDuplicates() {},
  handleMissing() {},
  cleanText() {},
  renameColumn() {},
  changeColumnType() {},
  addCalculatedColumn() {},
  recodeValues() {},
  binColumn() {},
  splitColumn() {},
  concatColumns() {},
};

const apiFunctions = {
  createDataset() {},
  fetchDatasets() {},
};

const runtimeFunctions = {
  replayPrepTransforms() {
    calls.push(["replayPrepTransforms"]);
    return { table: { replayed: true }, columns: [{ name: "value" }] };
  },
};

// Register mocks for all imported modules
mock.module("../src/core/state.js", { namedExports: stateReducers });
mock.module("../src/data/api.js", { namedExports: apiFunctions });
mock.module("../src/data/data-prep-engine.js", { namedExports: dataFunctions });
mock.module("../src/runtime/prep-runtime.js", { namedExports: runtimeFunctions });

const { handlePrepClick } = await import("../src/events/prep-click-handler.js");

function mockStore(initialState) {
  let state = initialState;
  return {
    getState() { return state; },
    setState(next) { state = next; return state; },
  };
}

function createRoot(fieldValues = {}, checkedValues = {}, extra = {}) {
  return {
    querySelector(selector) {
      const fieldMatch = selector.match(/^\[data-field="(.+)"\]$/);
      if (fieldMatch) {
        const field = fieldMatch[1];
        return {
          value: fieldValues[field],
          checked: checkedValues[field] || false,
        };
      }
      if (selector === ".prep-mapping-rows") return extra.mappingContainer || null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-field="dedup-col"]:checked') return extra.dedupChecked || [];
      if (selector === '[data-field="concat-col"]:checked') return extra.concatChecked || [];
      if (selector === ".prep-mapping-row") return extra.mappingRows || [];
      return [];
    },
  };
}

test("handlePrepClick opens filter panel", async () => {
  calls.length = 0;
  const store = mockStore({});
  const renderCalls = [];
  const event = {
    target: {
      closest(selector) {
        return selector === "[data-action]" ? { dataset: { action: "prep-filter" } } : null;
      },
    },
  };

  const handled = await handlePrepClick(event, {
    store,
    root: createRoot(),
    documentRef: {},
    windowRef: {},
    render() { renderCalls.push("render"); },
  });

  assert.equal(handled, true);
  assert.deepEqual(store.getState(), { activePanel: "filter" });
  assert.equal(renderCalls.length, 1);
});

test("handlePrepClick applies filter transform and closes active panel", async () => {
  calls.length = 0;
  const initialState = { dataPrep: { arqueroTable: { kind: "table" } } };
  const store = mockStore(initialState);
  const renderCalls = [];

  const event = {
    target: {
      closest(selector) {
        return selector === "[data-action]" ? { dataset: { action: "prep-apply-filter" } } : null;
      },
    },
  };

  const handled = await handlePrepClick(event, {
    store,
    root: createRoot({
      "filter-col": "status",
      "filter-op": "eq",
      "filter-val": "open",
      "filter-val2": "",
    }),
    documentRef: {},
    windowRef: {},
    render() { renderCalls.push("render"); },
  });

  assert.equal(handled, true);
  assert.deepEqual(calls[0], ["filterRows", "status", "eq", "open"]);
  assert.equal(calls[1][0], "addPrepTransform");
  assert.equal(calls[2][0], "setPrepTable");
  // Final state should have activePanel: null from closeActivePanel
  const finalState = store.getState();
  assert.equal(finalState.activePanel, null);
  assert.equal(renderCalls.length, 1);
});

test("handlePrepClick replays transforms on prep undo", async () => {
  calls.length = 0;
  const initialState = { dataPrep: { transforms: [{ type: "trim" }] } };
  const store = mockStore(initialState);
  const renderCalls = [];

  const event = {
    target: {
      closest(selector) {
        return selector === "[data-action]" ? { dataset: { action: "prep-undo" } } : null;
      },
    },
  };

  const handled = await handlePrepClick(event, {
    store,
    root: createRoot(),
    documentRef: {},
    windowRef: {},
    render() { renderCalls.push("render"); },
  });

  assert.equal(handled, true);
  assert.deepEqual(calls[0], ["undoPrepTransform"]);
  assert.deepEqual(calls[1], ["replayPrepTransforms"]);
  const finalState = store.getState();
  assert.equal(finalState.markedSaved, true);
  assert.equal(renderCalls.length, 1);
});

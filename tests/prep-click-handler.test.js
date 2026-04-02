import test from "node:test";
import assert from "node:assert/strict";

import { handlePrepClick } from "../src/events/prep-click-handler.js";

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
  let committed = null;
  const event = {
    target: {
      closest(selector) {
        return selector === "[data-action]" ? { dataset: { action: "prep-filter" } } : null;
      },
    },
  };

  const handled = await handlePrepClick(event, {
    state: {},
    root: createRoot(),
    documentRef: {},
    windowRef: {},
    setState() {},
    render() {},
    commit(next) { committed = next; },
    createDataset() {},
    fetchDatasets() {},
    setDatasets() {},
    setPrepError() {},
    clearPrepTransforms() {},
    setActivePanel(state, panel) { return { ...state, activePanel: panel }; },
    closeActivePanel() {},
    toggleRowExclusion() {},
    updateColumnMeta() {},
    addColumnMeta() {},
    addPrepTransform() {},
    setPrepTable() {},
    setColumns() {},
    setProfileCache() {},
    markPrepSaved() {},
    undoPrepTransform() {},
    undoPrepTransformTo() {},
    replayPrepTransforms() {},
    cleanText() {},
    filterRows() {},
    findReplace() {},
    removeDuplicates() {},
    handleMissing() {},
    renameColumn() {},
    changeColumnType() {},
    addCalculatedColumn() {},
    recodeValues() {},
    binColumn() {},
    splitColumn() {},
    concatColumns() {},
  });

  assert.equal(handled, true);
  assert.deepEqual(committed, { activePanel: "filter" });
});

test("handlePrepClick applies filter transform and closes active panel", async () => {
  const calls = [];
  const event = {
    target: {
      closest(selector) {
        return selector === "[data-action]" ? { dataset: { action: "prep-apply-filter" } } : null;
      },
    },
  };

  const handled = await handlePrepClick(event, {
    state: { dataPrep: { arqueroTable: { kind: "table" } } },
    root: createRoot({
      "filter-col": "status",
      "filter-op": "eq",
      "filter-val": "open",
      "filter-val2": "",
    }),
    documentRef: {},
    windowRef: {},
    setState(next) { calls.push(["setState", next]); },
    render() { calls.push(["render"]); },
    commit() {},
    createDataset() {},
    fetchDatasets() {},
    setDatasets() {},
    setPrepError() {},
    clearPrepTransforms() {},
    setActivePanel() {},
    closeActivePanel(state) { return { ...state, activePanel: null }; },
    toggleRowExclusion() {},
    updateColumnMeta() {},
    addColumnMeta() {},
    addPrepTransform(state, transform) {
      calls.push(["addPrepTransform", transform]);
      return { ...state, lastTransform: transform };
    },
    setPrepTable(state, table) {
      calls.push(["setPrepTable", table]);
      return { ...state, table };
    },
    setColumns() {},
    setProfileCache() {},
    markPrepSaved() {},
    undoPrepTransform() {},
    undoPrepTransformTo() {},
    replayPrepTransforms() {},
    cleanText() {},
    filterRows(table, column, operator, filterVal) {
      calls.push(["filterRows", column, operator, filterVal]);
      return { table, filtered: true };
    },
    findReplace() {},
    removeDuplicates() {},
    handleMissing() {},
    renameColumn() {},
    changeColumnType() {},
    addCalculatedColumn() {},
    recodeValues() {},
    binColumn() {},
    splitColumn() {},
    concatColumns() {},
  });

  assert.equal(handled, true);
  assert.deepEqual(calls[0], ["filterRows", "status", "eq", "open"]);
  assert.equal(calls[1][0], "addPrepTransform");
  assert.equal(calls[2][0], "setPrepTable");
  assert.equal(calls[3][0], "setState");
  assert.deepEqual(calls[4], ["render"]);
});

test("handlePrepClick replays transforms on prep undo", async () => {
  const calls = [];
  const event = {
    target: {
      closest(selector) {
        return selector === "[data-action]" ? { dataset: { action: "prep-undo" } } : null;
      },
    },
  };

  const handled = await handlePrepClick(event, {
    state: { dataPrep: { transforms: [{ type: "trim" }] } },
    root: createRoot(),
    documentRef: {},
    windowRef: {},
    setState(next) { calls.push(["setState", next]); },
    render() { calls.push(["render"]); },
    commit() {},
    createDataset() {},
    fetchDatasets() {},
    setDatasets() {},
    setPrepError() {},
    clearPrepTransforms() {},
    setActivePanel() {},
    closeActivePanel() {},
    toggleRowExclusion() {},
    updateColumnMeta() {},
    addColumnMeta() {},
    addPrepTransform() {},
    setPrepTable(state, table) { return { ...state, table }; },
    setColumns(state, columns) { return { ...state, columns }; },
    setProfileCache(state, cache) { return { ...state, cache }; },
    markPrepSaved(state) { return { ...state, markedSaved: true }; },
    undoPrepTransform(state) {
      calls.push(["undoPrepTransform"]);
      return { ...state, dataPrep: { transforms: [] } };
    },
    undoPrepTransformTo() {},
    replayPrepTransforms() {
      calls.push(["replayPrepTransforms"]);
      return { table: { replayed: true }, columns: [{ name: "value" }] };
    },
    cleanText() {},
    filterRows() {},
    findReplace() {},
    removeDuplicates() {},
    handleMissing() {},
    renameColumn() {},
    changeColumnType() {},
    addCalculatedColumn() {},
    recodeValues() {},
    binColumn() {},
    splitColumn() {},
    concatColumns() {},
  });

  assert.equal(handled, true);
  assert.deepEqual(calls[0], ["undoPrepTransform"]);
  assert.deepEqual(calls[1], ["replayPrepTransforms"]);
  assert.equal(calls[2][0], "setState");
  assert.equal(calls[2][1].markedSaved, true);
  assert.deepEqual(calls[3], ["render"]);
});

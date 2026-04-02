import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createInitialState,
  selectPrepDataset,
  loadPrepPoints,
  setPrepError,
  deletePrepDataset,
  setPrepParsedData,
  setPrepTable,
  addPrepTransform,
  undoPrepTransform,
  undoPrepTransformTo,
  clearPrepTransforms,
  setPrepHiddenColumns,
  markPrepSaved,
  setActivePanel,
  closeActivePanel,
  updateColumnMeta,
  addColumnMeta,
  toggleRowExclusion,
  bulkExcludeRows,
  clearAllExclusions,
} from "../../src/core/state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a base state with some dataPrep data pre-populated. */
function stateWithPrep(overrides = {}) {
  const s = createInitialState();
  s.dataPrep = { ...s.dataPrep, ...overrides };
  return s;
}

/** Return a base state with datasets and columnConfig pre-populated. */
function stateWithDatasets() {
  const s = createInitialState();
  s.datasets = [
    { id: "ds-1", name: "Alpha" },
    { id: "ds-2", name: "Beta" },
  ];
  s.activeDatasetId = "ds-1";
  s.dataPrep = { ...s.dataPrep, selectedDatasetId: "ds-1" };
  s.columnConfig = {
    columns: [
      { name: "col_a", dtype: "number", role: null, ordinal: 0 },
      { name: "col_b", dtype: "string", role: null, ordinal: 1 },
    ],
    loading: false,
  };
  return s;
}

// ---------------------------------------------------------------------------
// selectPrepDataset
// ---------------------------------------------------------------------------
describe("selectPrepDataset", () => {
  it("sets selectedDatasetId, resets points, sets loading", () => {
    const prev = createInitialState();
    const next = selectPrepDataset(prev, "ds-42");

    assert.equal(next.dataPrep.selectedDatasetId, "ds-42");
    assert.deepEqual(next.dataPrep.datasetPoints, []);
    assert.equal(next.dataPrep.loading, true);
    assert.equal(next.dataPrep.error, null);
  });

  it("does not mutate previous state", () => {
    const prev = createInitialState();
    const oldDP = prev.dataPrep;
    selectPrepDataset(prev, "ds-42");
    assert.equal(prev.dataPrep, oldDP);
    assert.equal(prev.dataPrep.selectedDatasetId, null);
  });
});

// ---------------------------------------------------------------------------
// loadPrepPoints
// ---------------------------------------------------------------------------
describe("loadPrepPoints", () => {
  it("stores points, clears loading and error", () => {
    const prev = stateWithPrep({ loading: true, error: "old error" });
    const pts = [{ x: 1 }, { x: 2 }];
    const next = loadPrepPoints(prev, pts);

    assert.deepEqual(next.dataPrep.datasetPoints, pts);
    assert.equal(next.dataPrep.loading, false);
    assert.equal(next.dataPrep.error, null);
  });
});

// ---------------------------------------------------------------------------
// setPrepError
// ---------------------------------------------------------------------------
describe("setPrepError", () => {
  it("sets error message and clears loading", () => {
    const prev = stateWithPrep({ loading: true });
    const next = setPrepError(prev, "something broke");

    assert.equal(next.dataPrep.error, "something broke");
    assert.equal(next.dataPrep.loading, false);
  });
});

// ---------------------------------------------------------------------------
// deletePrepDataset
// ---------------------------------------------------------------------------
describe("deletePrepDataset", () => {
  it("removes dataset from list and clears selection when selected", () => {
    const prev = stateWithDatasets();
    const next = deletePrepDataset(prev, "ds-1");

    assert.equal(next.datasets.length, 1);
    assert.equal(next.datasets[0].id, "ds-2");
    assert.equal(next.dataPrep.selectedDatasetId, null);
    assert.deepEqual(next.dataPrep.datasetPoints, []);
    assert.equal(next.activeDatasetId, null);
  });

  it("keeps selection when deleting a different dataset", () => {
    const prev = stateWithDatasets();
    const next = deletePrepDataset(prev, "ds-2");

    assert.equal(next.dataPrep.selectedDatasetId, "ds-1");
    assert.equal(next.activeDatasetId, "ds-1");
    assert.equal(next.datasets.length, 1);
  });
});

// ---------------------------------------------------------------------------
// setPrepParsedData
// ---------------------------------------------------------------------------
describe("setPrepParsedData", () => {
  it("stores rawRows, table, columns, resets transforms and hidden", () => {
    const prev = stateWithPrep({
      transforms: [{ type: "sort" }],
      hiddenColumns: ["x"],
      unsavedChanges: true,
    });
    const cols = [{ name: "a" }, { name: "b" }];
    const next = setPrepParsedData(prev, {
      rawRows: [[1, 2]],
      arqueroTable: "FAKE_TABLE",
      columns: cols,
    });

    assert.deepEqual(next.dataPrep.rawRows, [[1, 2]]);
    assert.equal(next.dataPrep.arqueroTable, "FAKE_TABLE");
    assert.deepEqual(next.dataPrep.originalColumns, cols);
    assert.deepEqual(next.dataPrep.transforms, []);
    assert.deepEqual(next.dataPrep.hiddenColumns, []);
    assert.deepEqual(next.dataPrep.columnOrder, ["a", "b"]);
    assert.equal(next.dataPrep.unsavedChanges, false);
    assert.equal(next.dataPrep.loading, false);
    assert.equal(next.dataPrep.error, null);
    // Also updates columnConfig
    assert.deepEqual(next.columnConfig.columns, cols);
    assert.equal(next.columnConfig.loading, false);
  });
});

// ---------------------------------------------------------------------------
// setPrepTable
// ---------------------------------------------------------------------------
describe("setPrepTable", () => {
  it("replaces arqueroTable and marks unsaved", () => {
    const prev = stateWithPrep({ unsavedChanges: false });
    const next = setPrepTable(prev, "NEW_TABLE");

    assert.equal(next.dataPrep.arqueroTable, "NEW_TABLE");
    assert.equal(next.dataPrep.unsavedChanges, true);
  });
});

// ---------------------------------------------------------------------------
// Transform pipeline: add / undo / undoTo / clear
// ---------------------------------------------------------------------------
describe("addPrepTransform", () => {
  it("appends a transform with a timestamp", () => {
    const prev = createInitialState();
    const next = addPrepTransform(prev, { type: "sort", col: "x" });

    assert.equal(next.dataPrep.transforms.length, 1);
    assert.equal(next.dataPrep.transforms[0].type, "sort");
    assert.equal(next.dataPrep.transforms[0].col, "x");
    assert.equal(typeof next.dataPrep.transforms[0].timestamp, "number");
    assert.equal(next.dataPrep.unsavedChanges, true);
  });

  it("preserves ordering when adding multiple transforms", () => {
    let s = createInitialState();
    s = addPrepTransform(s, { type: "sort", order: 1 });
    s = addPrepTransform(s, { type: "filter", order: 2 });
    s = addPrepTransform(s, { type: "rename", order: 3 });

    assert.equal(s.dataPrep.transforms.length, 3);
    assert.equal(s.dataPrep.transforms[0].order, 1);
    assert.equal(s.dataPrep.transforms[1].order, 2);
    assert.equal(s.dataPrep.transforms[2].order, 3);
  });

  it("does not mutate previous transforms array", () => {
    const prev = createInitialState();
    const origTransforms = prev.dataPrep.transforms;
    addPrepTransform(prev, { type: "sort" });
    assert.equal(origTransforms.length, 0);
  });
});

describe("undoPrepTransform", () => {
  it("removes the last transform", () => {
    let s = createInitialState();
    s = addPrepTransform(s, { type: "sort" });
    s = addPrepTransform(s, { type: "filter" });
    const next = undoPrepTransform(s);

    assert.equal(next.dataPrep.transforms.length, 1);
    assert.equal(next.dataPrep.transforms[0].type, "sort");
    assert.equal(next.dataPrep.unsavedChanges, true);
  });

  it("marks unsavedChanges false when no transforms remain", () => {
    let s = createInitialState();
    s = addPrepTransform(s, { type: "sort" });
    const next = undoPrepTransform(s);

    assert.equal(next.dataPrep.transforms.length, 0);
    assert.equal(next.dataPrep.unsavedChanges, false);
  });
});

describe("undoPrepTransformTo", () => {
  it("removes transforms from stepIndex onward", () => {
    let s = createInitialState();
    s = addPrepTransform(s, { type: "sort", id: 0 });
    s = addPrepTransform(s, { type: "filter", id: 1 });
    s = addPrepTransform(s, { type: "rename", id: 2 });
    s = addPrepTransform(s, { type: "recode", id: 3 });

    const next = undoPrepTransformTo(s, 2);

    assert.equal(next.dataPrep.transforms.length, 2);
    assert.equal(next.dataPrep.transforms[0].id, 0);
    assert.equal(next.dataPrep.transforms[1].id, 1);
    assert.equal(next.dataPrep.unsavedChanges, true);
  });

  it("clears all transforms when stepIndex is 0", () => {
    let s = createInitialState();
    s = addPrepTransform(s, { type: "sort" });
    s = addPrepTransform(s, { type: "filter" });

    const next = undoPrepTransformTo(s, 0);

    assert.equal(next.dataPrep.transforms.length, 0);
    assert.equal(next.dataPrep.unsavedChanges, false);
  });
});

describe("clearPrepTransforms", () => {
  it("empties transforms and marks saved", () => {
    let s = createInitialState();
    s = addPrepTransform(s, { type: "sort" });
    s = addPrepTransform(s, { type: "filter" });

    const next = clearPrepTransforms(s);

    assert.deepEqual(next.dataPrep.transforms, []);
    assert.equal(next.dataPrep.unsavedChanges, false);
  });
});

// ---------------------------------------------------------------------------
// setPrepHiddenColumns
// ---------------------------------------------------------------------------
describe("setPrepHiddenColumns", () => {
  it("sets hiddenColumns", () => {
    const prev = createInitialState();
    const next = setPrepHiddenColumns(prev, ["x", "y"]);

    assert.deepEqual(next.dataPrep.hiddenColumns, ["x", "y"]);
  });
});

// ---------------------------------------------------------------------------
// markPrepSaved
// ---------------------------------------------------------------------------
describe("markPrepSaved", () => {
  it("clears unsavedChanges flag", () => {
    const prev = stateWithPrep({ unsavedChanges: true });
    const next = markPrepSaved(prev);

    assert.equal(next.dataPrep.unsavedChanges, false);
  });
});

// ---------------------------------------------------------------------------
// setActivePanel / closeActivePanel
// ---------------------------------------------------------------------------
describe("setActivePanel", () => {
  it("sets the active panel", () => {
    const prev = createInitialState();
    const next = setActivePanel(prev, "column-config");

    assert.equal(next.dataPrep.activePanel, "column-config");
  });

  it("toggles panel off when same panel is set again", () => {
    const prev = stateWithPrep({ activePanel: "column-config" });
    const next = setActivePanel(prev, "column-config");

    assert.equal(next.dataPrep.activePanel, null);
  });
});

describe("closeActivePanel", () => {
  it("sets activePanel to null", () => {
    const prev = stateWithPrep({ activePanel: "column-config" });
    const next = closeActivePanel(prev);

    assert.equal(next.dataPrep.activePanel, null);
  });
});

// ---------------------------------------------------------------------------
// updateColumnMeta
// ---------------------------------------------------------------------------
describe("updateColumnMeta", () => {
  it("updates column properties by old name", () => {
    const prev = stateWithDatasets();
    const next = updateColumnMeta(prev, "col_a", { dtype: "string" });

    const col = next.columnConfig.columns.find((c) => c.name === "col_a");
    assert.equal(col.dtype, "string");
  });

  it("renames hidden columns when column name changes", () => {
    const prev = stateWithDatasets();
    prev.dataPrep.hiddenColumns = ["col_a", "col_b"];
    const next = updateColumnMeta(prev, "col_a", { name: "col_a_new" });

    assert.ok(next.dataPrep.hiddenColumns.includes("col_a_new"));
    assert.ok(!next.dataPrep.hiddenColumns.includes("col_a"));
    assert.ok(next.dataPrep.hiddenColumns.includes("col_b"));
  });

  it("does not mutate original columnConfig", () => {
    const prev = stateWithDatasets();
    const origCols = prev.columnConfig.columns;
    updateColumnMeta(prev, "col_a", { dtype: "string" });
    assert.equal(origCols[0].dtype, "number");
  });
});

// ---------------------------------------------------------------------------
// addColumnMeta
// ---------------------------------------------------------------------------
describe("addColumnMeta", () => {
  it("appends new columns with correct ordinals", () => {
    const prev = stateWithDatasets();
    const next = addColumnMeta(prev, [
      { name: "col_c", dtype: "number" },
      { name: "col_d", dtype: "string" },
    ]);

    assert.equal(next.columnConfig.columns.length, 4);
    assert.equal(next.columnConfig.columns[2].name, "col_c");
    assert.equal(next.columnConfig.columns[2].ordinal, 2);
    assert.equal(next.columnConfig.columns[3].name, "col_d");
    assert.equal(next.columnConfig.columns[3].ordinal, 3);
  });

  it("defaults role to null when not provided", () => {
    const prev = stateWithDatasets();
    const next = addColumnMeta(prev, [{ name: "col_c", dtype: "number" }]);

    assert.equal(next.columnConfig.columns[2].role, null);
  });

  it("preserves explicit role", () => {
    const prev = stateWithDatasets();
    const next = addColumnMeta(prev, [
      { name: "col_c", dtype: "number", role: "value" },
    ]);

    assert.equal(next.columnConfig.columns[2].role, "value");
  });
});

// ---------------------------------------------------------------------------
// toggleRowExclusion
// ---------------------------------------------------------------------------
describe("toggleRowExclusion", () => {
  it("adds a row index to excludedRows", () => {
    const prev = createInitialState();
    const next = toggleRowExclusion(prev, 5);

    assert.deepEqual(next.dataPrep.excludedRows, [5]);
  });

  it("removes a row index if already excluded", () => {
    const prev = stateWithPrep({ excludedRows: [3, 5, 7] });
    const next = toggleRowExclusion(prev, 5);

    assert.deepEqual(next.dataPrep.excludedRows, [3, 7]);
  });

  it("does not mutate original excludedRows", () => {
    const prev = stateWithPrep({ excludedRows: [3] });
    const orig = prev.dataPrep.excludedRows;
    toggleRowExclusion(prev, 5);
    assert.deepEqual(orig, [3]);
  });
});

// ---------------------------------------------------------------------------
// bulkExcludeRows
// ---------------------------------------------------------------------------
describe("bulkExcludeRows", () => {
  it("adds multiple row indices, deduplicating", () => {
    const prev = stateWithPrep({ excludedRows: [1, 3] });
    const next = bulkExcludeRows(prev, [3, 5, 7]);

    const sorted = [...next.dataPrep.excludedRows].sort((a, b) => a - b);
    assert.deepEqual(sorted, [1, 3, 5, 7]);
  });

  it("works on empty initial exclusions", () => {
    const prev = createInitialState();
    const next = bulkExcludeRows(prev, [10, 20]);

    assert.deepEqual(next.dataPrep.excludedRows, [10, 20]);
  });
});

// ---------------------------------------------------------------------------
// clearAllExclusions
// ---------------------------------------------------------------------------
describe("clearAllExclusions", () => {
  it("empties excludedRows", () => {
    const prev = stateWithPrep({ excludedRows: [1, 2, 3, 4, 5] });
    const next = clearAllExclusions(prev);

    assert.deepEqual(next.dataPrep.excludedRows, []);
  });
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialState,
  setColumns,
  setColumnsLoading,
  setExpandedProfileColumn,
  setProfileCache,
} from "../../src/core/state.js";

/* --- setColumns --- */

test("setColumns sets columnConfig.columns and clears loading", () => {
  let state = createInitialState();
  state = setColumnsLoading(state); // start loading
  assert.equal(state.columnConfig.loading, true);

  const cols = [
    { name: "value", dtype: "float64", role: "value" },
    { name: "batch", dtype: "string", role: "phase" },
  ];
  const next = setColumns(state, cols);

  assert.deepStrictEqual(next.columnConfig.columns, cols);
  assert.equal(next.columnConfig.loading, false);
});

test("setColumns with empty array clears columns", () => {
  let state = createInitialState();
  state = setColumns(state, [{ name: "x", dtype: "int", role: null }]);
  assert.equal(state.columnConfig.columns.length, 1);

  const next = setColumns(state, []);
  assert.deepStrictEqual(next.columnConfig.columns, []);
});

/* --- setColumnsLoading --- */

test("setColumnsLoading sets loading to true", () => {
  const state = createInitialState();
  assert.equal(state.columnConfig.loading, false);

  const next = setColumnsLoading(state);
  assert.equal(next.columnConfig.loading, true);
});

test("setColumnsLoading preserves existing columns", () => {
  let state = createInitialState();
  const cols = [{ name: "temp", dtype: "float64", role: "value" }];
  state = setColumns(state, cols);

  const next = setColumnsLoading(state);
  assert.equal(next.columnConfig.loading, true);
  assert.deepStrictEqual(next.columnConfig.columns, cols);
});

/* --- setExpandedProfileColumn --- */

test("setExpandedProfileColumn sets the column name", () => {
  const state = createInitialState();
  assert.equal(state.dataPrep.expandedProfileColumn, null);

  const next = setExpandedProfileColumn(state, "temperature");
  assert.equal(next.dataPrep.expandedProfileColumn, "temperature");
});

test("setExpandedProfileColumn toggles off when same column is set again", () => {
  let state = createInitialState();
  state = setExpandedProfileColumn(state, "temperature");
  assert.equal(state.dataPrep.expandedProfileColumn, "temperature");

  const next = setExpandedProfileColumn(state, "temperature");
  assert.equal(next.dataPrep.expandedProfileColumn, null);
});

test("setExpandedProfileColumn switches to new column", () => {
  let state = createInitialState();
  state = setExpandedProfileColumn(state, "col_a");
  const next = setExpandedProfileColumn(state, "col_b");
  assert.equal(next.dataPrep.expandedProfileColumn, "col_b");
});

/* --- setProfileCache --- */

test("setProfileCache sets profileCache in dataPrep", () => {
  const state = createInitialState();
  const cache = {
    temperature: { min: 0, max: 100, mean: 50 },
    pressure: { min: 1, max: 10, mean: 5 },
  };
  const next = setProfileCache(state, cache);
  assert.deepStrictEqual(next.dataPrep.profileCache, cache);
});

test("setProfileCache replaces previous cache entirely", () => {
  let state = createInitialState();
  state = setProfileCache(state, { a: { count: 10 } });
  const next = setProfileCache(state, { b: { count: 20 } });

  assert.deepStrictEqual(next.dataPrep.profileCache, { b: { count: 20 } });
  assert.equal(next.dataPrep.profileCache.a, undefined);
});

test("setProfileCache with empty object clears cache", () => {
  let state = createInitialState();
  state = setProfileCache(state, { x: { v: 1 } });
  const next = setProfileCache(state, {});
  assert.deepStrictEqual(next.dataPrep.profileCache, {});
});

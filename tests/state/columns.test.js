import test from "node:test";
import assert from "node:assert/strict";

import { createInitialState } from "../../src/core/state/init.js";
import { setColumns, setExpandedProfileColumn, setProfileCache } from "../../src/core/state/columns.js";

/* --- setColumns --- */

test("setColumns sets columnConfig.columns and clears loading", () => {
  let state = createInitialState();
  state = { ...state, columnConfig: { ...state.columnConfig, loading: true } };
  const cols = [{ name: "a" }, { name: "b" }];
  const next = setColumns(state, cols);

  assert.deepEqual(next.columnConfig.columns, cols);
  assert.equal(next.columnConfig.loading, false);
});

/* --- setExpandedProfileColumn --- */

test("setExpandedProfileColumn toggles expanded column", () => {
  const state = createInitialState();
  const next = setExpandedProfileColumn(state, "col_a");
  assert.equal(next.dataPrep.expandedProfileColumn, "col_a");

  const toggled = setExpandedProfileColumn(next, "col_a");
  assert.equal(toggled.dataPrep.expandedProfileColumn, null);
});

/* --- setProfileCache --- */

test("setProfileCache updates profileCache", () => {
  const state = createInitialState();
  const cache = { col_a: { mean: 5 } };
  const next = setProfileCache(state, cache);
  assert.deepEqual(next.dataPrep.profileCache, cache);
});

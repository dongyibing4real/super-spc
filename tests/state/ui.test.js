import test from "node:test";
import assert from "node:assert/strict";

import { createInitialState } from "../../src/core/state/init.js";
import { openContextMenu, closeContextMenu, togglePaneDataTable } from "../../src/core/state/ui.js";

/* --- openContextMenu / closeContextMenu --- */

test("openContextMenu sets position and defaults", () => {
  const state = createInitialState();
  const next = openContextMenu(state, 100, 200);

  assert.deepStrictEqual(next.ui.contextMenu, {
    x: 100,
    y: 200,
    axis: null,
    target: "canvas",
    role: "primary",
  });
});

test("openContextMenu passes through info options", () => {
  const state = createInitialState();
  const next = openContextMenu(state, 50, 75, {
    axis: "x",
    target: "axis",
    role: "challenger",
  });

  assert.equal(next.ui.contextMenu.x, 50);
  assert.equal(next.ui.contextMenu.y, 75);
  assert.equal(next.ui.contextMenu.axis, "x");
  assert.equal(next.ui.contextMenu.target, "axis");
  assert.equal(next.ui.contextMenu.role, "challenger");
});

test("closeContextMenu sets contextMenu to null", () => {
  let state = createInitialState();
  state = openContextMenu(state, 10, 20);
  assert.notEqual(state.ui.contextMenu, null);

  const next = closeContextMenu(state);
  assert.equal(next.ui.contextMenu, null);
});

test("closeContextMenu is idempotent on already-closed menu", () => {
  const state = createInitialState();
  assert.equal(state.ui.contextMenu, null);

  const next = closeContextMenu(state);
  assert.equal(next.ui.contextMenu, null);
});

/* --- togglePaneDataTable --- */

test("togglePaneDataTable flips per-chart showDataTable", () => {
  const state = createInitialState();
  const slot = state.charts["chart-1"];
  assert.equal(slot.showDataTable, false);

  const next = togglePaneDataTable(state, "chart-1");
  assert.equal(next.charts["chart-1"].showDataTable, true);

  const again = togglePaneDataTable(next, "chart-1");
  assert.equal(again.charts["chart-1"].showDataTable, false);
});

test("togglePaneDataTable returns state unchanged for unknown chartId", () => {
  const state = createInitialState();
  const next = togglePaneDataTable(state, "chart-999");
  assert.equal(next, state);
});

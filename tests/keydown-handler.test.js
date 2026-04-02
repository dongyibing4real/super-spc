import test from "node:test";
import assert from "node:assert/strict";

import {
  handleAppKeydown,
  navigateSelectionToViolation,
} from "../src/events/keydown-handler.js";

test("navigateSelectionToViolation moves forward and wraps", () => {
  assert.equal(navigateSelectionToViolation([2, 5, 9], 4, "n"), 5);
  assert.equal(navigateSelectionToViolation([2, 5, 9], 9, "n"), 2);
});

test("navigateSelectionToViolation moves backward and wraps", () => {
  assert.equal(navigateSelectionToViolation([2, 5, 9], 8, "p"), 5);
  assert.equal(navigateSelectionToViolation([2, 5, 9], 1, "p"), 9);
});

test("handleAppKeydown closes shortcut overlay on escape", () => {
  const calls = [];
  const event = {
    key: "Escape",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target: { closest() { return null; }, matches() { return false; } },
    preventDefault() { calls.push("preventDefault"); },
  };

  const handled = handleAppKeydown(event, {
    root: { querySelector() { return null; } },
    state: { ui: { shortcutOverlay: true, contextMenu: null, pendingNewChart: null }, route: "workspace", dataPrep: { selectedDatasetId: null, transforms: [] } },
    documentRef: { activeElement: null },
    getFocused() { return null; },
    setState(next) { calls.push(["setState", next.ui.shortcutOverlay]); },
    patchUi(nextUi) { return { ui: { ...nextUi } }; },
    commit() {},
    commitChart() {},
    commitContextMenu() {},
    commitRecipeRail() {},
    moveSelection() {},
    navigateSelectionToViolation,
    openContextMenu() {},
    closeContextMenu() {},
    setActivePanel() {},
    selectPoint() {},
    render() { calls.push("render"); },
  });

  assert.equal(handled, true);
  assert.deepEqual(calls, ["preventDefault", ["setState", false], "render"]);
});

test("handleAppKeydown opens context menu with shift+F10", () => {
  let committed = null;
  const event = {
    key: "F10",
    shiftKey: true,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target: {
      closest(selector) {
        return selector.includes("[data-chart-focus]") ? {} : null;
      },
      matches() { return false; },
    },
    preventDefault() {},
  };

  handleAppKeydown(event, {
    root: { querySelector() { return null; } },
    state: { ui: { shortcutOverlay: false, contextMenu: null, pendingNewChart: null }, route: "workspace", dataPrep: { selectedDatasetId: null, transforms: [] } },
    documentRef: { activeElement: null },
    getFocused() { return null; },
    setState() {},
    patchUi(nextUi) { return { ui: { ...nextUi } }; },
    commit() {},
    commitChart() {},
    commitContextMenu(next) { committed = next; },
    commitRecipeRail() {},
    moveSelection() {},
    navigateSelectionToViolation,
    openContextMenu(state, x, y) { return { ...state, ui: { contextMenu: { x, y } } }; },
    closeContextMenu() {},
    setActivePanel() {},
    selectPoint() {},
    render() {},
  });

  assert.deepEqual(committed.ui.contextMenu, { x: 400, y: 200 });
});

test("handleAppKeydown clears pending new chart on escape", () => {
  let committed = null;
  const event = {
    key: "Escape",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target: {
      closest(selector) {
        return selector.includes("[data-chart-focus]") ? {} : null;
      },
      matches() { return false; },
    },
    preventDefault() {},
  };

  handleAppKeydown(event, {
    root: { querySelector() { return null; } },
    state: { ui: { shortcutOverlay: false, contextMenu: null, pendingNewChart: { chart_type: "imr" } }, route: "workspace", dataPrep: { selectedDatasetId: null, transforms: [] } },
    documentRef: { activeElement: null },
    getFocused() { return null; },
    setState() {},
    patchUi(nextUi) { return { ui: { ...nextUi } }; },
    commit() {},
    commitChart() {},
    commitContextMenu() {},
    commitRecipeRail(next) { committed = next; },
    moveSelection() {},
    navigateSelectionToViolation,
    openContextMenu() {},
    closeContextMenu() {},
    setActivePanel() {},
    selectPoint() {},
    render() {},
  });

  assert.equal(committed.ui.pendingNewChart, null);
});

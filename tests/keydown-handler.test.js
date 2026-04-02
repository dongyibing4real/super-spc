import test from "node:test";
import assert from "node:assert/strict";

import {
  handleAppKeydown,
  navigateSelectionToViolation,
} from "../src/events/keydown-handler.js";

function mockStore(initialState) {
  let state = initialState;
  return {
    getState() { return state; },
    setState(next) { state = next; return state; },
  };
}

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
  const store = mockStore({
    ui: { shortcutOverlay: true, contextMenu: null, pendingNewChart: null },
    route: "workspace",
    dataPrep: { selectedDatasetId: null, transforms: [] },
  });

  const origSetState = store.setState;
  store.setState = (next) => { calls.push(["setState", next.ui.shortcutOverlay]); return origSetState(next); };

  const event = {
    key: "Escape",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target: { closest() { return null; }, matches() { return false; } },
    preventDefault() { calls.push("preventDefault"); },
  };

  const handled = handleAppKeydown(event, {
    store,
    root: { querySelector() { return null; } },
    documentRef: { activeElement: null },
    render() { calls.push("render"); },
  });

  assert.equal(handled, true);
  assert.deepEqual(calls, ["preventDefault", ["setState", false], "render"]);
});

test("handleAppKeydown opens context menu with shift+F10", () => {
  const store = mockStore({
    ui: { shortcutOverlay: false, contextMenu: null, pendingNewChart: null },
    route: "workspace",
    dataPrep: { selectedDatasetId: null, transforms: [] },
  });

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
    store,
    root: { querySelector() { return null; } },
    documentRef: { activeElement: null },
    render() {},
  });

  const cm = store.getState().ui.contextMenu;
  assert.equal(cm.x, 400);
  assert.equal(cm.y, 200);
});

test("handleAppKeydown clears pending new chart on escape", () => {
  const store = mockStore({
    ui: { shortcutOverlay: false, contextMenu: null, pendingNewChart: { chart_type: "imr" } },
    route: "workspace",
    dataPrep: { selectedDatasetId: null, transforms: [] },
  });

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
    store,
    root: { querySelector() { return null; } },
    documentRef: { activeElement: null },
    render() {},
  });

  assert.equal(store.getState().ui.pendingNewChart, null);
});

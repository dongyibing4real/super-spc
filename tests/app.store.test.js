import test from "node:test";
import assert from "node:assert/strict";

import { createStore } from "../src/core/store.js";

test("store returns initial state and updates through setState", () => {
  const initial = { count: 0 };
  const store = createStore(initial);

  assert.deepEqual(store.getState(), initial);
  const next = store.setState({ count: 1 });
  assert.deepEqual(next, { count: 1 });
  assert.deepEqual(store.getState(), { count: 1 });
});

test("dispatch applies reducer to current state", () => {
  const store = createStore({ count: 2 });

  const next = store.dispatch((state, delta) => ({ ...state, count: state.count + delta }), 3);

  assert.deepEqual(next, { count: 5 });
  assert.deepEqual(store.getState(), { count: 5 });
});

test("selector subscriptions only fire when selected value changes", () => {
  const store = createStore({ count: 0, notice: null });
  const seen = [];

  store.subscribe(
    (state) => state.count,
    (nextSelected, prevSelected) => {
      seen.push([prevSelected, nextSelected]);
    },
  );

  store.setState({ count: 0, notice: { title: "unchanged count" } });
  store.setState({ count: 1, notice: { title: "count changed" } });
  store.setState({ count: 1, notice: { title: "still unchanged count" } });
  store.setState({ count: 3, notice: { title: "count changed again" } });

  assert.deepEqual(seen, [
    [0, 1],
    [1, 3],
  ]);
});

test("bare subscriptions receive full state updates and can unsubscribe", () => {
  const store = createStore({ count: 0 });
  const seen = [];

  const unsubscribe = store.subscribe((nextState, prevState) => {
    seen.push([prevState.count, nextState.count]);
  });

  store.setState({ count: 1 });
  unsubscribe();
  store.setState({ count: 2 });

  assert.deepEqual(seen, [[0, 1]]);
});

/**
 * bridge.js -- Legacy API adapter over Zustand store.
 *
 * Exposes the exact same 4-method API as the original createStore():
 *   { getState, setState, dispatch, subscribe }
 *
 * All legacy code (subscribers, event handlers, views) uses this bridge
 * without knowing Zustand exists underneath.
 */

/**
 * @param {import('zustand/vanilla').StoreApi<any>} zustandStore
 */
export function createBridge(zustandStore) {
  function getState() {
    return zustandStore.getState();
  }

  /**
   * Full-state replacement (not shallow merge).
   * The Zustand store's custom middleware already handles audit + notice.
   */
  function setState(nextState) {
    zustandStore.setState(nextState);
    return zustandStore.getState();
  }

  /**
   * Convenience: apply reducer to current state, then setState.
   */
  function dispatch(reducer, ...args) {
    return setState(reducer(getState(), ...args));
  }

  /**
   * Selective subscription matching the legacy store contract:
   *
   * 1-arg form: subscribe(listener) — fires on every state change
   * 2-arg form: subscribe(selector, listener) — fires only when selected value changes
   *
   * Listener signature: listener(nextSelected, prevSelected, nextState, prevState)
   * Returns an unsubscribe function.
   */
  function subscribe(selectorOrListener, listener) {
    // 1-arg form: bare listener
    if (typeof selectorOrListener === "function" && typeof listener !== "function") {
      const bareListener = selectorOrListener;
      return zustandStore.subscribe((nextState, prevState) => {
        bareListener(nextState, prevState, nextState, prevState);
      });
    }

    // 2-arg form: selector + listener with memoization
    const selector = selectorOrListener;
    let lastSelected = selector(zustandStore.getState());

    return zustandStore.subscribe((nextState, prevState) => {
      const nextSelected = selector(nextState);
      if (Object.is(nextSelected, lastSelected)) return;
      const prevSelected = lastSelected;
      lastSelected = nextSelected;
      listener(nextSelected, prevSelected, nextState, prevState);
    });
  }

  return { getState, setState, dispatch, subscribe };
}

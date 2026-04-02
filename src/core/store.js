export function createStore(initialState) {
  let state = initialState;
  const subscriptions = new Set();

  function getState() {
    return state;
  }

  function notify(nextState, prevState) {
    for (const subscription of subscriptions) {
      const nextSelected = subscription.selector(nextState);
      if (Object.is(nextSelected, subscription.lastSelected)) continue;
      const prevSelected = subscription.lastSelected;
      subscription.lastSelected = nextSelected;
      subscription.listener(nextSelected, prevSelected, nextState, prevState);
    }
  }

  function setState(nextState) {
    const prevState = state;
    state = nextState;
    notify(nextState, prevState);
    return state;
  }

  function dispatch(reducer, ...args) {
    return setState(reducer(state, ...args));
  }

  function subscribe(selector, listener) {
    if (typeof selector === "function" && typeof listener !== "function") {
      const bareListener = selector;
      const subscription = {
        selector: (value) => value,
        listener: bareListener,
        lastSelected: state,
      };
      subscriptions.add(subscription);
      return () => subscriptions.delete(subscription);
    }

    const subscription = {
      selector,
      listener,
      lastSelected: selector(state),
    };
    subscriptions.add(subscription);
    return () => subscriptions.delete(subscription);
  }

  return {
    getState,
    setState,
    dispatch,
    subscribe,
  };
}

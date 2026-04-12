/**
 * spc-store.ts -- Zustand vanilla store wrapping existing state modules + middleware.
 *
 * Holds the exact same state shape as the legacy createStore().
 * Custom middleware runs auditMiddleware + noticeMiddleware on every setState.
 */
import { createStore, type StoreApi, type StateCreator } from "zustand/vanilla";
import { createInitialState } from "../core/state/init.js";
import { auditMiddleware } from "../core/middleware/audit.js";
import { noticeMiddleware } from "../core/middleware/notice.js";
import type { SPCState } from "../types/state.ts";

type SPCMiddleware = (prev: SPCState, next: SPCState) => SPCState;

const spcMiddleware: SPCMiddleware[] = [auditMiddleware, noticeMiddleware];

/**
 * Zustand middleware that applies the SPC middleware pipeline (audit + notice)
 * on every state update, matching the contract of the legacy store.
 */
function withSpcMiddleware(
  initializer: StateCreator<SPCState>
): StateCreator<SPCState> {
  return (set, get, api) => {
    const originalSetState = api.setState;

    api.setState = (
      nextStateOrUpdater: SPCState | Partial<SPCState> | ((state: SPCState) => SPCState | Partial<SPCState>),
      replace?: boolean,
    ): void => {
      const prevState = api.getState();
      // Resolve updater functions (Zustand passes functions or partial state)
      const nextState: SPCState | Partial<SPCState> =
        typeof nextStateOrUpdater === "function"
          ? nextStateOrUpdater(prevState)
          : nextStateOrUpdater;

      // Run SPC middleware pipeline: each mw(prev, next) → transformed next
      let finalState = nextState as SPCState;
      try {
        for (const mw of spcMiddleware) {
          finalState = mw(prevState, finalState);
        }
      } catch (err) {
        console.error("[spc-store] middleware error, applying state without middleware:", err);
        // Fall through with nextState (pre-middleware) to keep the store consistent
        finalState = nextState as SPCState;
      }

      // Always full-replace to match legacy store semantics (no shallow merge)
      originalSetState(finalState, true);
    };

    return initializer(set, get, api);
  };
}

export const spcStore: StoreApi<SPCState> = createStore<SPCState>(
  withSpcMiddleware(() => createInitialState())
);

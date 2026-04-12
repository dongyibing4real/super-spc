/**
 * Notice middleware — detects state changes and sets ui.notice.
 *
 * Runs after each reducer. Compares prev vs next state to detect changes
 * that should show user-facing notices. Sets nextState.ui.notice.
 *
 * This replaces inline ui.notice writes that were previously scattered
 * across chart.js and pipeline.js reducers.
 */
import type { SPCState, UIState } from '../../types/state.js';

type Notice = NonNullable<UIState["notice"]>;

function makeNotice(tone: string, title: string, body: string): Notice {
  return { title, body, tone } as Notice;
}

export function noticeMiddleware(prevState: SPCState, nextState: SPCState): SPCState {
  if (prevState === nextState) return nextState;

  // Point exclusion changed
  if (prevState.points !== nextState.points && prevState.points.length === nextState.points.length) {
    for (let i = 0; i < nextState.points.length; i++) {
      const prev = prevState.points[i];
      const next = nextState.points[i];
      if (prev && next && prev.excluded !== next.excluded) {
        return {
          ...nextState,
          ui: {
            ...nextState.ui,
            notice: makeNotice("info", next.excluded ? "Point excluded" : "Point restored", `${next.label} remains visible so the exclusion is auditable.`),
          },
        };
      }
    }
  }

  // Transform toggled
  if (prevState.transforms !== nextState.transforms && prevState.transforms.length === nextState.transforms.length) {
    for (let i = 0; i < nextState.transforms.length; i++) {
      const prev = prevState.transforms[i] as Record<string, unknown> | undefined;
      const next = nextState.transforms[i] as Record<string, unknown> | undefined;
      if (!prev || !next) continue;

      // Recovery takes priority over active toggle
      if (prev.status === "failed" && next.status === "active") {
        return {
          ...nextState,
          ui: {
            ...nextState.ui,
            notice: makeNotice("positive", "Transform recovered", `${next.title} is active again and the pipeline has been revalidated.`),
          },
        };
      }
      if (prev.status !== "failed" && next.status === "failed") {
        return {
          ...nextState,
          ui: {
            ...nextState.ui,
            notice: makeNotice("warning", "Transform failed", `${next.title} failed validation. The previous chart result is still active while the step stays reversible.`),
          },
        };
      }
      if (prev.active !== next.active && next.status !== "failed") {
        return {
          ...nextState,
          ui: {
            ...nextState.ui,
            notice: makeNotice("info", next.active ? "Transform enabled" : "Transform disabled", next.detail as string),
          },
        };
      }
    }
  }

  return nextState;
}

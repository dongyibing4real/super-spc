/**
 * Notice middleware — detects state changes and sets ui.notice.
 *
 * Runs after each reducer. Compares prev vs next state to detect changes
 * that should show user-facing notices. Sets nextState.ui.notice.
 *
 * This replaces inline ui.notice writes that were previously scattered
 * across chart.js and pipeline.js reducers.
 */
export function noticeMiddleware(prevState, nextState) {
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
            notice: {
              tone: "info",
              title: next.excluded ? "Point excluded" : "Point restored",
              body: `${next.label} remains visible so the exclusion is auditable.`,
            },
          },
        };
      }
    }
  }

  // Transform toggled
  if (prevState.transforms !== nextState.transforms && prevState.transforms.length === nextState.transforms.length) {
    for (let i = 0; i < nextState.transforms.length; i++) {
      const prev = prevState.transforms[i];
      const next = nextState.transforms[i];
      if (!prev || !next) continue;

      // Recovery takes priority over active toggle
      if (prev.status === "failed" && next.status === "active") {
        return {
          ...nextState,
          ui: {
            ...nextState.ui,
            notice: {
              tone: "positive",
              title: "Transform recovered",
              body: `${next.title} is active again and the pipeline has been revalidated.`,
            },
          },
        };
      }
      if (prev.status !== "failed" && next.status === "failed") {
        return {
          ...nextState,
          ui: {
            ...nextState.ui,
            notice: {
              tone: "warning",
              title: "Transform failed",
              body: `${next.title} failed validation. The previous chart result is still active while the step stays reversible.`,
            },
          },
        };
      }
      if (prev.active !== next.active && next.status !== "failed") {
        return {
          ...nextState,
          ui: {
            ...nextState.ui,
            notice: {
              tone: "info",
              title: next.active ? "Transform enabled" : "Transform disabled",
              body: next.detail,
            },
          },
        };
      }
    }
  }

  return nextState;
}

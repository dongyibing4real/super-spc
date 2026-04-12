/**
 * Audit middleware — detects state changes and appends audit log entries.
 *
 * Runs after each reducer. Compares prev vs next state to detect auditable
 * changes, then prepends log entries to nextState.auditLog.
 *
 * This replaces inline auditLog writes that were previously scattered
 * across chart.js and pipeline.js reducers.
 */
export function auditMiddleware(prevState, nextState) {
  if (prevState === nextState) return nextState;

  const entries = [];

  // Point exclusion changed
  if (prevState.points !== nextState.points && prevState.points.length === nextState.points.length) {
    for (let i = 0; i < nextState.points.length; i++) {
      const prev = prevState.points[i];
      const next = nextState.points[i];
      if (prev && next && prev.excluded !== next.excluded) {
        entries.push(
          `${next.label} ${next.excluded ? "excluded" : "restored"} while remaining visible on the chart.`
        );
      }
    }
  }

  // Transform toggled (active/inactive)
  if (prevState.transforms !== nextState.transforms && prevState.transforms.length === nextState.transforms.length) {
    for (let i = 0; i < nextState.transforms.length; i++) {
      const prev = prevState.transforms[i];
      const next = nextState.transforms[i];
      if (!prev || !next) continue;
      // Recovery: failed → active (takes priority over active toggle)
      if (prev.status === "failed" && next.status === "active") {
        entries.push(
          `${next.id} recovered and rejoined the active compute path.`
        );
      } else if (prev.status !== "failed" && next.status === "failed") {
        entries.push(
          `${next.id} failed validation. Prior chart result retained and the step is marked partial.`
        );
      } else if (prev.active !== next.active && next.status !== "failed") {
        entries.push(
          `${next.id} ${next.active ? "enabled" : "disabled"} from the reversible prep pipeline.`
        );
      }
    }
  }

  // Dataset loaded (points changed from empty or different dataset)
  if (
    prevState.activeDatasetId !== nextState.activeDatasetId &&
    nextState.activeDatasetId != null &&
    nextState.points.length > 0
  ) {
    entries.push(`Dataset loaded with ${nextState.points.length} points.`);
  }

  // Pipeline status changes (detected via auditLog diff)

  if (entries.length === 0) return nextState;

  return {
    ...nextState,
    auditLog: [...entries, ...nextState.auditLog],
  };
}

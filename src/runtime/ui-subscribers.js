/**
 * ui-subscribers.js -- Watch UI state changes and surgically update the DOM.
 *
 * Notice and context menu handling moved to React components (Phase 2).
 * Recipe rail and evidence rail subscribers remain until Phase 3.
 */
import { renderRecipeRail } from "../components/recipe-rail.js";
import { renderEvidenceRail } from "../views/workspace.js";
import { deriveWorkspace } from "../core/state.js";
import { morphEl } from "../core/morph.js";

export function updateRecipeRailSurface(root, state, morph = morphEl) {
  const rail = root.querySelector(".recipe-rail");
  if (!rail) return;
  morph(rail, renderRecipeRail(state));
}

export function updateEvidenceRailSurface(root, state, morph = morphEl) {
  const rail = root.querySelector(".evidence-rail");
  if (!rail) return;
  const workspace = deriveWorkspace(state);
  morph(rail, renderEvidenceRail(state, workspace));
}

export function setupUiSubscribers(store, root) {
  store.subscribe((nextState, prevState) => {
    if (
      nextState.route === "workspace" &&
      (
        nextState.focusedChartId !== prevState.focusedChartId ||
        nextState.activeChipEditor !== prevState.activeChipEditor ||
        nextState.ui.pendingNewChart !== prevState.ui.pendingNewChart ||
        nextState.chartOrder !== prevState.chartOrder ||
        nextState.charts !== prevState.charts ||
        nextState.activeDatasetId !== prevState.activeDatasetId ||
        nextState.datasets !== prevState.datasets ||
        nextState.columnConfig !== prevState.columnConfig
      )
    ) {
      updateRecipeRailSurface(root, nextState);
    }

    if (
      nextState.route === "workspace" &&
      (
        nextState.focusedChartId !== prevState.focusedChartId ||
        nextState.selectedPointIndex !== prevState.selectedPointIndex ||
        nextState.points !== prevState.points ||
        nextState.transforms !== prevState.transforms ||
        nextState.pipeline !== prevState.pipeline ||
        nextState.charts !== prevState.charts
      )
    ) {
      updateEvidenceRailSurface(root, nextState);
    }
  });
}

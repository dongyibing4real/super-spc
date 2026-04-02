import { renderContextMenu } from "../components/context-menu.js";
import { renderNotice } from "../components/notice.js";
import { renderRecipeRail } from "../components/recipe-rail.js";
import { renderEvidenceRail } from "../views/workspace.js";
import { deriveWorkspace } from "../core/state.js";
import { morphEl } from "../core/morph.js";

export function updateNoticeSurface(root, state) {
  const existing = root.querySelector(".notice");
  if (existing) existing.remove();

  if (!state.ui.notice) return;

  const main = root.querySelector(".main-shell");
  if (main) {
    main.insertAdjacentHTML("afterbegin", renderNotice(state));
  }
}

export function updateContextMenuSurface(root, state) {
  root.querySelectorAll(".chart-stage .context-menu").forEach((menu) => menu.remove());

  const stage = root.querySelector(`#chart-mount-${state.focusedChartId}`);
  if (!stage) return;

  if (state.ui.contextMenu) {
    const div = document.createElement("div");
    div.innerHTML = renderContextMenu(state);
    stage.appendChild(div.firstElementChild);
    stage.querySelector(".context-menu [role='menuitem']")?.focus();
  } else {
    stage.focus?.();
  }
}

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
    if (nextState.ui.notice !== prevState.ui.notice || nextState.route !== prevState.route) {
      updateNoticeSurface(root, nextState);
    }

    if (
      nextState.ui.contextMenu !== prevState.ui.contextMenu ||
      nextState.focusedChartId !== prevState.focusedChartId ||
      nextState.route !== prevState.route
    ) {
      updateContextMenuSurface(root, nextState);
    }

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

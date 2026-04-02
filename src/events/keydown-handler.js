export function handleAppKeydown(event, ctx) {
  const {
    root,
    state,
    documentRef,
    getFocused,
    setState,
    patchUi,
    commit,
    commitChart,
    commitContextMenu,
    commitRecipeRail,
    moveSelection,
    navigateSelectionToViolation,
    openContextMenu,
    closeContextMenu,
    setActivePanel,
  } = ctx;

  if (state.ui.contextMenu && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    event.preventDefault();
    const menu = root.querySelector(".context-menu");
    if (!menu) return true;
    const items = Array.from(menu.querySelectorAll("[role='menuitem']"));
    const idx = items.indexOf(documentRef.activeElement);
    const next = event.key === "ArrowDown"
      ? items[(idx + 1) % items.length]
      : items[(idx - 1 + items.length) % items.length];
    next?.focus();
    return true;
  }

  if (state.ui.shortcutOverlay) {
    if (event.key === "Escape" || event.key === "?") {
      event.preventDefault();
      setState(patchUi({ shortcutOverlay: false }));
      ctx.render();
      return true;
    }
  }

  const tag = documentRef.activeElement?.tagName;
  const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  if (!inInput && !event.metaKey && !event.ctrlKey && !event.altKey) {
    if (event.key === "?") {
      event.preventDefault();
      setState(patchUi({ shortcutOverlay: true }));
      ctx.render();
      return true;
    }

    if (state.route === "dataprep" && state.dataPrep.selectedDatasetId) {
      const dpKey = event.key.toLowerCase();
      const panel = { f: "filter", d: "find", r: "rename", t: "change_type", c: "calculated" }[dpKey];
      if (panel) {
        event.preventDefault();
        commit(setActivePanel(state, panel));
        return true;
      }
      if (dpKey === "z" && state.dataPrep.transforms.length > 0) {
        event.preventDefault();
        root.querySelector('[data-action="prep-undo"]')?.click();
        return true;
      }
    }

    if ((event.key === "n" || event.key === "p") && state.route === "workspace") {
      event.preventDefault();
      const focused = getFocused(state);
      if (!focused) return true;
      const violations = focused.violations || [];
      const indices = [...new Set(violations.flatMap((v) => v.indices || []))].sort((a, b) => a - b);
      if (indices.length === 0) return true;
      const target = navigateSelectionToViolation(indices, state.selectedPointIndex ?? -1, event.key);
      commitChart(ctx.selectPoint(state, target));
      return true;
    }
  }

  const chartTarget = event.target.closest("[data-chart-focus], [data-action='select-point']");
  if (!chartTarget) return false;

  if (event.key === "ArrowRight") {
    event.preventDefault();
    commitChart(moveSelection(state, 1));
    return true;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    commitChart(moveSelection(state, -1));
    return true;
  }
  if (event.key === "Enter" && event.target.matches("[data-action='select-point']")) {
    event.preventDefault();
    commitChart(ctx.selectPoint(state, Number(event.target.dataset.index)));
    return true;
  }
  if (event.key === "F10" && event.shiftKey) {
    event.preventDefault();
    commitContextMenu(openContextMenu(state, 400, 200));
    return true;
  }
  if (event.key === "Escape" && state.ui.contextMenu) {
    commitContextMenu(closeContextMenu(state));
    return true;
  }
  if (event.key === "Escape" && state.ui.pendingNewChart) {
    commitRecipeRail(patchUi({ pendingNewChart: null }));
    return true;
  }

  return false;
}

export function navigateSelectionToViolation(indices, currentIndex, directionKey) {
  if (directionKey === "n") {
    return indices.find((index) => index > currentIndex) ?? indices[0];
  }
  const prev = [...indices].reverse().find((index) => index < currentIndex);
  return prev ?? indices[indices.length - 1];
}

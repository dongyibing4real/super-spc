export function handleWorkspaceClick(event, ctx) {
  const {
    state,
    root,
    commit,
    commitChart,
    commitContextMenu,
    commitRecipeRail,
    commitEvidenceRail,
    commitNotice,
    patchUi,
    setActiveChipEditor,
    clearNotice,
    closeContextMenu,
    selectPoint,
    toggleChartOption,
    togglePointExclusion,
    toggleTransform,
    failTransformStep,
    recoverTransformStep,
    setChallengerStatus,
    selectStructuralFinding,
    setFindingsChart,
    setStructuralFindings,
    generateFindings,
    togglePaneDataTable,
    focusChart,
    snapshotRailPositions,
    playRailFlip,
    isWorkspaceFull,
    getFocused,
    DEFAULT_PARAMS,
    addChart,
    removeChart,
    saveLayout,
    reanalyze,
    chartRuntime,
  } = ctx;

  const clickedPane = event.target.closest('.chart-pane[data-chart-id]');
  if (clickedPane) {
    const chartId = clickedPane.dataset.chartId;
    if (chartId && chartId !== state.focusedChartId && state.charts[chartId]) {
      const next = focusChart(state, chartId);
      root.querySelectorAll(".chart-pane").forEach((pane) => {
        pane.classList.toggle("pane-focused", pane.dataset.chartId === next.focusedChartId);
      });
      commitRecipeRail(next);
      commitEvidenceRail(next);
    }
  }

  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) {
    let handled = false;
    if (state.activeChipEditor) {
      commitRecipeRail(setActiveChipEditor(state, state.activeChipEditor));
      handled = true;
    }
    if (state.ui.contextMenu) {
      commitContextMenu(closeContextMenu(state));
      handled = true;
    }
    if (state.ui.pendingNewChart && !event.target.closest(".rail-card--pending")) {
      commitRecipeRail(patchUi({ pendingNewChart: null }));
      handled = true;
    }
    return handled;
  }

  const action = actionTarget.dataset.action;

  switch (action) {
    case "select-point":
      commitChart(selectPoint(state, Number(actionTarget.dataset.index)));
      return true;
    case "toggle-chart": {
      const next = toggleChartOption(state, actionTarget.dataset.option);
      commitChart(next);
      if (state.ui.contextMenu) commitContextMenu(next);
      return true;
    }
    case "exclude-point":
      commitChart(togglePointExclusion(state, Number(actionTarget.dataset.index)));
      commitContextMenu(closeContextMenu(state));
      return true;
    case "toggle-transform":
      commitEvidenceRail(toggleTransform(state, actionTarget.dataset.stepId));
      return true;
    case "fail-transform":
      commitEvidenceRail(failTransformStep(state, actionTarget.dataset.stepId));
      return true;
    case "recover-transform":
      commitEvidenceRail(recoverTransformStep(state, actionTarget.dataset.stepId));
      return true;
    case "set-challenger-status":
      commit(setChallengerStatus(state, actionTarget.dataset.status));
      return true;
    case "select-structural-finding":
      commit(selectStructuralFinding(state, actionTarget.dataset.findingId));
      return true;
    case "switch-findings-chart": {
      const chartId = actionTarget.dataset.chartId;
      const withChart = setFindingsChart(state, chartId);
      const next = setStructuralFindings(withChart, generateFindings(withChart, chartId), chartId);
      commit(next);
      return true;
    }
    case "clear-notice":
      commitNotice(clearNotice(state));
      return true;
    case "toggle-pane-table": {
      const chartId = actionTarget.dataset.chartId;
      if (chartId) commit(togglePaneDataTable(state, chartId));
      return true;
    }
    case "focus-chart": {
      const chartId = actionTarget.dataset.chartId;
      if (chartId && chartId !== state.focusedChartId && state.charts[chartId]) {
        const snap = snapshotRailPositions();
        const next = focusChart(state, chartId);
        root.querySelectorAll(".chart-pane").forEach((pane) => {
          pane.classList.toggle("pane-focused", pane.dataset.chartId === next.focusedChartId);
        });
        const rail = root.querySelector(".recipe-rail");
        if (rail) {
          const cardMap = new Map();
          rail.querySelectorAll(".rail-card[data-chart-id]").forEach((el) => cardMap.set(el.dataset.chartId, el));
          const order = [next.focusedChartId, ...next.chartOrder.filter((id) => id !== next.focusedChartId)];
          for (const id of order) {
            const card = cardMap.get(id);
            if (card) {
              card.classList.toggle("rail-card-focused", id === next.focusedChartId);
              rail.appendChild(card);
            }
          }
        }
        commitEvidenceRail(next);
        playRailFlip(snap, 250);
      }
      return true;
    }
    case "open-add-chart": {
      if (isWorkspaceFull()) {
        commit(patchUi({
          notice: { tone: "warning", title: "Workspace is full", body: "Close a chart to add another." },
        }));
        return true;
      }
      const focused = getFocused(state);
      commitRecipeRail(patchUi({
        pendingNewChart: {
          ...DEFAULT_PARAMS,
          chart_type: focused.params.chart_type,
          value_column: focused.params.value_column,
          subgroup_column: focused.params.subgroup_column,
          phase_column: focused.params.phase_column,
        },
      }));
      return true;
    }
    case "cancel-add-chart":
      commitRecipeRail(patchUi({ pendingNewChart: null }));
      return true;
    case "confirm-add-chart": {
      const pending = state.ui.pendingNewChart;
      if (!pending) return true;
      let next = patchUi({ pendingNewChart: null });
      next = addChart(next, { chartType: pending.chart_type });
      const newId = `chart-${next.nextChartId - 1}`;
      if (next.charts[newId]) {
        next = {
          ...next,
          charts: {
            ...next.charts,
            [newId]: { ...next.charts[newId], params: { ...pending } },
          },
        };
      }
      commit(next);
      saveLayout();
      if (state.activeDatasetId) reanalyze();
      return true;
    }
    case "add-chart-from-rail": {
      if (isWorkspaceFull()) {
        commit(patchUi({
          notice: { tone: "warning", title: "Workspace is full", body: "Close a chart to add another." },
        }));
        return true;
      }
      const focusedType = getFocused(state).params.chart_type;
      commit(addChart(state, { chartType: focusedType }));
      saveLayout();
      if (state.activeDatasetId) reanalyze();
      return true;
    }
    case "remove-chart": {
      const chartId = actionTarget.dataset.chartId;
      if (chartId) {
        const next = removeChart(state, chartId);
        chartRuntime.destroyChart(chartId);
        commit(next);
        saveLayout();
      }
      return true;
    }
    default:
      return false;
  }
}

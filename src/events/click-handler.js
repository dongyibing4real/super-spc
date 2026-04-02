import {
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
  togglePaneDataTable,
  focusChart,
  addChart,
  removeChart,
  DEFAULT_PARAMS,
  getFocused,
} from "../core/state.js";
import { generateFindings } from "../core/findings-engine.js";

export function handleWorkspaceClick(event, { store, root, render, saveLayout, reanalyze, chartRuntime, snapshotRailPositions, playRailFlip, isWorkspaceFull }) {
  const state = store.getState();

  const clickedPane = event.target.closest('.chart-pane[data-chart-id]');
  if (clickedPane) {
    const chartId = clickedPane.dataset.chartId;
    if (chartId && chartId !== state.focusedChartId && state.charts[chartId]) {
      const next = focusChart(state, chartId);
      root.querySelectorAll(".chart-pane").forEach((pane) => {
        pane.classList.toggle("pane-focused", pane.dataset.chartId === next.focusedChartId);
      });
      store.setState(next);
    }
  }

  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) {
    let handled = false;
    if (state.activeChipEditor) {
      store.setState(setActiveChipEditor(state, state.activeChipEditor));
      handled = true;
    }
    if (state.ui.contextMenu) {
      store.setState(closeContextMenu(state));
      handled = true;
    }
    if (state.ui.pendingNewChart && !event.target.closest(".rail-card--pending")) {
      store.setState({ ...state, ui: { ...state.ui, pendingNewChart: null } });
      handled = true;
    }
    return handled;
  }

  const action = actionTarget.dataset.action;

  switch (action) {
    case "select-point":
      store.setState(selectPoint(state, Number(actionTarget.dataset.index)));
      return true;
    case "toggle-chart": {
      const next = toggleChartOption(state, actionTarget.dataset.option);
      store.setState(next);
      if (state.ui.contextMenu) store.setState(next);
      return true;
    }
    case "exclude-point":
      store.setState(togglePointExclusion(state, Number(actionTarget.dataset.index)));
      store.setState(closeContextMenu(store.getState()));
      return true;
    case "toggle-transform":
      store.setState(toggleTransform(state, actionTarget.dataset.stepId));
      return true;
    case "fail-transform":
      store.setState(failTransformStep(state, actionTarget.dataset.stepId));
      return true;
    case "recover-transform":
      store.setState(recoverTransformStep(state, actionTarget.dataset.stepId));
      return true;
    case "set-challenger-status":
      store.setState(setChallengerStatus(state, actionTarget.dataset.status));
      return true;
    case "select-structural-finding":
      store.setState(selectStructuralFinding(state, actionTarget.dataset.findingId));
      return true;
    case "switch-findings-chart": {
      const chartId = actionTarget.dataset.chartId;
      const withChart = setFindingsChart(state, chartId);
      const next = setStructuralFindings(withChart, generateFindings(withChart, chartId), chartId);
      store.setState(next);
      return true;
    }
    case "clear-notice":
      store.setState(clearNotice(state));
      return true;
    case "toggle-pane-table": {
      const chartId = actionTarget.dataset.chartId;
      if (chartId) store.setState(togglePaneDataTable(state, chartId));
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
        store.setState(next);
        playRailFlip(snap, 250);
      }
      return true;
    }
    case "open-add-chart": {
      if (isWorkspaceFull()) {
        store.setState({
          ...state,
          ui: {
            ...state.ui,
            notice: { tone: "warning", title: "Workspace is full", body: "Close a chart to add another." },
          },
        });
        return true;
      }
      const focused = getFocused(state);
      store.setState({
        ...state,
        ui: {
          ...state.ui,
          pendingNewChart: {
            ...DEFAULT_PARAMS,
            chart_type: focused.params.chart_type,
            value_column: focused.params.value_column,
            subgroup_column: focused.params.subgroup_column,
            phase_column: focused.params.phase_column,
          },
        },
      });
      return true;
    }
    case "cancel-add-chart":
      store.setState({ ...state, ui: { ...state.ui, pendingNewChart: null } });
      return true;
    case "confirm-add-chart": {
      const pending = state.ui.pendingNewChart;
      if (!pending) return true;
      let next = { ...state, ui: { ...state.ui, pendingNewChart: null } };
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
      store.setState(next);
      render();
      saveLayout();
      if (state.activeDatasetId) reanalyze();
      return true;
    }
    case "add-chart-from-rail": {
      if (isWorkspaceFull()) {
        store.setState({
          ...state,
          ui: {
            ...state.ui,
            notice: { tone: "warning", title: "Workspace is full", body: "Close a chart to add another." },
          },
        });
        return true;
      }
      const focusedType = getFocused(state).params.chart_type;
      store.setState(addChart(state, { chartType: focusedType }));
      render();
      saveLayout();
      if (state.activeDatasetId) reanalyze();
      return true;
    }
    case "remove-chart": {
      const chartId = actionTarget.dataset.chartId;
      if (chartId) {
        const next = removeChart(state, chartId);
        chartRuntime.destroyChart(chartId);
        store.setState(next);
        render();
        saveLayout();
      }
      return true;
    }
    default:
      return false;
  }
}

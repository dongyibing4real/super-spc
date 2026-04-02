import {
  setActiveChipEditor,
  setChartParams,
  setDatasets,
  setLoadingState,
  setError,
  createSlot,
} from "../core/state.js";
import { fetchDatasets as _fetchDatasets } from "../data/api.js";
import { INDIVIDUAL_ONLY, SUBGROUP_REQUIRED } from "../helpers.js";

export function parseActionTarget(action) {
  const match = action.match(/^(chart-\d+)-(.+)$/);
  if (!match) return { chartId: null, baseAction: action };
  return { chartId: match[1], baseAction: match[2] };
}

function parseNullableNumber(value) {
  const trimmed = value.trim();
  return trimmed !== "" ? parseFloat(trimmed) : null;
}

export async function handleAppChange(event, ctx) {
  const {
    store,
    root,
    render,
    loadDatasetById,
    restoreLayout,
    reanalyze,
    fetchDatasets = _fetchDatasets,
  } = ctx;

  if (event.target.matches('[data-action="switch-dataset"]')) {
    const state = store.getState();
    store.setState(setLoadingState(state, true));
    try {
      const datasets = await fetchDatasets();
      let next = setDatasets(store.getState(), datasets);
      const saved = restoreLayout();
      if (saved && saved.chartOrder.length > 0) {
        const restoredCharts = {};
        for (const cid of saved.chartOrder) {
          const p = saved.chartParams[cid];
          if (p && INDIVIDUAL_ONLY.has(p.chart_type)) p.subgroup_column = null;
          restoredCharts[cid] = createSlot(p ? { params: p } : {});
        }
        next = {
          ...next,
          charts: restoredCharts,
          chartOrder: saved.chartOrder,
          nextChartId: saved.nextChartId || saved.chartOrder.length + 1,
          focusedChartId: saved.focusedChartId || saved.chartOrder[0],
          chartLayout: { rows: saved.rows, colWeights: saved.colWeights, rowWeights: saved.rowWeights },
        };
      }
      store.setState(next);
      render();
      await loadDatasetById(event.target.value);
    } catch (err) {
      store.setState(setError(store.getState(), err.message));
      render();
    }
    return true;
  }

  const action = event.target.dataset.action;
  if (!action) return false;

  if (action.startsWith("_pending-") && store.getState().ui.pendingNewChart) {
    const state = store.getState();
    const pendingAction = action.slice("_pending-".length);
    const pending = { ...state.ui.pendingNewChart };

    if (pendingAction === "set-metric-column") pending.value_column = event.target.value || null;
    else if (pendingAction === "set-subgroup-column") {
      if (INDIVIDUAL_ONLY.has(pending.chart_type)) return true;
      const newSg = event.target.value || null;
      if (!newSg && SUBGROUP_REQUIRED.has(pending.chart_type)) return true;
      pending.subgroup_column = newSg;
    }
    else if (pendingAction === "set-phase-column") pending.phase_column = event.target.value || null;
    else if (pendingAction === "set-chart-type") {
      pending.chart_type = event.target.value;
      if (INDIVIDUAL_ONLY.has(pending.chart_type)) pending.subgroup_column = null;
    }
    else if (pendingAction === "set-sigma-method") pending.sigma_method = event.target.value;
    else if (pendingAction === "set-k-sigma") {
      const k = parseFloat(event.target.value);
      if (k > 0 && k <= 6) pending.k_sigma = k;
    } else if (pendingAction === "toggle-nelson") {
      const ruleId = Number(event.target.dataset.value);
      const current = pending.nelson_tests || [];
      pending.nelson_tests = event.target.checked ? [...current, ruleId] : current.filter((r) => r !== ruleId);
    } else if (pendingAction === "set-usl") pending.usl = parseNullableNumber(event.target.value);
    else if (pendingAction === "set-lsl") pending.lsl = parseNullableNumber(event.target.value);
    else if (pendingAction === "set-target") pending.target = parseNullableNumber(event.target.value);
    else return false;

    let next = { ...state, ui: { ...state.ui, pendingNewChart: pending } };
    if (pendingAction !== "toggle-nelson" && pendingAction !== "set-k-sigma") {
      next = setActiveChipEditor(next, null);
    }
    store.setState(next);
    return true;
  }

  const { chartId, baseAction } = parseActionTarget(action);
  if (!chartId) return false;

  if (baseAction === "set-metric-column") {
    const state = store.getState();
    let next = setChartParams(state, chartId, { value_column: event.target.value || null });
    next = setActiveChipEditor(next, null);
    store.setState(next);
    render();
    await reanalyze();
    return true;
  }
  if (baseAction === "set-subgroup-column") {
    const state = store.getState();
    const chartType = state.charts[chartId]?.params.chart_type;
    if (INDIVIDUAL_ONLY.has(chartType)) return true;
    const newSg = event.target.value || null;
    if (!newSg && SUBGROUP_REQUIRED.has(chartType)) return true;
    let next = setChartParams(state, chartId, { subgroup_column: newSg });
    next = setActiveChipEditor(next, null);
    store.setState(next);
    render();
    await reanalyze();
    return true;
  }
  if (baseAction === "set-phase-column") {
    const state = store.getState();
    let next = setChartParams(state, chartId, { phase_column: event.target.value || null });
    next = setActiveChipEditor(next, null);
    store.setState(next);
    render();
    await reanalyze();
    return true;
  }
  if (baseAction === "set-chart-type") {
    const state = store.getState();
    const newType = event.target.value;
    const updates = { chart_type: newType };
    if (INDIVIDUAL_ONLY.has(newType)) updates.subgroup_column = null;
    let next = setChartParams(state, chartId, updates);
    next = setActiveChipEditor(next, null);
    store.setState(next);
    render();
    await reanalyze();
    return true;
  }
  if (baseAction === "set-sigma-method") {
    const state = store.getState();
    let next = setChartParams(state, chartId, { sigma_method: event.target.value });
    next = setActiveChipEditor(next, null);
    store.setState(next);
    render();
    await reanalyze();
    return true;
  }
  if (baseAction === "toggle-nelson") {
    const state = store.getState();
    const ruleId = Number(event.target.dataset.value);
    const current = state.charts[chartId].params.nelson_tests || [];
    const nextRules = event.target.checked ? [...current, ruleId] : current.filter((r) => r !== ruleId);
    store.setState(setChartParams(state, chartId, { nelson_tests: nextRules }));
    render();
    await reanalyze();
    return true;
  }
  if (baseAction === "set-k-sigma") {
    const state = store.getState();
    const k = parseFloat(event.target.value);
    if (k > 0 && k <= 6) {
      store.setState(setChartParams(state, chartId, { k_sigma: k }));
      render();
      await reanalyze();
    }
    return true;
  }
  if (baseAction === "set-usl") {
    const state = store.getState();
    store.setState(setChartParams(state, chartId, { usl: parseNullableNumber(event.target.value) }));
    render();
    await reanalyze();
    return true;
  }
  if (baseAction === "set-lsl") {
    const state = store.getState();
    store.setState(setChartParams(state, chartId, { lsl: parseNullableNumber(event.target.value) }));
    render();
    await reanalyze();
    return true;
  }
  if (baseAction === "set-target") {
    const state = store.getState();
    store.setState(setChartParams(state, chartId, { target: parseNullableNumber(event.target.value) }));
    render();
    await reanalyze();
    return true;
  }

  return false;
}

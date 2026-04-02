import { updateSlot } from './init.js';

export function clearNotice(state) {
  return { ...state, ui: { ...state.ui, notice: null } };
}

export function toggleLayers(state) {
  return { ...state, ui: { ...state.ui, layersExpanded: !state.ui.layersExpanded } };
}

export function openContextMenu(state, x, y, info) {
  return {
    ...state,
    ui: { ...state.ui, contextMenu: { x, y, axis: info?.axis ?? null, target: info?.target ?? 'canvas', role: info?.role ?? 'primary' } }
  };
}

export function closeContextMenu(state) {
  return { ...state, ui: { ...state.ui, contextMenu: null } };
}

export function navigate(state, route) {
  // Clear any pending reset confirmation timer when leaving a route
  if (typeof window !== "undefined") clearTimeout(window._resetConfirmTimer);
  const next = {
    ...state,
    route,
    ui: { ...state.ui, contextMenu: null },
    dataPrep: { ...state.dataPrep, confirmingReset: false },
  };
  // Auto-select active dataset when entering Data Prep
  if (route === 'dataprep' && !next.dataPrep.selectedDatasetId && next.activeDatasetId) {
    next.dataPrep = { ...next.dataPrep, selectedDatasetId: next.activeDatasetId };
  }
  return next;
}

export function setError(state, message) {
  return { ...state, loading: false, error: message };
}

export function setLoadingState(state, loading) {
  return { ...state, loading, error: loading ? null : state.error };
}

export function setDatasets(state, datasets) {
  return { ...state, datasets };
}

export function toggleDataTable(state) {
  return { ...state, showDataTable: !state.showDataTable };
}

export function togglePaneDataTable(state, chartId) {
  const slot = state.charts[chartId];
  if (!slot) return state;
  return updateSlot(state, chartId, { showDataTable: !slot.showDataTable });
}

/** Toggle a chart in/out of the Method Lab comparison selection. */
export function toggleMethodLabChart(state, chartId) {
  if (!state.charts[chartId]) return state;
  const current = state.methodLabCharts || [];
  // If empty (= all selected), initialize from chartOrder minus this one
  if (current.length === 0) {
    const next = state.chartOrder.filter(id => id !== chartId);
    return { ...state, methodLabCharts: next };
  }
  // Toggle
  const has = current.includes(chartId);
  const next = has ? current.filter(id => id !== chartId) : [...current, chartId];
  return { ...state, methodLabCharts: next };
}

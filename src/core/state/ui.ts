import type { SPCState } from '../../types/state.js';
import { updateSlot } from './init.js';

/* ── Theme ── */

function resolveTheme(preference: string): "light" | "dark" {
  if (preference === 'dark' || preference === 'light') return preference;
  // 'system' or unknown → check OS preference
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(resolved: "light" | "dark"): void {
  document.documentElement.dataset.theme = resolved;
}

export function setTheme(state: SPCState, preference: "system" | "light" | "dark"): SPCState {
  const resolved = resolveTheme(preference);
  applyTheme(resolved);
  try { localStorage.setItem('super-spc-theme', preference); } catch {}
  return { ...state, ui: { ...state.ui, themePreference: preference, themeResolved: resolved } };
}

export function initTheme(state: SPCState): SPCState {
  let preference: "system" | "light" | "dark" = 'system';
  try { preference = (localStorage.getItem('super-spc-theme') || 'system') as "system" | "light" | "dark"; } catch {}
  const resolved = resolveTheme(preference);
  applyTheme(resolved);
  return { ...state, ui: { ...state.ui, themePreference: preference, themeResolved: resolved } };
}

export function clearNotice(state: SPCState): SPCState {
  return { ...state, ui: { ...state.ui, notice: null } };
}

interface ContextMenuInfo {
  axis?: string | null;
  target?: string;
  role?: string;
}

export function openContextMenu(state: SPCState, x: number, y: number, info?: ContextMenuInfo): SPCState {
  return {
    ...state,
    ui: { ...state.ui, contextMenu: { x, y, axis: info?.axis ?? null, target: info?.target ?? 'canvas', role: info?.role ?? 'primary' } }
  };
}

export function closeContextMenu(state: SPCState): SPCState {
  return { ...state, ui: { ...state.ui, contextMenu: null } };
}

export function navigate(state: SPCState, route: string): SPCState {
  // Clear any pending reset confirmation timer when leaving a route
  if (typeof window !== "undefined") clearTimeout((window as Window & { _resetConfirmTimer?: ReturnType<typeof setTimeout> })._resetConfirmTimer);
  const next: SPCState = {
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

export function setError(state: SPCState, message: string | null): SPCState {
  return { ...state, loading: false, error: message };
}

export function setLoadingState(state: SPCState, loading: boolean): SPCState {
  return { ...state, loading, error: loading ? null : state.error };
}

export function setDatasets(state: SPCState, datasets: { id: string; name: string }[]): SPCState {
  return { ...state, datasets };
}

export function togglePaneDataTable(state: SPCState, chartId: string): SPCState {
  const slot = state.charts[chartId];
  if (!slot) return state;
  return updateSlot(state, chartId, { showDataTable: !slot.showDataTable });
}

/** Toggle a chart in/out of the Method Lab comparison selection. */
export function toggleMethodLabChart(state: SPCState, chartId: string): SPCState {
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

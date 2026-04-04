/**
 * legacy-boot.js -- Application orchestrator (thin shell).
 *
 * Registers event handlers and subscribers, bootstraps.
 * All state changes go through store.setState(). Subscribers handle rendering.
 * Called by React's App.jsx via bootLegacyApp(rootElement).
 */
import {
  createSlot,
  cancelForecast,
  closeActivePanel,
  collectChartIds,
  focusChart,
  migrateTreeToRows,
  activateForecast,
  openContextMenu,
  selectForecast,
  selectPhase,
  selectPoint,
  selectPoints,
  setColumns,
  setDatasets,
  setError,
  setForecastPrompt,
  setForecastHorizon,
  setLoadingState,
  setPrepParsedData,
  loadPrepPoints,
  setPrepError,
  setXDomainOverride,
  setYDomainOverride,
  resetAxis,
} from "./core/state.js";
import { CHART_TYPE_LABELS, INDIVIDUAL_ONLY, SUBGROUP_REQUIRED } from "./helpers.js";
import {
  createDataset,
  fetchColumns,
  fetchDatasets,
  fetchPoints,
  runAnalysis,
} from "./data/api.js";
import { parseCSV } from "./data/csv-engine.js";
import { createTable, previewTypeConversion } from "./data/data-prep-engine.js";
import { createChart } from "./components/chart/index.js";
import { renderGhostRows } from "./components/ChartArena.jsx";
import { getChartPoints, ensureForecastVisible, extendForecastToViewport, buildChartData } from "./store/chart-data-builder.js";
import { DEFAULT_FORECAST_HORIZON } from "./prediction/constants.js";
import { spcStore } from "./store/spc-store.js";
import { createBridge } from "./store/bridge.js";
import { finalizeDatasetLoad, finalizeReanalysis } from "./runtime/analysis-runtime.js";
import { createChartRuntimeManager } from "./runtime/chart-runtime-manager.js";
import { setupDragInteractions } from "./runtime/drag-runtime.js";
import { handleAppKeydown } from "./events/keydown-handler.js";
import { handleAppChange } from "./events/change-handler.js";
import { handleWorkspaceClick } from "./events/click-handler.js";
import { handleAppClick } from "./events/app-click-handler.js";
import { handlePrepClick } from "./events/prep-click-handler.js";
import { computeGridPreview, insertChart, setColWeight, setRowWeight, setFindingsStandard, setStructuralFindings, setChartParams } from "./core/state.js";
import { generateFindings } from "./core/findings-engine.js";

export function bootLegacyApp(morphRoot) {

/**
 * morphRoot: the inner div managed by morphdom (non-workspace route content).
 * root: .main-shell — used for event delegation, DOM queries, and subscribers.
 *       This covers both React-rendered workspace and legacy-rendered routes.
 */
const root = morphRoot.parentElement;

/* ===Store ===*/
const store = createBridge(spcStore);
// Forecast timers are now managed by Chart.jsx. These are no-op stubs
// kept for the chartRuntimeManager constructor which still references them.
const forecastPromptTimers = new Map();
const forecastPromptEligibility = new Map();
function clearForecastPromptTimer(id) {
  const timer = forecastPromptTimers.get(id);
  if (timer) { clearTimeout(timer); forecastPromptTimers.delete(id); }
}
function handleForecastActivity() { /* Chart.jsx owns forecast timers now */ }
function handleForecastPromptEligibility() { /* Chart.jsx owns forecast timers now */ }

/* ===Chart runtime ===*/
const chartRuntime = createChartRuntimeManager({
  root,
  createChart,
  collectChartIds,
  clearForecastPromptTimer,
  forecastPromptEligibility,
  buildChartData,
  onSelectPoint(id, index) {
    const state = store.getState();
    store.setState(selectPoint(focusChart(state, id), index, id));
  },
  onSelectPoints(id, indices) {
    const state = store.getState();
    store.setState(selectPoints(focusChart(state, id), indices, id));
  },
  onSelectPhase(id, phaseIndex) {
    const state = store.getState();
    store.setState(selectPhase(focusChart(state, id), phaseIndex, id));
  },
  onContextMenu(id, x, y, info) {
    const state = store.getState();
    store.setState(openContextMenu(focusChart(state, id), x, y, { ...info, role: id }));
  },
  onAxisDrag(id, info) {
    const state = store.getState();
    const focused = focusChart(state, id);
    if (info.axis === "x") {
      let next = setXDomainOverride(focused, info.min, info.max, id);
      next = extendForecastToViewport(next, id, info.max);
      store.setState(next);
      return;
    }
    if (info.axis === "y") {
      store.setState(setYDomainOverride(focused, info.yMin, info.yMax, id));
    }
  },
  onForecastDrag(id, info) {
    const state = store.getState();
    const focused = focusChart(state, id);
    let next = setForecastHorizon(focused, info.horizon, id);
    next = setXDomainOverride(next, info.min, info.max, id);
    store.setState(next);
  },
  onForecastActivity(id) {
    handleForecastActivity(id);
  },
  onForecastPromptEligibilityChange(id, payload) {
    handleForecastPromptEligibility(id, payload.eligible);
  },
  onActivateForecast(id) {
    const state = store.getState();
    let next = activateForecast(focusChart(state, id), id);
    // Set horizon to fill the visible gap so predicted points cover the
    // entire space the user opened by panning, not just the default 6.
    const slot = next.charts[id];
    if (slot?.overrides?.x) {
      const pts = getChartPoints(slot, next.points);
      const lastPtIdx = Math.max(0, pts.length - 1);
      const gapIndices = Math.max(1, Math.ceil(slot.overrides.x.max - lastPtIdx));
      if (gapIndices > (slot.forecast?.horizon ?? DEFAULT_FORECAST_HORIZON)) {
        next = setForecastHorizon(next, gapIndices, id);
      }
    }
    next = ensureForecastVisible(next, id);
    store.setState(next);
  },
  onSelectForecast(id, selected) {
    const state = store.getState();
    store.setState(selectForecast(focusChart(state, id), selected, id));
  },
  onCancelForecast(id) {
    const state = store.getState();
    store.setState(cancelForecast(focusChart(state, id), id));
  },
  onAxisReset(id, axis) {
    store.setState(resetAxis(store.getState(), axis, id));
  },
});

/* ===Route change subscriber (React Sidebar dispatches navigate to Zustand) ===*/
store.subscribe(
  (s) => s.route,
  (nextRoute) => {
    render();
    // Lazy-load data prep points when navigating to dataprep
    if (nextRoute === "dataprep") {
      const state = store.getState();
      if (state.dataPrep.selectedDatasetId && state.dataPrep.datasetPoints.length === 0) {
        const dsId = state.dataPrep.selectedDatasetId;
        Promise.all([
          fetchPoints(dsId),
          fetchColumns(dsId).catch(() => []),
        ]).then(([pts, cols]) => {
          const rawRows = pts.map((p) => p.raw_data || {});
          const fallbackColumns = cols.length > 0 ? cols : store.getState().columnConfig.columns;
          const arqueroTable = createTable(rawRows, fallbackColumns);
          let next = setPrepParsedData(store.getState(), { rawRows, arqueroTable, columns: fallbackColumns });
          next = loadPrepPoints(next, pts);
          store.setState(next);
          render();
        }).catch((err) => {
          store.setState(setPrepError(store.getState(), err.message));
          render();
        });
      }
    }
  }
);

/* ===Unsaved changes guard ===*/
window.addEventListener("beforeunload", (e) => {
  if (store.getState().dataPrep.unsavedChanges) {
    e.preventDefault();
  }
});



function render() {
  // All views now rendered by React (Router.jsx).
  // Legacy render() only needs to handle side effects (chart cleanup).
  const state = store.getState();
  if (state.route !== "workspace") {
    chartRuntime.destroyInactive(state);
  }
}

/* ===Layout change (render + persist) ===*/
function applyLayoutChange(next) {
  store.setState(next);
  render();
  saveLayout();
}

/* ===FLIP animation helpers ===*/
function snapshotRailPositions() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const rail = root.querySelector(".recipe-rail");
  if (!rail) return null;
  const map = new Map();
  rail.querySelectorAll(".rail-card[data-chart-id]").forEach(el => {
    map.set(el.dataset.chartId, el.getBoundingClientRect());
  });
  return map.size > 0 ? map : null;
}

function playRailFlip(firstMap, duration = 250) {
  if (!firstMap) return;
  const rail = root.querySelector(".recipe-rail");
  if (!rail) return;
  rail.querySelectorAll(".rail-card[data-chart-id]").forEach(el => {
    const first = firstMap.get(el.dataset.chartId);
    if (!first) return;
    const last = el.getBoundingClientRect();
    const deltaY = first.top - last.top;
    if (Math.abs(deltaY) < 2) return;
    el.animate(
      [{ transform: `translateY(${deltaY}px)` }, { transform: "translateY(0)" }],
      { duration, easing: "cubic-bezier(0.25, 1, 0.5, 1)", composite: "replace" }
    );
  });
}

/** Pre-validate chart params before hitting the backend. */
function validatedRunAnalysis(datasetId, params) {
  if (SUBGROUP_REQUIRED.has(params.chart_type) && !params.subgroup_column) {
    return Promise.reject(new Error(
      `${CHART_TYPE_LABELS[params.chart_type] || params.chart_type} requires a subgroup column. Select one in the Subgroup chip.`
    ));
  }
  return runAnalysis(datasetId, params);
}

/* ===Data loading ===*/
async function loadDatasetById(datasetId) {
  store.setState(setLoadingState(store.getState(), true));
  render();
  try {
    const [points, columns] = await Promise.all([
      fetchPoints(datasetId),
      fetchColumns(datasetId).catch(() => []),
    ]);
    store.setState(setColumns(store.getState(), columns));

    const state = store.getState();
    const analysisResults = await Promise.allSettled(
      state.chartOrder.map(id => validatedRunAnalysis(datasetId, state.charts[id].params))
    );
    const { nextState } = finalizeDatasetLoad(store.getState(), {
      datasetId,
      datasets: store.getState().datasets,
      points,
      columns,
      analysisResults,
    });
    store.setState(nextState);
    render();
  } catch (err) {
    store.setState(setError(store.getState(), err.message));
    render();
  }
}

async function reanalyze() {
  const state = store.getState();
  if (!state.activeDatasetId) return;
  try {
    const dsId = state.activeDatasetId;
    const points = await fetchPoints(dsId);
    const freshState = store.getState();
    const analysisResults = await Promise.allSettled(
      freshState.chartOrder.map(id => validatedRunAnalysis(dsId, freshState.charts[id].params))
    );
    const { nextState } = finalizeReanalysis(store.getState(), { points, analysisResults });
    store.setState(nextState);
  } catch (err) {
    store.setState(setError(store.getState(), err.message));
  }
}

/* ===Event handlers ===*/
root.addEventListener("click", async (e) => {
  const handledWorkspaceClick = handleWorkspaceClick(e, {
    store,
    root,
    render,
    saveLayout,
    reanalyze,
    chartRuntime,
    snapshotRailPositions,
    playRailFlip,
    isWorkspaceFull,
  });

  const t = e.target.closest("[data-action]");
  if (!t) {
    const state = store.getState();
    if (state.dataPrep.activePanel && !e.target.closest('.prep-panel') && !e.target.closest('.prep-transform-toolbar')) {
      store.setState(closeActivePanel(state));
      render();
      return;
    }
    if (handledWorkspaceClick) return;
    return;
  }
  if (handledWorkspaceClick) return;

  const handledAppClick = await handleAppClick(e, {
    store,
    root,
    render,
    loadDatasetById,
  });
  if (handledAppClick) return;

  const handledPrepClick = await handlePrepClick(e, {
    store,
    root,
    documentRef: document,
    windowRef: window,
    render,
  });
  if (handledPrepClick) return;
});

root.addEventListener("keydown", (e) => {
  handleAppKeydown(e, { store, root, documentRef: document, render });
});

setupDragInteractions({
  root,
  documentRef: document,
  getState: () => store.getState(),
  chartRuntime,
  collectChartIds,
  renderGhostRows,
  computeGridPreview,
  commitLayout: applyLayoutChange,
  saveLayout,
  setColWeight,
  setRowWeight,
  buildChartData,
  insertChart,
  chartTypeLabels: CHART_TYPE_LABELS,
});

/* ===Pane titlebar right-click ===*/
let paneMenu = null;

function closePaneMenu() {
  if (paneMenu) { paneMenu.remove(); paneMenu = null; }
}

function showPaneContextMenu(x, y, chartId) {
  closePaneMenu();
  const isOnly = collectChartIds(store.getState().chartLayout).length <= 1;
  const menu = document.createElement("div");
  menu.className = "pane-context-menu";
  menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:9999`;
  menu.innerHTML = `
    <button data-action="remove-chart" data-chart-id="${chartId}" ${isOnly ? "disabled" : ""}>Close Pane</button>
  `;
  document.body.appendChild(menu);
  paneMenu = menu;
}

document.addEventListener("pointerdown", (e) => {
  if (paneMenu && !paneMenu.contains(e.target)) closePaneMenu();
}, true);

root.addEventListener("contextmenu", (e) => {
  const titlebar = e.target.closest(".chart-pane-titlebar");
  if (titlebar) {
    e.preventDefault();
    const pane = titlebar.closest(".chart-pane[data-chart-id]");
    if (pane?.dataset.chartId) showPaneContextMenu(e.clientX, e.clientY, pane.dataset.chartId);
    return;
  }

  if (e.defaultPrevented) return;
  const ch = e.target.closest(".chart-stage");
  if (!ch) return;
  e.preventDefault();
  const state = store.getState();
  const pane = ch.closest('.chart-pane[data-chart-id]');
  const next = pane && pane.dataset.chartId !== state.focusedChartId
    ? focusChart(state, pane.dataset.chartId)
    : state;
  const r = root.getBoundingClientRect();
  store.setState(openContextMenu(next, e.clientX - r.left, e.clientY - r.top, { target: 'canvas', role: next.focusedChartId }));
});

/* ===Standards input (on commit — blur or Enter) ===*/
root.addEventListener("change", (e) => {
  if (!e.target.matches("[data-standard-key]")) return;
  const key = e.target.dataset.standardKey;
  const value = parseFloat(e.target.value);
  if (!key || isNaN(value) || value < 0) return;
  let next = setFindingsStandard(store.getState(), key, value);
  try { localStorage.setItem("spc-findings-standards", JSON.stringify(next.findingsStandards)); } catch { /* */ }
  const chartId = next.findingsChartId || next.chartOrder[0];
  next = setStructuralFindings(next, generateFindings(next, chartId), chartId);
  store.setState(next);
});

/* ===Spec limit inputs (LSL/USL/Target on findings page) ===*/
root.addEventListener("change", (e) => {
  if (!e.target.matches("[data-spec-key]")) return;
  const key = e.target.dataset.specKey;
  const chartId = e.target.dataset.chartId;
  const raw = e.target.value.trim();
  const value = raw !== "" ? parseFloat(raw) : null;
  if (key && chartId && (value === null || !isNaN(value))) {
    store.setState(setChartParams(store.getState(), chartId, { [key]: value }));
    render();
    reanalyze();
  }
});

/* ===Change handlers ===*/
root.addEventListener("change", async (e) => {
  if (e.target.matches('[data-field="filter-op"]')) {
    const op = e.target.value;
    const val1 = root.querySelector('[data-field="filter-val"]');
    const val2 = root.querySelector('[data-field="filter-val2"]');
    if (val1) val1.style.display = (op === 'is_null' || op === 'is_not_null') ? 'none' : '';
    if (val2) val2.style.display = op === 'between' ? '' : 'none';
    return;
  }
  if (e.target.matches('[data-field="missing-strategy"]')) {
    const custom = root.querySelector('[data-field="missing-custom"]');
    if (custom) custom.style.display = e.target.value === 'fill_custom' ? '' : 'none';
    return;
  }
  if (e.target.matches('[data-field="recode-new-col"]')) {
    const nameInput = root.querySelector('[data-field="recode-new-name"]');
    if (nameInput) nameInput.style.display = e.target.checked ? '' : 'none';
    return;
  }
  if (e.target.matches('[data-field="bin-custom"]')) {
    const breaksInput = root.querySelector('[data-field="bin-breaks"]');
    if (breaksInput) breaksInput.style.display = e.target.checked ? '' : 'none';
    return;
  }
  if (e.target.matches('[data-field="validate-type"]')) {
    const vt = e.target.value;
    const minEl = root.querySelector('[data-field="validate-min"]');
    const maxEl = root.querySelector('[data-field="validate-max"]');
    const valuesEl = root.querySelector('[data-field="validate-values"]');
    const patternEl = root.querySelector('[data-field="validate-pattern"]');
    if (minEl) minEl.style.display = vt === 'range' ? '' : 'none';
    if (maxEl) maxEl.style.display = vt === 'range' ? '' : 'none';
    if (valuesEl) valuesEl.style.display = vt === 'allowed' ? '' : 'none';
    if (patternEl) patternEl.style.display = vt === 'regex' ? '' : 'none';
    return;
  }
  if (e.target.matches('[data-field="type-col"]')) {
    const state = store.getState();
    if (state.dataPrep.arqueroTable) {
      const col = e.target.value;
      const targetType = root.querySelector('[data-field="type-target"]')?.value || 'numeric';
      const pv = previewTypeConversion(state.dataPrep.arqueroTable, col, targetType);
      const badge = root.querySelector('[data-field="type-preview"]');
      if (badge) badge.textContent = `${pv.convertible}/${pv.total} convertible`;
    }
    return;
  }
  if (e.target.matches('[data-field="type-target"]')) {
    const state = store.getState();
    if (state.dataPrep.arqueroTable) {
      const col = root.querySelector('[data-field="type-col"]')?.value;
      const targetType = e.target.value;
      if (col) {
        const pv = previewTypeConversion(state.dataPrep.arqueroTable, col, targetType);
        const badge = root.querySelector('[data-field="type-preview"]');
        if (badge) badge.textContent = `${pv.convertible}/${pv.total} convertible`;
      }
    }
    return;
  }

  if (e.target.matches('[data-action="upload-csv"]')) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    store.setState(setLoadingState(store.getState(), true));
    render();
    try {
      const parsed = await parseCSV(file);
      const arqueroTable = createTable(parsed.rows, parsed.columns);

      const name = file.name.replace(/\.csv$/i, '');
      const newDs = await createDataset({
        name,
        columns: parsed.columns,
        rows: parsed.rows,
      });

      const datasets = await fetchDatasets();
      store.setState(setDatasets(store.getState(), datasets));
      store.setState(setPrepParsedData(store.getState(), {
        rawRows: parsed.rows,
        arqueroTable,
        columns: parsed.columns,
      }));

      await loadDatasetById(newDs.id);
    } catch (err) {
      store.setState(setError(store.getState(), err.message));
      render();
    }
    return;
  }

  await handleAppChange(e, {
    store,
    root,
    render,
    loadDatasetById,
    restoreLayout,
    reanalyze,
  });
});

/* ===Retry handler ===*/
root.addEventListener("click", (e) => {
  const t = e.target.closest('[data-action="retry-load"]');
  if (!t) return;
  main();
});

/* ===Layout capacity ===*/
function isWorkspaceFull() {
  const arenaEl = root.querySelector(".chart-arena");
  if (!arenaEl) return false;
  const maxPerRow = Math.floor(arenaEl.clientWidth / 250);
  const maxRows = Math.floor(arenaEl.clientHeight / 180);
  const maxCharts = maxPerRow * maxRows;
  return collectChartIds(store.getState().chartLayout).length >= maxCharts;
}

/* ===Layout persistence ===*/
const LAYOUT_STORAGE_KEY = "super-spc-chart-layout";

function saveLayout() {
  try {
    const state = store.getState();
    const data = {
      rows: state.chartLayout.rows,
      colWeights: state.chartLayout.colWeights,
      rowWeights: state.chartLayout.rowWeights,
      chartOrder: state.chartOrder,
      focusedChartId: state.focusedChartId,
      nextChartId: state.nextChartId,
      chartParams: {},
    };
    for (const id of state.chartOrder) {
      data.chartParams[id] = state.charts[id]?.params || null;
    }
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(data));
  } catch { /* localStorage unavailable or full */ }
}

function restoreLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.chartOrder || !data.chartParams) return null;
    if (!data.rows) {
      const migrated = migrateTreeToRows(data);
      data.rows = migrated.rows;
      data.colWeights = migrated.colWeights;
      data.rowWeights = migrated.rowWeights;
      if (!data.rows || data.rows.length === 0) {
        data.rows = [data.chartOrder];
        data.colWeights = [data.chartOrder.map(() => 1)];
        data.rowWeights = [1];
      }
    }
    if (!data.colWeights) {
      data.colWeights = data.rows.map(r => r.map(() => 1));
    }
    if (!data.rowWeights) {
      data.rowWeights = data.rows.map(() => 1);
    }
    return data;
  } catch { return null; }
}

/* ===Boot ===*/
render();

async function main() {
  try {
    const datasets = await fetchDatasets();
    store.setState(setDatasets(store.getState(), datasets));
    const id = datasets[0]?.id;
    if (!id) { store.setState(setLoadingState(store.getState(), false)); render(); return; }

    const saved = restoreLayout();
    if (saved && saved.chartOrder.length > 0) {
      const restoredCharts = {};
      for (const cid of saved.chartOrder) {
        const p = saved.chartParams[cid];
        if (p && INDIVIDUAL_ONLY.has(p.chart_type)) p.subgroup_column = null;
        restoredCharts[cid] = createSlot(p ? { params: p } : {});
      }
      const state = store.getState();
      store.setState({
        ...state,
        charts: restoredCharts,
        chartOrder: saved.chartOrder,
        nextChartId: saved.nextChartId || saved.chartOrder.length + 1,
        focusedChartId: saved.focusedChartId || saved.chartOrder[0],
        chartLayout: { rows: saved.rows, colWeights: saved.colWeights, rowWeights: saved.rowWeights },
      });
    }

    await loadDatasetById(id);
  } catch (err) {
    store.setState(setError(store.getState(), err.message));
    render();
  }
}

main();

} // end bootLegacyApp

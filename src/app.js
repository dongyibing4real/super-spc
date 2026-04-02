/**
 * app.js -- Application orchestrator (thin shell).
 *
 * Creates the store, registers event handlers and subscribers, bootstraps.
 * All state changes go through store.setState(). Subscribers handle rendering.
 */
import {
  createInitialState,
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
  setColumns,
  setDatasets,
  setError,
  setForecastPrompt,
  setForecastHorizon,
  setLoadingState,
  setPrepParsedData,
  setXDomainOverride,
  setYDomainOverride,
  resetAxis,
} from "./core/state.js";
import { renderSidebar } from "./components/sidebar.js";
import { capClass, CHART_TYPE_LABELS, detectRuleViolations, getCapability } from "./helpers.js";
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
import { renderNotice, renderLoadingState, renderErrorState, renderEmptyState } from "./components/notice.js";
import { renderGhostRows } from "./components/chart-arena.js";
import { renderWorkspace } from "./views/workspace.js";
import { renderDataPrep } from "./views/dataprep.js";
import { renderMethodLab } from "./views/methodlab.js";
import { renderFindings } from "./views/findings.js";
import { morphInner } from "./core/morph.js";
import { buildForecastView } from "./prediction/build-forecast-view.js";
import { DEFAULT_FORECAST_HORIZON } from "./prediction/constants.js";
import { createStore } from "./core/store.js";
import { finalizeDatasetLoad, finalizeReanalysis } from "./runtime/analysis-runtime.js";
import { setupUiSubscribers } from "./runtime/ui-subscribers.js";
import { createChartRuntimeManager } from "./runtime/chart-runtime-manager.js";
import { setupChartSubscribers } from "./runtime/chart-subscribers.js";
import { setupDragInteractions } from "./runtime/drag-runtime.js";
import { handleAppKeydown } from "./events/keydown-handler.js";
import { handleAppChange } from "./events/change-handler.js";
import { handleWorkspaceClick } from "./events/click-handler.js";
import { handleAppClick } from "./events/app-click-handler.js";
import { handlePrepClick } from "./events/prep-click-handler.js";
import { computeGridPreview, insertChart, setColWeight, setRowWeight } from "./core/state.js";

/* ===Store ===*/
const root = document.getElementById("app");
const store = createStore(createInitialState());
const forecastPromptTimers = new Map();
const forecastPromptEligibility = new Map();

setupUiSubscribers(store, root);

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
      const pts = getChartPoints(slot);
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

setupChartSubscribers(store, root, {
  chartRuntime,
  getCapability,
  capClass,
});

/* ===Unsaved changes guard ===*/
window.addEventListener("beforeunload", (e) => {
  if (store.getState().dataPrep.unsavedChanges) {
    e.preventDefault();
  }
});

/* ===Router ===*/
function renderRoute() {
  const state = store.getState();
  if (state.loading) return renderLoadingState();
  if (state.error) return renderErrorState(state);
  if (state.points.length === 0 && !state.activeDatasetId) return renderEmptyState();

  switch (state.route) {
    case "dataprep": return renderDataPrep(state);
    case "methodlab": return renderMethodLab(state);
    case "findings": return renderFindings(state);
    default: return renderWorkspace(state);
  }
}

function getChartPoints(slot) {
  const hasChartValues = slot.chartValues && slot.chartValues.length > 0;
  return hasChartValues
    ? slot.chartValues.map((v, i) => ({
        primaryValue: v,
        label: slot.chartLabels[i] || `pt-${i}`,
        subgroupLabel: slot.chartLabels[i] || `pt-${i}`,
        excluded: false,
        annotation: null,
        raw: {},
      }))
    : store.getState().points;
}

/* ===Forecast lifecycle ===*/
function clearForecastPromptTimer(id) {
  const timer = forecastPromptTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    forecastPromptTimers.delete(id);
  }
}

function scheduleForecastPrompt(id, { force = false } = {}) {
  const state = store.getState();
  const slot = state.charts[id];
  if (!slot || slot.forecast?.mode !== "hidden" || !forecastPromptEligibility.get(id)) {
    clearForecastPromptTimer(id);
    return;
  }
  if (forecastPromptTimers.has(id) && !force) return;
  clearForecastPromptTimer(id);
  forecastPromptTimers.set(id, window.setTimeout(() => {
    forecastPromptTimers.delete(id);
    const current = store.getState().charts[id];
    if (!current || current.forecast?.mode !== "hidden" || !forecastPromptEligibility.get(id)) return;
    store.setState(setForecastPrompt(store.getState(), true, id));
  }, 900));
}

function handleForecastPromptEligibility(id, eligible) {
  forecastPromptEligibility.set(id, eligible);
  const state = store.getState();
  const slot = state.charts[id];
  if (!slot) return;
  if (!eligible) {
    clearForecastPromptTimer(id);
    if (slot.forecast?.mode === "prompt") {
      store.setState(setForecastPrompt(state, false, id));
    }
    return;
  }
  if (slot.forecast?.mode === "hidden") {
    scheduleForecastPrompt(id);
  }
}

function handleForecastActivity(id) {
  const state = store.getState();
  const slot = state.charts[id];
  if (!slot || slot.forecast?.mode === "active") return;
  clearForecastPromptTimer(id);
  if (slot.forecast?.mode === "prompt") {
    store.setState(setForecastPrompt(state, false, id));
  }
  if (forecastPromptEligibility.get(id)) {
    scheduleForecastPrompt(id, { force: true });
  }
}

function ensureForecastVisible(nextState, id) {
  const slot = nextState.charts[id];
  if (!slot) return nextState;
  const points = getChartPoints(slot);
  const lastIdx = Math.max(0, points.length - 1);
  const horizon = slot.forecast?.horizon ?? DEFAULT_FORECAST_HORIZON;
  const requiredMax = lastIdx + horizon;
  const currentOverride = slot.overrides?.x;
  if (!currentOverride || currentOverride.max >= requiredMax) {
    return nextState;
  }
  return setXDomainOverride(nextState, currentOverride.min, requiredMax, id);
}

function extendForecastToViewport(nextState, id, nextXMax) {
  const slot = nextState.charts[id];
  if (!slot || slot.forecast?.mode !== "active") return nextState;
  const points = getChartPoints(slot);
  const lastIdx = Math.max(0, points.length - 1);
  const requiredHorizon = Math.max(1, Math.ceil(Math.max(0, nextXMax - lastIdx)));
  const currentHorizon = slot.forecast?.horizon ?? DEFAULT_FORECAST_HORIZON;
  if (requiredHorizon <= currentHorizon) return nextState;
  return setForecastHorizon(nextState, requiredHorizon, id);
}

/* ===Chart data builder ===*/
function buildChartData(id) {
  const state = store.getState();
  const slot = state.charts[id];
  const points = getChartPoints(slot);
  const hasChartValues = slot.chartValues && slot.chartValues.length > 0;
  const lastIdx = Math.max(0, points.length - 1);
  // No built-in right padding — the chart fits data exactly on initial load.
  // The forecast prompt appears only when the user pans/zooms to create a gap.
  const xDefaultDomain = { min: 0, max: lastIdx };
  const forecast = buildForecastView({
    points,
    limits: slot.limits,
    forecast: slot.forecast,
    xDomainOverride: slot.overrides.x,
    xDefaultDomain,
    chartTypeId: slot.context.chartType?.id,
  });

  return {
    points,
    limits: slot.limits,
    phases: slot.phases || [],
    forecast,
    toggles: {
      ...state.chartToggles,
      overlay: false,
      xDomainOverride: slot.overrides.x,
      xDefaultDomain,
      yDomainOverride: slot.overrides.y,
    },
    selectedIndex: hasChartValues ? (slot.selectedPointIndex ?? -1) : state.selectedPointIndex,
    selectedPhaseIndex: slot.selectedPhaseIndex ?? null,
    violations: detectRuleViolations(state, id),
    capability: getCapability(state, id),
    metric: slot.context.metric,
    subgroup: slot.context.subgroup,
    chartType: slot.context.chartType,
    seriesKey: "primaryValue",
    seriesType: id,
  };
}

/* ===Main render ===*/
function renderShortcutOverlay() {
  return `
    <div class="shortcut-overlay" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div class="shortcut-overlay-backdrop" data-action="close-shortcut-overlay"></div>
      <div class="shortcut-overlay-panel">
        <div class="shortcut-overlay-header">
          <h2 class="shortcut-overlay-title">Keyboard Shortcuts</h2>
          <button class="shortcut-overlay-close" data-action="close-shortcut-overlay" type="button" aria-label="Close">&times;</button>
        </div>
        <dl class="shortcut-list">
          <div class="shortcut-group-label">Violations</div>
          <div class="shortcut-row"><dt><kbd>n</kbd></dt><dd>Next violation point</dd></div>
          <div class="shortcut-row"><dt><kbd>p</kbd></dt><dd>Previous violation point</dd></div>
          <div class="shortcut-group-label">Data Prep</div>
          <div class="shortcut-row"><dt><kbd>r</kbd></dt><dd>Rename column</dd></div>
          <div class="shortcut-row"><dt><kbd>t</kbd></dt><dd>Change column type</dd></div>
          <div class="shortcut-row"><dt><kbd>c</kbd></dt><dd>Calculated column</dd></div>
          <div class="shortcut-row"><dt><kbd>f</kbd></dt><dd>Filter rows</dd></div>
          <div class="shortcut-row"><dt><kbd>d</kbd></dt><dd>Find &amp; replace</dd></div>
          <div class="shortcut-row"><dt><kbd>z</kbd></dt><dd>Undo last transform</dd></div>
          <div class="shortcut-group-label">Navigation</div>
          <div class="shortcut-row"><dt><kbd>&larr;</kbd> <kbd>&rarr;</kbd></dt><dd>Move selected point</dd></div>
          <div class="shortcut-row"><dt><kbd>?</kbd></dt><dd>Toggle this help overlay</dd></div>
          <div class="shortcut-row"><dt><kbd>Esc</kbd></dt><dd>Close overlays / cancel</dd></div>
        </dl>
      </div>
    </div>
  `;
}

function render() {
  const state = store.getState();
  morphInner(root, `
    <div class="app-shell">
      ${renderSidebar(state)}
      <main class="main-shell">
        ${renderNotice(state)}
        ${renderRoute()}
      </main>
    </div>
    ${state.ui?.shortcutOverlay ? renderShortcutOverlay() : ""}
  `);

  if (state.route === "workspace") {
    chartRuntime.syncWorkspace(state);
  } else {
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
      state.chartOrder.map(id => runAnalysis(datasetId, state.charts[id].params))
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
      freshState.chartOrder.map(id => runAnalysis(dsId, freshState.charts[id].params))
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
        restoredCharts[cid] = createSlot(saved.chartParams[cid] ? { params: saved.chartParams[cid] } : {});
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

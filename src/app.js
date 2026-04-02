/**
 * app.js -- Application orchestrator.
 *
 * Owns: global state, render cycle, D3 chart lifecycle, event delegation, data loading.
 * Delegates rendering to views/ and components/ modules.
 */
import {
  clearNotice,
  closeContextMenu,
  createInitialState,
  createSlot,
  cancelForecast,
  deletePrepDataset,
  failTransformStep,
  loadDataset,
  loadPrepPoints,
  moveSelection,
  navigate,
  openContextMenu,
  recoverTransformStep,
  setColumns,
  setPrepParsedData,
  setPrepTable,
  addPrepTransform,
  undoPrepTransform,
  undoPrepTransformTo,
  clearPrepTransforms,
  markPrepSaved,
  updateColumnMeta,
  addColumnMeta,
  toggleRowExclusion,
  setExpandedProfileColumn,
  setProfileCache,
  selectPoint,
  selectPrepDataset,
  selectStructuralFinding,
  setFindingsChart,
  setStructuralFindings,
  setPrepError,
  resetAxis,
  selectForecast,
  setChallengerStatus,
  setChartParams,
  setDatasets,
  setError,
  setForecastPrompt,
  setForecastHorizon,
  setLoadingState,
  setActiveChipEditor,
  setXDomainOverride,
  setYDomainOverride,
  toggleChartOption,
  togglePointExclusion,
  toggleTransform,
  setActivePanel,
  closeActivePanel,
  collectChartIds,
  focusChart,
  getFocused,
  migrateTreeToRows,
  togglePaneDataTable,
  activateForecast,
  deriveWorkspace,
  addChart,
  removeChart,
  insertChart,
  computeGridPreview,
  setColWeight,
  setRowWeight,
  DEFAULT_PARAMS,
} from "./core/state.js";
import { renderSidebar } from "./components/sidebar.js";
import { capClass, CHART_TYPE_LABELS, detectRuleViolations, getCapability } from "./helpers.js";
import {
  createDataset,
  deleteDataset,
  fetchColumns,
  fetchDatasets,
  fetchPoints,
  runAnalysis,
} from "./data/api.js";
import { parseCSV } from "./data/csv-engine.js";
import {
  createTable, filterRows, sortTable, findReplace, removeDuplicates,
  handleMissing, cleanText, renameColumn, changeColumnType, previewTypeConversion,
  addCalculatedColumn, recodeValues, binColumn, splitColumn, concatColumns,
} from "./data/data-prep-engine.js";
import { createChart } from "./components/chart/index.js";

import { renderNotice, renderLoadingState, renderErrorState, renderEmptyState } from "./components/notice.js";
import { renderRecipeRail } from "./components/recipe-rail.js";
import { renderChartArena, renderGhostRows } from "./components/chart-arena.js";
import { renderWorkspace, renderEvidenceRail } from "./views/workspace.js";
import { renderDataPrep } from "./views/dataprep.js";
import { renderMethodLab } from "./views/methodlab.js";
import { renderFindings } from "./views/findings.js";
import { morphInner, morphEl } from "./core/morph.js";
import { generateFindings } from "./core/findings-engine.js";
import { buildForecastView } from "./prediction/build-forecast-view.js";
import { DEFAULT_FORECAST_HORIZON } from "./prediction/constants.js";
import { createStore } from "./core/store.js";
import {
  finalizeDatasetLoad,
  finalizeReanalysis,
} from "./runtime/analysis-runtime.js";
import { setupUiSubscribers } from "./runtime/ui-subscribers.js";
import { createChartRuntimeManager } from "./runtime/chart-runtime-manager.js";
import { setupChartSubscribers } from "./runtime/chart-subscribers.js";
import { setupDragInteractions } from "./runtime/drag-runtime.js";
import { handleAppKeydown, navigateSelectionToViolation } from "./events/keydown-handler.js";
import { handleAppChange } from "./events/change-handler.js";
import { handleWorkspaceClick } from "./events/click-handler.js";
import { handleAppClick } from "./events/app-click-handler.js";
import { handlePrepClick } from "./events/prep-click-handler.js";
import { replayPrepTransforms } from "./runtime/prep-runtime.js";

/* ===Global state ===*/
const root = document.getElementById("app");
const store = createStore(createInitialState());
let state = store.getState();
const forecastPromptTimers = new Map();
const forecastPromptEligibility = new Map();

store.subscribe((nextState) => {
  state = nextState;
});

setupUiSubscribers(store, root);

function setState(nextState) {
  return store.setState(nextState);
}

function patchUi(nextUi) {
  return { ...state, ui: { ...state.ui, ...nextUi } };
}

const chartRuntime = createChartRuntimeManager({
  root,
  createChart,
  collectChartIds,
  clearForecastPromptTimer,
  forecastPromptEligibility,
  buildChartData,
  onSelectPoint(id, index) {
    const next = selectPoint(focusChart(state, id), index, id);
    commitChart(next);
    commitEvidenceRail(next);
  },
  onContextMenu(id, x, y, info) {
    commitContextMenu(openContextMenu(focusChart(state, id), x, y, { ...info, role: id }));
  },
  onAxisDrag(id, info) {
    const focused = focusChart(state, id);
    if (info.axis === "x") {
      let next = setXDomainOverride(focused, info.min, info.max, id);
      next = extendForecastToViewport(next, id, info.max);
      commitChart(next);
      return;
    }
    if (info.axis === "y") {
      commitChart(setYDomainOverride(focused, info.yMin, info.yMax, id));
    }
  },
  onForecastDrag(id, info) {
    const focused = focusChart(state, id);
    let next = setForecastHorizon(focused, info.horizon, id);
    next = setXDomainOverride(next, info.min, info.max, id);
    commitChart(next);
  },
  onForecastActivity(id) {
    handleForecastActivity(id);
  },
  onForecastPromptEligibilityChange(id, payload) {
    handleForecastPromptEligibility(id, payload.eligible);
  },
  onActivateForecast(id) {
    let next = activateForecast(focusChart(state, id), id);
    next = ensureForecastVisible(next, id);
    commitChart(next);
  },
  onSelectForecast(id, selected) {
    commitChart(selectForecast(focusChart(state, id), selected, id));
  },
  onCancelForecast(id) {
    commitChart(cancelForecast(focusChart(state, id), id));
  },
  onAxisReset(id, axis) {
    commitChart(resetAxis(state, axis, id));
  },
});

setupChartSubscribers(store, root, {
  chartRuntime,
  getCapability,
  capClass,
});

/* ===Unsaved changes guard ===*/
window.addEventListener("beforeunload", (e) => {
  if (state.dataPrep.unsavedChanges) {
    e.preventDefault();
  }
});

/* ===Router ===*/
function renderRoute() {
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
    : state.points;
}

function clearForecastPromptTimer(id) {
  const timer = forecastPromptTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    forecastPromptTimers.delete(id);
  }
}

function scheduleForecastPrompt(id, { force = false } = {}) {
  const slot = state.charts[id];
  if (!slot || slot.forecast?.mode !== "hidden" || !forecastPromptEligibility.get(id)) {
    clearForecastPromptTimer(id);
    return;
  }
  if (forecastPromptTimers.has(id) && !force) return;
  clearForecastPromptTimer(id);
  forecastPromptTimers.set(id, window.setTimeout(() => {
    forecastPromptTimers.delete(id);
    const current = state.charts[id];
    if (!current || current.forecast?.mode !== "hidden" || !forecastPromptEligibility.get(id)) return;
    commitChart(setForecastPrompt(state, true, id));
  }, 900));
}

function handleForecastPromptEligibility(id, eligible) {
  forecastPromptEligibility.set(id, eligible);
  const slot = state.charts[id];
  if (!slot) return;
  if (!eligible) {
    clearForecastPromptTimer(id);
    if (slot.forecast?.mode === "prompt") {
      commitChart(setForecastPrompt(state, false, id));
    }
    return;
  }
  if (slot.forecast?.mode === "hidden") {
    scheduleForecastPrompt(id);
  }
}

function handleForecastActivity(id) {
  const slot = state.charts[id];
  if (!slot || slot.forecast?.mode === "active") return;
  clearForecastPromptTimer(id);
  let next = state;
  if (slot.forecast?.mode === "prompt") {
    next = setForecastPrompt(next, false, id);
    commitChart(next);
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
  const slot = state.charts[id];
  const points = getChartPoints(slot);
  const hasChartValues = slot.chartValues && slot.chartValues.length > 0;
  const lastIdx = Math.max(0, points.length - 1);
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

/* ===Commit functions ===*/
function commit(next) { setState(next); render(); }

function commitChart(next) {
  setState(next);
}

function commitLayout(next) {
  setState(next);
  // Full re-render for layout changes (tree structure may have changed)
  render();
  saveLayout();
}

function commitContextMenu(next) {
  setState(next);
}

/* ===Targeted commit ---recipe rail (chip editors, layer toggles) ===*/
function commitRecipeRail(next) {
  setState(next);
}

/* ===FLIP animation helpers ---smooth card float transitions ===*/
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
  // Run synchronously ---before the browser paints the un-inverted state.
  // Reading getBoundingClientRect forces layout, then animate() starts
  // from the INVERT position on the very first painted frame.
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

/* ===Targeted commit ---notice bar ===*/
function commitNotice(next) {
  setState(next);
}

/* ===Targeted commit ---full workspace (recipe rail + chart arena + chart data) ===*/
function commitWorkspace(next) {
  setState(next);
}

/* ===Targeted commit ---evidence rail ===*/
function commitEvidenceRail(next) {
  setState(next);
}

/* ===Data loading ===*/
async function loadDatasetById(datasetId) {
  setState(setLoadingState(state, true));
  render();
  try {
    // 1. Fetch data and columns first
    const [points, columns] = await Promise.all([
      fetchPoints(datasetId),
      fetchColumns(datasetId).catch(() => []),
    ]);
    setState(setColumns(state, columns));

    // 2. Run analysis per chart with per-chart params (gracefully handle per-chart failures)
    const analysisResults = await Promise.allSettled(
      state.chartOrder.map(id => runAnalysis(datasetId, state.charts[id].params))
    );
    ({ nextState: state } = finalizeDatasetLoad(state, {
      datasetId,
      datasets: state.datasets,
      points,
      columns,
      analysisResults,
    }));
    setState(state);
    render();
  } catch (err) {
    setState(setError(state, err.message));
    render();
  }
}

async function reanalyze() {
  if (!state.activeDatasetId) return;
  try {
    const dsId = state.activeDatasetId;
    // Fetch points + run analysis per chart (gracefully handle per-chart failures)
    const points = await fetchPoints(dsId);
    const analysisResults = await Promise.allSettled(
      state.chartOrder.map(id => runAnalysis(dsId, state.charts[id].params))
    );
    ({ nextState: state } = finalizeReanalysis(state, { points, analysisResults }));
    commitWorkspace(state);
  } catch (err) {
    setState(setError(state, err.message));
    commitNotice(state);
  }
}

/* ===Event handlers ===*/
root.addEventListener("click", async (e) => {
  const handledWorkspaceClick = handleWorkspaceClick(e, {
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
  });

  const t = e.target.closest("[data-action]");
  if (!t) {
    if (state.dataPrep.activePanel && !e.target.closest('.prep-panel') && !e.target.closest('.prep-transform-toolbar')) {
      commit(closeActivePanel(state));
      return;
    }
    if (handledWorkspaceClick) return;
    return;
  }
  if (handledWorkspaceClick) return;

  const handledAppClick = await handleAppClick(e, {
    state,
    root,
    setState,
    render,
    commit,
    commitChart,
    commitContextMenu,
    commitRecipeRail,
    patchUi,
    navigate,
    fetchPoints,
    fetchColumns,
    createTable,
    setPrepParsedData,
    loadPrepPoints,
    setPrepError,
    resetAxis,
    closeContextMenu,
    setActiveChipEditor,
    selectPrepDataset,
    setColumns,
    deleteDataset,
    fetchDatasets,
    deletePrepDataset,
    setDatasets,
    loadDatasetById,
    setExpandedProfileColumn,
  });
  if (handledAppClick) return;

  const handledPrepClick = await handlePrepClick(e, {
    state,
    root,
    documentRef: document,
    windowRef: window,
    setState,
    render,
    commit,
    createDataset,
    fetchDatasets,
    setDatasets,
    setPrepError,
    markPrepSaved,
    clearPrepTransforms,
    setActivePanel,
    closeActivePanel,
    toggleRowExclusion,
    updateColumnMeta,
    addColumnMeta,
    addPrepTransform,
    setPrepTable,
    setColumns,
    setProfileCache,
    undoPrepTransform,
    undoPrepTransformTo,
    replayPrepTransforms,
    filterRows,
    findReplace,
    removeDuplicates,
    handleMissing,
    cleanText,
    renameColumn,
    changeColumnType,
    addCalculatedColumn,
    recodeValues,
    binColumn,
    splitColumn,
    concatColumns,
  });
  if (handledPrepClick) return;
});

root.addEventListener("keydown", (e) => {
  handleAppKeydown(e, {
    root,
    state,
    documentRef: document,
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
    selectPoint,
    render,
  });
});

setupDragInteractions({
  root,
  documentRef: document,
  getState: () => state,
  chartRuntime,
  collectChartIds,
  renderGhostRows,
  computeGridPreview,
  commitLayout,
  saveLayout,
  setColWeight,
  setRowWeight,
  buildChartData,
  insertChart,
  chartTypeLabels: CHART_TYPE_LABELS,
});

/* ===Pane titlebar right-click ---split/close context menu ===*/
let paneMenu = null;

function closePaneMenu() {
  if (paneMenu) { paneMenu.remove(); paneMenu = null; }
}

function showPaneContextMenu(x, y, chartId) {
  closePaneMenu();
  const isOnly = collectChartIds(state.chartLayout).length <= 1;
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
  // ---Pane titlebar right-click ---�?
  const titlebar = e.target.closest(".chart-pane-titlebar");
  if (titlebar) {
    e.preventDefault();
    const pane = titlebar.closest(".chart-pane[data-chart-id]");
    if (pane?.dataset.chartId) showPaneContextMenu(e.clientX, e.clientY, pane.dataset.chartId);
    return;
  }

  // ---Chart canvas right-click (existing behavior) ---�?
  if (e.defaultPrevented) return;
  const ch = e.target.closest(".chart-stage");
  if (!ch) return;
  e.preventDefault();
  const pane = ch.closest('.chart-pane[data-chart-id]');
  const next = pane && pane.dataset.chartId !== state.focusedChartId
    ? focusChart(state, pane.dataset.chartId)
    : state;
  const r = root.getBoundingClientRect();
  commitContextMenu(openContextMenu(next, e.clientX - r.left, e.clientY - r.top, { target: 'canvas', role: next.focusedChartId }));
});

/* ===Change handlers ===*/
root.addEventListener("change", async (e) => {
  // Prep panel conditional visibility
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
  // Phase 2 dynamic panel interactions
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
  // Phase 3: validate type conditional visibility
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
    // Update type conversion preview when column changes
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
    state = setLoadingState(state, true);
    render();
    try {
      // Client-side parse with PapaParse
      const parsed = await parseCSV(file);
      const arqueroTable = createTable(parsed.rows, parsed.columns);

      // Save to server (raw string rows, no derivation)
      const name = file.name.replace(/\.csv$/i, '');
      const newDs = await createDataset({
        name,
        columns: parsed.columns,
        rows: parsed.rows,
      });

      const datasets = await fetchDatasets();
      state = setDatasets(state, datasets);

      // Store parsed data in state for data prep
      state = setPrepParsedData(state, {
        rawRows: parsed.rows,
        arqueroTable,
        columns: parsed.columns,
      });

      await loadDatasetById(newDs.id);
    } catch (err) {
      state = setError(state, err.message);
      render();
    }
    return;
  }

  await handleAppChange(e, {
    state,
    root,
    setState,
    commit,
    commitRecipeRail,
    patchUi,
    setActiveChipEditor,
    setChartParams,
    setDatasets,
    setLoadingState,
    setError,
    createSlot,
    loadDatasetById,
    restoreLayout,
    fetchDatasets,
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
  return collectChartIds(state.chartLayout).length >= maxCharts;
}

/* ===Layout persistence ===*/
const LAYOUT_STORAGE_KEY = "super-spc-chart-layout";

function saveLayout() {
  try {
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
  } catch { /* localStorage unavailable or full ---silently ignore */ }
}

function restoreLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.chartOrder || !data.chartParams) return null;
    // Migrate legacy tree/flat formats to row-grid
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
    // Ensure weights exist (older saves may lack them)
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
    state = setDatasets(state, datasets);
    const id = datasets[0]?.id;
    if (!id) { state = setLoadingState(state, false); render(); return; }

    // Restore saved layout if it exists
    const saved = restoreLayout();
    if (saved && saved.chartOrder.length > 0) {
      // Rebuild charts from saved params
      const restoredCharts = {};
      for (const cid of saved.chartOrder) {
        restoredCharts[cid] = createSlot(saved.chartParams[cid] ? { params: saved.chartParams[cid] } : {});
      }
      state = {
        ...state,
        charts: restoredCharts,
        chartOrder: saved.chartOrder,
        nextChartId: saved.nextChartId || saved.chartOrder.length + 1,
        focusedChartId: saved.focusedChartId || saved.chartOrder[0],
        chartLayout: { rows: saved.rows, colWeights: saved.colWeights, rowWeights: saved.rowWeights },
      };
    }

    await loadDatasetById(id);
  } catch (err) {
    setState(setError(state, err.message));
    render();
  }
}

main();

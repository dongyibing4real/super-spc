/**
 * app.js — Application orchestrator.
 *
 * Owns: global state, render cycle, D3 chart lifecycle, event delegation, data loading.
 * Delegates rendering to views/ and components/ modules.
 */
import {
  clearNotice,
  closeContextMenu,
  createFindingFromSelection,
  createInitialState,
  deletePrepDataset,
  exportReport,
  failTransformStep,
  generateReportDraft,
  loadDataset,
  loadPrepPoints,
  moveSelection,
  navigate,
  openContextMenu,
  recoverTransformStep,
  selectFinding,
  selectPoint,
  selectPrepDataset,
  selectStructuralFinding,
  setFindingsChart,
  setStructuralFindings,
  setPrepError,
  setPrepSort,
  resetAxis,
  setChartLayout,
  setChallengerStatus,
  setDatasets,
  setError,
  setLoadingState,
  toggleDataTable,
  setXDomainOverride,
  setYDomainOverride,
  toggleChartOption,
  togglePointExclusion,
  toggleReportFailureMode,
  toggleTransform,
  setColumns,
  setChartParams,
  setActiveChipEditor,
  getPrimary,
  getFocused,
  setPrepParsedData,
  setPrepTable,
  addPrepTransform,
  markPrepSaved,
  setPrepHiddenColumns,
  undoPrepTransform,
  setActivePanel,
  closeActivePanel,
  focusChart,
  addChart,
  removeChart,
  resizeSplit,
  openChartPicker,
  closeChartPicker,
  collectChartIds,
} from "./core/state.js";
import { createChart } from "./components/chart/index.js";
import {
  createDataset, deleteDataset, fetchColumns, fetchDatasets, fetchPoints,
  runAnalysis, updateColumnRoles
} from "./data/api.js";
import { transformPoints, transformAnalysis, buildDefaultContext } from "./data/transforms.js";
import { parseCSV } from "./data/csv-engine.js";
import { createTable, filterRows, sortTable, findReplace, removeDuplicates, handleMissing, cleanText } from "./data/data-prep-engine.js";

import { getCapability, capClass, detectRuleViolations, applyParamsToContext } from "./helpers.js";
import { deriveWorkspace } from "./core/state.js";
import { renderSidebar } from "./components/sidebar.js";

import { renderNotice, renderLoadingState, renderErrorState, renderEmptyState } from "./components/notice.js";
import { renderRecipeRail } from "./components/recipe-rail.js";
import { renderContextMenu } from "./components/context-menu.js";
import { renderChartArena } from "./components/chart-arena.js";
import { renderWorkspace, renderEvidenceRail } from "./views/workspace.js";
import { renderDataPrep } from "./views/dataprep.js";
import { renderMethodLab } from "./views/methodlab.js";
import { renderFindings } from "./views/findings.js";
import { renderReports } from "./views/reports.js";
import { morphInner, morphEl } from "./core/morph.js";
import { generateFindings } from "./core/findings-engine.js";

/* ═══ Global state ═══ */
const root = document.getElementById("app");
let state = createInitialState();
let charts = { primary: null, challenger: null };

/* ═══ Unsaved changes guard ═══ */
window.addEventListener("beforeunload", (e) => {
  if (state.dataPrep.unsavedChanges) {
    e.preventDefault();
  }
});

/* ═══ Router ═══ */
function renderRoute() {
  if (state.loading) return renderLoadingState();
  if (state.error) return renderErrorState(state);
  if (state.points.length === 0 && !state.activeDatasetId) return renderEmptyState();

  switch (state.route) {
    case "dataprep": return renderDataPrep(state);
    case "methodlab": return renderMethodLab(state);
    case "findings": return renderFindings(state);
    case "reports": return renderReports(state);
    default: return renderWorkspace(state);
  }
}

/* ═══ Chart data builder ═══ */
function buildChartData(id) {
  const slot = state.charts[id];
  const hasChartValues = slot.chartValues && slot.chartValues.length > 0;

  // When the API returns chart values (subgroup stats, CUSUM sums, etc.),
  // use those as the plotted points instead of raw measurements.
  const points = hasChartValues
    ? slot.chartValues.map((v, i) => ({
        primaryValue: v,
        label: slot.chartLabels[i] || `pt-${i}`,
        subgroupLabel: slot.chartLabels[i] || `pt-${i}`,
        excluded: false,
        annotation: null,
        raw: {},
      }))
    : state.points;

  return {
    points,
    limits: slot.limits,
    phases: slot.phases || [],
    toggles: {
      ...state.chartToggles,
      overlay: false,
      xDomainOverride: slot.overrides.x,
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

/* ═══ Main render ═══ */
function render() {
  morphInner(root, `
    <div class="app-shell">
      ${renderSidebar(state)}
      <main class="main-shell">
        ${renderNotice(state)}
        ${renderRoute()}
      </main>
    </div>
  `);

  if (state.route === "workspace") {
    // Collect visible chart IDs from the layout tree
    const visibleIds = collectChartIds(state.chartLayout.tree);

    for (const id of visibleIds) {
      const mount = document.getElementById(`chart-mount-${id}`);
      if (!mount) continue;

      // Recreate chart if instance is missing or SVG is stale (e.g. after data table toggle)
      const svgStale = charts[id] && !charts[id].svg?.node()?.isConnected;
      if (!charts[id] || svgStale) {
        if (charts[id]) { charts[id].destroy(); charts[id] = null; }
        charts[id] = createChart(mount, {
          onSelectPoint: (index) => {
            state = focusChart(state, id);
            commitChart(selectPoint(state, index, id));
          },
          onContextMenu: (x, y, info) => {
            state = focusChart(state, id);
            commitContextMenu(openContextMenu(state, x, y, { ...info, role: id }));
          },
          onAxisDrag: (info) => {
            state = focusChart(state, id);
            if (info.axis === 'x') commitChart(setXDomainOverride(state, info.min, info.max, id));
            if (info.axis === 'y') commitChart(setYDomainOverride(state, info.yMin, info.yMax, id));
          },
          onAxisReset: (axis) => commitChart(resetAxis(state, axis, id)),
        });
      }
      charts[id].update(buildChartData(id));
    }

    requestAnimationFrame(() => {
      for (const id of visibleIds) {
        if (charts[id]) charts[id].update(buildChartData(id));
      }
    });

    // Destroy charts not visible in the tree
    for (const id of Object.keys(charts)) {
      if (!visibleIds.includes(id) && charts[id]) {
        charts[id].destroy();
        charts[id] = null;
      }
    }
  } else {
    for (const role of state.chartOrder) {
      if (charts[role]) { charts[role].destroy(); charts[role] = null; }
    }
  }
}

/* ═══ Commit functions ═══ */
function commit(next) { state = next; render(); }

function commitChart(next) {
  state = next;
  for (const id of state.chartOrder) {
    if (charts[id]) charts[id].update(buildChartData(id));
  }
  for (const id of state.chartOrder) {
    const paneCaps = root.querySelector(`.chart-pane[data-chart-id="${id}"] .pane-caps`);
    if (!paneCaps) continue;
    const cap = getCapability(state, id);
    if (cap.cpk) {
      paneCaps.innerHTML = `
        <span class="cap-item"><span class="cap-label">Cpk</span><span class="cap-value ${capClass(cap.cpk)}">${cap.cpk}</span></span>
        <span class="cap-item"><span class="cap-label">Ppk</span><span class="cap-value ${capClass(cap.ppk)}">${cap.ppk}</span></span>
      `;
    }
  }
  // Update focus visual
  root.querySelectorAll('.chart-pane').forEach(p => {
    p.classList.toggle('pane-focused', p.dataset.chartId === state.focusedChartId);
  });
}

function commitLayout(next) {
  state = next;
  // Full re-render for layout changes (tree structure may have changed)
  render();
}

function commitContextMenu(next) {
  state = next;
  const stage = root.querySelector(`#chart-mount-${state.focusedChartId}`);
  if (!stage) return;
  stage.querySelector(".context-menu")?.remove();

  if (state.ui.contextMenu) {
    const div = document.createElement("div");
    div.innerHTML = renderContextMenu(state);
    stage.appendChild(div.firstElementChild);
    stage.querySelector(".context-menu [role='menuitem']")?.focus();
  } else {
    stage.focus();
  }
}

/* ═══ Targeted commit — recipe rail (chip editors, layer toggles) ═══ */
function commitRecipeRail(next) {
  state = next;
  const rail = root.querySelector(".recipe-rail");
  if (!rail) return;
  morphEl(rail, renderRecipeRail(state));
}

/* ═══ Targeted commit — notice bar ═══ */
function commitNotice(next) {
  state = next;
  const existing = root.querySelector(".notice");
  if (existing) existing.remove();
  if (state.ui.notice) {
    const main = root.querySelector(".main-shell");
    if (main) main.insertAdjacentHTML("afterbegin", renderNotice(state));
  }
}

/* ═══ Targeted commit — full workspace (recipe rail + chart arena + chart data) ═══ */
function commitWorkspace(next) {
  state = next;

  // 1. Recipe rail
  const rail = root.querySelector(".recipe-rail");
  if (rail) morphEl(rail, renderRecipeRail(state));

  // 2. Chart toolbar title (shows focused chart info)
  const focused = getFocused(state);
  const title = root.querySelector(".toolbar-title h3");
  if (title) title.textContent = `${focused.context.metric.label} \u2014 ${focused.context.chartType.label}`;
  const windowEl = root.querySelector(".toolbar-window");
  if (windowEl) windowEl.textContent = focused.context.window;

  // 3. Pane method labels + capability badges
  for (const id of state.chartOrder) {
    const paneMethod = root.querySelector(`.chart-pane[data-chart-id="${id}"] .pane-method`);
    if (paneMethod) paneMethod.textContent = state.charts[id].context.chartType?.label || "";
    const paneCaps = root.querySelector(`.chart-pane[data-chart-id="${id}"] .pane-caps`);
    const cap = getCapability(state, id);
    if (paneCaps && cap.cpk) {
      paneCaps.innerHTML = `
        <span class="cap-item"><span class="cap-label">Cpk</span><span class="cap-value ${capClass(cap.cpk)}">${cap.cpk}</span></span>
        <span class="cap-item"><span class="cap-label">Ppk</span><span class="cap-value ${capClass(cap.ppk)}">${cap.ppk}</span></span>
      `;
    }
  }

  // 4. Update D3 charts
  for (const id of state.chartOrder) {
    if (charts[id]) charts[id].update(buildChartData(id));
  }

  // 5. Evidence rail
  const evidenceRail = root.querySelector(".evidence-rail");
  if (evidenceRail) {
    const workspace = deriveWorkspace(state);
    morphEl(evidenceRail, renderEvidenceRail(state, workspace));
  }
}

/* ═══ Targeted commit — evidence rail ═══ */
function commitEvidenceRail(next) {
  state = next;
  const rail = root.querySelector(".evidence-rail");
  if (!rail) return;
  const workspace = deriveWorkspace(state);
  morphEl(rail, renderEvidenceRail(state, workspace));
}

/* ═══ Slot builder — shared by loadDatasetById and reanalyze ═══ */
function buildSlots(analyses, baseContext) {
  const slots = {};
  state.chartOrder.forEach((id, i) => {
    const t = transformAnalysis(analyses[i]);
    slots[id] = {
      context: applyParamsToContext(baseContext, state.charts[id].params),
      limits: t.limits, capability: t.capability, violations: t.violations,
      sigma: t.sigma, zones: t.zones, chartValues: t.chartValues,
      chartLabels: t.chartLabels, phases: t.phases,
    };
  });
  return slots;
}

/* ═══ Data loading ═══ */
async function loadDatasetById(datasetId) {
  state = setLoadingState(state, true);
  render();
  try {
    // 1. Fetch data and columns first
    const [points, columns] = await Promise.all([
      fetchPoints(datasetId),
      fetchColumns(datasetId).catch(() => []),
    ]);
    state = setColumns(state, columns);

    // 2. Set initial column params from column roles (only if not already set)
    const valueName = columns.find(c => c.role === "value")?.name || null;
    const sgName = columns.find(c => c.role === "subgroup")?.name || null;
    const phName = columns.find(c => c.role === "phase")?.name || null;
    for (const id of state.chartOrder) {
      if (!state.charts[id].params.value_column) {
        state = setChartParams(state, id, { value_column: valueName, subgroup_column: sgName, phase_column: phName });
      }
    }

    // 3. Run analysis per chart with per-chart params (includes column overrides)
    const analyses = await Promise.all(
      state.chartOrder.map(id => runAnalysis(datasetId, state.charts[id].params))
    );
    const ds = state.datasets.find((d) => d.id === datasetId);
    const baseContext = ds ? buildDefaultContext(ds, columns) : getPrimary(state).context;
    const slots = buildSlots(analyses, baseContext);
    state = loadDataset(state, { points: transformPoints(points, columns), slots, datasetId });
    state = setStructuralFindings(state, generateFindings(state));
    render();
  } catch (err) {
    state = setError(state, err.message);
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
    const columns = state.columnConfig.columns;
    const ds = state.datasets.find((d) => d.id === dsId);
    const baseContext = ds ? buildDefaultContext(ds, columns) : getPrimary(state).context;

    // Build slots only for successful analyses; keep existing data for failed ones
    const slots = {};
    state.chartOrder.forEach((id, i) => {
      if (analysisResults[i].status === "fulfilled") {
        const t = transformAnalysis(analysisResults[i].value);
        slots[id] = {
          context: applyParamsToContext(baseContext, state.charts[id].params),
          limits: t.limits, capability: t.capability, violations: t.violations,
          sigma: t.sigma, zones: t.zones, chartValues: t.chartValues,
          chartLabels: t.chartLabels, phases: t.phases,
        };
      }
      // If rejected, slot is omitted — loadDataset will keep existing chart data
    });

    state = loadDataset(state, { points: transformPoints(points, columns), slots, datasetId: dsId });
    state = setStructuralFindings(state, generateFindings(state));
    commitWorkspace(state);
  } catch (err) {
    state = setError(state, err.message);
    commitNotice(state);
  }
}

/* ═══ Event handlers ═══ */
root.addEventListener("click", async (e) => {
  // Focus-on-click: clicking anywhere inside a chart pane focuses that chart
  const clickedPane = e.target.closest('.chart-pane[data-chart-id]');
  if (clickedPane) {
    const chartId = clickedPane.dataset.chartId;
    if (chartId && chartId !== state.focusedChartId && state.charts[chartId]) {
      state = focusChart(state, chartId);
      // Update focus visual + recipe rail + evidence rail
      root.querySelectorAll('.chart-pane').forEach(p => {
        p.classList.toggle('pane-focused', p.dataset.chartId === state.focusedChartId);
      });
      commitRecipeRail(state);
      commitEvidenceRail(state);
      // Update toolbar title
      const focused = getFocused(state);
      const titleEl = root.querySelector(".toolbar-title h3");
      if (titleEl) titleEl.textContent = `${focused.context.metric.label} \u2014 ${focused.context.chartType.label}`;
    }
  }

  const t = e.target.closest("[data-action]");
  if (!t) {
    if (state.activeChipEditor) commitRecipeRail(setActiveChipEditor(state, state.activeChipEditor));
    if (state.ui.contextMenu) commitContextMenu(closeContextMenu(state));
    if (state.dataPrep.activePanel && !e.target.closest('.prep-panel') && !e.target.closest('.prep-tool-btn')) {
      commit(closeActivePanel(state));
    }
    return;
  }
  const a = t.dataset.action;
  switch (a) {
    case "navigate": {
      commit(navigate(state, t.dataset.route));
      if (t.dataset.route === "dataprep" && state.dataPrep.selectedDatasetId && state.dataPrep.datasetPoints.length === 0) {
        try {
          const dsId = state.dataPrep.selectedDatasetId;
          const [pts, cols] = await Promise.all([
            fetchPoints(dsId),
            fetchColumns(dsId).catch(() => []),
          ]);
          const rawRows = pts.map(p => p.raw_data || {});
          const arqueroTable = createTable(rawRows, cols.length > 0 ? cols : state.columnConfig.columns);
          state = setPrepParsedData(state, { rawRows, arqueroTable, columns: cols.length > 0 ? cols : state.columnConfig.columns });
          state = loadPrepPoints(state, pts);
          render();
        } catch (err) { commit(setPrepError(state, err.message)); }
      }
      break;
    }
    case "select-point":       commitChart(selectPoint(state, Number(t.dataset.index))); break;
    case "toggle-chart": {
      const next = toggleChartOption(state, t.dataset.option);
      commitChart(next);
      if (state.ui.contextMenu) commitContextMenu(next);
      break;
    }
    case "exclude-point":      commitChart(togglePointExclusion(state, Number(t.dataset.index))); commitContextMenu(closeContextMenu(state)); break;
    case "toggle-transform":   commitEvidenceRail(toggleTransform(state, t.dataset.stepId)); break;
    case "fail-transform":     commitEvidenceRail(failTransformStep(state, t.dataset.stepId)); break;
    case "recover-transform":  commitEvidenceRail(recoverTransformStep(state, t.dataset.stepId)); break;
    case "set-challenger-status": commit(setChallengerStatus(state, t.dataset.status)); break;
    case "select-finding":     commit(selectFinding(state, t.dataset.findingId)); break;
    case "select-structural-finding": commit(selectStructuralFinding(state, t.dataset.findingId)); break;
    case "switch-findings-chart": {
      const cid = t.dataset.chartId;
      state = setFindingsChart(state, cid);
      state = setStructuralFindings(state, generateFindings(state, cid), cid);
      render();
      break;
    }
    case "create-finding":     commitEvidenceRail(createFindingFromSelection(state)); commitContextMenu(closeContextMenu(state)); break;
    case "generate-report":    commit(generateReportDraft(state)); break;
    case "export-report":      commit(exportReport(state)); break;
    case "toggle-export-failure": commit(toggleReportFailureMode(state)); break;
    case "clear-notice":       commitNotice(clearNotice(state)); break;
    case "toggle-data-table":  commit(toggleDataTable(state)); break;
    case "set-layout": {
      const arr = t.dataset.arrangement;
      const posMap = { horizontal: "left", vertical: "top", "primary-wide": "left", "primary-tall": "top", single: "left" };
      commitLayout(setChartLayout(state, arr, posMap[arr] || "left"));
      break;
    }
    case "add-chart": {
      commit(openChartPicker(state));
      break;
    }
    case "confirm-add-chart": {
      const typeSelect = root.querySelector('[data-field="picker-chart-type"]');
      const chartType = typeSelect ? typeSelect.value : "imr";
      state = addChart(state, { chartType, splitDirection: "row" });
      commit(state);
      // Trigger analysis for the new chart
      if (state.activeDatasetId) reanalyze();
      break;
    }
    case "cancel-add-chart": {
      commit(closeChartPicker(state));
      break;
    }
    case "remove-chart": {
      const chartId = t.dataset.chartId;
      if (chartId) {
        state = removeChart(state, chartId);
        // Destroy the D3 chart instance
        if (charts[chartId]) { charts[chartId].destroy(); delete charts[chartId]; }
        commit(state);
      }
      break;
    }
    case "reset-axis": { const axisRole = state.ui.contextMenu?.role || state.focusedChartId; commitChart(resetAxis(state, t.dataset.axis, axisRole)); commitContextMenu(closeContextMenu(state)); break; }
    case "toggle-chip-editor": {
      commitRecipeRail(setActiveChipEditor(state, t.dataset.chip));
      break;
    }
    case "select-prep-dataset": {
      const dsId = t.dataset.datasetId;
      commit(selectPrepDataset(state, dsId));
      try {
        const [pts, cols] = await Promise.all([
          fetchPoints(dsId),
          fetchColumns(dsId).catch(() => []),
        ]);
        state = setColumns(state, cols);
        state = loadPrepPoints(state, pts);
        // Build Arquero table from server data for transforms
        const rawRows = pts.map(p => p.raw_data || {});
        const arqueroTable = createTable(rawRows, cols);
        state = setPrepParsedData(state, { rawRows, arqueroTable, columns: cols });
        state = loadPrepPoints(state, pts);
        render();
      } catch (err) { commit(setPrepError(state, err.message)); }
      break;
    }
    case "delete-dataset": {
      const dsId = t.dataset.datasetId;
      if (!confirm("Delete this dataset? This cannot be undone.")) break;
      try {
        await deleteDataset(dsId);
        const datasets = await fetchDatasets();
        commit(deletePrepDataset(setDatasets(state, datasets), dsId));
      } catch (err) { commit(setPrepError(state, err.message)); }
      break;
    }
    case "load-prep-to-chart": {
      if (state.dataPrep.selectedDatasetId) {
        await loadDatasetById(state.dataPrep.selectedDatasetId);
        commit(navigate(state, "workspace"));
      }
      break;
    }
    case "sort-prep": {
      commit(setPrepSort(state, t.dataset.column));
      break;
    }
    case "toggle-column-visibility": {
      const col = t.dataset.column;
      const hidden = state.dataPrep.hiddenColumns || [];
      const next = hidden.includes(col) ? hidden.filter(c => c !== col) : [...hidden, col];
      commit(setPrepHiddenColumns(state, next));
      break;
    }
    case "prep-undo": {
      if (state.dataPrep.transforms.length > 0) {
        state = undoPrepTransform(state);
        // Replay transforms from original table
        if (state.dataPrep.rawRows && state.columnConfig.columns.length > 0) {
          let table = createTable(state.dataPrep.rawRows, state.columnConfig.columns);
          for (const tr of state.dataPrep.transforms) {
            try {
              table = applyTransform(table, tr);
            } catch { /* skip failed transforms */ }
          }
          state = setPrepTable(state, table);
          // Reset unsavedChanges based on transform count
          if (state.dataPrep.transforms.length === 0) {
            state = markPrepSaved(state);
          }
        }
        render();
      }
      break;
    }
    case "prep-trim": {
      const cols = state.columnConfig.columns.filter(c => c.dtype === 'text');
      if (cols.length > 0 && state.dataPrep.arqueroTable) {
        let table = state.dataPrep.arqueroTable;
        for (const c of cols) {
          try { table = cleanText(table, c.name, 'trim'); } catch { /* skip */ }
        }
        state = addPrepTransform(state, { type: 'trim', params: { columns: cols.map(c => c.name) } });
        state = setPrepTable(state, table);
        render();
      }
      break;
    }
    case "prep-save": {
      if (state.dataPrep.rawRows && state.dataPrep.selectedDatasetId) {
        try {
          await createDataset({
            name: state.datasets.find(d => d.id === state.dataPrep.selectedDatasetId)?.name + ' (cleaned)',
            columns: state.columnConfig.columns,
            rows: state.dataPrep.arqueroTable
              ? state.dataPrep.arqueroTable.objects().map(row => {
                  const out = {};
                  for (const [k, v] of Object.entries(row)) out[k] = v != null ? String(v) : '';
                  return out;
                })
              : state.dataPrep.rawRows,
          });
          const datasets = await fetchDatasets();
          state = setDatasets(state, datasets);
          state = markPrepSaved(state);
          render();
        } catch (err) {
          commit(setPrepError(state, err.message));
        }
      }
      break;
    }
    /* ═══ Panel toggle handlers ═══ */
    case "prep-filter": { commit(setActivePanel(state, 'filter')); break; }
    case "prep-find-replace": { commit(setActivePanel(state, 'find')); break; }
    case "prep-dedup": { commit(setActivePanel(state, 'dedup')); break; }
    case "prep-missing": { commit(setActivePanel(state, 'missing')); break; }
    /* ═══ Panel apply handlers ═══ */
    case "prep-apply-filter": {
      if (!state.dataPrep.arqueroTable) break;
      const col = root.querySelector('[data-field="filter-col"]')?.value;
      const op = root.querySelector('[data-field="filter-op"]')?.value;
      const val = root.querySelector('[data-field="filter-val"]')?.value;
      const val2 = root.querySelector('[data-field="filter-val2"]')?.value;
      if (!col || !op) break;
      const filterVal = op === 'between' ? [val, val2] : (op === 'is_null' || op === 'is_not_null') ? null : val;
      try {
        const table = filterRows(state.dataPrep.arqueroTable, col, op, filterVal);
        state = addPrepTransform(state, { type: 'filter', params: { column: col, operator: op, value: filterVal } });
        state = setPrepTable(state, table);
        state = closeActivePanel(state);
        render();
      } catch (err) { commit(setPrepError(state, err.message)); }
      break;
    }
    case "prep-apply-find": {
      if (!state.dataPrep.arqueroTable) break;
      const fcol = root.querySelector('[data-field="find-col"]')?.value;
      const search = root.querySelector('[data-field="find-search"]')?.value;
      const repl = root.querySelector('[data-field="find-replace"]')?.value ?? '';
      const useRegex = root.querySelector('[data-field="find-regex"]')?.checked || false;
      if (!search) break;
      try {
        let table = state.dataPrep.arqueroTable;
        if (fcol === '__all__') {
          for (const c of table.columnNames()) {
            try { table = findReplace(table, c, search, repl, useRegex); } catch { /* skip */ }
          }
        } else {
          table = findReplace(table, fcol, search, repl, useRegex);
        }
        state = addPrepTransform(state, { type: 'find_replace', params: { column: fcol, find: search, replace: repl, useRegex } });
        state = setPrepTable(state, table);
        state = closeActivePanel(state);
        render();
      } catch (err) { commit(setPrepError(state, err.message)); }
      break;
    }
    case "prep-apply-dedup": {
      if (!state.dataPrep.arqueroTable) break;
      const checked = [...root.querySelectorAll('[data-field="dedup-col"]:checked')].map(el => el.value);
      if (checked.length === 0) break;
      try {
        const table = removeDuplicates(state.dataPrep.arqueroTable, checked);
        state = addPrepTransform(state, { type: 'dedup', params: { keyColumns: checked } });
        state = setPrepTable(state, table);
        state = closeActivePanel(state);
        render();
      } catch (err) { commit(setPrepError(state, err.message)); }
      break;
    }
    case "prep-apply-missing": {
      if (!state.dataPrep.arqueroTable) break;
      const mcol = root.querySelector('[data-field="missing-col"]')?.value;
      const strat = root.querySelector('[data-field="missing-strategy"]')?.value;
      const custom = root.querySelector('[data-field="missing-custom"]')?.value;
      if (!mcol || !strat) break;
      try {
        const table = handleMissing(state.dataPrep.arqueroTable, mcol, strat, custom || null);
        state = addPrepTransform(state, { type: 'missing', params: { column: mcol, strategy: strat, customValue: custom || null } });
        state = setPrepTable(state, table);
        state = closeActivePanel(state);
        render();
      } catch (err) { commit(setPrepError(state, err.message)); }
      break;
    }
  }
});

/** Apply a single transform to an Arquero table. */
function applyTransform(table, tr) {
  switch (tr.type) {
    case 'filter': return filterRows(table, tr.params.column, tr.params.operator, tr.params.value);
    case 'sort': return sortTable(table, tr.params.sortSpec);
    case 'find_replace': {
      if (tr.params.column === '__all__') {
        let t = table;
        for (const c of t.columnNames()) {
          try { t = findReplace(t, c, tr.params.find, tr.params.replace, tr.params.useRegex); } catch { /* skip */ }
        }
        return t;
      }
      return findReplace(table, tr.params.column, tr.params.find, tr.params.replace, tr.params.useRegex);
    }
    case 'dedup': return removeDuplicates(table, tr.params.keyColumns);
    case 'missing': return handleMissing(table, tr.params.column, tr.params.strategy, tr.params.customValue);
    case 'trim': {
      let t = table;
      for (const col of tr.params.columns) { try { t = cleanText(t, col, 'trim'); } catch { /* skip */ } }
      return t;
    }
    default: return table;
  }
}

root.addEventListener("keydown", (e) => {
  if (state.ui.contextMenu && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    e.preventDefault();
    const menu = root.querySelector(".context-menu");
    if (!menu) return;
    const items = Array.from(menu.querySelectorAll("[role='menuitem']"));
    const idx = items.indexOf(document.activeElement);
    const next = e.key === "ArrowDown"
      ? items[(idx + 1) % items.length]
      : items[(idx - 1 + items.length) % items.length];
    next?.focus();
    return;
  }

  const ch = e.target.closest("[data-chart-focus], [data-action='select-point']");
  if (!ch) return;
  if (e.key === "ArrowRight") { e.preventDefault(); commitChart(moveSelection(state, 1)); }
  if (e.key === "ArrowLeft") { e.preventDefault(); commitChart(moveSelection(state, -1)); }
  if (e.key === "Enter" && e.target.matches("[data-action='select-point']")) { e.preventDefault(); commitChart(selectPoint(state, Number(e.target.dataset.index))); }
  if (e.key === "F10" && e.shiftKey) { e.preventDefault(); commitContextMenu(openContextMenu(state, 400, 200)); }
  if (e.key === "Escape" && state.ui.contextMenu) commitContextMenu(closeContextMenu(state));
});

/* ═══ Drag-to-arrange chart panes (Phase 2 — simplified for now) ═══ */
// Drag-to-rearrange is deferred to Phase 2. For now, pane titlebars
// serve as focus targets only. The grip icon hints at future drag capability.

/* ═══ Resize split divider (tree-path-aware) ═══ */
let dividerDrag = null;

root.addEventListener("pointerdown", (e) => {
  const divider = e.target.closest(".split-divider");
  if (!divider) return;
  e.preventDefault();
  divider.setPointerCapture(e.pointerId);
  const container = divider.closest(".split-container");
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const isHoriz = divider.dataset.direction === "horizontal";
  const path = divider.dataset.path ? divider.dataset.path.split(".").map(Number) : [];
  divider.classList.add("active");
  document.body.style.cursor = isHoriz ? "col-resize" : "row-resize";
  dividerDrag = { divider, container, rect, isHoriz, path, pointerId: e.pointerId };
});

root.addEventListener("pointermove", (e) => {
  if (!dividerDrag) return;
  const { rect, isHoriz, container } = dividerDrag;
  const minPx = state.chartLayout.minPaneSize || 300;
  const totalPx = isHoriz ? rect.width : rect.height;
  const minRatio = Math.min(0.2, minPx / totalPx);
  let ratio;
  if (isHoriz) {
    ratio = Math.max(minRatio, Math.min(1 - minRatio, (e.clientX - rect.left) / rect.width));
    container.style.gridTemplateColumns = `${ratio}fr ${1 - ratio}fr`;
  } else {
    ratio = Math.max(minRatio, Math.min(1 - minRatio, (e.clientY - rect.top) / rect.height));
    container.style.gridTemplateRows = `${ratio}fr ${1 - ratio}fr`;
  }
  dividerDrag.lastRatio = ratio;
});

function endDividerDrag() {
  if (!dividerDrag) return;
  const { divider, lastRatio, path } = dividerDrag;
  divider.classList.remove("active");
  document.body.style.cursor = "";
  if (lastRatio != null) {
    state = resizeSplit(state, path, [lastRatio, 1 - lastRatio]);
  }
  dividerDrag = null;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      for (const id of state.chartOrder) {
        if (charts[id]) charts[id].update(buildChartData(id));
      }
    });
  });
}

root.addEventListener("pointerup", endDividerDrag);
root.addEventListener("pointercancel", endDividerDrag);

root.addEventListener("contextmenu", (e) => {
  if (e.defaultPrevented) return;
  const ch = e.target.closest(".chart-stage");
  if (!ch) return;
  e.preventDefault();
  // Focus the chart pane that was right-clicked
  const pane = ch.closest('.chart-pane[data-chart-id]');
  if (pane && pane.dataset.chartId !== state.focusedChartId) {
    state = focusChart(state, pane.dataset.chartId);
  }
  const r = root.getBoundingClientRect();
  commitContextMenu(openContextMenu(state, e.clientX - r.left, e.clientY - r.top, { target: 'canvas', role: state.focusedChartId }));
});

/* ═══ Change handlers ═══ */
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

  if (e.target.matches('[data-action="switch-dataset"]')) {
    loadDatasetById(e.target.value);
    return;
  }


  const action = e.target.dataset?.action;
  if (!action || !state.activeDatasetId) return;
  const dsId = state.activeDatasetId;
  const cols = state.columnConfig.columns;

  // Determine which chart this action targets by prefix (e.g. "chart-1-set-chart-type")
  let chartId = null;
  let baseAction = action;
  for (const id of state.chartOrder) {
    if (action.startsWith(id + "-")) {
      chartId = id;
      baseAction = action.slice(id.length + 1);
      break;
    }
  }

  if (chartId && baseAction === "set-metric-column") {
    state = setChartParams(state, chartId, { value_column: e.target.value || null });
    state = setActiveChipEditor(state, null);
    await reanalyze();
    return;
  }
  if (chartId && baseAction === "set-subgroup-column") {
    state = setChartParams(state, chartId, { subgroup_column: e.target.value || null });
    state = setActiveChipEditor(state, null);
    await reanalyze();
    return;
  }
  if (chartId && baseAction === "set-phase-column") {
    state = setChartParams(state, chartId, { phase_column: e.target.value || null });
    state = setActiveChipEditor(state, null);
    await reanalyze();
    return;
  }
  if (chartId && baseAction === "set-chart-type") {
    state = setChartParams(state, chartId, { chart_type: e.target.value });
    state = setActiveChipEditor(state, null);
    await reanalyze();
    return;
  }
  if (chartId && baseAction === "set-sigma-method") {
    state = setChartParams(state, chartId, { sigma_method: e.target.value });
    state = setActiveChipEditor(state, null);
    await reanalyze();
    return;
  }
  if (chartId && baseAction === "toggle-nelson") {
    const ruleId = Number(e.target.dataset.value);
    const current = state.charts[chartId].params.nelson_tests || [];
    const next = e.target.checked ? [...current, ruleId] : current.filter((r) => r !== ruleId);
    state = setChartParams(state, chartId, { nelson_tests: next });
    await reanalyze();
    return;
  }
  if (chartId && baseAction === "set-k-sigma") {
    const k = parseFloat(e.target.value);
    if (k > 0 && k <= 6) {
      state = setChartParams(state, chartId, { k_sigma: k });
      await reanalyze();
    }
    return;
  }
});

/* ═══ Retry handler ═══ */
root.addEventListener("click", (e) => {
  const t = e.target.closest('[data-action="retry-load"]');
  if (!t) return;
  main();
});

/* ═══ Boot ═══ */
render();

async function main() {
  try {
    const datasets = await fetchDatasets();
    state = setDatasets(state, datasets);
    const id = datasets[0]?.id;
    if (!id) { state = setLoadingState(state, false); render(); return; }
    await loadDatasetById(id);
  } catch (err) {
    state = setError(state, err.message);
    render();
  }
}

main();

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
  setChallengerStatus,
  setDatasets,
  setError,
  setLoadingState,
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
  updateColumnMeta,
  addColumnMeta,
  toggleRowExclusion,
  clearAllExclusions,
  setProfileCache,
  focusChart,
  addChart,
  removeChart,
  collectChartIds,
  createSlot,
  insertChart,
  computeGridPreview,
  migrateTreeToRows,
  togglePaneDataTable,
} from "./core/state.js";
import { createChart } from "./components/chart/index.js";
import {
  createDataset, deleteDataset, fetchColumns, fetchDatasets, fetchPoints,
  runAnalysis, updateColumnRoles
} from "./data/api.js";
import { transformPoints, transformAnalysis, buildDefaultContext } from "./data/transforms.js";
import { parseCSV } from "./data/csv-engine.js";
import { createTable, filterRows, sortTable, findReplace, removeDuplicates, handleMissing, cleanText, renameColumn, changeColumnType, previewTypeConversion, addCalculatedColumn, recodeValues, binColumn, splitColumn, concatColumns } from "./data/data-prep-engine.js";

import { getCapability, capClass, detectRuleViolations, applyParamsToContext, CHART_TYPE_LABELS } from "./helpers.js";
import { deriveWorkspace } from "./core/state.js";
import { renderSidebar } from "./components/sidebar.js";

import { renderNotice, renderLoadingState, renderErrorState, renderEmptyState } from "./components/notice.js";
import { renderRecipeRail } from "./components/recipe-rail.js";
import { renderContextMenu } from "./components/context-menu.js";
import { renderChartArena, renderGhostRows } from "./components/chart-arena.js";
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
    const visibleIds = collectChartIds(state.chartLayout);

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
  saveLayout();
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

  // 2. Pane method labels + capability badges
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
    const p = state.charts[id].params;
    const t = transformAnalysis(analyses[i], p.usl, p.lsl);
    slots[id] = {
      context: applyParamsToContext(baseContext, p),
      limits: { ...t.limits, target: p.target ?? null }, capability: t.capability, violations: t.violations,
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
        const p = state.charts[id].params;
        const t = transformAnalysis(analysisResults[i].value, p.usl, p.lsl);
        slots[id] = {
          context: applyParamsToContext(baseContext, p),
          limits: { ...t.limits, target: p.target ?? null }, capability: t.capability, violations: t.violations,
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
    case "toggle-pane-table": {
      const cid = t.dataset.chartId;
      if (cid) commit(togglePaneDataTable(state, cid));
      break;
    }
    case "focus-chart": {
      const cid = t.dataset.chartId;
      if (cid && cid !== state.focusedChartId && state.charts[cid]) {
        state = focusChart(state, cid);
        commit(state);
      }
      break;
    }
    case "add-chart-from-rail": {
      // Split focused pane horizontally, clone focused chart type
      const focusedType = getFocused(state).params.chart_type;
      state = addChart(state, { chartType: focusedType });
      commit(state);
      saveLayout();
      if (state.activeDatasetId) reanalyze();
      break;
    }
    case "remove-chart": {
      const chartId = t.dataset.chartId;
      if (chartId) {
        state = removeChart(state, chartId);
        if (charts[chartId]) { charts[chartId].destroy(); delete charts[chartId]; }
        commit(state);
        saveLayout();
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
        // Apply row exclusions from data prep to chart points
        const excludedSet = new Set(state.dataPrep.excludedRows || []);
        if (excludedSet.size > 0 && state.points.length > 0) {
          state = {
            ...state,
            points: state.points.map((p, i) => excludedSet.has(i) ? { ...p, excluded: true } : p),
          };
        }
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
        // Replay transforms from original table using original columns
        const origCols = state.dataPrep.originalColumns || state.columnConfig.columns;
        if (state.dataPrep.rawRows && origCols.length > 0) {
          let table = createTable(state.dataPrep.rawRows, origCols);
          let columns = origCols.map(c => ({ ...c }));
          for (const tr of state.dataPrep.transforms) {
            try {
              table = applyTransform(table, tr);
              // Rebuild column metadata for Phase 2 transforms
              if (tr.type === 'rename') {
                columns = columns.map(c => c.name === tr.params.oldName ? { ...c, name: tr.params.newName } : c);
              } else if (tr.type === 'change_type') {
                columns = columns.map(c => c.name === tr.params.column ? { ...c, dtype: tr.params.targetType } : c);
              } else if (tr.type === 'calculated' || tr.type === 'bin' || tr.type === 'concat') {
                columns.push({ name: tr.params.newColName, dtype: tr.type === 'bin' ? 'text' : tr.type === 'concat' ? 'text' : 'numeric', role: null, ordinal: columns.length });
              } else if (tr.type === 'split') {
                for (let i = 0; i < tr.params.maxParts; i++) {
                  columns.push({ name: `${tr.params.column}_${i + 1}`, dtype: 'text', role: null, ordinal: columns.length });
                }
              } else if (tr.type === 'recode' && tr.params.newColName) {
                columns.push({ name: tr.params.newColName, dtype: 'text', role: null, ordinal: columns.length });
              }
            } catch { /* skip failed transforms */ }
          }
          state = setPrepTable(state, table);
          state = setColumns(state, columns);
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
    case "prep-rename": { commit(setActivePanel(state, 'rename')); break; }
    case "prep-change-type": { commit(setActivePanel(state, 'change_type')); break; }
    case "prep-calc": { commit(setActivePanel(state, 'calculated')); break; }
    case "prep-recode": { commit(setActivePanel(state, 'recode')); break; }
    case "prep-bin": { commit(setActivePanel(state, 'bin')); break; }
    case "prep-split": { commit(setActivePanel(state, 'split')); break; }
    case "prep-concat": { commit(setActivePanel(state, 'concat')); break; }
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
    /* ═══ Phase 2 apply handlers ═══ */
    case "prep-apply-rename": {
      if (!state.dataPrep.arqueroTable) break;
      const oldName = root.querySelector('[data-field="rename-col"]')?.value;
      const newName = root.querySelector('[data-field="rename-new"]')?.value?.trim();
      if (!oldName || !newName) break;
      const existing = state.columnConfig.columns.map(c => c.name);
      if (existing.includes(newName)) { commit(setPrepError(state, `Column "${newName}" already exists`)); break; }
      try {
        const table = renameColumn(state.dataPrep.arqueroTable, oldName, newName);
        state = addPrepTransform(state, { type: 'rename', params: { oldName, newName } });
        state = setPrepTable(state, table);
        state = updateColumnMeta(state, oldName, { name: newName });
        state = closeActivePanel(state);
        render();
      } catch (err) { commit(setPrepError(state, err.message)); }
      break;
    }
    case "prep-apply-change-type": {
      if (!state.dataPrep.arqueroTable) break;
      const tcol = root.querySelector('[data-field="type-col"]')?.value;
      const targetType = root.querySelector('[data-field="type-target"]')?.value;
      if (!tcol || !targetType) break;
      try {
        const table = changeColumnType(state.dataPrep.arqueroTable, tcol, targetType);
        state = addPrepTransform(state, { type: 'change_type', params: { column: tcol, targetType } });
        state = setPrepTable(state, table);
        state = updateColumnMeta(state, tcol, { dtype: targetType });
        state = closeActivePanel(state);
        render();
      } catch (err) { commit(setPrepError(state, err.message)); }
      break;
    }
    case "prep-apply-calc": {
      if (!state.dataPrep.arqueroTable) break;
      const calcName = root.querySelector('[data-field="calc-name"]')?.value?.trim();
      const calcExpr = root.querySelector('[data-field="calc-expr"]')?.value?.trim();
      if (!calcName || !calcExpr) break;
      const colNames = state.columnConfig.columns.map(c => c.name);
      if (colNames.includes(calcName)) { commit(setPrepError(state, `Column "${calcName}" already exists`)); break; }
      try {
        const table = addCalculatedColumn(state.dataPrep.arqueroTable, calcName, calcExpr, colNames);
        state = addPrepTransform(state, { type: 'calculated', params: { newColName: calcName, expression: calcExpr, columns: colNames } });
        state = setPrepTable(state, table);
        state = addColumnMeta(state, [{ name: calcName, dtype: 'numeric' }]);
        state = closeActivePanel(state);
        render();
      } catch (err) { commit(setPrepError(state, err.message)); }
      break;
    }
    case "prep-apply-recode": {
      if (!state.dataPrep.arqueroTable) break;
      const rcol = root.querySelector('[data-field="recode-col"]')?.value;
      const asNew = root.querySelector('[data-field="recode-new-col"]')?.checked;
      const newColName = asNew ? root.querySelector('[data-field="recode-new-name"]')?.value?.trim() : null;
      if (!rcol) break;
      if (asNew && !newColName) break;
      // Read mapping rows
      const mapping = {};
      const rows = root.querySelectorAll('.prep-mapping-row');
      rows.forEach(row => {
        const oldVal = row.querySelector('[data-field="recode-old"]')?.value;
        const newVal = row.querySelector('[data-field="recode-new"]')?.value;
        if (oldVal != null && oldVal !== '') mapping[oldVal] = newVal ?? '';
      });
      if (Object.keys(mapping).length === 0) break;
      try {
        const table = recodeValues(state.dataPrep.arqueroTable, rcol, mapping, newColName);
        state = addPrepTransform(state, { type: 'recode', params: { column: rcol, mapping, newColName } });
        state = setPrepTable(state, table);
        if (newColName) state = addColumnMeta(state, [{ name: newColName, dtype: 'text' }]);
        state = closeActivePanel(state);
        render();
      } catch (err) { commit(setPrepError(state, err.message)); }
      break;
    }
    case "prep-apply-bin": {
      if (!state.dataPrep.arqueroTable) break;
      const bcol = root.querySelector('[data-field="bin-col"]')?.value;
      const binCount = parseInt(root.querySelector('[data-field="bin-count"]')?.value || '5', 10);
      const useCustom = root.querySelector('[data-field="bin-custom"]')?.checked;
      const binName = root.querySelector('[data-field="bin-name"]')?.value?.trim() || `${bcol}_binned`;
      let customBreaks = null;
      if (useCustom) {
        const breaksStr = root.querySelector('[data-field="bin-breaks"]')?.value || '';
        customBreaks = breaksStr.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n)).sort((a, b) => a - b);
        if (customBreaks.length === 0) { commit(setPrepError(state, 'Enter valid break values')); break; }
      }
      if (!bcol) break;
      try {
        const table = binColumn(state.dataPrep.arqueroTable, bcol, binCount, binName, customBreaks);
        state = addPrepTransform(state, { type: 'bin', params: { column: bcol, binCount, newColName: binName, customBreaks } });
        state = setPrepTable(state, table);
        state = addColumnMeta(state, [{ name: binName, dtype: 'text' }]);
        state = closeActivePanel(state);
        render();
      } catch (err) { commit(setPrepError(state, err.message)); }
      break;
    }
    case "prep-apply-split": {
      if (!state.dataPrep.arqueroTable) break;
      const scol = root.querySelector('[data-field="split-col"]')?.value;
      const delim = root.querySelector('[data-field="split-delim"]')?.value || ',';
      const maxParts = parseInt(root.querySelector('[data-field="split-parts"]')?.value || '2', 10);
      if (!scol) break;
      try {
        const table = splitColumn(state.dataPrep.arqueroTable, scol, delim, maxParts);
        state = addPrepTransform(state, { type: 'split', params: { column: scol, delimiter: delim, maxParts } });
        state = setPrepTable(state, table);
        const newCols = Array.from({ length: maxParts }, (_, i) => ({ name: `${scol}_${i + 1}`, dtype: 'text' }));
        state = addColumnMeta(state, newCols);
        state = closeActivePanel(state);
        render();
      } catch (err) { commit(setPrepError(state, err.message)); }
      break;
    }
    case "prep-apply-concat": {
      if (!state.dataPrep.arqueroTable) break;
      const concatCols = [...root.querySelectorAll('[data-field="concat-col"]:checked')].map(el => el.value);
      const sep = root.querySelector('[data-field="concat-sep"]')?.value ?? ' ';
      const cname = root.querySelector('[data-field="concat-name"]')?.value?.trim() || 'combined';
      if (concatCols.length < 2) break;
      try {
        const table = concatColumns(state.dataPrep.arqueroTable, concatCols, sep, cname);
        state = addPrepTransform(state, { type: 'concat', params: { columns: concatCols, separator: sep, newColName: cname } });
        state = setPrepTable(state, table);
        state = addColumnMeta(state, [{ name: cname, dtype: 'text' }]);
        state = closeActivePanel(state);
        render();
      } catch (err) { commit(setPrepError(state, err.message)); }
      break;
    }
    case "prep-recode-add-row": {
      const container = root.querySelector('.prep-mapping-rows');
      if (container) {
        const row = document.createElement('div');
        row.className = 'prep-mapping-row';
        row.innerHTML = `<input type="text" data-field="recode-old" placeholder="old value" /><span class="prep-panel-label">\u2192</span><input type="text" data-field="recode-new" placeholder="new value" />`;
        container.appendChild(row);
      }
      break;
    }
    /* ═══ Phase 3 handlers ═══ */
    case "prep-validate": { commit(setActivePanel(state, 'validate')); break; }
    case "toggle-row-exclude": {
      const rowIdx = Number(t.dataset.row);
      if (!isNaN(rowIdx)) {
        commit(toggleRowExclusion(state, rowIdx));
      }
      break;
    }
    case "prep-restore-all": {
      commit(clearAllExclusions(state));
      break;
    }
    case "prep-apply-validate": {
      const vcol = root.querySelector('[data-field="validate-col"]')?.value;
      const vtype = root.querySelector('[data-field="validate-type"]')?.value;
      if (!vcol || !vtype) break;
      let rule;
      if (vtype === 'range') {
        const min = root.querySelector('[data-field="validate-min"]')?.value;
        const max = root.querySelector('[data-field="validate-max"]')?.value;
        rule = { type: 'range', min: min !== '' ? Number(min) : null, max: max !== '' ? Number(max) : null };
      } else if (vtype === 'allowed') {
        const valStr = root.querySelector('[data-field="validate-values"]')?.value || '';
        rule = { type: 'allowed', values: valStr.split(',').map(s => s.trim()).filter(Boolean) };
      } else if (vtype === 'regex') {
        const pattern = root.querySelector('[data-field="validate-pattern"]')?.value || '';
        rule = { type: 'regex', pattern };
      }
      if (rule) {
        state = updateColumnMeta(state, vcol, { validation: rule });
        state = closeActivePanel(state);
        render();
      }
      break;
    }
    case "prep-clear-validate": {
      const vcol = root.querySelector('[data-field="validate-col"]')?.value;
      if (vcol) {
        state = updateColumnMeta(state, vcol, { validation: null });
        state = closeActivePanel(state);
        render();
      }
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
    // Phase 2
    case 'rename': return renameColumn(table, tr.params.oldName, tr.params.newName);
    case 'change_type': return changeColumnType(table, tr.params.column, tr.params.targetType);
    case 'calculated': return addCalculatedColumn(table, tr.params.newColName, tr.params.expression, tr.params.columns);
    case 'recode': return recodeValues(table, tr.params.column, tr.params.mapping, tr.params.newColName);
    case 'bin': return binColumn(table, tr.params.column, tr.params.binCount, tr.params.newColName, tr.params.customBreaks);
    case 'split': return splitColumn(table, tr.params.column, tr.params.delimiter, tr.params.maxParts);
    case 'concat': return concatColumns(table, tr.params.columns, tr.params.separator, tr.params.newColName);
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

/* ═══ Header drag — zone-inference + ghost preview ═══ */
let pendingDrag = null;  // recorded on pointerdown, promoted to dragState after threshold
let dragState = null;
let ghostOverlay = null;
let ghostRafId = null;

/** Compute drop zone with hysteresis to prevent flickering at boundaries */
function getDropZone(paneEl, clientX, clientY, prevZone) {
  const r = paneEl.getBoundingClientRect();
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
  const relX = (clientX - r.left) / r.width;
  const relY = (clientY - r.top) / r.height;
  let zone;
  if (relY < 0.25) zone = "top";
  else if (relY > 0.75) zone = "bottom";
  else if (relX < 0.25) zone = "left";
  else if (relX > 0.75) zone = "right";
  else zone = "center";

  // DRAG-006: hysteresis — stay on previous zone if cursor is within 15px of a boundary
  if (prevZone && prevZone !== zone) {
    const HYSTERESIS = 15;
    const topB = r.top + r.height * 0.25;
    const botB = r.bottom - r.height * 0.25;
    const lefB = r.left + r.width * 0.25;
    const rigB = r.right - r.width * 0.25;
    const nearBoundary =
      Math.abs(clientY - topB) < HYSTERESIS ||
      Math.abs(clientY - botB) < HYSTERESIS ||
      Math.abs(clientX - lefB) < HYSTERESIS ||
      Math.abs(clientX - rigB) < HYSTERESIS;
    if (nearBoundary) return prevZone;
  }
  return zone;
}

// DRAG-005: rAF-throttled overlay update
function updateGhostOverlay(ghostRows, incomingId) {
  if (!ghostOverlay || !ghostRows) return;
  if (ghostRafId) cancelAnimationFrame(ghostRafId);
  ghostRafId = requestAnimationFrame(() => {
    ghostOverlay.innerHTML = renderGhostRows(ghostRows, incomingId);
    ghostOverlay.style.display = "flex";
    ghostRafId = null;
  });
}

function hideGhostOverlay() {
  if (ghostRafId) { cancelAnimationFrame(ghostRafId); ghostRafId = null; }
  if (ghostOverlay) ghostOverlay.style.display = "none";
}

function removeGhostOverlay() {
  if (ghostRafId) { cancelAnimationFrame(ghostRafId); ghostRafId = null; }
  if (ghostOverlay) { ghostOverlay.remove(); ghostOverlay = null; }
}

root.addEventListener("pointerdown", (e) => {
  // ── Header drag — record pending, promote after 4px threshold (DRAG-003) ──
  const handle = e.target.closest("[data-drag-handle]");
  if (!handle) return;
  if (state.chartOrder.length < 2) return;
  const pane = handle.closest(".chart-pane");
  if (!pane) return;
  if (e.target.closest("button")) return;

  e.preventDefault();
  pendingDrag = { chartId: handle.dataset.dragHandle, pane, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
});

root.addEventListener("pointermove", (e) => {
  // ── Promote pending drag once 4px threshold is crossed (DRAG-003) ──
  if (pendingDrag && !dragState) {
    const dx = e.clientX - pendingDrag.startX;
    const dy = e.clientY - pendingDrag.startY;
    if (Math.sqrt(dx * dx + dy * dy) < 4) return;

    const { chartId, pane, pointerId } = pendingDrag;
    pendingDrag = null;

    // DRAG-001: capture pointer so fast moves don't lose events
    pane.setPointerCapture(pointerId);
    // DRAG-007: suppress text selection during drag
    document.body.style.userSelect = "none";

    // Ghost cursor follower — DRAG-008: use params.chart_type not context
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.textContent = CHART_TYPE_LABELS[state.charts[chartId]?.params?.chart_type] || "Chart";
    document.body.appendChild(ghost);
    pane.classList.add("dragging");

    // Ghost overlay on the arena
    const arenaEl = root.querySelector(".chart-arena");
    if (arenaEl) {
      ghostOverlay = document.createElement("div");
      ghostOverlay.className = "arena-ghost-overlay";
      ghostOverlay.style.display = "none";
      arenaEl.appendChild(ghostOverlay);
    }

    dragState = { chartId, pane, ghost, dropTarget: null, dropZone: null };

    // DRAG-004: show overlay immediately over source pane
    updateGhostOverlay(state.chartLayout.rows, chartId);
  }

  // ── Header drag: zone inference + ghost preview ──
  if (!dragState) return;
  const { ghost, chartId } = dragState;

  // Move cursor follower
  ghost.style.left = (e.clientX + 12) + "px";
  ghost.style.top = (e.clientY - 10) + "px";

  // Find target pane and zone (pass prevZone for hysteresis)
  let foundTarget = null;
  let foundZone = null;
  for (const p of root.querySelectorAll(".chart-pane:not(.dragging)")) {
    const zone = getDropZone(p, e.clientX, e.clientY, dragState.dropZone);
    if (zone) { foundTarget = p.dataset.chartId; foundZone = zone; break; }
  }

  dragState.dropTarget = foundTarget;
  dragState.dropZone = foundZone;

  if (foundTarget && foundZone) {
    const previewRows = computeGridPreview(state.chartLayout.rows, chartId, foundTarget, foundZone);
    updateGhostOverlay(previewRows, chartId);
  } else {
    // Back over source pane — show current layout with source highlighted
    updateGhostOverlay(state.chartLayout.rows, chartId);
  }
});

function endDrag() {
  pendingDrag = null;
  if (!dragState) return;
  const { pane, ghost, chartId, dropTarget, dropZone } = dragState;
  pane.classList.remove("dragging");
  ghost.remove();
  removeGhostOverlay();
  document.body.style.userSelect = ""; // DRAG-007: restore text selection

  if (dropTarget && dropZone && dropTarget !== chartId) {
    state = insertChart(state, chartId, dropTarget, dropZone);
    commitLayout(state);
    saveLayout();
  }
  dragState = null;
}

// DRAG-002: bind to document so release outside root is always caught
document.addEventListener("pointerup", () => { endDrag(); });
document.addEventListener("pointercancel", () => { endDrag(); });

/* ═══ Pane titlebar right-click — split/close context menu ═══ */
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
  // ── Pane titlebar right-click ──
  const titlebar = e.target.closest(".chart-pane-titlebar");
  if (titlebar) {
    e.preventDefault();
    const pane = titlebar.closest(".chart-pane[data-chart-id]");
    if (pane?.dataset.chartId) showPaneContextMenu(e.clientX, e.clientY, pane.dataset.chartId);
    return;
  }

  // ── Chart canvas right-click (existing behavior) ──
  if (e.defaultPrevented) return;
  const ch = e.target.closest(".chart-stage");
  if (!ch) return;
  e.preventDefault();
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
  if (chartId && baseAction === "set-usl") {
    const v = e.target.value.trim();
    state = setChartParams(state, chartId, { usl: v !== '' ? parseFloat(v) : null });
    await reanalyze();
    return;
  }
  if (chartId && baseAction === "set-lsl") {
    const v = e.target.value.trim();
    state = setChartParams(state, chartId, { lsl: v !== '' ? parseFloat(v) : null });
    await reanalyze();
    return;
  }
  if (chartId && baseAction === "set-target") {
    const v = e.target.value.trim();
    state = setChartParams(state, chartId, { target: v !== '' ? parseFloat(v) : null });
    await reanalyze();
    return;
  }
});

/* ═══ Retry handler ═══ */
root.addEventListener("click", (e) => {
  const t = e.target.closest('[data-action="retry-load"]');
  if (!t) return;
  main();
});

/* ═══ Layout persistence ═══ */
const LAYOUT_STORAGE_KEY = "super-spc-chart-layout";

function saveLayout() {
  try {
    const data = {
      rows: state.chartLayout.rows,
      chartOrder: state.chartOrder,
      focusedChartId: state.focusedChartId,
      nextChartId: state.nextChartId,
      chartParams: {},
    };
    for (const id of state.chartOrder) {
      data.chartParams[id] = state.charts[id]?.params || null;
    }
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(data));
  } catch { /* localStorage unavailable or full — silently ignore */ }
}

function restoreLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.chartOrder || !data.chartParams) return null;
    // Migrate legacy tree/flat formats to row-grid
    if (!data.rows) {
      data.rows = migrateTreeToRows(data).rows;
      if (!data.rows || data.rows.length === 0) {
        data.rows = [data.chartOrder];
      }
    }
    return data;
  } catch { return null; }
}

/* ═══ Boot ═══ */
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
        chartLayout: { rows: saved.rows },
      };
    }

    await loadDatasetById(id);
  } catch (err) {
    state = setError(state, err.message);
    render();
  }
}

main();

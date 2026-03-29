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
} from "./core/state.js";
import { createChart } from "./components/chart/index.js";
import {
  deleteDataset, fetchColumns, fetchDatasets, fetchPoints,
  runAnalysis, updateColumnRoles, uploadCsv
} from "./data/api.js";
import { transformPoints, transformAnalysis, buildDefaultContext } from "./data/transforms.js";

import { getCapability, capClass, detectRuleViolations, applyParamsToContext } from "./helpers.js";
import { deriveWorkspace } from "./core/state.js";
import { renderSidebar } from "./components/sidebar.js";

import { renderNotice, renderLoadingState, renderErrorState, renderEmptyState } from "./components/notice.js";
import { renderRecipeRail } from "./components/recipe-rail.js";
import { renderContextMenu } from "./components/context-menu.js";
import { CHART_MOUNT_PRIMARY, CHART_MOUNT_CHALLENGER, renderChartArena } from "./components/chart-arena.js";
import { renderWorkspace, renderEvidenceRail } from "./views/workspace.js";
import { renderDataPrep } from "./views/dataprep.js";
import { renderMethodLab } from "./views/methodlab.js";
import { renderFindings } from "./views/findings.js";
import { renderReports } from "./views/reports.js";
import { morphInner, morphEl } from "./core/morph.js";

/* ═══ Global state ═══ */
const root = document.getElementById("app");
let state = createInitialState();
let charts = { primary: null, challenger: null };

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
    const activeIds = state.chartOrder;

    for (const id of activeIds) {
      const mount = document.getElementById(id === "primary" ? CHART_MOUNT_PRIMARY : CHART_MOUNT_CHALLENGER);
      if (!mount) continue;

      // Recreate chart if instance is missing or SVG is stale (e.g. after data table toggle)
      const svgStale = charts[id] && !charts[id].svg?.node()?.isConnected;
      if (!charts[id] || svgStale) {
        if (charts[id]) { charts[id].destroy(); charts[id] = null; }
        charts[id] = createChart(mount, {
          onSelectPoint: (index) => commitChart(selectPoint(state, index, id)),
          onContextMenu: (x, y, info) => commitContextMenu(openContextMenu(state, x, y, { ...info, role: id })),
          onAxisDrag: (info) => {
            if (info.axis === 'x') commitChart(setXDomainOverride(state, info.min, info.max, id));
            if (info.axis === 'y') commitChart(setYDomainOverride(state, info.yMin, info.yMax, id));
          },
          onAxisReset: (axis) => commitChart(resetAxis(state, axis, id)),
        });
      }
      charts[id].update(buildChartData(id));
    }

    requestAnimationFrame(() => {
      for (const id of activeIds) {
        if (charts[id]) charts[id].update(buildChartData(id));
      }
    });

    // Destroy charts not in chartOrder
    for (const id of Object.keys(charts)) {
      if (!activeIds.includes(id) && charts[id]) {
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
    const paneCaps = root.querySelector(`.chart-pane[data-role="${id}"] .pane-caps`);
    if (!paneCaps) continue;
    const cap = getCapability(state, id);
    if (cap.cpk) {
      paneCaps.innerHTML = `
        <span class="cap-item"><span class="cap-label">Cpk</span><span class="cap-value ${capClass(cap.cpk)}">${cap.cpk}</span></span>
        <span class="cap-item"><span class="cap-label">Ppk</span><span class="cap-value ${capClass(cap.ppk)}">${cap.ppk}</span></span>
      `;
    }
  }
}

function commitLayout(next) {
  state = next;
  const arena = root.querySelector(".chart-arena");
  if (!arena) return;

  const hasChallenger = state.chartOrder.length > 1;
  const layout = state.chartLayout;
  const arrangement = hasChallenger ? layout.arrangement : "single";
  const ratio = layout.splitRatio ?? 0.5;
  const isHoriz = arrangement === "horizontal" || arrangement === "primary-wide" || arrangement === "challenger-wide";
  const isVert = arrangement === "vertical" || arrangement === "primary-tall" || arrangement === "challenger-tall";
  const showChallenger = hasChallenger && arrangement !== "single";

  if (showChallenger && isHoriz) {
    arena.style.gridTemplateColumns = `${ratio}fr auto ${1 - ratio}fr`;
    arena.style.gridTemplateRows = "1fr";
  } else if (showChallenger && isVert) {
    arena.style.gridTemplateColumns = "1fr";
    arena.style.gridTemplateRows = `${ratio}fr auto ${1 - ratio}fr`;
  } else {
    arena.style.gridTemplateColumns = "1fr";
    arena.style.gridTemplateRows = "1fr";
  }
  arena.dataset.layout = arrangement;

  const divider = arena.querySelector(".chart-divider");
  if (divider && showChallenger) {
    divider.style.display = "";
    divider.dataset.divider = isHoriz ? "horizontal" : "vertical";
  } else if (divider) {
    divider.style.display = "none";
  }

  const challengerPane = arena.querySelector('.chart-pane[data-role="challenger"]');
  if (challengerPane) challengerPane.style.display = showChallenger ? "" : "none";

  const primaryFirst = layout.primaryPosition === "left" || layout.primaryPosition === "top";
  const primaryPane = arena.querySelector('.chart-pane[data-role="primary"]');
  if (primaryPane && challengerPane && divider) {
    if (primaryFirst) {
      arena.insertBefore(primaryPane, arena.firstChild);
      arena.insertBefore(divider, challengerPane);
    } else {
      arena.insertBefore(challengerPane, arena.firstChild);
      arena.insertBefore(divider, primaryPane);
    }
  }

  root.querySelectorAll(".layout-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.arrangement === arrangement);
  });

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      for (const id of state.chartOrder) {
        if (charts[id]) charts[id].update(buildChartData(id));
      }
    });
  });
}

function commitContextMenu(next) {
  state = next;
  const stage = root.querySelector(`#${CHART_MOUNT_PRIMARY}`);
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

  // 2. Chart toolbar title
  const primary = getPrimary(state);
  const title = root.querySelector(".toolbar-title h3");
  if (title) title.textContent = `${primary.context.metric.label} \u2014 ${primary.context.chartType.label}`;
  const windowEl = root.querySelector(".toolbar-window");
  if (windowEl) windowEl.textContent = primary.context.window;

  // 3. Pane method labels + capability badges
  for (const id of state.chartOrder) {
    const paneMethod = root.querySelector(`.chart-pane[data-role="${id}"] .pane-method`);
    if (paneMethod) paneMethod.textContent = state.charts[id].context.chartType?.label || "";
    const paneCaps = root.querySelector(`.chart-pane[data-role="${id}"] .pane-caps`);
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
    const [points, ...analyses] = await Promise.all([
      fetchPoints(dsId),
      ...state.chartOrder.map(id => runAnalysis(dsId, state.charts[id].params)),
    ]);
    const columns = state.columnConfig.columns;
    const ds = state.datasets.find((d) => d.id === dsId);
    const baseContext = ds ? buildDefaultContext(ds, columns) : getPrimary(state).context;
    const slots = buildSlots(analyses, baseContext);
    state = loadDataset(state, { points: transformPoints(points, columns), slots, datasetId: dsId });
    commitWorkspace(state);
  } catch (err) {
    state = setError(state, err.message);
    commitNotice(state);
  }
}

/* ═══ Event handlers ═══ */
root.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) {
    if (state.activeChipEditor) commitRecipeRail(setActiveChipEditor(state, state.activeChipEditor));
    if (state.ui.contextMenu) commitContextMenu(closeContextMenu(state));
    return;
  }
  const a = t.dataset.action;
  switch (a) {
    case "navigate": {
      commit(navigate(state, t.dataset.route));
      if (t.dataset.route === "dataprep" && state.dataPrep.selectedDatasetId && state.dataPrep.datasetPoints.length === 0) {
        try {
          const pts = await fetchPoints(state.dataPrep.selectedDatasetId);
          commit(loadPrepPoints(state, pts));
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
    case "reset-axis": { const axisRole = state.ui.contextMenu?.role || "primary"; commitChart(resetAxis(state, t.dataset.axis, axisRole)); commitContextMenu(closeContextMenu(state)); break; }
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
        commit(loadPrepPoints(state, pts));
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
  }
});

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

/* ═══ Drag-to-arrange chart panes ═══ */
let dragState = null;

root.addEventListener("pointerdown", (e) => {
  const handle = e.target.closest("[data-drag-handle]");
  if (!handle) return;
  const pane = handle.closest(".chart-pane");
  const arena = pane?.closest(".chart-arena");
  if (!pane || !arena) return;

  e.preventDefault();
  const role = handle.dataset.dragHandle;
  const rect = arena.getBoundingClientRect();

  const ghost = pane.cloneNode(true);
  ghost.classList.add("drag-ghost");
  ghost.style.width = pane.offsetWidth + "px";
  ghost.style.height = pane.offsetHeight + "px";
  document.body.appendChild(ghost);
  pane.classList.add("dragging");

  const zones = ["left", "right", "top", "bottom"].map(pos => {
    const zone = document.createElement("div");
    zone.classList.add("drop-zone");
    zone.dataset.dropPosition = pos;
    arena.style.position = "relative";
    arena.appendChild(zone);
    Object.assign(zone.style, {
      position: "absolute", zIndex: "100",
      ...(pos === "left"   ? { left: 0, top: 0, width: "50%", height: "100%" } : {}),
      ...(pos === "right"  ? { right: 0, top: 0, width: "50%", height: "100%" } : {}),
      ...(pos === "top"    ? { left: 0, top: 0, width: "100%", height: "50%" } : {}),
      ...(pos === "bottom" ? { left: 0, bottom: 0, width: "100%", height: "50%" } : {}),
    });
    return zone;
  });

  dragState = { role, pane, arena, ghost, zones, arenaRect: rect };
});

root.addEventListener("pointermove", (e) => {
  if (!dragState) return;
  const { ghost, zones, arenaRect } = dragState;
  ghost.style.left = (e.clientX - ghost.offsetWidth / 2) + "px";
  ghost.style.top = (e.clientY - 20) + "px";

  const x = e.clientX - arenaRect.left;
  const y = e.clientY - arenaRect.top;
  const w = arenaRect.width;
  const h = arenaRect.height;

  let activePos = null;
  if (x < w * 0.35) activePos = "left";
  else if (x > w * 0.65) activePos = "right";
  else if (y < h * 0.35) activePos = "top";
  else if (y > h * 0.65) activePos = "bottom";

  zones.forEach(z => z.classList.toggle("active", z.dataset.dropPosition === activePos));
  dragState.activePos = activePos;
});

function endDrag() {
  if (!dragState) return;
  const { pane, ghost, zones, activePos, role } = dragState;
  pane.classList.remove("dragging");
  ghost.remove();
  zones.forEach(z => z.remove());

  if (activePos) {
    const arrangement = (activePos === "left" || activePos === "right") ? "horizontal" : "vertical";
    let primaryPosition;
    if (role === "primary") {
      primaryPosition = activePos;
    } else {
      const opposites = { left: "right", right: "left", top: "bottom", bottom: "top" };
      primaryPosition = opposites[activePos];
    }
    commitLayout(setChartLayout(state, arrangement, primaryPosition));
  }
  dragState = null;
}

root.addEventListener("pointerup", endDrag);
root.addEventListener("pointercancel", endDrag);

/* ═══ Resize divider ═══ */
let dividerDrag = null;

root.addEventListener("pointerdown", (e) => {
  const divider = e.target.closest(".chart-divider");
  if (!divider) return;
  e.preventDefault();
  divider.setPointerCapture(e.pointerId);
  const arena = divider.closest(".chart-arena");
  if (!arena) return;
  const rect = arena.getBoundingClientRect();
  const isHoriz = divider.dataset.divider === "horizontal";
  divider.classList.add("active");
  document.body.style.cursor = isHoriz ? "col-resize" : "row-resize";
  dividerDrag = { divider, arena, rect, isHoriz, pointerId: e.pointerId };
});

root.addEventListener("pointermove", (e) => {
  if (!dividerDrag) return;
  const { rect, isHoriz, arena } = dividerDrag;
  let ratio;
  if (isHoriz) {
    ratio = Math.max(0.2, Math.min(0.8, (e.clientX - rect.left) / rect.width));
    arena.style.gridTemplateColumns = `${ratio}fr auto ${1 - ratio}fr`;
  } else {
    ratio = Math.max(0.2, Math.min(0.8, (e.clientY - rect.top) / rect.height));
    arena.style.gridTemplateRows = `${ratio}fr auto ${1 - ratio}fr`;
  }
  dividerDrag.lastRatio = ratio;
});

function endDividerDrag() {
  if (!dividerDrag) return;
  const { divider, lastRatio } = dividerDrag;
  divider.classList.remove("active");
  document.body.style.cursor = "";
  if (lastRatio != null) {
    state = setChartLayout(state, state.chartLayout.arrangement, state.chartLayout.primaryPosition, lastRatio);
  }
  dividerDrag = null;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      for (const role of state.chartOrder) {
        if (charts[role]) charts[role].update(buildChartData(role));
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
  const r = root.getBoundingClientRect();
  commitContextMenu(openContextMenu(state, e.clientX - r.left, e.clientY - r.top, { target: 'canvas' }));
});

/* ═══ Change handlers ═══ */
root.addEventListener("change", async (e) => {
  if (e.target.matches('[data-action="upload-csv"]')) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    state = setLoadingState(state, true);
    render();
    try {
      const newDs = await uploadCsv(file);
      const datasets = await fetchDatasets();
      state = setDatasets(state, datasets);
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

  // Determine which chart this action targets by prefix
  const isPrimary = action.startsWith("primary-");
  const isChallenger = action.startsWith("challenger-");
  const chartId = isPrimary ? "primary" : isChallenger ? "challenger" : null;
  const baseAction = isPrimary ? action.slice(8) : isChallenger ? action.slice(11) : action;

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

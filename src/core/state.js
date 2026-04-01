import { DEFAULT_FORECAST_HORIZON } from "../prediction/constants.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getFailedTransformCount(state) {
  return state.transforms.filter((step) => step.status === "failed").length;
}

function getSelectedPoint(state) {
  return state.points[state.selectedPointIndex];
}

function getPhaseLabel(state, phaseId) {
  const phases = getPrimary(state).phases || [];
  return phases.find((phase) => phase.id === phaseId)?.label || phaseId;
}

function buildSignalNarrative(state, point) {
  if (!point) {
    return { title: "Select a point to inspect.", confidence: "Pending", statusTone: "neutral" };
  }

  const primary = getFocused(state);
  const violations = primary.violations || [];
  const idx = state.selectedPointIndex;
  const pointViolations = violations.filter(v => v.indices.includes(idx));

  if (pointViolations.length > 0) {
    const ruleNames = pointViolations.map(v => v.description).join("; ");
    return {
      title: `Rule violation detected at point ${idx + 1}: ${ruleNames}`,
      confidence: pointViolations.length > 1 ? "High" : "Medium",
      statusTone: "critical",
    };
  }

  if (point.excluded) {
    return {
      title: `Point ${point.label} is excluded from limit calculations but visible for audit.`,
      confidence: "Review exclusion",
      statusTone: "warning",
    };
  }

  if (point.primaryValue > primary.limits.ucl || point.primaryValue < primary.limits.lcl) {
    return {
      title: `Point ${point.label} is beyond control limits (value: ${point.primaryValue.toFixed(4)}).`,
      confidence: "High",
      statusTone: "critical",
    };
  }

  return {
    title: `Point ${point.label} is within control limits (value: ${point.primaryValue.toFixed(4)}).`,
    confidence: "In control",
    statusTone: "info",
  };
}

function buildWhyTriggered(state, point) {
  const violations = getFocused(state).violations || [];
  if (violations.length === 0) {
    return ["No rule violations detected in this dataset."];
  }

  // Group by rule: violations fire once per phase, so deduplicate by testId
  // and sum the flagged point counts across all phases.
  const byRule = new Map();
  for (const v of violations) {
    if (!byRule.has(v.testId)) {
      byRule.set(v.testId, { description: v.description, count: 0 });
    }
    byRule.get(v.testId).count += v.indices.length;
  }
  return [...byRule.values()]
    .sort((a, b) => b.count - a.count)
    .map(r => ({ description: r.description, count: r.count }));
}

/** Rules (deduplicated by testId) that fired at a specific point index. */
function buildRulesAtPoint(state, idx) {
  if (idx == null) return [];
  const violations = getFocused(state).violations || [];
  const seen = new Set();
  const result = [];
  for (const v of violations) {
    if (v.indices.includes(Number(idx)) && !seen.has(v.testId)) {
      seen.add(v.testId);
      result.push({ testId: v.testId, description: v.description });
    }
  }
  return result;
}

function buildEvidence(state, point) {
  const primary = getFocused(state);
  const sigma = primary.sigma;

  // Deduplicate violations by rule before counting
  const uniqueRules = new Set((primary.violations || []).map(v => v.testId));
  const violationCount = (primary.violations || []).reduce((sum, v) => sum + v.indices.length, 0);

  return [
    // 閳光偓閳光偓 Point-level items (change with the selected point) 閳光偓閳光偓
    {
      label: "Value",
      value: point ? point.primaryValue.toFixed(4) : "-",
      resolved: Boolean(point),
      category: "point",
    },
    // 閳光偓閳光偓 Chart-level items (stable, describe the analysis) 閳光偓閳光偓
    {
      label: "UCL / CL / LCL",
      value: `${primary.limits.ucl.toFixed(4)} / ${primary.limits.center.toFixed(4)} / ${primary.limits.lcl.toFixed(4)}`,
      resolved: true,
      category: "chart",
    },
    {
      label: "Sigma",
      value: sigma ? `${sigma.sigma_hat.toFixed(4)} (${sigma.method})` : "Not computed",
      resolved: Boolean(sigma),
      category: "chart",
    },
    {
      label: "Violations",
      value: uniqueRules.size > 0 ? `${uniqueRules.size} rule${uniqueRules.size !== 1 ? "s" : ""} 璺?${violationCount} pts` : "None",
      resolved: uniqueRules.size === 0,
      category: "chart",
    },
    {
      label: "Points",
      value: `${state.points.length} 璺?${state.points.filter(p => p.excluded).length} excl`,
      resolved: true,
      category: "chart",
    },
    {
      label: "Pipeline",
      value: state.pipeline.status === "ready" ? "Ready" : "Partial",
      resolved: state.pipeline.status === "ready",
      category: "chart",
    },
  ];
}

function buildRecommendations(state, point) {
  const checks = [];
  const violations = getFocused(state).violations || [];

  if (violations.some(v => v.testId === "1")) {
    checks.push("Investigate points beyond control limits - check for assignable causes.");
  }
  if (violations.some(v => v.testId === "2")) {
    checks.push("9+ consecutive points on same side of CL - possible process shift.");
  }
  if (violations.some(v => ["3", "5"].includes(v.testId))) {
    checks.push("Trending pattern detected - check for gradual process drift.");
  }
  if (violations.length === 0) {
    checks.push("Process appears in statistical control. Continue monitoring.");
  }
  if (point?.excluded) {
    checks.push(`Review exclusion of point ${point.label} - verify the reason is still valid.`);
  }

  return checks;
}

function buildComparisonStrip(state) {
  const focused = getFocused(state);
  const violations = focused.violations || [];
  const violationCount = violations.reduce((sum, v) => sum + v.indices.length, 0);
  const ruleCount = violations.length;

  return [
    { label: "OOC points", value: String(violationCount), tone: violationCount > 0 ? "critical" : "positive" },
    { label: "Rules triggered", value: String(ruleCount), tone: ruleCount > 0 ? "warning" : "positive" },
    { label: "Method", value: focused.context.chartType?.label || "-", tone: "neutral" },
    { label: "Limits scope", value: focused.limits.scope, tone: "neutral" },
    { label: "Charts", value: String(state.chartOrder.length), tone: "neutral" },
  ];
}

/* 閳烘劏鏅查埡?Default empty state for initial load 閳烘劏鏅查埡?*/
const DEFAULT_CONTEXT = {
  title: "",
  metric: { id: "value", label: "Value", unit: "" },
  subgroup: { id: "default", label: "Individual", detail: "n=1" },
  phase: { id: "default", label: "All data", detail: "No phases" },
  chartType: { id: "imr", label: "IMR", detail: "Individual + Moving Range" },
  sigma: { label: "3 Sigma", detail: "Moving range" },
  tests: { label: "Nelson", detail: "Rule 1, 2, 5" },
  compare: { label: "None", detail: "No challenger" },
  window: "",
  methodBadge: "IMR",
  status: "Loading"
};

const DEFAULT_LIMITS = {
  center: 0, ucl: 0, lcl: 0, usl: null, lsl: null,
  version: "", scope: "Dataset"
};

export const DEFAULT_PARAMS = {
  chart_type: "imr",
  sigma_method: "moving_range",
  k_sigma: 3.0,
  nelson_tests: [1, 2, 5],
  value_column: null,
  subgroup_column: null,
  phase_column: null,
  n_trials: null,
  usl: null,
  lsl: null,
  target: null,
};

export function createSlot(overrides = {}) {
  return {
    params: { ...DEFAULT_PARAMS },
    context: { ...DEFAULT_CONTEXT },
    limits: { ...DEFAULT_LIMITS },
    capability: null,
    violations: [],
    sigma: null,
    zones: null,
    overrides: { x: null, y: null },
    chartValues: [],
    chartLabels: [],
    phases: [],
    selectedPointIndex: null,
    showDataTable: false,
    forecast: {
      mode: "hidden",   // hidden | prompt | active
      selected: false,
      horizon: DEFAULT_FORECAST_HORIZON,
    },
    ...overrides,
  };
}

function updateSlot(state, id, updates) {
  return {
    ...state,
    charts: {
      ...state.charts,
      [id]: { ...state.charts[id], ...updates },
    },
  };
}

/** Helper to read the primary chart slot (first in order) */
export function getPrimary(state) {
  return state.charts[state.chartOrder[0]];
}

/** Helper to read the focused chart slot */
export function getFocused(state) {
  return state.charts[state.focusedChartId] || getPrimary(state);
}

/* 閳烘劏鏅查埡?Freeform Split Layout (binary split tree) 閳烘劏鏅查埡?*/


/* 閳光偓閳光偓 Tree helpers (kept temporarily for migration only) 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓 */

function _collect(node) {
  if (!node) return [];
  if (node.type === "pane") return [node.chartId];
  return node.children.flatMap(_collect);
}

/** Migrate legacy tree layout to row-grid on load */
export function migrateTreeToRows(layout) {
  if (layout.rows && layout.colWeights) return layout;
  if (layout.rows) {
    // Has rows but no weights 閳?add default weights
    return { rows: layout.rows, colWeights: layout.rows.map(r => r.map(() => 1)), rowWeights: layout.rows.map(() => 1) };
  }
  if (layout.tree) {
    const ids = _collect(layout.tree);
    return { rows: [ids], colWeights: [ids.map(() => 1)], rowWeights: [1] };
  }
  if (layout.slots) {
    const ids = [...layout.slots];
    return { rows: [ids], colWeights: [ids.map(() => 1)], rowWeights: [1] };
  }
  return { rows: [], colWeights: [], rowWeights: [] };
}

/** Get all chart IDs visible in the current layout */
export function collectChartIds(layout) {
  if (!layout?.rows) {
    // Legacy fallback 閳?auto-migrate
    if (layout?.tree) return _collect(layout.tree);
    if (layout?.slots) return [...layout.slots];
    return [];
  }
  return layout.rows.flat();
}

/** Insert a chart at a position relative to a target chart */
export function insertChart(state, chartId, targetId, zone) {
  const rows = state.chartLayout.rows.map(r => [...r]);
  const colWeights = state.chartLayout.colWeights.map(r => [...r]);
  const rowWeights = [...state.chartLayout.rowWeights];

  if (zone === "center") {
    // Swap: exchange positions and weights
    const aR = rows.findIndex(r => r.includes(chartId));
    const aC = rows[aR].indexOf(chartId);
    const bR = rows.findIndex(r => r.includes(targetId));
    const bC = rows[bR].indexOf(targetId);
    rows[aR][aC] = targetId;
    rows[bR][bC] = chartId;
    const tmpW = colWeights[aR][aC];
    colWeights[aR][aC] = colWeights[bR][bC];
    colWeights[bR][bC] = tmpW;
    return { ...state, chartLayout: { rows, colWeights, rowWeights } };
  }

  const tR = rows.findIndex(r => r.includes(targetId));

  // Remove chartId from current position
  const sR = rows.findIndex(r => r.includes(chartId));
  if (sR >= 0) {
    const sC = rows[sR].indexOf(chartId);
    rows[sR].splice(sC, 1);
    colWeights[sR].splice(sC, 1);
    if (rows[sR].length === 0) {
      rows.splice(sR, 1);
      colWeights.splice(sR, 1);
      rowWeights.splice(sR, 1);
    }
  }

  // Recompute target after removal
  const tR2 = rows.findIndex(r => r.includes(targetId));
  const tC2 = rows[tR2].indexOf(targetId);

  switch (zone) {
    case "right":
      rows[tR2].splice(tC2 + 1, 0, chartId);
      colWeights[tR2].splice(tC2 + 1, 0, 1);
      break;
    case "left":
      rows[tR2].splice(tC2, 0, chartId);
      colWeights[tR2].splice(tC2, 0, 1);
      break;
    case "bottom":
      rows.splice(tR2 + 1, 0, [chartId]);
      colWeights.splice(tR2 + 1, 0, [1]);
      rowWeights.splice(tR2 + 1, 0, 1);
      break;
    case "top":
      rows.splice(tR2, 0, [chartId]);
      colWeights.splice(tR2, 0, [1]);
      rowWeights.splice(tR2, 0, 1);
      break;
  }

  return { ...state, chartLayout: { rows, colWeights, rowWeights } };
}

/** Compute a preview of the grid after a drag-drop 閳?does NOT modify state */
export function computeGridPreview(layout, draggingId, targetId, zone) {
  const { rows, colWeights, rowWeights } = layout;
  if (!draggingId || !targetId || draggingId === targetId) return layout;

  if (zone === "center") {
    const preview = rows.map(r => r.map(id =>
      id === draggingId ? targetId : id === targetId ? draggingId : id
    ));
    return { rows: preview, colWeights, rowWeights };
  }

  // Remove dragging from current position, keeping weights in sync
  const pRows = [];
  const pColW = [];
  const pRowW = [];
  for (let r = 0; r < rows.length; r++) {
    const filtered = [];
    const filteredW = [];
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] !== draggingId) {
        filtered.push(rows[r][c]);
        filteredW.push(colWeights[r][c]);
      }
    }
    if (filtered.length > 0) {
      pRows.push(filtered);
      pColW.push(filteredW);
      pRowW.push(rowWeights[r]);
    }
  }

  const tR = pRows.findIndex(r => r.includes(targetId));
  if (tR < 0) return layout;
  const tC = pRows[tR].indexOf(targetId);

  switch (zone) {
    case "right":  pRows[tR].splice(tC + 1, 0, draggingId); pColW[tR].splice(tC + 1, 0, 1); break;
    case "left":   pRows[tR].splice(tC, 0, draggingId); pColW[tR].splice(tC, 0, 1); break;
    case "bottom": pRows.splice(tR + 1, 0, [draggingId]); pColW.splice(tR + 1, 0, [1]); pRowW.splice(tR + 1, 0, 1); break;
    case "top":    pRows.splice(tR, 0, [draggingId]); pColW.splice(tR, 0, [1]); pRowW.splice(tR, 0, 1); break;
  }
  return { rows: pRows, colWeights: pColW, rowWeights: pRowW };
}

export function createInitialState() {
  return {
    route: "workspace",
    loading: true,
    error: null,
    datasets: [],
    activeDatasetId: null,
    showDataTable: false,
    points: [],
    transforms: [],
    structuralFindings: [],
    selectedFindingId: null,
    findingsChartId: null,
    reportTemplate: {
      title: "SPC Investigation Report",
      sections: ["Executive summary", "Evidence ledger", "Method comparison", "Recommended actions"]
    },
    pipeline: {
      status: "ready",
      rescueMode: "none",
      lastSuccessfulAt: null
    },
    selectedPointIndex: 0,
    chartToggles: {
      overlay: true,
      specLimits: true,
      grid: true,
      phaseTags: true,
      events: true,
      excludedMarkers: true,
      confidenceBand: true,
    },
    charts: {
      "chart-1": createSlot(),
    },
    chartOrder: ["chart-1"],
    nextChartId: 2,
    focusedChartId: "chart-1",
    chartLayout: {
      rows: [["chart-1"]],
      colWeights: [[1]],
      rowWeights: [1],
    },
    ui: {
      notice: null,
      contextMenu: null,
      layersExpanded: false,
      pendingNewChart: null,
    },
    auditLog: [],
    dataPrep: {
      selectedDatasetId: null,
      datasetPoints: [],
      loading: false,
      error: null,
      rawRows: null,
      originalColumns: [],
      arqueroTable: null,
      transforms: [],
      hiddenColumns: [],
      columnOrder: [],
      unsavedChanges: false,
      activePanel: null,
      excludedRows: [],
      expandedProfileColumn: null,
      profileCache: {},
      confirmingDeleteId: null,
    },
    columnConfig: {
      columns: [],
      loading: false,
    },
    activeChipEditor: null,
  };
}

/* 閳烘劏鏅查埡?New actions for API integration 閳烘劏鏅查埡?*/

export function setDatasets(state, datasets) {
  return { ...state, datasets };
}

export function loadDataset(state, { points, slots, datasetId }) {
  const updatedCharts = { ...state.charts };
  for (const [id, result] of Object.entries(slots)) {
    if (updatedCharts[id]) {
      updatedCharts[id] = { ...updatedCharts[id], ...result, overrides: { x: null, y: null } };
    }
  }
  return {
    ...state,
    loading: false,
    error: null,
    activeDatasetId: datasetId,
    points,
    selectedPointIndex: points.length > 0 ? points.length - 1 : 0,
    structuralFindings: [],
    selectedFindingId: null,
    findingsChartId: null,
    auditLog: [`Dataset loaded with ${points.length} points.`],
    charts: updatedCharts,
  };
}

export function toggleDataTable(state) {
  return { ...state, showDataTable: !state.showDataTable };
}

export function togglePaneDataTable(state, chartId) {
  const slot = state.charts[chartId];
  if (!slot) return state;
  return updateSlot(state, chartId, { showDataTable: !slot.showDataTable });
}

export function setLoadingState(state, loading) {
  return { ...state, loading, error: loading ? null : state.error };
}

export function setError(state, message) {
  return { ...state, loading: false, error: message };
}

/* 閳烘劏鏅查埡?Existing actions 閳?refactored to selective cloning 閳烘劏鏅查埡?*/

export function deriveWorkspace(state) {
  const point = getSelectedPoint(state);
  const signal = buildSignalNarrative(state, point);
  const evidence = buildEvidence(state, point);

  return {
    selectedPoint: point,
    signal,
    whyTriggered: buildWhyTriggered(state, point),
    rulesAtPoint: buildRulesAtPoint(state, state.selectedPointIndex),
    evidence,
    recommendations: buildRecommendations(state, point),
    compareCards: buildComparisonStrip(state),
    excludedCount: state.points.filter((candidate) => candidate.excluded).length,
    lineageCount: state.transforms.filter((step) => step.active || step.status === "failed").length,
    failedTransformCount: getFailedTransformCount(state),
    phaseLabel: point ? getPhaseLabel(state, point.phaseId) : null
  };
}

export function navigate(state, route) {
  const next = {
    ...state,
    route,
    ui: { ...state.ui, contextMenu: null }
  };
  // Auto-select active dataset when entering Data Prep
  if (route === 'dataprep' && !next.dataPrep.selectedDatasetId && next.activeDatasetId) {
    next.dataPrep = { ...next.dataPrep, selectedDatasetId: next.activeDatasetId };
  }
  return next;
}

/* 閳烘劏鏅查埡?Data Prep actions 閳烘劏鏅查埡?*/

export function selectPrepDataset(state, datasetId) {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, selectedDatasetId: datasetId, datasetPoints: [], loading: true, error: null }
  };
}

export function loadPrepPoints(state, points) {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, datasetPoints: points, loading: false, error: null }
  };
}

export function setPrepError(state, message) {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, loading: false, error: message }
  };
}

export function deletePrepDataset(state, datasetId) {
  const datasets = state.datasets.filter(d => d.id !== datasetId);
  const dp = state.dataPrep.selectedDatasetId === datasetId
    ? { ...state.dataPrep, selectedDatasetId: null, datasetPoints: [], error: null }
    : state.dataPrep;
  const activeDatasetId = state.activeDatasetId === datasetId ? null : state.activeDatasetId;
  return { ...state, datasets, dataPrep: dp, activeDatasetId };
}

/* 閳烘劏鏅查埡?Client-side data prep actions 閳烘劏鏅查埡?*/

export function setPrepParsedData(state, { rawRows, arqueroTable, columns }) {
  return {
    ...state,
    dataPrep: {
      ...state.dataPrep,
      rawRows,
      originalColumns: columns, // preserved for undo replay (immune to rename/type changes)
      arqueroTable,
      transforms: [],
      hiddenColumns: [],
      columnOrder: columns.map(c => c.name),
      unsavedChanges: false,
      loading: false,
      error: null,
    },
    columnConfig: { ...state.columnConfig, columns, loading: false },
  };
}

export function setPrepTable(state, arqueroTable) {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, arqueroTable, unsavedChanges: true },
  };
}

export function addPrepTransform(state, transform) {
  return {
    ...state,
    dataPrep: {
      ...state.dataPrep,
      transforms: [...state.dataPrep.transforms, { ...transform, timestamp: Date.now() }],
      unsavedChanges: true,
    },
  };
}

export function undoPrepTransform(state) {
  const transforms = state.dataPrep.transforms.slice(0, -1);
  return {
    ...state,
    dataPrep: { ...state.dataPrep, transforms, unsavedChanges: transforms.length > 0 },
  };
}

/** Tail-trim: undo all transforms from stepIndex onward (view-only ledger, end-trimmable). */
export function undoPrepTransformTo(state, stepIndex) {
  const transforms = state.dataPrep.transforms.slice(0, stepIndex);
  return {
    ...state,
    dataPrep: { ...state.dataPrep, transforms, unsavedChanges: transforms.length > 0 },
  };
}

export function clearPrepTransforms(state) {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, transforms: [], unsavedChanges: false },
  };
}

export function setPrepHiddenColumns(state, hiddenColumns) {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, hiddenColumns },
  };
}

export function markPrepSaved(state) {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, unsavedChanges: false },
  };
}

export function setActivePanel(state, panel) {
  const toggled = state.dataPrep.activePanel === panel ? null : panel;
  return {
    ...state,
    dataPrep: { ...state.dataPrep, activePanel: toggled },
  };
}

export function closeActivePanel(state) {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, activePanel: null },
  };
}

/**
 * Update column metadata (for rename, change dtype).
 * Also updates hiddenColumns if a column name changed.
 */
export function updateColumnMeta(state, oldName, updates) {
  const columns = state.columnConfig.columns.map(c =>
    c.name === oldName ? { ...c, ...updates } : c
  );
  let hiddenColumns = state.dataPrep.hiddenColumns;
  if (updates.name && updates.name !== oldName) {
    hiddenColumns = hiddenColumns.map(h => h === oldName ? updates.name : h);
  }
  return {
    ...state,
    columnConfig: { ...state.columnConfig, columns },
    dataPrep: { ...state.dataPrep, hiddenColumns },
  };
}

/**
 * Add new column metadata (for calculated, split, concat, recode-to-new, bin).
 * @param {Object} state
 * @param {Array<{name: string, dtype: string, role: string|null}>} newColumns
 */
export function addColumnMeta(state, newColumns) {
  const startOrdinal = state.columnConfig.columns.length;
  const withOrdinals = newColumns.map((c, i) => ({
    ...c,
    role: c.role ?? null,
    ordinal: startOrdinal + i,
  }));
  return {
    ...state,
    columnConfig: {
      ...state.columnConfig,
      columns: [...state.columnConfig.columns, ...withOrdinals],
    },
  };
}

// 閳烘劏鏅查埡?Phase 3 閳?Row Exclusion 閳烘劏鏅查埡?

export function toggleRowExclusion(state, rowIdx) {
  const excluded = [...state.dataPrep.excludedRows];
  const pos = excluded.indexOf(rowIdx);
  if (pos >= 0) excluded.splice(pos, 1);
  else excluded.push(rowIdx);
  return { ...state, dataPrep: { ...state.dataPrep, excludedRows: excluded } };
}

export function bulkExcludeRows(state, indices) {
  const excluded = [...new Set([...state.dataPrep.excludedRows, ...indices])];
  return { ...state, dataPrep: { ...state.dataPrep, excludedRows: excluded } };
}

export function clearAllExclusions(state) {
  return { ...state, dataPrep: { ...state.dataPrep, excludedRows: [] } };
}

// 閳烘劏鏅查埡?Phase 3 閳?Data Profiling 閳烘劏鏅查埡?

export function setExpandedProfileColumn(state, colName) {
  const current = state.dataPrep.expandedProfileColumn;
  return {
    ...state,
    dataPrep: {
      ...state.dataPrep,
      expandedProfileColumn: current === colName ? null : colName,
    },
  };
}

export function setProfileCache(state, cache) {
  return { ...state, dataPrep: { ...state.dataPrep, profileCache: cache } };
}

/* 閳烘劏鏅查埡?Column Config + Analysis Params actions 閿熸枻鎷烽埡鎰ㄦ櫜 */

export function setColumns(state, columns) {
  return {
    ...state,
    columnConfig: { ...state.columnConfig, columns, loading: false },
  };
}

export function setColumnsLoading(state) {
  return {
    ...state,
    columnConfig: { ...state.columnConfig, loading: true },
  };
}

export function setChartParams(state, id, params) {
  return updateSlot(state, id, { params: { ...state.charts[id].params, ...params } });
}

export function setActiveChipEditor(state, chipId) {
  return {
    ...state,
    activeChipEditor: state.activeChipEditor === chipId ? null : chipId,
  };
}

export function selectPoint(state, index, id = null) {
  // Subgroup-based charts (X-Bar R, CUSUM, etc.) have their own point space 閳?
  // chartValues indices don't map to raw state.points indices.  Store selection
  // per-slot so clicks in one chart don't highlight semantically-unrelated
  // points in a chart that uses a different granularity.
  if (id && state.charts[id]) {
    const slot = state.charts[id];
    const hasChartValues = slot.chartValues && slot.chartValues.length > 0;
    if (hasChartValues) {
      const clamped = clamp(index, 0, Math.max(0, slot.chartValues.length - 1));
      return {
        ...state,
        charts: { ...state.charts, [id]: { ...slot, selectedPointIndex: clamped } },
        ui: { ...state.ui, contextMenu: null },
      };
    }
  }
  // Raw-point charts (IMR, etc.) use the global index into state.points
  return {
    ...state,
    selectedPointIndex: clamp(index, 0, Math.max(0, state.points.length - 1)),
    ui: { ...state.ui, contextMenu: null }
  };
}

export function moveSelection(state, delta) {
  return selectPoint(state, state.selectedPointIndex + delta);
}

export function toggleChartOption(state, option) {
  return {
    ...state,
    chartToggles: { ...state.chartToggles, [option]: !state.chartToggles[option] }
  };
}

export function togglePointExclusion(state, index) {
  const point = state.points[index];
  if (!point) return state;

  const newExcluded = !point.excluded;
  const newPoints = state.points.map((p, i) =>
    i === index ? { ...p, excluded: newExcluded } : p
  );

  return {
    ...state,
    points: newPoints,
    pipeline: { ...state.pipeline, status: "ready", rescueMode: "none" },
    auditLog: [
      `${point.label} ${newExcluded ? "excluded" : "restored"} while remaining visible on the chart.`,
      ...state.auditLog
    ],
    ui: {
      ...state.ui,
      notice: {
        tone: "info",
        title: newExcluded ? "Point excluded" : "Point restored",
        body: `${point.label} remains visible so the exclusion is auditable.`
      }
    }
  };
}

export function toggleTransform(state, stepId) {
  const stepIndex = state.transforms.findIndex((c) => c.id === stepId);
  const step = state.transforms[stepIndex];
  if (!step || step.status === "failed") return state;

  const newActive = !step.active;
  const newTransforms = state.transforms.map((s, i) =>
    i === stepIndex ? { ...s, active: newActive, status: newActive ? "active" : "inactive" } : s
  );

  return {
    ...state,
    transforms: newTransforms,
    auditLog: [
      `${step.id} ${newActive ? "enabled" : "disabled"} from the reversible prep pipeline.`,
      ...state.auditLog
    ],
    ui: {
      ...state.ui,
      notice: {
        tone: "info",
        title: newActive ? "Transform enabled" : "Transform disabled",
        body: step.detail
      }
    }
  };
}

export function failTransformStep(state, stepId) {
  const stepIndex = state.transforms.findIndex((c) => c.id === stepId);
  const step = state.transforms[stepIndex];
  if (!step) return state;

  const newTransforms = state.transforms.map((s, i) =>
    i === stepIndex ? { ...s, status: "failed", active: false } : s
  );

  return {
    ...state,
    transforms: newTransforms,
    pipeline: { ...state.pipeline, status: "partial", rescueMode: "retain-previous-compute" },
    auditLog: [
      `${step.id} failed validation. Prior chart result retained and the step is marked partial.`,
      ...state.auditLog
    ],
    ui: {
      ...state.ui,
      notice: {
        tone: "warning",
        title: "Transform failed",
        body: `${step.title} failed validation. The previous chart result is still active while the step stays reversible.`
      }
    }
  };
}

export function recoverTransformStep(state, stepId) {
  const stepIndex = state.transforms.findIndex((c) => c.id === stepId);
  const step = state.transforms[stepIndex];
  if (!step) return state;

  const newTransforms = state.transforms.map((s, i) =>
    i === stepIndex ? { ...s, status: "active", active: true } : s
  );
  const failedCount = newTransforms.filter((s) => s.status === "failed").length;
  const newPipelineStatus = failedCount > 0 ? "partial" : "ready";

  return {
    ...state,
    transforms: newTransforms,
    pipeline: {
      ...state.pipeline,
      status: newPipelineStatus,
      rescueMode: newPipelineStatus === "ready" ? "none" : "retain-previous-compute"
    },
    auditLog: [
      `${step.id} recovered and rejoined the active compute path.`,
      ...state.auditLog
    ],
    ui: {
      ...state.ui,
      notice: {
        tone: "positive",
        title: "Transform recovered",
        body: `${step.title} is active again and the pipeline has been revalidated.`
      }
    }
  };
}

export function setChallengerStatus(state, status) {
  // Legacy method-lab integration 閳?kept for backwards compatibility
  return {
    ...state,
    auditLog: [`Method status changed to ${status}.`, ...state.auditLog],
    ui: {
      ...state.ui,
      notice: {
        tone: status === "ready" ? "positive" : status === "partial" ? "warning" : "critical",
        title: "Method lab updated",
        body:
          status === "ready"
            ? "Methods are now fully comparable."
            : status === "partial"
              ? "Primary completed, challenger needs another run."
              : "Method timed out. Primary remains authoritative."
      }
    }
  };
}






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

/* 閳烘劏鏅查埡?Split Layout actions 閳烘劏鏅查埡?*/

export function focusChart(state, chartId) {
  if (!state.charts[chartId] || state.focusedChartId === chartId) return state;
  return { ...state, focusedChartId: chartId };
}

/** Add a new chart using row-grid auto-placement rules */
export function addChart(state, { chartType = "imr" } = {}) {
  const newId = `chart-${state.nextChartId}`;
  const focusedSlot = getFocused(state);

  const newParams = {
    ...DEFAULT_PARAMS,
    chart_type: chartType,
    value_column: focusedSlot.params.value_column,
    subgroup_column: focusedSlot.params.subgroup_column,
    phase_column: focusedSlot.params.phase_column,
  };
  const chartLabels = {
    imr: "IMR", xbar_r: "X-Bar R", xbar_s: "X-Bar S", r: "R", s: "S", mr: "MR",
    p: "P", np: "NP", c: "C", u: "U", laney_p: "Laney P\u2019", laney_u: "Laney U\u2019",
    cusum: "CUSUM", ewma: "EWMA", levey_jennings: "Levey-Jennings",
    cusum_vmask: "CUSUM V-Mask", three_way: "Three-Way", presummarize: "Presummarize",
    run: "Run Chart", short_run: "Short Run", g: "G", t: "T",
    hotelling_t2: "Hotelling T\u00B2", mewma: "MEWMA",
  };
  const label = chartLabels[chartType] || chartType;
  const newSlot = createSlot({
    params: newParams,
    context: { ...focusedSlot.context, chartType: { id: chartType, label, detail: "" }, methodBadge: label },
  });

  // Auto-placement: fill last row first, then new row below
  const { rows, colWeights, rowWeights } = state.chartLayout;
  const lastRow = rows[rows.length - 1];
  const rowAbove = rows.length >= 2 ? rows[rows.length - 2] : null;
  const maxInRow = rowAbove ? rowAbove.length : 2;
  let newRows, newColWeights, newRowWeights;
  if (lastRow.length < maxInRow) {
    newRows = [...rows.slice(0, -1), [...lastRow, newId]];
    newColWeights = [...colWeights.slice(0, -1), [...colWeights[colWeights.length - 1], 1]];
    newRowWeights = rowWeights;
  } else {
    newRows = [...rows, [newId]];
    newColWeights = [...colWeights, [1]];
    newRowWeights = [...rowWeights, 1];
  }

  return {
    ...state,
    charts: { ...state.charts, [newId]: newSlot },
    chartOrder: [...state.chartOrder, newId],
    nextChartId: state.nextChartId + 1,
    focusedChartId: newId,
    chartLayout: { rows: newRows, colWeights: newColWeights, rowWeights: newRowWeights },
  };
}

/** Remove a chart from the row-grid layout */
export function removeChart(state, chartId) {
  if (collectChartIds(state.chartLayout).length <= 1) return state;
  if (!state.charts[chartId]) return state;

  const { rows, colWeights, rowWeights } = state.chartLayout;
  const newRows = [];
  const newColWeights = [];
  const newRowWeights = [];
  for (let r = 0; r < rows.length; r++) {
    const filtered = [];
    const filteredW = [];
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] !== chartId) {
        filtered.push(rows[r][c]);
        filteredW.push(colWeights[r][c]);
      }
    }
    if (filtered.length > 0) {
      newRows.push(filtered);
      newColWeights.push(filteredW);
      newRowWeights.push(rowWeights[r]);
    }
  }

  const newCharts = { ...state.charts };
  delete newCharts[chartId];
  const newOrder = state.chartOrder.filter(id => id !== chartId);
  const newFocus = state.focusedChartId === chartId ? newOrder[0] : state.focusedChartId;

  return {
    ...state,
    charts: newCharts,
    chartOrder: newOrder,
    focusedChartId: newFocus,
    chartLayout: { rows: newRows, colWeights: newColWeights, rowWeights: newRowWeights },
  };
}

/** Set column weight ratio between two adjacent panes in a row */
export function setColWeight(state, rowIndex, leftCol, ratio) {
  const colWeights = state.chartLayout.colWeights.map(r => [...r]);
  const total = colWeights[rowIndex][leftCol] + colWeights[rowIndex][leftCol + 1];
  colWeights[rowIndex][leftCol] = total * ratio;
  colWeights[rowIndex][leftCol + 1] = total * (1 - ratio);
  return { ...state, chartLayout: { ...state.chartLayout, colWeights } };
}

/** Set row weight ratio between two adjacent rows */
export function setRowWeight(state, topRow, ratio) {
  const rowWeights = [...state.chartLayout.rowWeights];
  const total = rowWeights[topRow] + rowWeights[topRow + 1];
  rowWeights[topRow] = total * ratio;
  rowWeights[topRow + 1] = total * (1 - ratio);
  return { ...state, chartLayout: { ...state.chartLayout, rowWeights } };
}

export function setXDomainOverride(state, min, max, id) {
  if (!id) id = state.focusedChartId || state.chartOrder[0];
  return updateSlot(state, id, { overrides: { ...state.charts[id].overrides, x: { min, max } } });
}

export function setYDomainOverride(state, yMin, yMax, id) {
  if (!id) id = state.focusedChartId || state.chartOrder[0];
  return updateSlot(state, id, { overrides: { ...state.charts[id].overrides, y: { yMin, yMax } } });
}

export function resetAxis(state, axis, id) {
  if (!id) id = state.focusedChartId || state.chartOrder[0];
  const overrides = state.charts[id].overrides;
  if (axis === 'x') return updateSlot(state, id, { overrides: { ...overrides, x: null } });
  if (axis === 'y') return updateSlot(state, id, { overrides: { ...overrides, y: null } });
  return state;
}

export function setForecastPrompt(state, visible, id) {
  if (!id) id = state.focusedChartId || state.chartOrder[0];
  const slot = state.charts[id];
  if (!slot || slot.forecast?.mode === "active") return state;
  const nextMode = visible ? "prompt" : "hidden";
  if ((slot.forecast?.mode || "hidden") === nextMode) return state;
  return updateSlot(state, id, {
    forecast: {
      ...slot.forecast,
      mode: nextMode,
      selected: false,
    },
  });
}

export function activateForecast(state, id) {
  if (!id) id = state.focusedChartId || state.chartOrder[0];
  const slot = state.charts[id];
  if (!slot) return state;
  return updateSlot(state, id, {
    forecast: {
      ...slot.forecast,
      mode: "active",
      selected: true,
    },
  });
}

export function selectForecast(state, selected, id) {
  if (!id) id = state.focusedChartId || state.chartOrder[0];
  const slot = state.charts[id];
  if (!slot || slot.forecast?.mode !== "active") return state;
  if (slot.forecast.selected === selected) return state;
  return updateSlot(state, id, {
    forecast: {
      ...slot.forecast,
      selected,
    },
  });
}

export function setForecastHorizon(state, horizon, id) {
  if (!id) id = state.focusedChartId || state.chartOrder[0];
  const slot = state.charts[id];
  if (!slot) return state;
  const nextHorizon = Math.max(1, Math.ceil(horizon));
  if (slot.forecast?.horizon === nextHorizon) return state;
  return updateSlot(state, id, {
    forecast: {
      ...slot.forecast,
      horizon: nextHorizon,
    },
  });
}

export function cancelForecast(state, id) {
  if (!id) id = state.focusedChartId || state.chartOrder[0];
  const slot = state.charts[id];
  if (!slot) return state;
  return updateSlot(state, id, {
    forecast: {
      ...slot.forecast,
      mode: "hidden",
      selected: false,
    },
  });
}

/* 閳烘劏鏅查埡?Structural Findings actions 閳烘劏鏅查埡?*/

export function setStructuralFindings(state, findings, chartId) {
  return {
    ...state,
    structuralFindings: findings,
    selectedFindingId: findings.length > 0 ? findings[0].id : null,
    findingsChartId: chartId || state.focusedChartId || state.chartOrder[0],
  };
}

export function selectStructuralFinding(state, findingId) {
  return { ...state, selectedFindingId: findingId };
}

export function setFindingsChart(state, chartId) {
  return { ...state, findingsChartId: chartId };
}


import { DEFAULT_FORECAST_HORIZON } from "../../prediction/constants.js";

const DEFAULT_FINDINGS_STANDARDS = {
  cpkThreshold: 1.33,
  cpkMarginal: 1.0,
  maxOocPercent: 2.0,
  maxOocCount: 3,
  centeringRatio: 0.9,
  runsZThreshold: 1.96,
  zoneDeviation: 0.2,
};

function restoreFindingsStandards() {
  try {
    const raw = localStorage.getItem("spc-findings-standards");
    if (raw) return { ...DEFAULT_FINDINGS_STANDARDS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_FINDINGS_STANDARDS };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getFailedTransformCount(state) {
  return state.transforms.filter((step) => step.status === "failed").length;
}

/* ---Default empty state for initial load ---*/
const DEFAULT_CONTEXT = {
  title: "",
  metric: { id: "value", label: "Value", unit: "" },
  subgroup: { id: "default", label: "Individual", detail: "n=1" },
  phase: { id: "default", label: "All data", detail: "No phases" },
  chartType: { id: null, label: "Select\u2026", detail: "No chart type selected" },
  sigma: { label: "3 Sigma", detail: "Moving range" },
  tests: { label: "Nelson", detail: "Rule 1, 2, 5" },
  compare: { label: "None", detail: "Single method" },
  window: "",
  methodBadge: "",
  status: "Loading"
};

const DEFAULT_LIMITS = {
  center: 0, ucl: 0, lcl: 0, usl: null, lsl: null,
  version: "", scope: "Dataset"
};

export const DEFAULT_PARAMS = {
  chart_type: null,
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
    accentIdx: 0,
    _cascadeMemory: { lastIndividualType: null, lastSubgroupedType: null },
    forecast: {
      mode: "hidden",   // hidden | prompt | active
      selected: false,
      horizon: DEFAULT_FORECAST_HORIZON,
    },
    ...overrides,
  };
}

export function updateSlot(state, id, updates) {
  return {
    ...state,
    charts: {
      ...state.charts,
      [id]: { ...state.charts[id], ...updates },
    },
  };
}

/* --- Tree helpers (kept temporarily for migration only) --- */

function _collect(node) {
  if (!node) return [];
  if (node.type === "pane") return [node.chartId];
  return node.children.flatMap(_collect);
}

/** Migrate legacy tree layout to row-grid on load */
export function migrateTreeToRows(layout) {
  if (layout.rows && layout.colWeights) return layout;
  if (layout.rows) {
    // Has rows but no weights ---add default weights
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
    findingsStandards: restoreFindingsStandards(),
    findingsStandardsExpanded: false,
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
      confidenceBand: false,
    },
    charts: {
      "chart-1": createSlot({ accentIdx: 0 }),
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
      confirmingReset: false,
    },
    columnConfig: {
      columns: [],
      loading: false,
    },
    activeChipEditor: null,
    methodLabCharts: [],   // chart IDs selected for Method Lab comparison (empty = all)
  };
}

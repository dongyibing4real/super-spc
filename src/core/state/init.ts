import type {
  ChartContext,
  ChartLayout,
  ChartLimits,
  ChartParams,
  ChartSlot,
  FindingsStandards,
  SPCState,
} from "../../types/state.ts";

const DEFAULT_FORECAST_HORIZON = 6;

const DEFAULT_FINDINGS_STANDARDS: FindingsStandards = {
  cpkThreshold: 1.33,
  cpkMarginal: 1.0,
  maxOocPercent: 2.0,
  maxOocCount: 3,
  centeringRatio: 0.9,
  runsZThreshold: 1.96,
  zoneDeviation: 0.2,
};

function restoreFindingsStandards(): FindingsStandards {
  try {
    const raw = localStorage.getItem("spc-findings-standards");
    if (raw) return { ...DEFAULT_FINDINGS_STANDARDS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_FINDINGS_STANDARDS };
}

/* ---Default empty state for initial load ---*/
const DEFAULT_CONTEXT: ChartContext = {
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

const DEFAULT_LIMITS: ChartLimits = {
  center: 0, ucl: 0, lcl: 0, usl: null, lsl: null,
  version: "", scope: "Dataset"
};

export const DEFAULT_PARAMS: ChartParams = {
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

export function createSlot(overrides: Partial<ChartSlot> = {}): ChartSlot {
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
    selectedPointIndices: null,
    selectedPhaseIndex: null,
    showDataTable: false,
    accentIdx: 0,
    _cascadeMemory: { lastIndividualType: null, lastSubgroupedType: null },
    forecast: {
      mode: "hidden",
      horizon: DEFAULT_FORECAST_HORIZON,
      timeBudget: 3,
      result: null,
      driftSummary: null,
      cacheKey: null,
      visibleHorizon: DEFAULT_FORECAST_HORIZON,
    },
    ...overrides,
  };
}

export function updateSlot(state: SPCState, id: string, updates: Partial<ChartSlot>): SPCState {
  return {
    ...state,
    charts: {
      ...state.charts,
      [id]: { ...state.charts[id], ...updates },
    },
  };
}

/* --- Tree helpers (kept temporarily for migration only) --- */

interface TreeNode {
  type?: string;
  chartId?: string;
  children?: TreeNode[];
}

function _collect(node: TreeNode | null): string[] {
  if (!node) return [];
  if (node.type === "pane") return [node.chartId!];
  return (node.children || []).flatMap(_collect);
}

interface LegacyLayout {
  rows?: string[][];
  colWeights?: number[][];
  rowWeights?: number[];
  tree?: TreeNode;
  slots?: string[];
}

/** Migrate legacy tree layout to row-grid on load */
export function migrateTreeToRows(layout: LegacyLayout): ChartLayout {
  if (layout.rows && layout.colWeights) return layout as ChartLayout;
  if (layout.rows) {
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

export function createInitialState(): SPCState {
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
    selectedPointIndices: null,
    selectedPhaseIndex: null,
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
      themePreference: 'system',
      themeResolved: 'dark',
      shortcutOverlay: false,
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
    methodLabCharts: [],
  };
}

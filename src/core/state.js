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
  return [...byRule.values()].map(r =>
    `${r.description} — ${r.count} point${r.count !== 1 ? "s" : ""} flagged.`
  );
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
    // ── Point-level items (change with the selected point) ──
    {
      label: "Value",
      value: point ? point.primaryValue.toFixed(4) : "—",
      resolved: Boolean(point),
      category: "point",
    },
    // ── Chart-level items (stable, describe the analysis) ──
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
      value: uniqueRules.size > 0 ? `${uniqueRules.size} rule${uniqueRules.size !== 1 ? "s" : ""} · ${violationCount} pts` : "None",
      resolved: uniqueRules.size === 0,
      category: "chart",
    },
    {
      label: "Points",
      value: `${state.points.length} · ${state.points.filter(p => p.excluded).length} excl`,
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
    checks.push("Investigate points beyond control limits — check for assignable causes.");
  }
  if (violations.some(v => v.testId === "2")) {
    checks.push("9+ consecutive points on same side of CL — possible process shift.");
  }
  if (violations.some(v => ["3", "5"].includes(v.testId))) {
    checks.push("Trending pattern detected — check for gradual process drift.");
  }
  if (violations.length === 0) {
    checks.push("Process appears in statistical control. Continue monitoring.");
  }
  if (point?.excluded) {
    checks.push(`Review exclusion of point ${point.label} — verify the reason is still valid.`);
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
    { label: "Method", value: focused.context.chartType?.label || "—", tone: "neutral" },
    { label: "Limits scope", value: focused.limits.scope, tone: "neutral" },
    { label: "Charts", value: String(state.chartOrder.length), tone: "neutral" },
  ];
}

function buildReportEligibility(finding) {
  const unresolved = finding.citations.filter((citation) => !citation.resolved);
  return {
    canExport: unresolved.length === 0,
    unresolved
  };
}

/* ═══ Default empty state for initial load ═══ */
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

const DEFAULT_PARAMS = {
  chart_type: "imr",
  sigma_method: "moving_range",
  k_sigma: 3.0,
  nelson_tests: [1, 2, 5],
  value_column: null,
  subgroup_column: null,
  phase_column: null,
  n_trials: null,
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

/* ═══ Split tree helpers ═══ */

/** Find the tree node at a given path (array of 0/1 indices) */
function getNodeAtPath(tree, path) {
  let node = tree;
  for (const idx of path) {
    if (!node.children) return null;
    node = node.children[idx];
  }
  return node;
}

/** Immutably replace a tree node at a given path */
function replaceNodeAtPath(tree, path, replacement) {
  if (path.length === 0) return replacement;
  const [head, ...rest] = path;
  const newChildren = tree.children.map((child, i) =>
    i === head ? replaceNodeAtPath(child, rest, replacement) : child
  );
  return { ...tree, children: newChildren, sizes: [...tree.sizes] };
}

/** Collect all chartIds from a tree (leaf traversal) */
export function collectChartIds(node) {
  if (node.type === "pane") return [node.chartId];
  return node.children.flatMap(collectChartIds);
}

/** Find the path to a pane by chartId */
function findPanePath(node, chartId, path = []) {
  if (node.type === "pane") return node.chartId === chartId ? path : null;
  for (let i = 0; i < node.children.length; i++) {
    const result = findPanePath(node.children[i], chartId, [...path, i]);
    if (result) return result;
  }
  return null;
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
    findings: [],
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
    activeFindingId: null,
    reportDraft: null,
    reportExport: {
      status: "idle",
      failNext: false,
      lastArtifactId: null
    },
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
      tree: { type: "pane", chartId: "chart-1" },
      minPaneSize: 300,
    },
    chartPicker: null, // { open: true } when the add-chart picker is visible
    ui: {
      notice: null,
      contextMenu: null,
      layersExpanded: false
    },
    auditLog: [],
    dataPrep: {
      selectedDatasetId: null,
      datasetPoints: [],
      loading: false,
      error: null,
      sortColumn: 'sequence_index',
      sortDirection: 'asc',
      rawRows: null,
      arqueroTable: null,
      transforms: [],
      hiddenColumns: [],
      columnOrder: [],
      unsavedChanges: false,
      activePanel: null,
    },
    columnConfig: {
      columns: [],
      loading: false,
    },
    activeChipEditor: null,
  };
}

/* ═══ New actions for API integration ═══ */

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
    findings: [],
    activeFindingId: null,
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

export function setLoadingState(state, loading) {
  return { ...state, loading, error: loading ? null : state.error };
}

export function setError(state, message) {
  return { ...state, loading: false, error: message };
}

/* ═══ Existing actions — refactored to selective cloning ═══ */

export function deriveWorkspace(state) {
  const point = getSelectedPoint(state);
  const signal = buildSignalNarrative(state, point);
  const evidence = buildEvidence(state, point);
  const activeFinding = state.findings.find((finding) => finding.id === state.activeFindingId) || null;
  const findingEligibility = activeFinding ? buildReportEligibility(activeFinding) : null;

  return {
    selectedPoint: point,
    signal,
    whyTriggered: buildWhyTriggered(state, point),
    rulesAtPoint: buildRulesAtPoint(state, state.selectedPointIndex),
    evidence,
    recommendations: buildRecommendations(state, point),
    compareCards: buildComparisonStrip(state),
    activeFinding,
    findingEligibility,
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

/* ═══ Data Prep actions ═══ */

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

export function setPrepSort(state, column) {
  const dp = state.dataPrep;
  const direction = dp.sortColumn === column && dp.sortDirection === 'asc' ? 'desc' : 'asc';
  return {
    ...state,
    dataPrep: { ...dp, sortColumn: column, sortDirection: direction }
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

/* ═══ Client-side data prep actions ═══ */

export function setPrepParsedData(state, { rawRows, arqueroTable, columns }) {
  return {
    ...state,
    dataPrep: {
      ...state.dataPrep,
      rawRows,
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
  return {
    ...state,
    dataPrep: {
      ...state.dataPrep,
      activePanel: state.dataPrep.activePanel === panel ? null : panel,
    },
  };
}

export function closeActivePanel(state) {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, activePanel: null },
  };
}

/* ═══ Column Config + Analysis Params actions ═══ */

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
  // Subgroup-based charts (X-Bar R, CUSUM, etc.) have their own point space —
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
  // Legacy method-lab integration — kept for backwards compatibility
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

export function selectFinding(state, findingId) {
  return { ...state, activeFindingId: findingId };
}

export function createFindingFromSelection(state) {
  const workspace = deriveWorkspace(state);
  const point = workspace.selectedPoint;

  if (!point) return state;

  const newFinding = {
    id: `finding-generated-${state.findings.length + 1}`,
    title: `Workspace finding from ${point.label}`,
    severity: point.primaryValue >= getPrimary(state).limits.ucl ? "High" : "Medium",
    summary: workspace.signal.title,
    confidence: workspace.signal.confidence === "High" ? 0.84 : 0.66,
    status: "Draft",
    owner: "Unassigned",
    citations: workspace.evidence.map((item) => ({
      label: item.label,
      value: item.value,
      resolved: item.resolved
    }))
  };

  return {
    ...state,
    findings: [newFinding, ...state.findings],
    activeFindingId: newFinding.id,
    auditLog: [`Finding draft created from workspace selection ${point.label}.`, ...state.auditLog],
    ui: {
      ...state.ui,
      notice: {
        tone: "positive",
        title: "Finding draft created",
        body: `${newFinding.title} is linked to the current workspace evidence.`
      }
    }
  };
}

export function generateReportDraft(state) {
  const finding = state.findings.find((item) => item.id === state.activeFindingId);
  if (!finding) return state;

  const eligibility = buildReportEligibility(finding);

  return {
    ...state,
    reportDraft: {
      id: `report-${finding.id}`,
      title: state.reportTemplate.title,
      findingTitle: finding.title,
      generatedAt: new Date().toISOString(),
      partial: !eligibility.canExport,
      unresolved: eligibility.unresolved
    },
    reportExport: { ...state.reportExport, status: "drafted" },
    ui: {
      ...state.ui,
      notice: {
        tone: eligibility.canExport ? "positive" : "warning",
        title: "Report draft generated",
        body: eligibility.canExport
          ? "All citations are resolved. The report is ready for export."
          : "The draft exists, but export is blocked until every citation resolves."
      }
    }
  };
}

export function toggleReportFailureMode(state) {
  const newFailNext = !state.reportExport.failNext;
  return {
    ...state,
    reportExport: { ...state.reportExport, failNext: newFailNext },
    ui: {
      ...state.ui,
      notice: {
        tone: newFailNext ? "warning" : "info",
        title: newFailNext ? "Next export will fail" : "Export failure cleared",
        body: newFailNext
          ? "Use this to verify the retry path without losing the draft."
          : "The next export attempt will use the normal success path."
      }
    }
  };
}

export function exportReport(state) {
  const finding = state.findings.find((item) => item.id === state.activeFindingId);
  if (!finding) return state;

  const eligibility = buildReportEligibility(finding);

  if (!eligibility.canExport) {
    return {
      ...state,
      reportExport: { ...state.reportExport, status: "blocked" },
      ui: {
        ...state.ui,
        notice: {
          tone: "critical",
          title: "Export blocked",
          body: `Resolve ${eligibility.unresolved.length} citation gap${eligibility.unresolved.length === 1 ? "" : "s"} before export.`
        }
      }
    };
  }

  if (state.reportExport.failNext) {
    return {
      ...state,
      reportExport: { ...state.reportExport, status: "failed", failNext: false },
      ui: {
        ...state.ui,
        notice: {
          tone: "critical",
          title: "Renderer failed",
          body: "The draft is preserved and can be retried without data loss."
        }
      }
    };
  }

  return {
    ...state,
    reportExport: { ...state.reportExport, status: "exported", lastArtifactId: `artifact-${finding.id}` },
    auditLog: [`Report exported for ${finding.id}.`, ...state.auditLog],
    ui: {
      ...state.ui,
      notice: {
        tone: "positive",
        title: "Report exported",
        body: `${state.reportTemplate.title} is ready for handoff.`
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

export function setChartLayout(state, arrangement, primaryPosition, splitRatio) {
  // Legacy preset support: convert arrangement name to a tree
  if (state.chartOrder.length <= 1) return state;
  const ids = state.chartOrder;
  const ratio = splitRatio != null ? splitRatio : (arrangement.includes("wide") || arrangement.includes("tall") ? 0.67 : 0.5);
  const isVert = arrangement === "vertical" || arrangement === "primary-tall" || arrangement === "challenger-tall";
  const direction = isVert ? "column" : "row";
  const firstId = (primaryPosition === "left" || primaryPosition === "top") ? ids[0] : ids[1];
  const secondId = firstId === ids[0] ? ids[1] : ids[0];

  if (arrangement === "single") {
    return { ...state, chartLayout: { ...state.chartLayout, tree: { type: "pane", chartId: ids[0] } } };
  }
  return {
    ...state,
    chartLayout: {
      ...state.chartLayout,
      tree: {
        type: "container", direction,
        children: [{ type: "pane", chartId: firstId }, { type: "pane", chartId: secondId }],
        sizes: [ratio, 1 - ratio],
      },
    },
  };
}

/* ═══ Multi-chart actions ═══ */

export function focusChart(state, chartId) {
  if (!state.charts[chartId] || state.focusedChartId === chartId) return state;
  return { ...state, focusedChartId: chartId };
}

export function addChart(state, { chartType = "imr", splitDirection = "row" } = {}) {
  const newId = `chart-${state.nextChartId}`;
  const focusedSlot = getFocused(state);

  // Inherit metric/subgroup/phase from focused chart
  const newParams = {
    ...DEFAULT_PARAMS,
    chart_type: chartType,
    value_column: focusedSlot.params.value_column,
    subgroup_column: focusedSlot.params.subgroup_column,
    phase_column: focusedSlot.params.phase_column,
  };

  // Set initial context to reflect chosen chart type (fully updated by reanalyze later)
  const chartLabels = {
    imr: "IMR", xbar_r: "X-Bar R", xbar_s: "X-Bar S", r: "R", s: "S", mr: "MR",
    p: "P", np: "NP", c: "C", u: "U", laney_p: "Laney P\u2019", laney_u: "Laney U\u2019",
    cusum: "CUSUM", ewma: "EWMA", levey_jennings: "Levey-Jennings",
    cusum_vmask: "CUSUM V-Mask", three_way: "Three-Way", presummarize: "Presummarize",
    run: "Run Chart", short_run: "Short Run", g: "G", t: "T",
    hotelling_t2: "Hotelling T\u00B2", mewma: "MEWMA",
  };
  const label = chartLabels[chartType] || chartType;
  const initialContext = {
    ...focusedSlot.context,
    chartType: { id: chartType, label, detail: "" },
    methodBadge: label,
  };
  const newSlot = createSlot({ params: newParams, context: initialContext });
  const newCharts = { ...state.charts, [newId]: newSlot };
  const newOrder = [...state.chartOrder, newId];

  // Split the focused pane in the tree
  const focusedPath = findPanePath(state.chartLayout.tree, state.focusedChartId);
  const newTree = focusedPath !== null
    ? replaceNodeAtPath(state.chartLayout.tree, focusedPath, {
        type: "container",
        direction: splitDirection,
        children: [
          { type: "pane", chartId: state.focusedChartId },
          { type: "pane", chartId: newId },
        ],
        sizes: [0.5, 0.5],
      })
    : {
        type: "container",
        direction: splitDirection,
        children: [state.chartLayout.tree, { type: "pane", chartId: newId }],
        sizes: [0.5, 0.5],
      };

  return {
    ...state,
    charts: newCharts,
    chartOrder: newOrder,
    nextChartId: state.nextChartId + 1,
    focusedChartId: newId,
    chartLayout: { ...state.chartLayout, tree: newTree },
    chartPicker: null,
  };
}

export function removeChart(state, chartId) {
  // Cannot remove the last chart
  if (state.chartOrder.length <= 1) return state;
  if (!state.charts[chartId]) return state;

  // Remove from charts and order
  const newCharts = { ...state.charts };
  delete newCharts[chartId];
  const newOrder = state.chartOrder.filter(id => id !== chartId);

  // Collapse the tree: find the pane, replace its parent container with the sibling
  const path = findPanePath(state.chartLayout.tree, chartId);
  let newTree = state.chartLayout.tree;
  if (path && path.length > 0) {
    const parentPath = path.slice(0, -1);
    const childIndex = path[path.length - 1];
    const parent = getNodeAtPath(newTree, parentPath);
    if (parent && parent.children) {
      const sibling = parent.children[1 - childIndex];
      newTree = replaceNodeAtPath(newTree, parentPath, sibling);
    }
  } else if (path && path.length === 0) {
    // Removing root pane — shouldn't happen (guarded above), but safe fallback
    newTree = { type: "pane", chartId: newOrder[0] };
  }

  // Move focus to sibling or first chart
  const newFocus = state.focusedChartId === chartId ? newOrder[0] : state.focusedChartId;

  return {
    ...state,
    charts: newCharts,
    chartOrder: newOrder,
    focusedChartId: newFocus,
    chartLayout: { ...state.chartLayout, tree: newTree },
  };
}

export function resizeSplit(state, path, sizes) {
  const node = getNodeAtPath(state.chartLayout.tree, path);
  if (!node || node.type !== "container") return state;
  const newTree = replaceNodeAtPath(state.chartLayout.tree, path, { ...node, sizes });
  return { ...state, chartLayout: { ...state.chartLayout, tree: newTree } };
}

export function openChartPicker(state) {
  return { ...state, chartPicker: { open: true } };
}

export function closeChartPicker(state) {
  return { ...state, chartPicker: null };
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

/* ═══ Structural Findings actions ═══ */

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

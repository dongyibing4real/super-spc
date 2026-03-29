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

  const primary = getPrimary(state);
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
  const violations = getPrimary(state).violations || [];
  if (violations.length === 0) {
    return ["No rule violations detected in this dataset."];
  }

  return violations.map(v => {
    const count = v.indices.length;
    return `${v.description} — ${count} point${count !== 1 ? "s" : ""} flagged.`;
  });
}

function buildEvidence(state, point) {
  const primary = getPrimary(state);
  const sigma = primary.sigma;
  const violationCount = (primary.violations || []).reduce((sum, v) => sum + v.indices.length, 0);

  return [
    {
      label: "Selected point",
      value: point ? `${point.label} (${point.primaryValue.toFixed(4)})` : "None",
      resolved: Boolean(point),
    },
    {
      label: "Sigma estimate",
      value: sigma ? `${sigma.sigma_hat.toFixed(6)} (${sigma.method})` : "Not computed",
      resolved: Boolean(sigma),
    },
    {
      label: "Control limits",
      value: `UCL ${primary.limits.ucl.toFixed(4)} / CL ${primary.limits.center.toFixed(4)} / LCL ${primary.limits.lcl.toFixed(4)}`,
      resolved: true,
    },
    {
      label: "Rule violations",
      value: violationCount > 0 ? `${violationCount} points flagged` : "None",
      resolved: violationCount === 0,
    },
    {
      label: "Excluded points",
      value: `${state.points.filter(p => p.excluded).length} of ${state.points.length}`,
      resolved: true,
    },
    {
      label: "Transform pipeline",
      value: state.pipeline.status === "ready" ? "All steps valid" : "Pipeline partial — some steps failed",
      resolved: state.pipeline.status === "ready",
    },
    {
      label: "Limits version",
      value: primary.limits.version || "—",
      resolved: true,
    },
  ];
}

function buildRecommendations(state, point) {
  const checks = [];
  const violations = getPrimary(state).violations || [];

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
  const primary = getPrimary(state);
  const violations = primary.violations || [];
  const violationCount = violations.reduce((sum, v) => sum + v.indices.length, 0);
  const ruleCount = violations.length;

  if (state.chartOrder.length > 1) {
    return [
      { label: "OOC points", value: String(violationCount), tone: violationCount > 0 ? "critical" : "positive" },
      { label: "Rules triggered", value: String(ruleCount), tone: ruleCount > 0 ? "warning" : "positive" },
      { label: "Method", value: primary.context.chartType?.label || "—", tone: "neutral" },
      { label: "Limits scope", value: primary.limits.scope, tone: "neutral" },
    ];
  }

  return [
    { label: "OOC points", value: String(violationCount), tone: violationCount > 0 ? "critical" : "positive" },
    { label: "Rules triggered", value: String(ruleCount), tone: ruleCount > 0 ? "warning" : "positive" },
    { label: "Sigma method", value: primary.sigma?.method || "—", tone: "neutral" },
    { label: "Limits scope", value: primary.limits.scope, tone: "neutral" },
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

/** Helper to read the primary chart slot */
export function getPrimary(state) {
  return state.charts[state.chartOrder[0]];
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
      primary: createSlot(),
      challenger: createSlot({ params: { ...DEFAULT_PARAMS, chart_type: "xbar_r" } }),
    },
    chartOrder: ["primary", "challenger"],
    chartLayout: {
      arrangement: "horizontal",
      primaryPosition: "left",
      splitRatio: 0.5,
    },
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

export function selectPoint(state, index) {
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
  // Manage chartOrder: "ready" includes challengers, other statuses remove them
  const hasChallenger = state.chartOrder.length > 1;
  let chartOrder = state.chartOrder;
  if (status === "ready" && !hasChallenger) {
    chartOrder = [...state.chartOrder, "challenger"];
  } else if (status !== "ready" && hasChallenger) {
    chartOrder = [state.chartOrder[0]];
  }
  return {
    ...state,
    chartOrder,
    auditLog: [`Challenger method status changed to ${status}.`, ...state.auditLog],
    ui: {
      ...state.ui,
      notice: {
        tone: status === "ready" ? "positive" : status === "partial" ? "warning" : "critical",
        title: "Method lab updated",
        body:
          status === "ready"
            ? "Primary and challenger methods are now fully comparable."
            : status === "partial"
              ? "Primary completed, challenger needs another run."
              : "Challenger timed out. Primary remains authoritative."
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
  return {
    ...state,
    chartLayout: {
      arrangement,
      primaryPosition,
      splitRatio: splitRatio != null ? splitRatio : (arrangement.includes("wide") || arrangement.includes("tall") ? 0.67 : 0.5),
    }
  };
}

export function setXDomainOverride(state, min, max, id = "primary") {
  return updateSlot(state, id, { overrides: { ...state.charts[id].overrides, x: { min, max } } });
}

export function setYDomainOverride(state, yMin, yMax, id = "primary") {
  return updateSlot(state, id, { overrides: { ...state.charts[id].overrides, y: { yMin, yMax } } });
}

export function resetAxis(state, axis, id = "primary") {
  const overrides = state.charts[id].overrides;
  if (axis === 'x') return updateSlot(state, id, { overrides: { ...overrides, x: null } });
  if (axis === 'y') return updateSlot(state, id, { overrides: { ...overrides, y: null } });
  return state;
}

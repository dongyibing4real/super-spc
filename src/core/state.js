import { createMockModel } from "../data/mock-data.js";

function cloneState(state) {
  return structuredClone(state);
}

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
  return state.phases.find((phase) => phase.id === phaseId)?.label || phaseId;
}

function buildSignalNarrative(state, point) {
  if (!point) {
    return {
      title: "Choose a point to inspect the signal.",
      confidence: "Pending",
      statusTone: "neutral"
    };
  }

  if (point.primaryValue >= state.limits.ucl) {
    return {
      title: `Persistent upward drift began in ${point.phaseId} and is now beyond the saved UCL.`,
      confidence: state.compare.challengerStatus === "ready" ? "High" : "Medium",
      statusTone: "critical"
    };
  }

  if (point.excluded) {
    return {
      title: `Selected lot ${point.lot} is excluded from limit calculations but remains visible for audit review.`,
      confidence: "Review exclusion",
      statusTone: "warning"
    };
  }

  return {
    title: `Signal is building through ${point.phaseId}; review the event boundary and subgroup split before publishing.`,
    confidence: "Moderate",
    statusTone: "info"
  };
}

function buildWhyTriggered(state, point) {
  const rules = [
    "Rule 1 breach at lots L-2865, L-2866, and L-2867.",
    "Eight-point upward run begins after the P3 maintenance boundary.",
    "Robust adaptive overlay discounts transient spikes without hiding them."
  ];

  if (state.compare.challengerStatus !== "ready") {
    rules[2] = "Challenger method is partial; comparison deltas remain visible but unresolved.";
  }

  if (point?.excluded) {
    rules.unshift(`Lot ${point.lot} is excluded from the current compute but still displayed as an audit marker.`);
  }

  return rules;
}

function buildEvidence(state, point) {
  const transformResolved = state.pipeline.status === "ready";
  const methodResolved = state.compare.challengerStatus === "ready";

  return [
    {
      label: "Lots",
      value: point ? `${point.lot} through L-2867` : "Choose a point",
      resolved: Boolean(point)
    },
    {
      label: "Transform steps",
      value: state.transforms
        .filter((step) => step.active || step.status === "failed")
        .map((step) => step.id)
        .join(", "),
      resolved: transformResolved
    },
    {
      label: "Phase definition",
      value: `${point?.phaseId || "P3"} via event boundary M-204`,
      resolved: true
    },
    {
      label: "Subgroup logic",
      value: state.context.subgroup.label,
      resolved: true
    },
    {
      label: "Limits version",
      value: state.limits.version,
      resolved: true
    },
    {
      label: "Method version",
      value: methodResolved ? `EWMA-1.0 and ${state.compare.challengerVersion}` : "Primary only",
      resolved: methodResolved
    }
  ];
}

function buildRecommendations(state, point) {
  const checks = [
    "Compare chamber clean timestamp against the P3 boundary.",
    "Inspect cavity-specific behavior before widening scope.",
    "Generate a fresh post-maintenance limits set for Cavity 1."
  ];

  if (point?.excluded) {
    checks.unshift(`Review why ${point.lot} is excluded and whether the exclusion should remain active.`);
  }

  if (state.compare.challengerStatus !== "ready") {
    checks.push("Re-run the challenger method before promoting a final finding.");
  }

  return checks;
}

function buildComparisonStrip(state) {
  if (state.compare.challengerStatus === "ready") {
    return [
      { label: "False alarms", value: "12 -> 4", tone: "positive" },
      { label: "Earliest detection", value: "5 lots earlier", tone: "neutral" },
      { label: "Method agreement", value: "High", tone: "positive" },
      { label: "Limits scope", value: state.limits.scope, tone: "neutral" }
    ];
  }

  if (state.compare.challengerStatus === "partial") {
    return [
      { label: "False alarms", value: "Primary only", tone: "warning" },
      { label: "Earliest detection", value: "Pending challenger", tone: "warning" },
      { label: "Method agreement", value: "Unresolved", tone: "warning" },
      { label: "Limits scope", value: state.limits.scope, tone: "neutral" }
    ];
  }

  return [
    { label: "False alarms", value: "Timed out", tone: "critical" },
    { label: "Earliest detection", value: "Unknown", tone: "critical" },
    { label: "Method agreement", value: "Unavailable", tone: "critical" },
    { label: "Limits scope", value: state.limits.scope, tone: "neutral" }
  ];
}

function buildReportEligibility(finding) {
  const unresolved = finding.citations.filter((citation) => !citation.resolved);
  return {
    canExport: unresolved.length === 0,
    unresolved
  };
}

export function createInitialState() {
  const model = createMockModel();

  return {
    route: "workspace",
    context: model.context,
    limits: model.limits,
    challengerLimits: model.challengerLimits,
    phases: model.phases,
    points: model.points,
    transforms: model.transforms,
    findings: model.findings,
    reportTemplate: model.reportTemplate,
    compare: {
      primaryMethod: "EWMA-1.0",
      challengerMethod: "Robust Adaptive",
      challengerVersion: "RA-2.1",
      challengerStatus: "ready"
    },
    pipeline: {
      status: "ready",
      rescueMode: "none",
      lastSuccessfulAt: "2026-03-25 11:12"
    },
    selectedPointIndex: 24,
    activeFindingId: model.findings[0].id,
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
      confidenceBand: true
    },
    chartLayout: {
      arrangement: "horizontal",   // "horizontal" | "vertical" | "single" | "primary-wide" | "primary-tall"
      primaryPosition: "left",     // "left" | "right" | "top" | "bottom"
      splitRatio: 0.5,             // 0-1, fraction of space for the first pane
    },
    ui: {
      notice: null,
      contextMenu: null
    },
    auditLog: [
      "Workspace loaded from normalized CSV dataset.",
      "Phase-aware limits resolved from limits-v12.4.",
      "Robust adaptive challenger completed successfully."
    ]
  };
}

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
  const next = cloneState(state);
  next.route = route;
  next.ui.contextMenu = null;
  return next;
}

export function selectPoint(state, index) {
  const next = cloneState(state);
  next.selectedPointIndex = clamp(index, 0, next.points.length - 1);
  next.ui.contextMenu = null;
  return next;
}

export function moveSelection(state, delta) {
  return selectPoint(state, state.selectedPointIndex + delta);
}

export function toggleChartOption(state, option) {
  const next = cloneState(state);
  next.chartToggles[option] = !next.chartToggles[option];
  return next;
}

export function togglePointExclusion(state, index) {
  const next = cloneState(state);
  const point = next.points[index];

  if (!point) {
    return next;
  }

  point.excluded = !point.excluded;
  next.pipeline.status = "ready";
  next.pipeline.rescueMode = "none";
  next.auditLog.unshift(
    `${point.lot} ${point.excluded ? "excluded" : "restored"} while remaining visible on the chart.`
  );
  next.ui.notice = {
    tone: "info",
    title: point.excluded ? "Point excluded" : "Point restored",
    body: `${point.lot} remains visible so the exclusion is auditable.`
  };

  return next;
}

export function toggleTransform(state, stepId) {
  const next = cloneState(state);
  const step = next.transforms.find((candidate) => candidate.id === stepId);

  if (!step || step.status === "failed") {
    return next;
  }

  step.active = !step.active;
  step.status = step.active ? "active" : "inactive";
  next.auditLog.unshift(`${step.id} ${step.active ? "enabled" : "disabled"} from the reversible prep pipeline.`);
  next.ui.notice = {
    tone: "info",
    title: step.active ? "Transform enabled" : "Transform disabled",
    body: step.detail
  };

  return next;
}

export function failTransformStep(state, stepId) {
  const next = cloneState(state);
  const step = next.transforms.find((candidate) => candidate.id === stepId);

  if (!step) {
    return next;
  }

  step.status = "failed";
  step.active = false;
  next.pipeline.status = "partial";
  next.pipeline.rescueMode = "retain-previous-compute";
  next.auditLog.unshift(`${step.id} failed validation. Prior chart result retained and the step is marked partial.`);
  next.ui.notice = {
    tone: "warning",
    title: "Transform failed",
    body: `${step.title} failed validation. The previous chart result is still active while the step stays reversible.`
  };

  return next;
}

export function recoverTransformStep(state, stepId) {
  const next = cloneState(state);
  const step = next.transforms.find((candidate) => candidate.id === stepId);

  if (!step) {
    return next;
  }

  step.status = "active";
  step.active = true;
  next.pipeline.status = getFailedTransformCount(next) > 0 ? "partial" : "ready";
  next.pipeline.rescueMode = next.pipeline.status === "ready" ? "none" : "retain-previous-compute";
  next.auditLog.unshift(`${step.id} recovered and rejoined the active compute path.`);
  next.ui.notice = {
    tone: "positive",
    title: "Transform recovered",
    body: `${step.title} is active again and the pipeline has been revalidated.`
  };

  return next;
}

export function setChallengerStatus(state, status) {
  const next = cloneState(state);
  next.compare.challengerStatus = status;
  next.auditLog.unshift(`Challenger method status changed to ${status}.`);
  next.ui.notice = {
    tone: status === "ready" ? "positive" : status === "partial" ? "warning" : "critical",
    title: "Method lab updated",
    body:
      status === "ready"
        ? "Primary and challenger methods are now fully comparable."
        : status === "partial"
          ? "Primary completed, challenger needs another run."
          : "Challenger timed out. Primary remains authoritative."
  };

  return next;
}

export function selectFinding(state, findingId) {
  const next = cloneState(state);
  next.activeFindingId = findingId;
  return next;
}

export function createFindingFromSelection(state) {
  const next = cloneState(state);
  const workspace = deriveWorkspace(next);
  const point = workspace.selectedPoint;

  if (!point) {
    return next;
  }

  const newFinding = {
    id: `finding-generated-${next.findings.length + 1}`,
    title: `Workspace finding from ${point.lot}`,
    severity: point.primaryValue >= next.limits.ucl ? "High" : "Medium",
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

  next.findings.unshift(newFinding);
  next.activeFindingId = newFinding.id;
  next.ui.notice = {
    tone: "positive",
    title: "Finding draft created",
    body: `${newFinding.title} is linked to the current workspace evidence.`
  };
  next.auditLog.unshift(`Finding draft created from workspace selection ${point.lot}.`);

  return next;
}

export function generateReportDraft(state) {
  const next = cloneState(state);
  const finding = next.findings.find((item) => item.id === next.activeFindingId);

  if (!finding) {
    return next;
  }

  const eligibility = buildReportEligibility(finding);
  next.reportDraft = {
    id: `report-${finding.id}`,
    title: next.reportTemplate.title,
    findingTitle: finding.title,
    generatedAt: "2026-03-25 11:45",
    partial: !eligibility.canExport,
    unresolved: eligibility.unresolved
  };
  next.reportExport.status = "drafted";
  next.ui.notice = {
    tone: eligibility.canExport ? "positive" : "warning",
    title: "Report draft generated",
    body: eligibility.canExport
      ? "All citations are resolved. The report is ready for export."
      : "The draft exists, but export is blocked until every citation resolves."
  };

  return next;
}

export function toggleReportFailureMode(state) {
  const next = cloneState(state);
  next.reportExport.failNext = !next.reportExport.failNext;
  next.ui.notice = {
    tone: next.reportExport.failNext ? "warning" : "info",
    title: next.reportExport.failNext ? "Next export will fail" : "Export failure cleared",
    body: next.reportExport.failNext
      ? "Use this to verify the retry path without losing the draft."
      : "The next export attempt will use the normal success path."
  };
  return next;
}

export function exportReport(state) {
  const next = cloneState(state);
  const finding = next.findings.find((item) => item.id === next.activeFindingId);

  if (!finding) {
    return next;
  }

  const eligibility = buildReportEligibility(finding);

  if (!eligibility.canExport) {
    next.reportExport.status = "blocked";
    next.ui.notice = {
      tone: "critical",
      title: "Export blocked",
      body: `Resolve ${eligibility.unresolved.length} citation gap${eligibility.unresolved.length === 1 ? "" : "s"} before export.`
    };
    return next;
  }

  if (next.reportExport.failNext) {
    next.reportExport.status = "failed";
    next.reportExport.failNext = false;
    next.ui.notice = {
      tone: "critical",
      title: "Renderer failed",
      body: "The draft is preserved and can be retried without data loss."
    };
    return next;
  }

  next.reportExport.status = "exported";
  next.reportExport.lastArtifactId = `artifact-${finding.id}`;
  next.ui.notice = {
    tone: "positive",
    title: "Report exported",
    body: `${next.reportTemplate.title} is ready for handoff.`
  };
  next.auditLog.unshift(`Report exported for ${finding.id}.`);

  return next;
}

export function clearNotice(state) {
  const next = cloneState(state);
  next.ui.notice = null;
  return next;
}

export function openContextMenu(state, x, y) {
  const next = cloneState(state);
  next.ui.contextMenu = { x, y };
  return next;
}

export function closeContextMenu(state) {
  const next = cloneState(state);
  next.ui.contextMenu = null;
  return next;
}

export function setChartLayout(state, arrangement, primaryPosition, splitRatio) {
  const next = cloneState(state);
  next.chartLayout = {
    arrangement,
    primaryPosition,
    splitRatio: splitRatio != null ? splitRatio : (arrangement.includes("wide") || arrangement.includes("tall") ? 0.67 : 0.5),
  };
  return next;
}

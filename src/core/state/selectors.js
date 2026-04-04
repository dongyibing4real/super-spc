import { getFailedTransformCount } from './init.js';
import { SIGMA_METHOD_LABELS, capClass } from '../../helpers.js';

/** Helper to read the first chart slot (chartOrder[0]). */
export function getFirstChart(state) {
  return state.charts[state.chartOrder[0]];
}
/** @deprecated Use getFirstChart(). */
export const getPrimary = getFirstChart;

/** Helper to read the focused chart slot */
export function getFocused(state) {
  return state.charts[state.focusedChartId] || getFirstChart(state);
}

export function getSelectedPoint(state) {
  const focused = getFocused(state);
  const hasChartValues = focused.chartValues && focused.chartValues.length > 0;
  if (hasChartValues) {
    const idx = focused.selectedPointIndex ?? 0;
    const v = focused.chartValues[idx];
    return v != null ? {
      primaryValue: v,
      label: focused.chartLabels?.[idx] || `pt-${idx}`,
      subgroupLabel: focused.chartLabels?.[idx] || `pt-${idx}`,
      excluded: false,
      annotation: null,
      raw: {},
    } : undefined;
  }
  return state.points[state.selectedPointIndex];
}

export function getPhaseLabel(state, phaseId) {
  const phases = getPrimary(state).phases || [];
  return phases.find((phase) => phase.id === phaseId)?.label || phaseId;
}

export function buildSignalNarrative(state, point) {
  if (!point) {
    return { title: "Select a point to inspect.", confidence: "Pending", statusTone: "neutral" };
  }

  const primary = getFocused(state);
  const violations = primary.violations || [];
  const hasChartValues = primary.chartValues && primary.chartValues.length > 0;
  const idx = hasChartValues ? (primary.selectedPointIndex ?? 0) : state.selectedPointIndex;
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

export function buildWhyTriggered(state, point) {
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
    // --- Point-level items (change with the selected point) ---
    {
      label: "Value",
      value: point ? point.primaryValue.toFixed(4) : "-",
      resolved: Boolean(point),
      category: "point",
    },
    // --- Chart-level items (stable, describe the analysis) ---
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
      value: uniqueRules.size > 0 ? `${uniqueRules.size} rule${uniqueRules.size !== 1 ? "s" : ""} ${violationCount} pts` : "None",
      resolved: uniqueRules.size === 0,
      category: "chart",
    },
    {
      label: "Points",
      value: `${state.points.length} ${state.points.filter(p => p.excluded).length} excl`,
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

/**
 * Build violation breakdown for a set of point indices.
 * Returns: { inControl, oocCount, ruleBreakdown: [{testId, description, count}] }
 */
function _buildViolationBreakdown(violations, indices) {
  const indexSet = new Set(indices);
  const oocIndices = new Set();
  const ruleMap = new Map(); // testId -> { description, indices: Set }

  for (const v of violations) {
    const matched = v.indices.filter(i => indexSet.has(i));
    if (matched.length === 0) continue;

    if (v.testId === '1') {
      for (const i of matched) oocIndices.add(i);
    }

    if (!ruleMap.has(v.testId)) {
      ruleMap.set(v.testId, { testId: v.testId, description: v.description, pts: new Set() });
    }
    for (const i of matched) ruleMap.get(v.testId).pts.add(i);
  }

  const ruleBreakdown = [...ruleMap.values()]
    .map(r => ({ testId: r.testId, description: r.description, count: r.pts.size }))
    .sort((a, b) => b.count - a.count);

  return {
    total: indices.length,
    oocCount: oocIndices.size,
    inControl: indices.length - oocIndices.size,
    ruleBreakdown,
  };
}

/** Build selected phase summary for evidence rail display. */
function _buildSelectedPhase(focused) {
  const idx = focused.selectedPhaseIndex;
  if (idx == null || !focused.phases || !focused.phases[idx]) return null;
  const phase = focused.phases[idx];
  const pointCount = (phase.end - phase.start) + 1;
  const phaseIndices = [];
  for (let i = phase.start; i <= phase.end; i++) phaseIndices.push(i);
  const violations = focused.violations || [];
  const breakdown = _buildViolationBreakdown(violations, phaseIndices);

  return {
    label: phase.label || phase.id || `Phase ${idx + 1}`,
    index: idx,
    ucl: phase.limits?.ucl,
    center: phase.limits?.center,
    lcl: phase.limits?.lcl,
    pointCount,
    ...breakdown,
  };
}

/** Build summary for multi-point (marquee) selection. */
function _buildSelectedPoints(state) {
  const focused = getFocused(state);
  const hasChartValues = focused.chartValues && focused.chartValues.length > 0;
  const indices = hasChartValues
    ? (focused.selectedPointIndices || null)
    : (state.selectedPointIndices || null);

  if (!indices || indices.length === 0) return null;

  const points = hasChartValues
    ? focused.chartValues.map((v, i) => ({
        primaryValue: v,
        label: focused.chartLabels?.[i] || `pt-${i}`,
        excluded: false,
      }))
    : state.points;

  const violations = focused.violations || [];
  const values = [];
  let excludedCount = 0;

  for (const idx of indices) {
    const pt = points[idx];
    if (!pt) continue;
    const val = pt.primaryValue ?? pt.value;
    if (val != null) values.push(val);
    if (pt.excluded) excludedCount++;
  }

  if (values.length === 0) return null;

  const count = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((s, v) => s + v, 0) / count;
  const variance = count > 1
    ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (count - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  const range = max - min;
  const breakdown = _buildViolationBreakdown(violations, indices);

  return {
    count,
    min,
    max,
    mean,
    stdDev,
    range,
    ...breakdown,
    excludedCount,
    indices,
  };
}

// ─── Method Lab selectors ──────────────────────────

/** Per-chart method summary for side-by-side comparison. */
export function buildMethodLabComparison(state) {
  return state.chartOrder.map(id => {
    const slot = state.charts[id];
    if (!slot) return { id, empty: true };
    const params = slot.params || {};
    const violations = slot.violations || [];
    const totalOOC = violations.reduce((sum, v) => sum + v.indices.length, 0);
    const uniqueRules = new Set(violations.map(v => v.testId));

    // Per-rule breakdown: deduplicate by testId, sum points across phases
    const ruleMap = new Map();
    for (const v of violations) {
      if (!ruleMap.has(v.testId)) {
        ruleMap.set(v.testId, { testId: v.testId, desc: v.description, count: 0 });
      }
      ruleMap.get(v.testId).count += v.indices.length;
    }

    // Nelson rules: params stores boolean array indexed 0-7 → convert to rule numbers
    const enabledRules = (params.nelson_rules || [])
      .map((on, i) => on ? String(i + 1) : null)
      .filter(Boolean);

    return {
      id,
      isFocused: id === state.focusedChartId,
      // Method config
      chartType: slot.context?.chartType?.label || (params.chart_type ? params.chart_type : "Select…"),
      sigmaMethod: slot.context?.sigma?.detail || SIGMA_METHOD_LABELS[params.sigma_method] || "—",
      kSigma: params.k_sigma ?? 3,
      subgroup: slot.context?.subgroup?.detail || "Individual",
      phaseColumn: params.phase_column || "None",
      // Limits
      ucl: slot.limits?.ucl,
      center: slot.limits?.center,
      lcl: slot.limits?.lcl,
      limitsScope: slot.limits?.scope || "—",
      // Sigma estimate
      sigmaHat: slot.sigma?.sigma_hat,
      // Capability
      cpk: slot.capability?.cpk,
      ppk: slot.capability?.ppk,
      cp: slot.capability?.cp,
      capGrade: slot.capability?.cpk != null ? capClass(slot.capability.cpk) : null,
      // Violations
      oocCount: totalOOC,
      ruleCount: uniqueRules.size,
      ruleBreakdown: [...ruleMap.values()].sort((a, b) => b.count - a.count),
      // Config
      enabledRules,
      // Phases
      phaseCount: (slot.phases || []).length,
    };
  });
}

/** Points where charts disagree (some flag, some don't). Only meaningful with 2+ charts.
 *  @param {Array<string>} [chartIds] - optional subset of chart IDs to compare (defaults to all)
 */
export function buildDisagreements(state, chartIds) {
  const ids = chartIds || state.chartOrder;
  if (ids.length < 2) return { items: [], summary: null };

  // For each chart, build a Set of all violation point indices
  const chartSets = ids.map(id => {
    const slot = state.charts[id];
    if (!slot) return { id, label: "—", indices: new Set() };
    const violations = slot.violations || [];
    const indices = new Set();
    for (const v of violations) v.indices.forEach(i => indices.add(i));
    return {
      id,
      label: slot.context?.chartType?.label || id,
      indices,
    };
  });

  // Collect every index flagged by ANY chart
  const allFlagged = new Set();
  for (const c of chartSets) c.indices.forEach(i => allFlagged.add(i));

  const items = [];
  for (const idx of [...allFlagged].sort((a, b) => a - b)) {
    const flaggedBy = chartSets.filter(c => c.indices.has(idx));
    const clearedBy = chartSets.filter(c => !c.indices.has(idx));
    if (flaggedBy.length === 0 || clearedBy.length === 0) continue; // unanimous — skip

    const pt = state.points[idx];
    const value = pt?.primaryValue ?? pt?.value;

    // Which rules each flagging chart uses at this point
    const ruleDetails = flaggedBy.map(c => {
      const rules = (state.charts[c.id].violations || [])
        .filter(v => v.indices.includes(idx))
        .map(v => v.description);
      return { chartLabel: c.label, rules };
    });

    items.push({
      pointIndex: idx,
      label: pt?.label || `pt-${idx + 1}`,
      value,
      flaggedBy: ruleDetails,
      clearedBy: clearedBy.map(c => c.label),
    });
  }

  // Summary: how many points each chart uniquely flags
  const totalPoints = state.points.length;
  const uniqueCounts = chartSets.map(c => {
    const uniqueToThis = [...c.indices].filter(idx => {
      return chartSets.every(other => other === c || !other.indices.has(idx));
    });
    return { label: c.label, uniqueCount: uniqueToThis.length };
  });

  // Points where ALL charts agree they're OOC
  const unanimousOOC = [...allFlagged].filter(idx =>
    chartSets.every(c => c.indices.has(idx))
  ).length;

  return {
    items,
    summary: {
      disagreementCount: items.length,
      totalPoints,
      pct: totalPoints > 0 ? (items.length / totalPoints * 100).toFixed(1) : "0",
      uniqueCounts,
      unanimousOOC,
    },
  };
}

export function deriveWorkspace(state) {
  const focused = getFocused(state);
  const hasChartValues = focused.chartValues && focused.chartValues.length > 0;

  // Determine if user explicitly selected a point (vs default index 0)
  const rawIdx = hasChartValues ? focused.selectedPointIndex : state.selectedPointIndex;
  const hasPointSelection = rawIdx != null;

  const point = hasPointSelection ? getSelectedPoint(state) : undefined;
  const signal = buildSignalNarrative(state, point);
  const evidence = buildEvidence(state, point);
  const activeIdx = hasChartValues ? (focused.selectedPointIndex ?? 0) : state.selectedPointIndex;

  // Build single-point violation breakdown when a point IS selected
  let pointBreakdown = null;
  if (hasPointSelection && activeIdx != null) {
    const violations = focused.violations || [];
    pointBreakdown = _buildViolationBreakdown(violations, [activeIdx]);
  }

  // Selected phase summary for evidence rail
  const selectedPhase = _buildSelectedPhase(focused);

  // Multi-point (marquee) selection summary
  const selectedPoints = _buildSelectedPoints(state);

  return {
    selectedPoint: point,
    hasPointSelection,
    pointBreakdown,
    selectedPoints,
    signal,
    whyTriggered: buildWhyTriggered(state, point),
    rulesAtPoint: buildRulesAtPoint(state, activeIdx),
    evidence,
    recommendations: buildRecommendations(state, point),
    compareCards: buildComparisonStrip(state),
    excludedCount: state.points.filter((candidate) => candidate.excluded).length,
    lineageCount: state.transforms.filter((step) => step.active || step.status === "failed").length,
    failedTransformCount: getFailedTransformCount(state),
    phaseLabel: point ? getPhaseLabel(state, point.phaseId) : null,
    selectedPhase,
  };
}

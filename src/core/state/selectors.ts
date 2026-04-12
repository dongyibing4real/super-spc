import { SIGMA_METHOD_LABELS } from '../../constants.js';
import { capClass } from '../../helpers.js';
import type { SPCState, ChartSlot, ChartPoint, Violation } from '../../types/state.js';

interface TransformStep {
  status?: string;
  active?: boolean;
  [key: string]: unknown;
}

export function getFailedTransformCount(state: SPCState): number {
  return (state.transforms as TransformStep[]).filter((step) => step.status === "failed").length;
}

interface CapabilityResult {
  cpk: number | null;
  ppk: number | null;
  cp: number | null;
}

export function getCapability(state: SPCState, id: string | null = null): CapabilityResult {
  if (!id) id = state.focusedChartId || state.chartOrder[0];
  return state.charts[id]?.capability || { cpk: null, ppk: null, cp: null };
}

export function detectRuleViolations(state: SPCState, id: string | null = null): Map<number, string[]> {
  if (!id) id = state.focusedChartId || state.chartOrder[0];
  const violations = new Map<number, string[]>();
  const stateViolations = state.charts[id]?.violations || [];
  stateViolations.forEach(v => {
    v.indices.forEach(idx => {
      if (!violations.has(idx)) violations.set(idx, []);
      violations.get(idx)!.push(v.testId);
    });
  });
  return violations;
}

/** Helper to read the first chart slot (chartOrder[0]). */
export function getFirstChart(state: SPCState): ChartSlot {
  return state.charts[state.chartOrder[0]];
}

/** Helper to read the focused chart slot */
export function getFocused(state: SPCState): ChartSlot {
  return state.charts[state.focusedChartId] || getFirstChart(state);
}

interface SelectedPointInfo {
  primaryValue: number;
  label: string;
  subgroupLabel: string;
  excluded: boolean;
  annotation: string | null;
  raw: Record<string, string>;
  phaseId?: string | null;
}

function getSelectedPoint(state: SPCState): SelectedPointInfo | undefined {
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
  const pt = state.points[state.selectedPointIndex!];
  return pt as SelectedPointInfo | undefined;
}

function getPhaseLabel(state: SPCState, phaseId: string | null): string {
  const phases = getFirstChart(state).phases || [];
  return (phases.find((phase) => phase.id === phaseId) as Record<string, unknown> | undefined)?.label as string || phaseId || "";
}

interface SignalNarrative {
  title: string;
  confidence: string;
  statusTone: string;
}

function buildSignalNarrative(state: SPCState, point: SelectedPointInfo | undefined): SignalNarrative {
  if (!point) {
    return { title: "Select a point to inspect.", confidence: "Pending", statusTone: "neutral" };
  }

  const primary = getFocused(state);
  const violations = primary.violations || [];
  const hasChartValues = primary.chartValues && primary.chartValues.length > 0;
  const idx = hasChartValues ? (primary.selectedPointIndex ?? 0) : state.selectedPointIndex!;
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

interface WhyTriggeredItem {
  description: string;
  count: number;
}

function buildWhyTriggered(state: SPCState, point: SelectedPointInfo | undefined): (string | WhyTriggeredItem)[] {
  const violations = getFocused(state).violations || [];
  if (violations.length === 0) {
    return ["No rule violations detected in this dataset."];
  }

  // Group by rule: violations fire once per phase, so deduplicate by testId
  // and sum the flagged point counts across all phases.
  const byRule = new Map<string, { description: string; count: number }>();
  for (const v of violations) {
    if (!byRule.has(v.testId)) {
      byRule.set(v.testId, { description: v.description, count: 0 });
    }
    byRule.get(v.testId)!.count += v.indices.length;
  }
  return [...byRule.values()]
    .sort((a, b) => b.count - a.count)
    .map(r => ({ description: r.description, count: r.count }));
}

interface RuleAtPoint {
  testId: string;
  description: string;
}

/** Rules (deduplicated by testId) that fired at a specific point index. */
function buildRulesAtPoint(state: SPCState, idx: number | null): RuleAtPoint[] {
  if (idx == null) return [];
  const violations = getFocused(state).violations || [];
  const seen = new Set<string>();
  const result: RuleAtPoint[] = [];
  for (const v of violations) {
    if (v.indices.includes(Number(idx)) && !seen.has(v.testId)) {
      seen.add(v.testId);
      result.push({ testId: v.testId, description: v.description });
    }
  }
  return result;
}

interface EvidenceItem {
  label: string;
  value: string;
  resolved: boolean;
  category: string;
}

function buildEvidence(state: SPCState, point: SelectedPointInfo | undefined): EvidenceItem[] {
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

function buildRecommendations(state: SPCState, point: SelectedPointInfo | undefined): string[] {
  const checks: string[] = [];
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

interface CompareCard {
  label: string;
  value: string;
  tone: string;
}

function buildComparisonStrip(state: SPCState): CompareCard[] {
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

interface ViolationBreakdown {
  total: number;
  oocCount: number;
  inControl: number;
  ruleBreakdown: { testId: string; description: string; count: number }[];
}

/**
 * Build violation breakdown for a set of point indices.
 * Returns: { inControl, oocCount, ruleBreakdown: [{testId, description, count}] }
 */
function _buildViolationBreakdown(violations: Violation[], indices: number[]): ViolationBreakdown {
  const indexSet = new Set(indices);
  const oocIndices = new Set<number>();
  const ruleMap = new Map<string, { testId: string; description: string; pts: Set<number> }>();

  for (const v of violations) {
    const matched = v.indices.filter(i => indexSet.has(i));
    if (matched.length === 0) continue;

    if (v.testId === '1') {
      for (const i of matched) oocIndices.add(i);
    }

    if (!ruleMap.has(v.testId)) {
      ruleMap.set(v.testId, { testId: v.testId, description: v.description, pts: new Set() });
    }
    for (const i of matched) ruleMap.get(v.testId)!.pts.add(i);
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

interface SelectedPhaseInfo extends ViolationBreakdown {
  label: string;
  index: number;
  ucl: number | undefined;
  center: number | undefined;
  lcl: number | undefined;
  pointCount: number;
}

/** Build selected phase summary for evidence rail display. */
function _buildSelectedPhase(focused: ChartSlot): SelectedPhaseInfo | null {
  const idx = focused.selectedPhaseIndex;
  if (idx == null || !focused.phases || !focused.phases[idx]) return null;
  const phase = focused.phases[idx] as unknown as Record<string, unknown>;
  const phaseStart = (phase.start ?? phase.startIndex ?? 0) as number;
  const phaseEnd = (phase.end ?? phase.endIndex ?? 0) as number;
  const pointCount = (phaseEnd - phaseStart) + 1;
  const phaseIndices: number[] = [];
  for (let i = phaseStart; i <= phaseEnd; i++) phaseIndices.push(i);
  const violations = focused.violations || [];
  const breakdown = _buildViolationBreakdown(violations, phaseIndices);
  const phaseLimits = phase.limits as { ucl?: number; center?: number; lcl?: number } | undefined;

  return {
    label: (phase.label as string) || (phase.id as string) || `Phase ${idx + 1}`,
    index: idx,
    ucl: phaseLimits?.ucl,
    center: phaseLimits?.center,
    lcl: phaseLimits?.lcl,
    pointCount,
    ...breakdown,
  };
}

interface SelectedPointsInfo extends ViolationBreakdown {
  count: number;
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  range: number;
  excludedCount: number;
  indices: number[];
}

/** Build summary for multi-point (marquee) selection. */
function _buildSelectedPoints(state: SPCState): SelectedPointsInfo | null {
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
  const values: number[] = [];
  let excludedCount = 0;

  for (const idx of indices) {
    const pt = points[idx] as { primaryValue?: number; value?: number; excluded?: boolean } | undefined;
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

interface MethodLabEntry {
  id: string;
  empty?: boolean;
  isFocused?: boolean;
  chartType?: string;
  sigmaMethod?: string;
  kSigma?: number;
  subgroup?: string;
  phaseColumn?: string;
  ucl?: number;
  center?: number;
  lcl?: number;
  limitsScope?: string;
  sigmaHat?: number;
  cpk?: number;
  ppk?: number;
  cp?: number;
  capGrade?: string | null;
  oocCount?: number;
  ruleCount?: number;
  ruleBreakdown?: { testId: string; desc: string; count: number }[];
  enabledRules?: string[];
  phaseCount?: number;
}

/** Per-chart method summary for side-by-side comparison. */
export function buildMethodLabComparison(state: SPCState): MethodLabEntry[] {
  return state.chartOrder.map(id => {
    const slot = state.charts[id];
    if (!slot) return { id, empty: true };
    const params = slot.params || ({} as ChartSlot["params"]);
    const violations = slot.violations || [];
    const totalOOC = violations.reduce((sum, v) => sum + v.indices.length, 0);
    const uniqueRules = new Set(violations.map(v => v.testId));

    // Per-rule breakdown: deduplicate by testId, sum points across phases
    const ruleMap = new Map<string, { testId: string; desc: string; count: number }>();
    for (const v of violations) {
      if (!ruleMap.has(v.testId)) {
        ruleMap.set(v.testId, { testId: v.testId, desc: v.description, count: 0 });
      }
      ruleMap.get(v.testId)!.count += v.indices.length;
    }

    // Nelson rules: params stores boolean array indexed 0-7 → convert to rule numbers
    const nelsonRules = (params as unknown as Record<string, unknown>).nelson_rules as boolean[] | undefined;
    const enabledRules = (nelsonRules || [])
      .map((on: boolean, i: number) => on ? String(i + 1) : null)
      .filter((v): v is string => v !== null);

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

interface DisagreementItem {
  pointIndex: number;
  label: string;
  value: number | undefined;
  flaggedBy: { chartLabel: string; rules: string[] }[];
  clearedBy: string[];
}

interface DisagreementSummary {
  disagreementCount: number;
  totalPoints: number;
  pct: string;
  uniqueCounts: { label: string; uniqueCount: number }[];
  unanimousOOC: number;
}

interface DisagreementsResult {
  items: DisagreementItem[];
  summary: DisagreementSummary | null;
}

/** Points where charts disagree (some flag, some don't). Only meaningful with 2+ charts. */
export function buildDisagreements(state: SPCState, chartIds?: string[]): DisagreementsResult {
  const ids = chartIds || state.chartOrder;
  if (ids.length < 2) return { items: [], summary: null };

  // For each chart, build a Set of all violation point indices
  const chartSets = ids.map(id => {
    const slot = state.charts[id];
    if (!slot) return { id, label: "—", indices: new Set<number>() };
    const violations = slot.violations || [];
    const indices = new Set<number>();
    for (const v of violations) v.indices.forEach(i => indices.add(i));
    return {
      id,
      label: slot.context?.chartType?.label || id,
      indices,
    };
  });

  // Collect every index flagged by ANY chart
  const allFlagged = new Set<number>();
  for (const c of chartSets) c.indices.forEach(i => allFlagged.add(i));

  const items: DisagreementItem[] = [];
  for (const idx of [...allFlagged].sort((a, b) => a - b)) {
    const flaggedBy = chartSets.filter(c => c.indices.has(idx));
    const clearedBy = chartSets.filter(c => !c.indices.has(idx));
    if (flaggedBy.length === 0 || clearedBy.length === 0) continue; // unanimous — skip

    const pt = state.points[idx];
    const value = pt?.primaryValue ?? (pt as unknown as Record<string, unknown>)?.value as number | undefined;

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

interface DerivedWorkspace {
  selectedPoint: SelectedPointInfo | undefined;
  hasPointSelection: boolean;
  pointBreakdown: ViolationBreakdown | null;
  selectedPoints: SelectedPointsInfo | null;
  signal: SignalNarrative;
  whyTriggered: (string | WhyTriggeredItem)[];
  rulesAtPoint: RuleAtPoint[];
  evidence: EvidenceItem[];
  recommendations: string[];
  compareCards: CompareCard[];
  excludedCount: number;
  lineageCount: number;
  failedTransformCount: number;
  phaseLabel: string | null;
  selectedPhase: SelectedPhaseInfo | null;
}

export function deriveWorkspace(state: SPCState): DerivedWorkspace {
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
  let pointBreakdown: ViolationBreakdown | null = null;
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
    lineageCount: (state.transforms as TransformStep[]).filter((step) => step.active || step.status === "failed").length,
    failedTransformCount: getFailedTransformCount(state),
    phaseLabel: point ? getPhaseLabel(state, point.phaseId ?? null) : null,
    selectedPhase,
  };
}

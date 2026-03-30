/**
 * findings-engine.js — Auto-generates structural findings from analysis data.
 *
 * Each generator is a pure function: (slot, points, state) → Finding[]
 * Findings regenerate on every analysis — no stale state.
 */

import { computeStats, capClass, SIGMA_METHOD_LABELS } from "../helpers.js";

/* ═══ Finding shape (JSDoc) ═══════════════════════════
 * @typedef {Object} Finding
 * @property {string} id           - Unique per run (generator-id)
 * @property {string} generatorId  - Which generator produced it
 * @property {string} category     - "stability" | "capability" | "statistical" | "pattern"
 * @property {string} severity     - "good" | "warning" | "danger" | "info"
 * @property {string} title        - 2-4 word headline
 * @property {string} detail       - Explanatory sentence
 * @property {Object} [metric]     - { label, value, raw }
 * @property {Object} [context]    - Generator-specific data for detail panel
 */

// ─── Stability generators ───────────────────────────

function stabilityVerdict(slot, points) {
  const violations = slot.violations || [];
  const totalOOC = violations.reduce((sum, v) => sum + v.indices.length, 0);
  const uniqueRules = new Set(violations.map(v => v.testId));

  let severity, title;
  if (totalOOC === 0) {
    severity = "good"; title = "Process Stable";
  } else if (uniqueRules.size <= 2 && totalOOC <= 3) {
    severity = "warning"; title = "Minor Instability";
  } else {
    severity = "danger"; title = "Process Unstable";
  }

  return [{
    id: "stability-verdict",
    generatorId: "stabilityVerdict",
    category: "stability",
    severity,
    title,
    detail: totalOOC === 0
      ? "No rule violations detected. Process is in statistical control."
      : `${uniqueRules.size} rule${uniqueRules.size !== 1 ? "s" : ""} triggered across ${totalOOC} point${totalOOC !== 1 ? "s" : ""}.`,
    metric: { label: "OOC Points", value: String(totalOOC), raw: totalOOC },
    context: {
      ruleCount: uniqueRules.size,
      oocCount: totalOOC,
      totalPoints: points.length,
      oocRate: points.length > 0 ? (totalOOC / points.length * 100).toFixed(1) + "%" : "—",
    },
  }];
}

function violationSummary(slot) {
  const violations = slot.violations || [];
  if (violations.length === 0) return [];

  // Group by rule, deduplicate, count points
  const byRule = new Map();
  for (const v of violations) {
    if (!byRule.has(v.testId)) {
      byRule.set(v.testId, { testId: v.testId, description: v.description, count: 0 });
    }
    byRule.get(v.testId).count += v.indices.length;
  }

  return [...byRule.values()].map(r => ({
    id: `violation-rule-${r.testId}`,
    generatorId: "violationSummary",
    category: "stability",
    severity: r.testId === "1" ? "danger" : "warning",
    title: `Rule ${r.testId}`,
    detail: `${r.description} — ${r.count} point${r.count !== 1 ? "s" : ""} flagged.`,
    metric: { label: "Points", value: String(r.count), raw: r.count },
    context: { testId: r.testId, description: r.description, pointCount: r.count },
  }));
}

function phaseComparison(slot) {
  const phases = slot.phases || [];
  if (phases.length < 2) return [];

  const findings = [];
  for (let i = 1; i < phases.length; i++) {
    const prev = phases[i - 1];
    const curr = phases[i];
    const prevCL = Array.isArray(prev.limits.cl) ? prev.limits.cl[0] : prev.limits.cl;
    const currCL = Array.isArray(curr.limits.cl) ? curr.limits.cl[0] : curr.limits.cl;

    if (prevCL == null || currCL == null) continue;

    const meanShift = currCL - prevCL;
    const prevSigma = prev.sigma?.sigma_hat || 0;
    const currSigma = curr.sigma?.sigma_hat || 0;
    const sigmaChange = prevSigma > 0 ? ((currSigma - prevSigma) / prevSigma * 100) : 0;
    const shiftMagnitude = prevSigma > 0 ? Math.abs(meanShift) / prevSigma : 0;

    let severity = "info";
    if (shiftMagnitude > 1.5) severity = "danger";
    else if (shiftMagnitude > 0.5) severity = "warning";

    findings.push({
      id: `phase-compare-${prev.id}-${curr.id}`,
      generatorId: "phaseComparison",
      category: "stability",
      severity,
      title: `Phase Shift`,
      detail: `${prev.id} → ${curr.id}: mean shifted ${meanShift >= 0 ? "+" : ""}${meanShift.toFixed(4)}, sigma ${sigmaChange >= 0 ? "+" : ""}${sigmaChange.toFixed(1)}%.`,
      metric: { label: "Mean Shift", value: meanShift.toFixed(4), raw: meanShift },
      context: {
        fromPhase: prev.id, toPhase: curr.id,
        meanShift, sigmaChange: sigmaChange.toFixed(1),
        shiftInSigmas: shiftMagnitude.toFixed(2),
      },
    });
  }
  return findings;
}

// ─── Capability generators ──────────────────────────

function capabilityVerdict(slot) {
  const cap = slot.capability;
  if (!cap || cap.cpk == null) return [];

  const cpk = cap.cpk;
  const cls = capClass(cpk);
  const severity = cls === "good" ? "good" : cls === "marginal" ? "warning" : "danger";

  const parts = [];
  if (cap.cp != null) parts.push(`Cp ${cap.cp.toFixed(2)}`);
  parts.push(`Cpk ${cpk.toFixed(2)}`);
  if (cap.pp != null) parts.push(`Pp ${cap.pp.toFixed(2)}`);
  if (cap.ppk != null) parts.push(`Ppk ${cap.ppk.toFixed(2)}`);

  return [{
    id: "capability-verdict",
    generatorId: "capabilityVerdict",
    category: "capability",
    severity,
    title: severity === "good" ? "Capable" : severity === "warning" ? "Marginal Capability" : "Not Capable",
    detail: `${parts.join(", ")}. Threshold: Cpk >= 1.33.`,
    metric: { label: "Cpk", value: cpk.toFixed(2), raw: cpk },
    context: { ...cap },
  }];
}

function centeringAssessment(slot) {
  const cap = slot.capability;
  if (!cap || cap.cpk == null || cap.cp == null || cap.cp === 0) return [];

  const ratio = cap.cpk / cap.cp;
  let severity, title;
  if (ratio >= 0.9) {
    severity = "good"; title = "Well Centered";
  } else if (ratio >= 0.7) {
    severity = "warning"; title = "Off Center";
  } else {
    severity = "danger"; title = "Significantly Off Center";
  }

  return [{
    id: "centering-assessment",
    generatorId: "centeringAssessment",
    category: "capability",
    severity,
    title,
    detail: `Cpk/Cp ratio: ${(ratio * 100).toFixed(0)}%. ${ratio < 0.9 ? "Process mean is shifted from center of specification range." : "Process mean is near the center of specification range."}`,
    metric: { label: "Cpk/Cp", value: (ratio * 100).toFixed(0) + "%", raw: ratio },
    context: { ratio, cp: cap.cp, cpk: cap.cpk },
  }];
}

// ─── Statistical generators ─────────────────────────

function statisticalSummary(slot, points) {
  // computeStats expects p.value but our points use p.primaryValue
  const mapped = points.map(p => ({ ...p, value: p.primaryValue ?? p.value }));
  const stats = computeStats(mapped);
  if (!stats) return [];

  const sigma = slot.sigma;
  return [{
    id: "statistical-summary",
    generatorId: "statisticalSummary",
    category: "statistical",
    severity: "info",
    title: "Summary Statistics",
    detail: `N=${stats.n}, Mean=${stats.mean.toFixed(4)}, Std=${stats.std.toFixed(4)}, Range=[${stats.min.toFixed(4)}, ${stats.max.toFixed(4)}].`,
    metric: { label: "N", value: String(stats.n), raw: stats.n },
    context: {
      n: stats.n,
      mean: stats.mean.toFixed(4),
      std: stats.std.toFixed(4),
      sigmaWithin: sigma ? sigma.sigma_hat.toFixed(4) : "—",
      min: stats.min.toFixed(4),
      max: stats.max.toFixed(4),
      range: (stats.max - stats.min).toFixed(4),
      median: stats.median.toFixed(4),
      subgroupCount: stats.subgroupCount,
    },
  }];
}

function sigmaMethodNote(slot) {
  const sigma = slot.sigma;
  if (!sigma) return [];

  const label = SIGMA_METHOD_LABELS[sigma.method] || sigma.method;
  return [{
    id: "sigma-method",
    generatorId: "sigmaMethodNote",
    category: "statistical",
    severity: "info",
    title: "Sigma Method",
    detail: `Estimated via ${label} using ${sigma.n_used} observations. sigma_hat = ${sigma.sigma_hat.toFixed(4)}.`,
    metric: { label: "sigma", value: sigma.sigma_hat.toFixed(4), raw: sigma.sigma_hat },
    context: { method: sigma.method, label, sigmaHat: sigma.sigma_hat, nUsed: sigma.n_used },
  }];
}

function zoneDistribution(slot, points) {
  const zones = slot.zones;
  if (!zones || !points.length) return [];

  const cl = zones.cl;
  const sigma = zones.zone_a_upper - zones.zone_b_upper; // 1-sigma width
  if (sigma <= 0) return [];

  let zoneA = 0, zoneB = 0, zoneC = 0, beyond = 0;
  const values = points.map(p => p.primaryValue ?? p.value).filter(v => v != null);
  for (const v of values) {
    const dist = Math.abs(v - cl) / sigma;
    if (dist > 3) beyond++;
    else if (dist > 2) zoneA++;
    else if (dist > 1) zoneB++;
    else zoneC++;
  }
  const total = values.length || 1;
  const pctC = (zoneC / total * 100).toFixed(1);
  const pctB = (zoneB / total * 100).toFixed(1);
  const pctA = (zoneA / total * 100).toFixed(1);
  const pctBeyond = (beyond / total * 100).toFixed(1);

  // Expected: ~68% in C, ~27% in B, ~4.3% in A, ~0.3% beyond
  const cDeviation = Math.abs(zoneC / total - 0.6827);
  let severity = "info";
  if (cDeviation > 0.2) severity = "warning";

  return [{
    id: "zone-distribution",
    generatorId: "zoneDistribution",
    category: "statistical",
    severity,
    title: "Zone Distribution",
    detail: `Zone C: ${pctC}%, B: ${pctB}%, A: ${pctA}%, Beyond: ${pctBeyond}%. Expected (normal): 68/27/4/0.3%.`,
    metric: { label: "Zone C", value: pctC + "%", raw: zoneC / total },
    context: {
      zoneC: { count: zoneC, pct: pctC },
      zoneB: { count: zoneB, pct: pctB },
      zoneA: { count: zoneA, pct: pctA },
      beyond: { count: beyond, pct: pctBeyond },
    },
  }];
}

// ─── Pattern generators ─────────────────────────────

function runsDetection(slot, points) {
  const zones = slot.zones;
  if (!zones || points.length < 10) return [];

  const cl = zones.cl;
  const values = points.map(p => p.primaryValue ?? p.value).filter(v => v != null);
  if (values.length < 10) return [];

  let runs = 1;
  let above = 0, below = 0;
  for (let i = 0; i < values.length; i++) {
    const side = values[i] > cl;
    if (side) above++; else below++;
    if (i > 0 && (values[i] > cl) !== (values[i - 1] > cl)) runs++;
  }

  const n1 = above, n2 = below;
  if (n1 === 0 || n2 === 0) return [];
  const expectedRuns = (2 * n1 * n2) / (n1 + n2) + 1;
  const varianceRuns = (2 * n1 * n2 * (2 * n1 * n2 - n1 - n2)) / ((n1 + n2) ** 2 * (n1 + n2 - 1));
  if (varianceRuns <= 0) return [];
  const z = (runs - expectedRuns) / Math.sqrt(varianceRuns);

  let severity = "info", interpretation = "Random pattern";
  if (Math.abs(z) > 1.96) {
    severity = "warning";
    interpretation = z < 0 ? "Too few runs — possible shift or trend" : "Too many runs — possible oscillation";
  }

  return [{
    id: "runs-detection",
    generatorId: "runsDetection",
    category: "pattern",
    severity,
    title: z < -1.96 ? "Shift Pattern" : z > 1.96 ? "Oscillation Pattern" : "Runs Normal",
    detail: `${runs} runs observed, ${expectedRuns.toFixed(1)} expected. Z=${z.toFixed(2)}. ${interpretation}.`,
    metric: { label: "Runs", value: String(runs), raw: runs },
    context: { runs, expected: expectedRuns.toFixed(1), z: z.toFixed(2), interpretation, above: n1, below: n2 },
  }];
}

function trendDetection(slot) {
  const violations = slot.violations || [];
  const rule3 = violations.find(v => v.testId === "3");
  if (!rule3) return [];

  return [{
    id: "trend-detection",
    generatorId: "trendDetection",
    category: "pattern",
    severity: "warning",
    title: "Trend Detected",
    detail: `${rule3.description} — ${rule3.indices.length} point${rule3.indices.length !== 1 ? "s" : ""} in trending sequence.`,
    metric: { label: "Points", value: String(rule3.indices.length), raw: rule3.indices.length },
    context: { indices: rule3.indices, description: rule3.description },
  }];
}

function stratificationDetection(slot) {
  const violations = slot.violations || [];
  const rule7 = violations.find(v => v.testId === "7");
  if (!rule7) return [];

  return [{
    id: "stratification-detection",
    generatorId: "stratificationDetection",
    category: "pattern",
    severity: "warning",
    title: "Stratification",
    detail: `${rule7.description} — suggests reduced variation or incorrect limits. ${rule7.indices.length} points in Zone C.`,
    metric: { label: "Points", value: String(rule7.indices.length), raw: rule7.indices.length },
    context: { indices: rule7.indices, description: rule7.description },
  }];
}

function mixtureDetection(slot) {
  const violations = slot.violations || [];
  const rule8 = violations.find(v => v.testId === "8");
  if (!rule8) return [];

  return [{
    id: "mixture-detection",
    generatorId: "mixtureDetection",
    category: "pattern",
    severity: "warning",
    title: "Mixture Pattern",
    detail: `${rule8.description} — suggests mixture of populations or systematic alternation. ${rule8.indices.length} points beyond Zone C.`,
    metric: { label: "Points", value: String(rule8.indices.length), raw: rule8.indices.length },
    context: { indices: rule8.indices, description: rule8.description },
  }];
}

// ─── Registry & orchestrator ────────────────────────

const GENERATOR_REGISTRY = [
  { id: "stabilityVerdict",        category: "stability",   label: "Stability Verdict",      generate: stabilityVerdict },
  { id: "violationSummary",        category: "stability",   label: "Violation Summary",      generate: violationSummary },
  { id: "phaseComparison",         category: "stability",   label: "Phase Comparison",       generate: phaseComparison },
  { id: "capabilityVerdict",       category: "capability",  label: "Capability Verdict",     generate: capabilityVerdict },
  { id: "centeringAssessment",     category: "capability",  label: "Centering Assessment",   generate: centeringAssessment },
  { id: "statisticalSummary",      category: "statistical", label: "Summary Statistics",      generate: statisticalSummary },
  { id: "sigmaMethodNote",         category: "statistical", label: "Sigma Method",           generate: sigmaMethodNote },
  { id: "zoneDistribution",        category: "statistical", label: "Zone Distribution",      generate: zoneDistribution },
  { id: "runsDetection",           category: "pattern",     label: "Runs Detection",         generate: runsDetection },
  { id: "trendDetection",          category: "pattern",     label: "Trend Detection",        generate: trendDetection },
  { id: "stratificationDetection", category: "pattern",     label: "Stratification",         generate: stratificationDetection },
  { id: "mixtureDetection",        category: "pattern",     label: "Mixture Detection",      generate: mixtureDetection },
];

/**
 * Run all generators against current state and return findings array.
 * Errors in individual generators are isolated — one failure doesn't block others.
 */
export function generateFindings(state, chartId) {
  const id = chartId || state.chartOrder[0];
  const slot = state.charts[id];
  if (!slot) return [];

  const points = state.points || [];
  const findings = [];

  for (const gen of GENERATOR_REGISTRY) {
    try {
      const result = gen.generate(slot, points, state);
      if (Array.isArray(result)) findings.push(...result);
    } catch (err) {
      console.warn(`[findings-engine] Generator "${gen.id}" failed:`, err);
    }
  }

  return findings;
}

/**
 * Derive view-ready data from findings array.
 * Groups by category, computes health summary.
 */
export function deriveFindings(state) {
  const findings = state.structuralFindings || [];
  const selected = findings.find(f => f.id === state.selectedFindingId) || findings[0] || null;

  const categories = ["stability", "capability", "statistical", "pattern"];
  const grouped = {};
  for (const cat of categories) {
    grouped[cat] = findings.filter(f => f.category === cat);
  }

  // Health summary: worst severity across all findings
  const severityRank = { danger: 3, warning: 2, info: 1, good: 0 };
  let worstSeverity = "good";
  let worstRank = 0;
  for (const f of findings) {
    const rank = severityRank[f.severity] ?? 0;
    if (rank > worstRank) { worstRank = rank; worstSeverity = f.severity; }
  }

  // Key metrics for health bar
  const stabilityVerdict = findings.find(f => f.generatorId === "stabilityVerdict");
  const capVerdict = findings.find(f => f.generatorId === "capabilityVerdict");
  const statsSummary = findings.find(f => f.generatorId === "statisticalSummary");

  return {
    findings,
    selected,
    grouped,
    health: {
      severity: worstSeverity,
      label: worstSeverity === "good" ? "Healthy" : worstSeverity === "info" ? "Normal" : worstSeverity === "warning" ? "Attention" : "Critical",
      oocCount: stabilityVerdict?.metric?.raw ?? 0,
      cpk: capVerdict?.metric?.value ?? "—",
      cpkSeverity: capVerdict?.severity ?? "info",
      n: statsSummary?.context?.n ?? 0,
    },
    dangerCount: findings.filter(f => f.severity === "danger").length,
    warningCount: findings.filter(f => f.severity === "warning").length,
  };
}

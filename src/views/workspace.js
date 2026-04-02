import { deriveWorkspace, getFocused } from "../core/state.js";
import { toneClass } from "../helpers.js";
import { renderRecipeRail } from "../components/recipe-rail.js";
import { renderChartArena } from "../components/chart-arena.js";

/** Render violation breakdown rows shared across point/selection/phase tiers. */
function renderBreakdown(breakdown) {
  if (!breakdown) return '';
  const { total, inControl, oocCount, ruleBreakdown } = breakdown;
  const nelsonRules = ruleBreakdown.filter(r => r.testId !== '1');
  return `
    <div class="rail-section breakdown-stats">
      <p class="eyebrow">Status</p>
      <ul class="evidence-list">
        <li><span>In Control</span><strong class="positive">${inControl}</strong></li>
        <li><span>Beyond Limits</span><strong class="${oocCount > 0 ? 'danger' : ''}">${oocCount}</strong></li>
      </ul>
      ${nelsonRules.length > 0 ? `
      <p class="eyebrow" style="margin-top:6px">Nelson Tests</p>
      <ul class="evidence-list">
        ${nelsonRules.map(r =>
          `<li><span>R${r.testId}</span><strong class="warning">${r.count} pt${r.count !== 1 ? 's' : ''}</strong></li>`
        ).join('')}
      </ul>
      ` : ''}
    </div>
  `;
}

export function renderEvidenceRail(state, workspace) {
  const { signal, selectedPoint, hasPointSelection, pointBreakdown, selectedPoints, rulesAtPoint, whyTriggered, evidence, selectedPhase } = workspace;
  const tone = toneClass(signal.statusTone);
  const chartEvidence = evidence.filter(e => e.category === "chart");
  const focusedSlot = getFocused(state);
  const chartLabel = focusedSlot?.context?.chartType?.label || "-";

  const fmtVal = (v) => v != null ? Number(v).toFixed(3) : "-";

  return `
    <aside class="evidence-rail">

      <!-- --- POINT TIER (only when user explicitly selected a point) --- -->
      ${hasPointSelection && selectedPoint ? `
      <div class="rail-tier-label">
        <span class="eyebrow">Point</span>
        <span class="rail-tier-badge">${selectedPoint.label}</span>
      </div>

      <div class="rail-section signal-hero ${tone}">
        <p class="eyebrow">Signal</p>
        <h3>${signal.title}</h3>
        <div class="signal-meta">
          <span class="status-chip ${tone}"><span class="sdot"></span>${signal.confidence}</span>
          ${rulesAtPoint.length > 0
            ? `<div class="rule-tags">${rulesAtPoint.map(r =>
                `<span class="rule-tag" title="${r.description}">R${r.testId}</span>`
              ).join("")}</div>`
            : ""}
        </div>
      </div>
      ${renderBreakdown(pointBreakdown)}
      ` : ''}

      <!-- --- SELECTION TIER (multi-point marquee) --- -->
      ${selectedPoints ? `
      <div class="rail-tier-label">
        <span class="eyebrow">Selection</span>
        <span class="rail-tier-badge selection-badge">${selectedPoints.count} pts</span>
      </div>

      <div class="rail-section signal-hero selection-hero">
        <p class="eyebrow">Selected Points</p>
        <h3>${selectedPoints.count} Points</h3>
        <div class="signal-meta">
          <span class="status-chip ${selectedPoints.oocCount > 0 ? 'critical' : 'positive'}"><span class="sdot"></span>${selectedPoints.oocCount > 0 ? `${selectedPoints.oocCount} OOC` : 'All In Control'}</span>
          ${selectedPoints.excludedCount > 0 ? `<span class="selection-excluded-count">${selectedPoints.excludedCount} excl</span>` : ''}
        </div>
      </div>

      ${renderBreakdown(selectedPoints)}

      <div class="rail-section selection-stats">
        <p class="eyebrow">Summary Statistics</p>
        <ul class="evidence-list">
          <li><span>Mean</span><strong>${fmtVal(selectedPoints.mean)}</strong></li>
          <li><span>Std Dev</span><strong>${fmtVal(selectedPoints.stdDev)}</strong></li>
          <li><span>Min</span><strong>${fmtVal(selectedPoints.min)}</strong></li>
          <li><span>Max</span><strong>${fmtVal(selectedPoints.max)}</strong></li>
          <li><span>Range</span><strong>${fmtVal(selectedPoints.range)}</strong></li>
        </ul>
      </div>
      ` : ''}

      <!-- --- PHASE TIER --- -->
      ${selectedPhase ? `
      <div class="rail-tier-label">
        <span class="eyebrow">Phase</span>
        <span class="rail-tier-badge phase-badge">${selectedPhase.index + 1}</span>
      </div>

      <div class="rail-section signal-hero phase-hero">
        <p class="eyebrow">Selected Phase</p>
        <h3>${selectedPhase.label}</h3>
        <div class="signal-meta">
          <span class="status-chip ${selectedPhase.oocCount > 0 ? 'critical' : 'positive'}"><span class="sdot"></span>${selectedPhase.oocCount > 0 ? `${selectedPhase.oocCount} OOC` : 'In Control'}</span>
          <span class="phase-point-count">${selectedPhase.pointCount} pts</span>
        </div>
      </div>

      ${renderBreakdown(selectedPhase)}

      <div class="rail-section phase-limits">
        <p class="eyebrow">Control Limits</p>
        <ul class="evidence-list">
          <li class="limit-ucl"><span>UCL</span><strong>${fmtVal(selectedPhase.ucl)}</strong></li>
          <li class="limit-cl"><span>CL</span><strong>${fmtVal(selectedPhase.center)}</strong></li>
          <li class="limit-lcl"><span>LCL</span><strong>${fmtVal(selectedPhase.lcl)}</strong></li>
        </ul>
      </div>

      <div class="rail-section phase-stats">
        <p class="eyebrow">Spread</p>
        <ul class="evidence-list">
          <li><span>Range</span><strong>${fmtVal(selectedPhase.range)}</strong></li>
          <li><span>1\u03c3</span><strong>${fmtVal(selectedPhase.sigma)}</strong></li>
        </ul>
      </div>
      ` : ""}

      <!-- --- CHART TIER --- -->
      <div class="rail-tier-label">
        <span class="eyebrow">Chart</span>
        <span class="rail-tier-badge">${chartLabel}</span>
      </div>

      <div class="rail-section">
        <p class="eyebrow">Violations</p>
        <ul class="rail-list">
          ${whyTriggered.map(item =>
            typeof item === "string"
              ? `<li>${item}</li>`
              : `<li>${item.description} - <strong class="violation-count">${item.count} point${item.count !== 1 ? "s" : ""}</strong> flagged.</li>`
          ).join("")}
        </ul>
      </div>

      <div class="rail-section">
        <p class="eyebrow">Method</p>
        <ul class="evidence-list">
          ${chartEvidence.map(item => `
            <li class="${item.resolved ? "" : "unresolved"}">
              <span>${item.label}</span>
              <strong>${item.value}</strong>
            </li>
          `).join("")}
        </ul>
      </div>

    </aside>
  `;
}

export function renderWorkspace(state) {
  const workspace = deriveWorkspace(state);

  return `
    <div class="workspace-layout">
      ${renderRecipeRail(state)}
      <div class="workspace-main">
        ${renderChartArena(state)}
      </div>
      ${renderEvidenceRail(state, workspace)}
    </div>
  `;
}



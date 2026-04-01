import { deriveWorkspace, getFocused } from "../core/state.js";
import { toneClass } from "../helpers.js";
import { renderRecipeRail } from "../components/recipe-rail.js";
import { renderChartArena } from "../components/chart-arena.js";

export function renderEvidenceRail(state, workspace) {
  const { signal, selectedPoint, rulesAtPoint, whyTriggered, evidence } = workspace;
  const tone = toneClass(signal.statusTone);
  const chartEvidence = evidence.filter(e => e.category === "chart");
  const focusedSlot = getFocused(state);
  const chartLabel = focusedSlot?.context?.chartType?.label || "-";

  return `
    <aside class="evidence-rail">

      <!-- 閳光偓閳光偓 POINT TIER 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓 -->
      <div class="rail-tier-label">
        <span class="eyebrow">Point</span>
        ${selectedPoint ? `<span class="rail-tier-badge">${selectedPoint.label}</span>` : ""}
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

      <!-- 閳光偓閳光偓 CHART TIER 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓 -->
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



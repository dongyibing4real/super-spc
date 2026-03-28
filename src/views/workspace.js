import { deriveWorkspace } from "../core/state.js";
import { toneClass } from "../helpers.js";
import { renderRecipeRail } from "../components/recipe-rail.js";
import { renderChartArena } from "../components/chart-arena.js";

export function renderEvidenceRail(state, workspace) {
  return `
    <aside class="evidence-rail">
      <div class="rail-section signal-hero">
        <p class="eyebrow">Signal</p>
        <h3>${workspace.signal.title}</h3>
        <span class="status-chip ${toneClass(workspace.signal.statusTone)}" style="margin-top:4px"><span class="sdot"></span> ${workspace.signal.confidence}</span>
      </div>
      <div class="rail-section">
        <p class="eyebrow">Why it triggered</p>
        <ul class="rail-list">
          ${workspace.whyTriggered.map(item => `<li>${item}</li>`).join("")}
        </ul>
      </div>
      <div class="rail-section">
        <p class="eyebrow">Evidence ledger</p>
        <ul class="evidence-list">
          ${workspace.evidence.map(item => `
            <li class="${item.resolved ? "" : "unresolved"}">
              <span>${item.label}</span>
              <strong>${item.value}</strong>
            </li>
          `).join("")}
        </ul>
      </div>
      <div class="rail-section">
        <p class="eyebrow">Checks</p>
        <ul class="rail-list">
          ${workspace.recommendations.map(item => `<li>${item}</li>`).join("")}
        </ul>
      </div>
      <div class="rail-section">
        <p class="eyebrow">Finding</p>
        <h3>${workspace.activeFinding?.title || "No draft"}</h3>
        <p>${workspace.activeFinding?.summary || "Create from signal."}</p>
        <div class="rail-actions">
          <button data-action="create-finding" type="button">Create</button>
          <button data-action="navigate" data-route="findings" type="button">View all</button>
        </div>
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
        <div class="compare-strip">
          ${workspace.compareCards.map(item => `
            <div class="compare-card ${toneClass(item.tone)}">
              <p>${item.label}</p>
              <strong>${item.value}</strong>
            </div>
          `).join("")}
        </div>
        <div class="lineage-strip">
          <div><span>Data</span><strong>2026-03-25 11:12</strong></div>
          <div><span>Limits</span><strong>${state.charts[state.chartOrder[0]].limits.version}</strong></div>
          <div><span>Transforms</span><strong>${workspace.lineageCount}</strong></div>
          <div><span>Excluded</span><strong>${workspace.excludedCount}</strong></div>
          <div><span>Pipeline</span><strong>${state.pipeline.status}</strong></div>
        </div>
      </div>
      ${renderEvidenceRail(state, workspace)}
    </div>
  `;
}

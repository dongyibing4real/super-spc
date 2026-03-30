import { deriveFindings } from "../core/findings-engine.js";
import { getPrimary } from "../core/state.js";

const CATEGORY_LABELS = {
  stability: "Stability",
  capability: "Capability",
  statistical: "Statistical",
  pattern: "Pattern",
};

function renderHealthBar(health, slot) {
  const chartLabel = slot?.context?.chartType?.label || "\u2014";
  return `
    <div class="findings-health-bar">
      <div class="health-badge ${health.severity}">
        <span class="sdot"></span>
        ${health.label}
      </div>
      <div class="health-metrics">
        <div class="health-metric">
          <span class="eyebrow">Cpk</span>
          <strong class="mono ${health.cpkSeverity}">${health.cpk}</strong>
        </div>
        <div class="health-metric">
          <span class="eyebrow">OOC</span>
          <strong class="mono ${health.oocCount > 0 ? "danger" : "good"}">${health.oocCount}</strong>
        </div>
        <div class="health-metric">
          <span class="eyebrow">N</span>
          <strong class="mono">${health.n}</strong>
        </div>
        <div class="health-metric">
          <span class="eyebrow">Chart</span>
          <strong>${chartLabel}</strong>
        </div>
      </div>
    </div>
  `;
}

function renderFindingCard(f, isActive) {
  return `
    <button class="finding-card ${isActive ? "active" : ""} ${f.severity}"
      data-action="select-structural-finding" data-finding-id="${f.id}" type="button">
      <div class="finding-card-head">
        <span class="finding-severity-dot ${f.severity}"></span>
        <h4>${f.title}</h4>
      </div>
      ${f.metric ? `<span class="finding-card-metric mono">${f.metric.label}: ${f.metric.value}</span>` : ""}
    </button>
  `;
}

function renderDetailPanel(finding) {
  if (!finding) {
    return `
      <article class="finding-detail-panel panel-card">
        <p class="muted">No findings generated. Load a dataset and run analysis.</p>
      </article>
    `;
  }

  const ctx = finding.context || {};

  return `
    <article class="finding-detail-panel panel-card">
      <div class="finding-detail-head">
        <h4>${finding.title}</h4>
        <span class="health-badge ${finding.severity}"><span class="sdot"></span>${finding.severity}</span>
      </div>
      <p class="finding-detail-text">${finding.detail}</p>

      ${finding.metric ? `
        <div class="finding-metric-hero">
          <span class="eyebrow">${finding.metric.label}</span>
          <strong class="mono data-large">${finding.metric.value}</strong>
        </div>
      ` : ""}

      ${Object.keys(ctx).length > 0 ? `
        <div class="finding-context-grid">
          ${Object.entries(ctx).map(([key, val]) => {
            if (val == null || typeof val === "object") return "";
            const label = key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
            return `<div><span class="eyebrow">${label}</span><strong class="mono">${val}</strong></div>`;
          }).join("")}
        </div>
      ` : ""}
    </article>
  `;
}

function renderStatsSummary(state) {
  const statsFinding = (state.structuralFindings || []).find(f => f.generatorId === "statisticalSummary");
  if (!statsFinding) return "";

  const ctx = statsFinding.context;
  const rows = [
    ["N", ctx.n],
    ["Mean", ctx.mean],
    ["\u03C3 Within", ctx.sigmaWithin],
    ["\u03C3 Overall", ctx.std],
    ["Min", ctx.min],
    ["Max", ctx.max],
    ["Range", ctx.range],
    ["Median", ctx.median],
  ];

  return `
    <div class="findings-stats-table">
      <table>
        <thead><tr>${rows.map(([label]) => `<th>${label}</th>`).join("")}</tr></thead>
        <tbody><tr>${rows.map(([, val]) => `<td class="mono">${val}</td>`).join("")}</tr></tbody>
      </table>
    </div>
  `;
}

function renderAISection() {
  return `
    <div class="findings-ai-section">
      <div class="findings-ai-header">
        <div>
          <span class="eyebrow">AI Agent</span>
          <p>Deeper pattern analysis, root cause hypotheses, and recommended actions.</p>
        </div>
        <button class="btn" disabled type="button">Connect</button>
      </div>
      <div class="findings-ai-cards">
        <div class="ai-placeholder-card">
          <span class="eyebrow">Root Cause</span>
          <p class="muted">AI-generated root cause hypotheses will appear here.</p>
        </div>
        <div class="ai-placeholder-card">
          <span class="eyebrow">Recommendations</span>
          <p class="muted">Actionable next steps based on pattern analysis.</p>
        </div>
        <div class="ai-placeholder-card">
          <span class="eyebrow">Correlation</span>
          <p class="muted">Cross-chart and cross-variable insights.</p>
        </div>
      </div>
    </div>
  `;
}

export function renderFindings(state) {
  const derived = deriveFindings(state);
  const slot = getPrimary(state);
  const categories = ["stability", "capability", "statistical", "pattern"];

  return `
    <section class="route-panel">
      <div class="route-header">
        <div><h3>Findings</h3><p class="muted">Evidence-backed process health assessment</p></div>
        <div class="route-actions">
          <span class="findings-count-badge">
            ${derived.dangerCount > 0 ? `<span class="danger">${derived.dangerCount} critical</span>` : ""}
            ${derived.warningCount > 0 ? `<span class="warning">${derived.warningCount} warning</span>` : ""}
          </span>
        </div>
      </div>

      ${renderHealthBar(derived.health, slot)}

      <div class="findings-dashboard-grid">
        <div class="findings-card-column">
          ${categories.map(cat => {
            const items = derived.grouped[cat] || [];
            if (items.length === 0) return "";
            return `
              <div class="finding-category-group">
                <span class="eyebrow">${CATEGORY_LABELS[cat]}</span>
                ${items.map(f => renderFindingCard(f, derived.selected?.id === f.id)).join("")}
              </div>
            `;
          }).join("")}
        </div>

        <div class="findings-detail-column">
          ${renderDetailPanel(derived.selected)}
        </div>
      </div>

      ${renderAISection()}
      ${renderStatsSummary(state)}
    </section>
  `;
}

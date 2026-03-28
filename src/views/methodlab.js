import { deriveWorkspace } from "../core/state.js";
import { toneClass } from "../helpers.js";

export function renderMethodLab(state) {
  const workspace = deriveWorkspace(state);
  return `
    <section class="route-panel">
      <div class="route-header">
        <div>
          <h3>Method Lab</h3>
          <p class="muted">Primary vs challenger comparison</p>
        </div>
        <div class="segmented">
          ${["ready","partial","timeout"].map(s => {
            const isActive = (s === "ready" && state.chartOrder.length > 1) || (s !== "ready" && state.chartOrder.length === 1);
            return `<button data-action="set-challenger-status" data-status="${s}" type="button" class="${isActive ? "active" : ""}">${s === "timeout" ? "Timeout" : s.charAt(0).toUpperCase() + s.slice(1)}</button>`;
          }).join("")}
        </div>
      </div>
      <div class="method-grid">
        <article class="panel-card">
          <p class="eyebrow">Primary</p>
          <h4>${state.charts.primary.context.chartType?.label || "IMR"}</h4>
          <ul class="metric-stack">
            <li><span>Detection</span><strong>Classical EWMA</strong></li>
            <li><span>Conclusion</span><strong>Shift confirmed</strong></li>
            <li><span>Rule pressure</span><strong>Rule 1 + run</strong></li>
          </ul>
        </article>
        <article class="panel-card dark">
          <p class="eyebrow">Challenger</p>
          <h4>${state.charts.challenger?.context.chartType?.label || "—"}</h4>
          <ul class="metric-stack">
            <li><span>Status</span><strong>${state.chartOrder.length > 1 ? "ready" : "inactive"}</strong></li>
            <li><span>Detection</span><strong>${workspace.compareCards[1].value}</strong></li>
            <li><span>False alarms</span><strong>${workspace.compareCards[0].value}</strong></li>
          </ul>
        </article>
        <article class="panel-card span-two">
          <h4>Decision Posture</h4>
          <p class="muted">Challenger never silently replaces primary. Review deltas and keep disagreement visible.</p>
          <div class="comparison-lanes">
            ${workspace.compareCards.map(item => `
              <div class="lane-card ${toneClass(item.tone)}"><span>${item.label}</span><strong>${item.value}</strong></div>
            `).join("")}
          </div>
        </article>
      </div>
    </section>
  `;
}

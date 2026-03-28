export function renderFindings(state) {
  const af = state.findings.find(f => f.id === state.activeFindingId) || state.findings[0];
  return `
    <section class="route-panel">
      <div class="route-header">
        <div><h3>Findings</h3><p class="muted">Evidence-backed decision drafts</p></div>
        <button class="primary-action" data-action="create-finding" type="button">Create</button>
      </div>
      <div class="findings-grid">
        <div class="finding-queue">
          ${state.findings.map(f => `
            <button class="finding-item ${f.id === af.id ? "active" : ""}"
              data-action="select-finding" data-finding-id="${f.id}" type="button">
              <p class="eyebrow">${f.status}</p>
              <h4>${f.title}</h4>
              <p>${f.summary}</p>
            </button>
          `).join("")}
        </div>
        <article class="finding-detail panel-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <h4>${af.title}</h4>
            <span class="status-chip ${af.severity === "High" ? "danger" : "warning"}"><span class="sdot"></span> ${af.severity}</span>
          </div>
          <p class="muted">${af.summary}</p>
          <div class="meta-grid">
            <div><span>Confidence</span><strong>${af.confidence}</strong></div>
            <div><span>Owner</span><strong>${af.owner}</strong></div>
            <div><span>Status</span><strong>${af.status}</strong></div>
          </div>
          <h5>Citations</h5>
          <ul class="evidence-list light">
            ${af.citations.map(c => `
              <li class="${c.resolved ? "" : "unresolved"}"><span>${c.label}</span><strong>${c.value}</strong></li>
            `).join("")}
          </ul>
        </article>
      </div>
    </section>
  `;
}

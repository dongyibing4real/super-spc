export function renderReports(state) {
  const af = state.findings.find(f => f.id === state.activeFindingId) || null;
  return `
    <section class="route-panel">
      <div class="route-header">
        <div><h3>Reports</h3><p class="muted">Audit-ready artifacts</p></div>
        <div class="route-actions">
          <button class="primary-action" data-action="generate-report" type="button">Generate</button>
          <button class="btn" data-action="export-report" type="button">Export</button>
          <button class="btn" data-action="toggle-export-failure" type="button">${state.reportExport.failNext ? "Fail queued" : "Queue fail"}</button>
        </div>
      </div>
      <div class="reports-grid">
        <article class="panel-card">
          <h4>Report State</h4>
          <div class="meta-grid">
            <div><span>Finding</span><strong>${af ? af.title : "None"}</strong></div>
            <div><span>Draft</span><strong>${state.reportDraft ? state.reportDraft.id : "\u2014"}</strong></div>
            <div><span>Export</span><strong>${state.reportExport.status}</strong></div>
          </div>
          ${state.reportDraft ? `
            <div class="report-preview">
              <p class="eyebrow">Draft</p>
              <h4>${state.reportDraft.title}</h4>
              <p class="muted">${state.reportDraft.findingTitle}</p>
              <p class="mono" style="color:var(--t-4);margin-top:2px">${state.reportDraft.generatedAt}</p>
              ${state.reportDraft.partial
                ? `<div class="warning-panel"><strong>Blocked</strong><p>${state.reportDraft.unresolved.length} gaps remain.</p></div>`
                : `<div class="success-panel"><strong>Ready</strong><p>All citations resolved.</p></div>`}
            </div>
          ` : `<p class="muted" style="margin-top:6px">Generate from selected finding.</p>`}
        </article>
        <article class="panel-card dark">
          <h4>Export Contract</h4>
          <ul class="rail-list light">
            <li>Blocked when citations unresolved.</li>
            <li>Failure preserves draft, supports retry.</li>
            <li>Artifacts carry full lineage.</li>
            <li>Reports derive from workspace state.</li>
          </ul>
        </article>
      </div>
    </section>
  `;
}

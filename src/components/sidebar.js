import { NAV } from "../helpers.js";

export function renderSidebar(state) {
  return `
    <aside class="sidebar">
      <div class="brand-block">
        <div class="logo">SP</div>
        <div>
          <h1>Super SPC</h1>
          <span class="muted">v0.1.0</span>
        </div>
      </div>
      <span class="nav-section-label">Views</span>
      <nav class="nav-list">
        ${NAV.map(([route, abbr, label]) => `
          <button class="nav-item ${state.route === route ? "active" : ""}"
            data-action="navigate" data-route="${route}" type="button">
            <span class="nav-abbr">${abbr}</span><span class="nav-label">${label}</span>
          </button>
        `).join("")}
      </nav>
      <div class="sidebar-foot">
        <span class="status-dot-live ${state.pipeline.status === "ready" ? "" : "offline"}"></span>
        <span>Pipeline ${state.pipeline.status}</span>
      </div>
    </aside>
  `;
}

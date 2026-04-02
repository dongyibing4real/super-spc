import { NAV } from "../helpers.js";

function brandMark() {
  // Abstracted control chart glyph: a data series crossing through
  // three limit reference lines (UCL/CL/LCL). The series has one point
  // breaching the upper limit — the core SPC concept in a single mark.
  return `<svg class="brand-mark" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Background -->
    <rect width="28" height="28" rx="4" fill="#1C2733"/>
    <!-- Limit lines: UCL / CL / LCL -->
    <line x1="4" y1="8" x2="24" y2="8" stroke="#CD4246" stroke-opacity="0.45" stroke-width="0.75" stroke-dasharray="1.5 1.5"/>
    <line x1="4" y1="14" x2="24" y2="14" stroke="#238551" stroke-opacity="0.55" stroke-width="0.75"/>
    <line x1="4" y1="20" x2="24" y2="20" stroke="#CD4246" stroke-opacity="0.45" stroke-width="0.75" stroke-dasharray="1.5 1.5"/>
    <!-- Data series polyline — one point breaches UCL -->
    <polyline points="5,15 8,12 11,16 14,13 17,6 20,11 23,14" stroke="#4C90F0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- OOC point (breach) highlighted red -->
    <circle cx="17" cy="6" r="2" fill="#CD4246"/>
    <!-- Normal points -->
    <circle cx="5" cy="15" r="1.2" fill="#4C90F0"/>
    <circle cx="8" cy="12" r="1.2" fill="#4C90F0"/>
    <circle cx="11" cy="16" r="1.2" fill="#4C90F0"/>
    <circle cx="14" cy="13" r="1.2" fill="#4C90F0"/>
    <circle cx="20" cy="11" r="1.2" fill="#4C90F0"/>
    <circle cx="23" cy="14" r="1.2" fill="#4C90F0"/>
  </svg>`;
}

export function renderSidebar(state) {
  return `
    <aside class="sidebar">
      <div class="brand-block">
        ${brandMark()}
        <h1>Super <span class="brand-spc">SPC</span></h1>
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

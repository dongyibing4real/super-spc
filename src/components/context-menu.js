const LAYERS = [
  ["specLimits", "Limits & zones"],
  ["grid", "Grid"],
  ["phaseTags", "Phases"],
  ["events", "Events"],
  ["excludedMarkers", "Exclusions"],
  ["confidenceBand", "Conf. band"],
];

export function renderPointContextMenu(state) {
  const { x, y } = state.ui.contextMenu;
  const sp = state.points[state.selectedPointIndex];
  return `
    <div class="context-menu" style="left:${x}px;top:${y}px;" role="menu">
      <div class="context-menu-header">Point</div>
      <button data-action="exclude-point" data-index="${state.selectedPointIndex}" role="menuitem" type="button">${sp?.excluded ? "Restore point" : "Exclude point"}</button>
      <button data-action="create-finding" role="menuitem" type="button">Create finding from selection</button>
      <button data-action="navigate" data-route="methodlab" role="menuitem" type="button">Open in Method Lab</button>
    </div>
  `;
}

export function renderLineContextMenu(state) {
  const { x, y } = state.ui.contextMenu;
  return `
    <div class="context-menu" style="left:${x}px;top:${y}px;" role="menu">
      <div class="context-menu-header">Line</div>
      <button data-action="navigate" data-route="methodlab" role="menuitem" type="button">Open in Method Lab</button>
    </div>
  `;
}

export function renderCanvasContextMenu(state) {
  const { x, y } = state.ui.contextMenu;
  return `
    <div class="context-menu canvas-context-menu" style="left:${x}px;top:${y}px;" role="menu">
      <div class="context-menu-header">Canvas</div>
      ${LAYERS.map(([k, l]) => `
        <button class="context-toggle ${state.chartToggles[k] ? "is-on" : ""}"
          data-action="toggle-chart" data-option="${k}" role="menuitem" type="button">
          <span>${l}</span>
          <span class="toggle-dot"></span>
        </button>
      `).join("")}
    </div>
  `;
}

export function renderAxisContextMenu(state) {
  const { x, y, axis } = state.ui.contextMenu;
  const label = axis === 'x' ? 'X-Axis' : 'Y-Axis';
  return `
    <div class="context-menu axis-context-menu" style="left:${x}px;top:${y}px;" role="menu">
      <div class="context-menu-header">${label}</div>
      <button data-action="reset-axis" data-axis="${axis}" role="menuitem" type="button">Reset axis</button>
    </div>
  `;
}

export function renderContextMenu(state) {
  const target = state.ui.contextMenu.target || 'canvas';
  if (state.ui.contextMenu.axis) return renderAxisContextMenu(state);
  switch (target) {
    case 'point': return renderPointContextMenu(state);
    case 'line': return renderLineContextMenu(state);
    default: return renderCanvasContextMenu(state);
  }
}

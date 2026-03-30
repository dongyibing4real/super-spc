import { getCapability, capClass, CHART_TYPE_LABELS } from "../helpers.js";
import { renderContextMenu } from "./context-menu.js";

/* ═══ Chart pane renderer ═══ */

function renderChartPane(state, chartId) {
  const slot = state.charts[chartId];
  if (!slot) return "";

  const isFocused = state.focusedChartId === chartId;
  const isOnly = state.chartOrder.length <= 1;
  const caps = getCapability(state, chartId);
  const method = slot.context.chartType?.label || "";
  const metric = slot.context.metric?.label || "";

  const titlebar = isOnly ? "" : `
    <div class="chart-pane-titlebar" data-drag-handle="${chartId}">
      <span class="grip-icon">⠗</span>
      <span class="method-dot"></span>
      <strong class="pane-method">${method}</strong>
      <span class="pane-metric">${metric}</span>
      ${caps.cpk ? `
        <div class="pane-caps">
          <span class="cap-item"><span class="cap-label">Cpk</span><span class="cap-value ${capClass(caps.cpk)}">${caps.cpk}</span></span>
          <span class="cap-item"><span class="cap-label">Ppk</span><span class="cap-value ${capClass(caps.ppk)}">${caps.ppk}</span></span>
        </div>
      ` : ""}
      <div class="pane-actions">
        <button class="pane-split-btn" data-action="split-pane" data-chart-id="${chartId}" data-direction="h" title="Split right">
          <svg viewBox="0 0 12 12" width="10" height="10"><rect x="0" y="1" width="5" height="10" rx="1" fill="currentColor" opacity="0.5"/><rect x="7" y="1" width="5" height="10" rx="1" fill="currentColor" opacity="0.5"/></svg>
        </button>
        <button class="pane-split-btn" data-action="split-pane" data-chart-id="${chartId}" data-direction="v" title="Split down">
          <svg viewBox="0 0 12 12" width="10" height="10"><rect x="1" y="0" width="10" height="5" rx="1" fill="currentColor" opacity="0.5"/><rect x="1" y="7" width="10" height="5" rx="1" fill="currentColor" opacity="0.5"/></svg>
        </button>
        <button class="pane-close" data-action="remove-chart" data-chart-id="${chartId}" title="Close chart">×</button>
      </div>
    </div>`;

  return `
    <div class="chart-pane ${isFocused ? "pane-focused" : ""}" data-chart-id="${chartId}">
      ${titlebar}
      <div class="chart-stage" id="chart-mount-${chartId}" tabindex="0" data-chart-focus="true" aria-label="${chartId} control chart">
        ${isFocused && state.ui.contextMenu ? renderContextMenu(state) : ""}
      </div>
    </div>
  `;
}

/* ═══ Recursive tree renderer ═══ */

function renderTreeNode(state, node) {
  if (!node) return "";

  if (node.type === "pane") {
    return renderChartPane(state, node.chartId);
  }

  // Container node: two children separated by a draggable divider
  const isH = node.direction === "h";
  const pct = (node.ratio * 100).toFixed(2);

  return `
    <div class="split-container split-${node.direction}" data-container-id="${node.id}">
      <div class="split-child" style="flex: 0 0 ${pct}%">
        ${renderTreeNode(state, node.children[0])}
      </div>
      <div class="split-divider split-divider-${node.direction}" data-container-id="${node.id}" data-direction="${node.direction}"></div>
      <div class="split-child" style="flex: 1 1 0">
        ${renderTreeNode(state, node.children[1])}
      </div>
    </div>
  `;
}

/* ═══ Ghost layout renderer (drag preview overlay) ═══ */

export function renderGhostNode(node, incomingId) {
  if (!node) return "";
  if (node.type === "pane") {
    const isIncoming = node.chartId === incomingId;
    return `<div class="ghost-pane${isIncoming ? " ghost-pane-incoming" : ""}"></div>`;
  }
  const pct = (node.ratio * 100).toFixed(2);
  return `
    <div class="ghost-container ghost-${node.direction}">
      <div class="ghost-child" style="flex: 0 0 ${pct}%">${renderGhostNode(node.children[0], incomingId)}</div>
      <div class="ghost-divider-line ghost-divider-${node.direction}"></div>
      <div class="ghost-child" style="flex: 1 1 0">${renderGhostNode(node.children[1], incomingId)}</div>
    </div>`;
}


/* ═══ Data table renderer ═══ */

export function renderDataTable(state) {
  if (state.points.length === 0) return '<div class="empty-table">No data loaded.</div>';

  const focusedSlot = state.charts[state.focusedChartId];
  const violations = focusedSlot?.violations || [];
  const violatedIndices = new Set();
  violations.forEach(v => v.indices.forEach(i => violatedIndices.add(i)));

  const cols = state.columnConfig.columns || [];
  const hasRawData = state.points[0]?.raw && Object.keys(state.points[0].raw).length > 0;
  const rawColumns = hasRawData
    ? cols.filter(c => c.role !== "value").map(c => c.name)
    : [];

  const rows = state.points.map((p, i) => {
    const isViolated = violatedIndices.has(i);
    const isExcluded = p.excluded;
    const isSelected = i === state.selectedPointIndex;
    const cls = [
      isViolated ? "row-violated" : "",
      isExcluded ? "row-excluded" : "",
      isSelected ? "row-selected" : "",
    ].filter(Boolean).join(" ");

    const rawCells = rawColumns.map(col => `<td class="mono">${p.raw?.[col] ?? ""}</td>`).join("");

    return `<tr class="${cls}" data-action="select-point" data-index="${i}">
      <td class="mono">${i + 1}</td>
      <td class="mono">${p.primaryValue.toFixed(4)}</td>
      <td class="mono">${p.subgroupLabel}</td>
      ${rawCells}
      <td>${isExcluded ? '<span class="status-chip warning">Excl</span>' : isViolated ? '<span class="status-chip danger">OOC</span>' : '<span class="status-chip info">OK</span>'}</td>
    </tr>`;
  }).join("");

  const valueCol = cols.find(c => c.role === "value");
  const valueName = valueCol?.name || "Value";
  const subgroupCol = cols.find(c => c.role === "subgroup");
  const subgroupName = subgroupCol?.name || "Subgroup";

  return `
    <div class="data-table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${valueName}</th>
            <th>${subgroupName}</th>
            ${rawColumns.map(col => `<th>${col}</th>`).join("")}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/* ═══ Main chart arena ═══ */

export function renderChartArena(state) {
  const focusedSlot = state.charts[state.focusedChartId] || state.charts[state.chartOrder[0]];
  const tree = state.chartLayout.tree;

  return `
    <section class="chart-card">
      <div class="chart-toolbar">
        <div class="toolbar-title">
          <h3>${focusedSlot.context.metric?.label || ""} — ${focusedSlot.context.chartType?.label || ""}</h3>
          <span class="toolbar-window">${focusedSlot.context.window || ""}</span>
        </div>
        <div class="layout-controls">
          <button class="layout-btn ${state.showDataTable ? "active" : ""}" data-action="toggle-data-table" title="Data Table">☰</button>
        </div>
      </div>
      ${state.showDataTable ? renderDataTable(state) : `
        <div class="chart-arena">
          ${renderTreeNode(state, tree)}
        </div>
      `}
    </section>
  `;
}

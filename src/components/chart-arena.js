import { getCapability, capClass, CHART_TYPE_LABELS } from "../helpers.js";
import { renderContextMenu } from "./context-menu.js";
import { LAYOUT_TEMPLATES } from "../core/state.js";

/* ═══ Chart pane renderer ═══ */

function renderChartPane(state, chartId, slotIndex) {
  const slot = state.charts[chartId];
  if (!slot) return "";

  const isFocused = state.focusedChartId === chartId;
  const isOnlyChart = state.chartOrder.length <= 1;
  const caps = getCapability(state, chartId);
  const method = slot.context.chartType?.label || "";
  const metric = slot.context.metric?.label || "";

  const titlebar = isOnlyChart ? "" : `
      <div class="chart-pane-titlebar" data-drag-handle="${chartId}">
        <span class="grip-icon">\u2817</span>
        <span class="method-dot"></span>
        <strong class="pane-method">${method}</strong>
        <span class="pane-metric">${metric}</span>
        ${caps.cpk ? `
          <div class="pane-caps">
            <span class="cap-item"><span class="cap-label">Cpk</span><span class="cap-value ${capClass(caps.cpk)}">${caps.cpk}</span></span>
            <span class="cap-item"><span class="cap-label">Ppk</span><span class="cap-value ${capClass(caps.ppk)}">${caps.ppk}</span></span>
          </div>
        ` : ""}
        <button class="pane-close" data-action="remove-chart" data-chart-id="${chartId}" title="Close chart">\u00d7</button>
      </div>`;

  // Grid area name for template-area layouts (a, b, c, d...)
  const areaName = String.fromCharCode(97 + slotIndex); // 0→a, 1→b, 2→c, 3→d

  return `
    <div class="chart-pane ${isFocused ? "pane-focused" : ""}" data-chart-id="${chartId}" style="grid-area: ${areaName}">
      ${titlebar}
      <div class="chart-stage" id="chart-mount-${chartId}" tabindex="0" data-chart-focus="true" aria-label="${chartId} control chart">
        ${isFocused && state.ui.contextMenu ? renderContextMenu(state) : ""}
      </div>
    </div>
  `;
}

/* ═══ Layout template wireframe icons (SVG miniatures) ═══ */

const TEMPLATE_ICONS = {
  "1":   '<svg viewBox="0 0 20 14"><rect x="1" y="1" width="18" height="12" rx="1" fill="currentColor" opacity="0.3"/></svg>',
  "2h":  '<svg viewBox="0 0 20 14"><rect x="1" y="1" width="8.5" height="12" rx="1" fill="currentColor" opacity="0.3"/><rect x="10.5" y="1" width="8.5" height="12" rx="1" fill="currentColor" opacity="0.3"/></svg>',
  "2v":  '<svg viewBox="0 0 20 14"><rect x="1" y="1" width="18" height="5.5" rx="1" fill="currentColor" opacity="0.3"/><rect x="1" y="7.5" width="18" height="5.5" rx="1" fill="currentColor" opacity="0.3"/></svg>',
  "3h":  '<svg viewBox="0 0 20 14"><rect x="1" y="1" width="5.3" height="12" rx="1" fill="currentColor" opacity="0.3"/><rect x="7.3" y="1" width="5.3" height="12" rx="1" fill="currentColor" opacity="0.3"/><rect x="13.6" y="1" width="5.3" height="12" rx="1" fill="currentColor" opacity="0.3"/></svg>',
  "2x2": '<svg viewBox="0 0 20 14"><rect x="1" y="1" width="8.5" height="5.5" rx="1" fill="currentColor" opacity="0.3"/><rect x="10.5" y="1" width="8.5" height="5.5" rx="1" fill="currentColor" opacity="0.3"/><rect x="1" y="7.5" width="8.5" height="5.5" rx="1" fill="currentColor" opacity="0.3"/><rect x="10.5" y="7.5" width="8.5" height="5.5" rx="1" fill="currentColor" opacity="0.3"/></svg>',
  "1+2": '<svg viewBox="0 0 20 14"><rect x="1" y="1" width="18" height="5.5" rx="1" fill="currentColor" opacity="0.3"/><rect x="1" y="7.5" width="8.5" height="5.5" rx="1" fill="currentColor" opacity="0.3"/><rect x="10.5" y="7.5" width="8.5" height="5.5" rx="1" fill="currentColor" opacity="0.3"/></svg>',
  "2+1": '<svg viewBox="0 0 20 14"><rect x="1" y="1" width="8.5" height="5.5" rx="1" fill="currentColor" opacity="0.3"/><rect x="10.5" y="1" width="8.5" height="5.5" rx="1" fill="currentColor" opacity="0.3"/><rect x="1" y="7.5" width="18" height="5.5" rx="1" fill="currentColor" opacity="0.3"/></svg>',
};

function renderLayoutPicker(state) {
  const count = state.chartOrder.length;
  if (count < 2) return "";

  const current = state.chartLayout.template;

  // Show templates that fit the current chart count (or have fewer slots)
  const available = Object.entries(LAYOUT_TEMPLATES)
    .filter(([, tpl]) => tpl.slots >= 2 && tpl.slots <= Math.max(count, 4))
    .map(([id, tpl]) => {
      const active = id === current;
      const icon = TEMPLATE_ICONS[id] || "";
      return `<button class="layout-btn layout-template-btn ${active ? "active" : ""}"
        data-action="set-snap-layout" data-template="${id}" title="${tpl.label}">
        ${icon}
      </button>`;
    });

  return `<span class="layout-divider"></span>${available.join("")}`;
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
  const layout = state.chartLayout;
  const tpl = LAYOUT_TEMPLATES[layout.template] || LAYOUT_TEMPLATES["1"];

  // Grid columns/rows inline, areas via data-template CSS rules
  const gridStyle = `grid-template-columns: ${tpl.cols}; grid-template-rows: ${tpl.rows}`;

  // Render chart panes for each slot
  const panes = layout.slots.map((chartId, i) => renderChartPane(state, chartId, i)).join("");

  return `
    <section class="chart-card">
      <div class="chart-toolbar">
        <div class="toolbar-title">
          <h3>${focusedSlot.context.metric?.label || ""} \u2014 ${focusedSlot.context.chartType?.label || ""}</h3>
          <span class="toolbar-window">${focusedSlot.context.window || ""}</span>
        </div>
        <div class="layout-controls">
          <button class="layout-btn ${state.showDataTable ? "active" : ""}" data-action="toggle-data-table" title="Data Table">\u2630</button>
          ${renderLayoutPicker(state)}
        </div>
      </div>
      ${state.showDataTable ? renderDataTable(state) : `
        <div class="chart-arena" data-template="${layout.template}" style="${gridStyle}">
          ${panes}
        </div>
      `}
    </section>
  `;
}

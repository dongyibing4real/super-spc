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
        <button class="pane-table-btn ${slot.showDataTable ? "active" : ""}" data-action="toggle-pane-table" data-chart-id="${chartId}" title="Data table">☰</button>
        <button class="pane-close" data-action="remove-chart" data-chart-id="${chartId}" title="Close chart">×</button>
      </div>
    </div>`;

  const showTable = slot.showDataTable;
  return `
    <div class="chart-pane ${isFocused ? "pane-focused" : ""}" data-chart-id="${chartId}">
      ${titlebar}
      ${showTable
        ? `<div class="pane-data-table">${renderDataTable(state, chartId)}</div>`
        : `<div class="chart-stage" id="chart-mount-${chartId}" tabindex="0" data-chart-focus="true" aria-label="${chartId} control chart">
            ${isFocused && state.ui.contextMenu ? renderContextMenu(state) : ""}
          </div>`
      }
    </div>
  `;
}

/* ═══ Row-grid renderer ═══ */

function renderRows(state) {
  const { rows } = state.chartLayout;
  if (!rows || rows.length === 0) return "";
  return rows.map(row =>
    `<div class="chart-row">
      ${row.map(id => renderChartPane(state, id)).join("")}
    </div>`
  ).join("");
}

/* ═══ Ghost layout renderer (drag preview overlay) ═══ */

export function renderGhostRows(rows, incomingId) {
  if (!rows || rows.length === 0) return "";
  return rows.map(row =>
    `<div class="ghost-row">
      ${row.map(id =>
        `<div class="ghost-pane${id === incomingId ? " ghost-pane-incoming" : ""}"></div>`
      ).join("")}
    </div>`
  ).join("");
}


/* ═══ Data table renderer ═══ */

export function renderDataTable(state, chartId) {
  if (state.points.length === 0) return '<div class="empty-table">No data loaded.</div>';

  const focusedSlot = state.charts[chartId || state.focusedChartId];
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
  return `
    <section class="chart-card">
      <div class="chart-arena">
        ${renderRows(state)}
      </div>
    </section>
  `;
}

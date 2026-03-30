import { getCapability, capClass, detectRuleViolations, CHART_TYPE_LABELS } from "../helpers.js";
import { renderContextMenu } from "./context-menu.js";
import { collectChartIds } from "../core/state.js";

/* ═══ Chart type options (shared with recipe-rail) ═══ */
const CHART_TYPES = [
  ["Variables", [["imr","IMR"],["xbar_r","X-Bar R"],["xbar_s","X-Bar S"],["r","R"],["s","S"],["mr","MR"]]],
  ["Attributes", [["p","P"],["np","NP"],["c","C"],["u","U"],["laney_p","Laney P\u2019"],["laney_u","Laney U\u2019"]]],
  ["Advanced", [["cusum","CUSUM"],["ewma","EWMA"],["levey_jennings","Levey-Jennings"],["cusum_vmask","CUSUM V-Mask"],["three_way","Three-Way"],["presummarize","Presummarize"],["run","Run Chart"]]],
  ["Short Run", [["short_run","Short Run"]]],
  ["Rare Event", [["g","G"],["t","T"]]],
  ["Multivariate", [["hotelling_t2","Hotelling T\u00B2"],["mewma","MEWMA"]]],
];

/* ═══ Chart pane renderer ═══ */

function renderChartPane(state, chartId) {
  const slot = state.charts[chartId];
  if (!slot) return "";

  const isFocused = state.focusedChartId === chartId;
  const isOnlyChart = state.chartOrder.length <= 1;
  const caps = getCapability(state, chartId);
  const method = slot.context.chartType?.label || "";
  const metric = slot.context.metric?.label || "";
  const chartIndex = state.chartOrder.indexOf(chartId) + 1;

  // VS Code behavior: hide titlebar when only 1 chart (no ambiguity needed)
  const titlebar = isOnlyChart ? "" : `
      <div class="chart-pane-titlebar" data-drag-handle="${chartId}">
        <span class="grip-icon">\u2817</span>
        <span class="method-dot ${chartId}"></span>
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

function renderTreeNode(state, node, path = []) {
  if (node.type === "pane") {
    return renderChartPane(state, node.chartId);
  }

  const isRow = node.direction === "row";
  const gridProp = isRow ? "grid-template-columns" : "grid-template-rows";
  const crossProp = isRow ? "grid-template-rows" : "grid-template-columns";
  const gridStyle = `${gridProp}: ${node.sizes[0]}fr auto ${node.sizes[1]}fr; ${crossProp}: 1fr;`;
  const dividerDir = isRow ? "horizontal" : "vertical";

  return `
    <div class="split-container" data-direction="${node.direction}" data-path="${path.join(".")}" style="${gridStyle}">
      ${renderTreeNode(state, node.children[0], [...path, 0])}
      <div class="split-divider" data-direction="${dividerDir}" data-path="${path.join(".")}"></div>
      ${renderTreeNode(state, node.children[1], [...path, 1])}
    </div>
  `;
}

/* ═══ Chart picker (inline panel) ═══ */

function renderChartPicker(state) {
  if (!state.chartPicker) return "";
  return `
    <div class="chart-picker">
      <span class="picker-label">New chart type:</span>
      <select class="chip-select" data-field="picker-chart-type">
        ${CHART_TYPES.map(([group, items]) =>
          `<optgroup label="${group}">${items.map(([val, label]) =>
            `<option value="${val}">${label}</option>`
          ).join("")}</optgroup>`
        ).join("")}
      </select>
      <button class="picker-btn primary" data-action="confirm-add-chart">Add</button>
      <button class="picker-btn" data-action="cancel-add-chart">Cancel</button>
    </div>
  `;
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
  const hasMultiple = state.chartOrder.length >= 2;
  const currentDir = tree.type === "container" ? tree.direction : null;

  return `
    <section class="chart-card">
      <div class="chart-toolbar">
        <div class="toolbar-title">
          <h3>${focusedSlot.context.metric?.label || ""} \u2014 ${focusedSlot.context.chartType?.label || ""}</h3>
          <span class="toolbar-window">${focusedSlot.context.window || ""}</span>
        </div>
        <div class="layout-controls">
          <button class="layout-btn ${state.showDataTable ? "active" : ""}" data-action="toggle-data-table" title="Data Table">\u2630</button>
          ${hasMultiple ? `
            <span class="layout-divider"></span>
            <button class="layout-btn ${currentDir === "row" ? "active" : ""}" data-action="set-layout-preset" data-preset="side-by-side" title="Side by side">\u25eb</button>
            <button class="layout-btn ${currentDir === "column" ? "active" : ""}" data-action="set-layout-preset" data-preset="stacked" title="Stacked">\u25a9</button>
            ${state.chartOrder.length >= 3 ? `
              <button class="layout-btn" data-action="set-layout-preset" data-preset="grid" title="Grid (2\u00d72)">\u2b1a</button>
            ` : ""}
          ` : ""}
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

import { getCapability, capClass, detectRuleViolations } from "../helpers.js";
import { renderContextMenu } from "./context-menu.js";

export const CHART_MOUNT_PRIMARY = "chart-mount-primary";
export const CHART_MOUNT_CHALLENGER = "chart-mount-challenger";

function renderChartPane(state, role, method, caps, sp, limits, seriesKey) {
  const val = sp[seriesKey];
  const violations = detectRuleViolations(state);

  return `
    <div class="chart-pane" data-role="${role}" data-series-key="${seriesKey}">
      <div class="chart-pane-titlebar" data-drag-handle="${role}">
        <span class="grip-icon">\u2817</span>
        <span class="method-dot ${role}"></span>
        <span class="pane-role">${role === "primary" ? "Primary" : "Challenger"}</span>
        <strong class="pane-method">${method}</strong>
        ${caps.cpk ? `
          <div class="pane-caps">
            <span class="cap-item"><span class="cap-label">Cpk</span><span class="cap-value ${capClass(caps.cpk)}">${caps.cpk}</span></span>
            <span class="cap-item"><span class="cap-label">Ppk</span><span class="cap-value ${capClass(caps.ppk)}">${caps.ppk}</span></span>
          </div>
        ` : ""}
      </div>
      <div class="chart-stage" id="${role === "primary" ? CHART_MOUNT_PRIMARY : CHART_MOUNT_CHALLENGER}" tabindex="0" data-chart-focus="true" aria-label="${role} control chart">
        ${role === "primary" && state.ui.contextMenu ? renderContextMenu(state) : ""}
      </div>
    </div>
  `;
}

export function renderDataTable(state) {
  if (state.points.length === 0) return '<div class="empty-table">No data loaded.</div>';

  const violations = state.charts[state.chartOrder[0]]?.violations || [];
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

export function renderChartArena(state) {
  const sp = state.points[state.selectedPointIndex];
  const primarySlot = state.charts[state.chartOrder[0]];
  const hasChallenger = state.chartOrder.length > 1;
  const layout = state.chartLayout;
  const arrangement = hasChallenger ? layout.arrangement : "single";
  const showChallenger = hasChallenger && arrangement !== "single";

  const primaryFirst = layout.primaryPosition === "left" || layout.primaryPosition === "top";

  const panes = state.chartOrder.map(id => {
    const slot = state.charts[id];
    return renderChartPane(state, id, slot.context.chartType?.label || "", slot.capability || { cpk: null, ppk: null }, sp, slot.limits, "primaryValue");
  });

  const primaryPane = panes[0];
  const challengerPane = showChallenger ? panes[1] : "";

  const ratio = layout.splitRatio ?? 0.5;
  const isHoriz = arrangement === "horizontal" || arrangement === "primary-wide" || arrangement === "challenger-wide";
  const isVert = arrangement === "vertical" || arrangement === "primary-tall" || arrangement === "challenger-tall";
  let gridStyle = "";
  if (showChallenger && isHoriz) {
    gridStyle = `grid-template-columns: ${ratio}fr auto ${1 - ratio}fr; grid-template-rows: 1fr;`;
  } else if (showChallenger && isVert) {
    gridStyle = `grid-template-columns: 1fr; grid-template-rows: ${ratio}fr auto ${1 - ratio}fr;`;
  }

  const divider = showChallenger ? `<div class="chart-divider" data-divider="${isHoriz ? "horizontal" : "vertical"}"></div>` : "";

  const firstPane = primaryFirst ? primaryPane : challengerPane;
  const secondPane = primaryFirst ? challengerPane : primaryPane;

  return `
    <section class="chart-card">
      <div class="chart-toolbar">
        <div class="toolbar-title">
          <h3>${primarySlot.context.metric?.label || ""} \u2014 ${primarySlot.context.chartType?.label || ""}</h3>
          <span class="toolbar-window">${primarySlot.context.window || ""}</span>
        </div>
        <div class="layout-controls">
          <button class="layout-btn ${state.showDataTable ? "active" : ""}" data-action="toggle-data-table" title="Data Table">\u2630</button>
          ${hasChallenger ? `
            <button class="layout-btn ${arrangement === "horizontal" ? "active" : ""}" data-action="set-layout" data-arrangement="horizontal" title="Side by side (50/50)">\u25eb</button>
            <button class="layout-btn ${arrangement === "vertical" ? "active" : ""}" data-action="set-layout" data-arrangement="vertical" title="Stacked (50/50)">\u25a9</button>
            <button class="layout-btn ${arrangement === "primary-wide" ? "active" : ""}" data-action="set-layout" data-arrangement="primary-wide" title="Primary wide (2/3)">\u25e7</button>
            <button class="layout-btn ${arrangement === "primary-tall" ? "active" : ""}" data-action="set-layout" data-arrangement="primary-tall" title="Primary tall (2/3)">\u2b12</button>
            <button class="layout-btn ${arrangement === "single" ? "active" : ""}" data-action="set-layout" data-arrangement="single" title="Primary only">\u25a3</button>
          ` : ""}
        </div>
      </div>
      ${state.showDataTable ? renderDataTable(state) : `
        <div class="chart-arena" data-layout="${arrangement}" style="${gridStyle}">
          ${firstPane}${divider}${secondPane}
        </div>
      `}
    </section>
  `;
}

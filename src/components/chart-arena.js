import { getCapability, capClass, CHART_TYPE_LABELS } from "../helpers.js";
import { renderContextMenu } from "./context-menu.js";
import { buildForecastView } from "../prediction/build-forecast-view.js";

const FOCUSED_TAIL_WINDOW = 60;

function getChartPoints(state, slot) {
  const hasChartValues = slot.chartValues && slot.chartValues.length > 0;
  return hasChartValues
    ? slot.chartValues.map((v, i) => ({
        primaryValue: v,
        label: slot.chartLabels[i] || `pt-${i}`,
        subgroupLabel: slot.chartLabels[i] || `pt-${i}`,
        excluded: false,
        annotation: null,
        raw: {},
      }))
    : state.points;
}

/* ═══ Chart pane renderer ═══ */

function renderChartPane(state, chartId) {
  const slot = state.charts[chartId];
  if (!slot) return "";

  const isFocused = state.focusedChartId === chartId;
  const isOnly = state.chartOrder.length <= 1;
  const caps = getCapability(state, chartId);
  const method = slot.context.chartType?.label || "";
  const metric = slot.context.metric?.label || "";
  const points = getChartPoints(state, slot);
  const lastIdx = Math.max(0, points.length - 1);
  const xDefaultDomain = {
    min: Math.max(0, lastIdx - (FOCUSED_TAIL_WINDOW - 1)),
    max: lastIdx + (slot.forecast?.horizon || 6),
  };
  const forecastView = buildForecastView({
    points,
    limits: slot.limits,
    forecast: slot.forecast,
    xDomainOverride: slot.overrides.x,
    xDefaultDomain,
    chartTypeId: slot.context.chartType?.id,
  });
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
  const accentIdx = slot.accentIdx ?? 0;
  return `
    <div class="chart-pane ${isFocused ? "pane-focused" : ""}" data-chart-id="${chartId}" data-accent="${accentIdx}">
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
  const { rows, colWeights, rowWeights } = state.chartLayout;
  if (!rows || rows.length === 0) return "";
  const totalRowWeight = rowWeights.reduce((a, b) => a + b, 0);

  return rows.map((row, r) => {
    const rowPct = (rowWeights[r] / totalRowWeight * 100).toFixed(2);
    const totalColWeight = colWeights[r].reduce((a, b) => a + b, 0);

    const cells = row.map((id, c) => {
      const colPct = (colWeights[r][c] / totalColWeight * 100).toFixed(2);
      const pane = `<div class="chart-pane-wrap" style="flex: 0 0 ${colPct}%">${renderChartPane(state, id)}</div>`;
      const divider = c < row.length - 1
        ? `<div class="grid-divider grid-divider-col" data-row="${r}" data-col="${c}"><span class="grid-divider-grip">::</span></div>`
        : "";
      return pane + divider;
    }).join("");

    const rowDiv = r < rows.length - 1
      ? `<div class="grid-divider grid-divider-row" data-row="${r}"><span class="grid-divider-grip">::</span></div>`
      : "";

    return `<div class="chart-row" style="flex: 0 0 ${rowPct}%">${cells}</div>${rowDiv}`;
  }).join("");
}

/* ═══ Ghost layout renderer (drag preview overlay) ═══ */

export function renderGhostRows(layout, incomingId) {
  const { rows, colWeights, rowWeights } = layout;
  if (!rows || rows.length === 0) return "";
  const totalRowWeight = rowWeights.reduce((a, b) => a + b, 0);

  return rows.map((row, r) => {
    const rowPct = (rowWeights[r] / totalRowWeight * 100).toFixed(2);
    const totalColWeight = colWeights[r].reduce((a, b) => a + b, 0);

    const cells = row.map((id, c) => {
      const colPct = (colWeights[r][c] / totalColWeight * 100).toFixed(2);
      return `<div class="ghost-pane${id === incomingId ? " ghost-pane-incoming" : ""}" style="flex: 0 0 ${colPct}%"></div>`;
    }).join("");

    return `<div class="ghost-row" style="flex: 0 0 ${rowPct}%">${cells}</div>`;
  }).join("");
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

import React from "react";
import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import { getCapability, capClass, CHART_TYPE_LABELS } from "../helpers.js";
import { buildForecastView } from "../prediction/build-forecast-view.js";
import Chart from "./Chart.jsx";

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

/* --- Chart pane (React) --- */

function ChartPane({ state, chartId }) {
  const slot = state.charts[chartId];
  if (!slot) return null;

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
  // buildForecastView is called for side-effects / consistency with legacy
  buildForecastView({
    points,
    limits: slot.limits,
    forecast: slot.forecast,
    xDomainOverride: slot.overrides.x,
    xDefaultDomain,
    chartTypeId: slot.context.chartType?.id,
  });

  const showTable = slot.showDataTable;
  const accentIdx = state.chartOrder.indexOf(chartId) % 8;

  return (
    <div
      className={`chart-pane ${isFocused ? "pane-focused" : ""}`}
      data-chart-id={chartId}
      data-accent={accentIdx}
    >
      {!isOnly && (
        <div className="chart-pane-titlebar" data-drag-handle={chartId}>
          <span className="grip-icon">⠗</span>
          <span className="method-dot"></span>
          <strong className="pane-method">{method}</strong>
          <span className="pane-metric">{metric}</span>
          {caps.cpk ? (
            <div className="pane-caps">
              <span className="cap-item">
                <span className="cap-label">Cpk</span>
                <span className={`cap-value ${capClass(caps.cpk)}`}>{caps.cpk}</span>
              </span>
              <span className="cap-item">
                <span className="cap-label">Ppk</span>
                <span className={`cap-value ${capClass(caps.ppk)}`}>{caps.ppk}</span>
              </span>
            </div>
          ) : null}
          <div className="pane-actions">
            <button
              className={`pane-table-btn ${slot.showDataTable ? "active" : ""}`}
              data-action="toggle-pane-table"
              data-chart-id={chartId}
              title="Data table"
            >
              ☰
            </button>
            <button
              className="pane-close"
              data-action="remove-chart"
              data-chart-id={chartId}
              title="Close chart"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {showTable ? (
        <div
          className="pane-data-table"
          dangerouslySetInnerHTML={{ __html: renderDataTable(state, chartId) }}
        />
      ) : (
        <Chart key={chartId} chartId={chartId} />
      )}
    </div>
  );
}

/* --- Row grid (React) --- */

function RowGrid({ state }) {
  const { rows, colWeights, rowWeights } = state.chartLayout;
  if (!rows || rows.length === 0) return null;
  const totalRowWeight = rowWeights.reduce((a, b) => a + b, 0);

  return (
    <>
      {rows.map((row, r) => {
        const rowPct = (rowWeights[r] / totalRowWeight * 100).toFixed(2);
        const totalColWeight = colWeights[r].reduce((a, b) => a + b, 0);

        return (
          <React.Fragment key={`row-${r}`}>
            <div className="chart-row" style={{ flex: `0 0 ${rowPct}%` }}>
              {row.map((id, c) => {
                const colPct = (colWeights[r][c] / totalColWeight * 100).toFixed(2);
                return (
                  <React.Fragment key={id}>
                    <div className="chart-pane-wrap" style={{ flex: `0 0 ${colPct}%` }}>
                      <ChartPane state={state} chartId={id} />
                    </div>
                    {c < row.length - 1 && (
                      <div className="grid-divider grid-divider-col" data-row={r} data-col={c}>
                        <span className="grid-divider-grip">::</span>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            {r < rows.length - 1 && (
              <div className="grid-divider grid-divider-row" data-row={r}>
                <span className="grid-divider-grip">::</span>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

/* --- Ghost layout renderer (template-string, NOT React) --- */

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

/* --- Data table renderer (template-string, NOT React) --- */

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

/* --- Main ChartArena component --- */

export default function ChartArena() {
  const charts = useStore(spcStore, (s) => s.charts);
  const chartOrder = useStore(spcStore, (s) => s.chartOrder);
  const chartLayout = useStore(spcStore, (s) => s.chartLayout);
  const focusedChartId = useStore(spcStore, (s) => s.focusedChartId);
  const points = useStore(spcStore, (s) => s.points);
  const selectedPointIndex = useStore(spcStore, (s) => s.selectedPointIndex);
  const columnConfig = useStore(spcStore, (s) => s.columnConfig);
  const chartToggles = useStore(spcStore, (s) => s.chartToggles);
  const contextMenu = useStore(spcStore, (s) => s.ui.contextMenu);

  const state = {
    charts,
    chartOrder,
    chartLayout,
    focusedChartId,
    points,
    selectedPointIndex,
    columnConfig,
    chartToggles,
    ui: { contextMenu },
  };

  return (
    <section className="chart-card">
      <div className="chart-arena">
        <RowGrid state={state} />
      </div>
    </section>
  );
}

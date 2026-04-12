import React from "react";
import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import { focusChart, removeChart, selectPoint } from "../core/state/chart.js";
import { togglePaneDataTable, openContextMenu } from "../core/state/ui.js";
import { saveLayout } from "../store/actions.js";
import { CHART_TYPE_LABELS } from "../constants.js";
import { capClass } from "../helpers.js";
import { getCapability } from "../core/state/selectors.js";
import Chart from "./Chart.jsx";
import type { SPCState, ChartSlot, ChartLayout, ChartToggles, ChartPoint, ColumnConfig, Violation } from "../types/state.js";

/* --- Shared arena state subset used by pane sub-components --- */

interface ArenaState {
  charts: Record<string, ChartSlot>;
  chartOrder: string[];
  chartLayout: ChartLayout;
  focusedChartId: string;
  points: ChartPoint[];
  selectedPointIndex: number | null;
  columnConfig: ColumnConfig;
  chartToggles: ChartToggles;
  ui: { contextMenu: unknown | null };
}

/* --- Chart pane (React) --- */

interface ChartPaneProps {
  state: ArenaState;
  chartId: string;
}

function ChartPane({ state, chartId }: ChartPaneProps): React.JSX.Element | null {
  const slot: ChartSlot | undefined = state.charts[chartId];
  if (!slot) return null;

  const isFocused: boolean = state.focusedChartId === chartId;
  const isOnly: boolean = state.chartOrder.length <= 1;
  const caps = getCapability(state as unknown as SPCState, chartId) as { cpk?: number; ppk?: number };
  const method: string = slot.context.chartType?.label || "";
  const metric: string = slot.context.metric?.label || "";
  const showTable: boolean = slot.showDataTable;
  const accentIdx: number = state.chartOrder.indexOf(chartId) % 8;

  const handlePaneClick = (): void => {
    if (!isFocused) {
      spcStore.setState((s: SPCState) => focusChart(s, chartId));
    }
  };

  const handleRemoveChart = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    spcStore.setState((s: SPCState) => removeChart(s, chartId));
    saveLayout();
  };

  const handleToggleTable = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    spcStore.setState((s: SPCState) => togglePaneDataTable(s, chartId));
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const root: HTMLElement = document.getElementById("app") || document.documentElement;
    const rootRect: DOMRect = root.getBoundingClientRect();
    const x: number = e.clientX - rootRect.left;
    const y: number = e.clientY - rootRect.top;
    spcStore.setState((s: SPCState) => openContextMenu(s, x, y, { target: "canvas" }));
  };

  const handleTitlebarContextMenu = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    const root: HTMLElement = document.getElementById("app") || document.documentElement;
    const rootRect: DOMRect = root.getBoundingClientRect();
    const x: number = e.clientX - rootRect.left;
    const y: number = e.clientY - rootRect.top;
    spcStore.setState((s: SPCState) => openContextMenu(s, x, y, { target: "canvas" }));
  };

  return (
    <div
      className={`chart-pane ${isFocused ? "pane-focused" : ""}`}
      data-chart-id={chartId}
      data-accent={accentIdx}
      onClick={handlePaneClick}
    >
      {!isOnly && (
        <div
          className="chart-pane-titlebar"
          data-drag-handle={chartId}
          onContextMenu={handleTitlebarContextMenu}
        >
          <span className="grip-icon"> :: </span>
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
                <span className={`cap-value ${capClass(caps.ppk as number)}`}>{caps.ppk}</span>
              </span>
            </div>
          ) : null}
          <div className="pane-actions">
            <button
              className={`pane-table-btn ${slot.showDataTable ? "active" : ""}`}
              onClick={handleToggleTable}
              data-chart-id={chartId}
              title="Data table"
            >
              ☰
            </button>
            <button
              className="pane-close"
              onClick={handleRemoveChart}
              data-chart-id={chartId}
              title="Close chart"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {showTable ? (
        <DataTable state={state} chartId={chartId} />
      ) : (
        <Chart key={chartId} chartId={chartId} onContextMenu={handleContextMenu} />
      )}
    </div>
  );
}

/* --- Data table (React) --- */

interface DataTableProps {
  state: ArenaState;
  chartId: string;
}

function DataTable({ state, chartId }: DataTableProps): React.JSX.Element {
  const focusedSlot: ChartSlot | undefined = state.charts[chartId || state.focusedChartId];
  const violations: Violation[] = focusedSlot?.violations || [];
  const violatedIndices = new Set<number>();
  violations.forEach((v: Violation) => v.indices.forEach((i: number) => violatedIndices.add(i)));

  const cols = state.columnConfig.columns || [];
  const hasRawData: boolean = !!(state.points[0]?.raw && Object.keys(state.points[0].raw).length > 0);
  const rawColumns: string[] = hasRawData
    ? cols.filter((c) => c.role !== "value").map((c) => c.name)
    : [];

  const valueCol = cols.find((c) => c.role === "value");
  const valueName: string = valueCol?.name || "Value";
  const subgroupCol = cols.find((c) => c.role === "subgroup");
  const subgroupName: string = subgroupCol?.name || "Subgroup";

  if (state.points.length === 0) {
    return <div className="pane-data-table"><div className="empty-table">No data loaded.</div></div>;
  }

  const handleRowClick = (index: number): void => {
    spcStore.setState((s: SPCState) => selectPoint(s, index));
  };

  return (
    <div className="pane-data-table">
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{valueName}</th>
              <th>{subgroupName}</th>
              {rawColumns.map((col: string) => (
                <th key={col}>{col}</th>
              ))}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {state.points.map((p: ChartPoint, i: number) => {
              const isViolated: boolean = violatedIndices.has(i);
              const isExcluded: boolean = p.excluded;
              const isSelected: boolean = i === state.selectedPointIndex;
              const cls: string = [
                isViolated ? "row-violated" : "",
                isExcluded ? "row-excluded" : "",
                isSelected ? "row-selected" : "",
              ].filter(Boolean).join(" ");

              return (
                <tr
                  key={i}
                  className={cls}
                  onClick={() => handleRowClick(i)}
                  style={{ cursor: "pointer" }}
                >
                  <td className="mono">{i + 1}</td>
                  <td className="mono">{p.primaryValue.toFixed(4)}</td>
                  <td className="mono">{p.subgroupLabel}</td>
                  {rawColumns.map((col: string) => (
                    <td key={col} className="mono">{p.raw?.[col] ?? ""}</td>
                  ))}
                  <td>
                    {isExcluded ? (
                      <span className="status-chip warning">Excl</span>
                    ) : isViolated ? (
                      <span className="status-chip danger">OOC</span>
                    ) : (
                      <span className="status-chip info">OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --- Row grid (React) --- */

interface RowGridProps {
  state: ArenaState;
}

function RowGrid({ state }: RowGridProps): React.JSX.Element | null {
  const { rows, colWeights, rowWeights } = state.chartLayout;
  if (!rows || rows.length === 0) return null;
  return (
    <>
      {rows.map((row: string[], r: number) => {
        return (
          <React.Fragment key={`row-${r}`}>
            <div className="chart-row" style={{ flex: `${rowWeights[r]} 1 0` }}>
              {row.map((id: string, c: number) => {
                return (
                  <React.Fragment key={id}>
                    <div className="chart-pane-wrap" style={{ flex: `${colWeights[r][c]} 1 0` }}>
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

export function renderGhostRows(layout: ChartLayout, incomingId: string): string {
  const { rows, colWeights, rowWeights } = layout;
  if (!rows || rows.length === 0) return "";

  return rows.map((row: string[], r: number) => {
    const cells: string = row.map((id: string, c: number) => {
      return `<div class="ghost-pane${id === incomingId ? " ghost-pane-incoming" : ""}" style="flex: ${colWeights[r][c]} 1 0"></div>`;
    }).join("");

    return `<div class="ghost-row" style="flex: ${rowWeights[r]} 1 0">${cells}</div>`;
  }).join("");
}

/* --- Data table renderer (template-string, NOT React) --- */

export function renderDataTable(state: ArenaState, chartId: string): string {
  if (state.points.length === 0) return '<div class="empty-table">No data loaded.</div>';

  const focusedSlot: ChartSlot | undefined = state.charts[chartId || state.focusedChartId];
  const violations: Violation[] = focusedSlot?.violations || [];
  const violatedIndices = new Set<number>();
  violations.forEach((v: Violation) => v.indices.forEach((i: number) => violatedIndices.add(i)));

  const cols = state.columnConfig.columns || [];
  const hasRawData: boolean = !!(state.points[0]?.raw && Object.keys(state.points[0].raw).length > 0);
  const rawColumns: string[] = hasRawData
    ? cols.filter((c) => c.role !== "value").map((c) => c.name)
    : [];

  const rows: string = state.points.map((p: ChartPoint, i: number) => {
    const isViolated: boolean = violatedIndices.has(i);
    const isExcluded: boolean = p.excluded;
    const isSelected: boolean = i === state.selectedPointIndex;
    const cls: string = [
      isViolated ? "row-violated" : "",
      isExcluded ? "row-excluded" : "",
      isSelected ? "row-selected" : "",
    ].filter(Boolean).join(" ");

    const rawCells: string = rawColumns.map((col: string) => `<td class="mono">${p.raw?.[col] ?? ""}</td>`).join("");

    return `<tr class="${cls}" data-index="${i}">
      <td class="mono">${i + 1}</td>
      <td class="mono">${p.primaryValue.toFixed(4)}</td>
      <td class="mono">${p.subgroupLabel}</td>
      ${rawCells}
      <td>${isExcluded ? '<span class="status-chip warning">Excl</span>' : isViolated ? '<span class="status-chip danger">OOC</span>' : '<span class="status-chip info">OK</span>'}</td>
    </tr>`;
  }).join("");

  const valueCol = cols.find((c) => c.role === "value");
  const valueName: string = valueCol?.name || "Value";
  const subgroupCol = cols.find((c) => c.role === "subgroup");
  const subgroupName: string = subgroupCol?.name || "Subgroup";

  return `
    <div class="data-table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${valueName}</th>
            <th>${subgroupName}</th>
            ${rawColumns.map((col: string) => `<th>${col}</th>`).join("")}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/* --- Main ChartArena component --- */

export default function ChartArena(): React.JSX.Element {
  const charts = useStore(spcStore, (s: SPCState) => s.charts);
  const chartOrder = useStore(spcStore, (s: SPCState) => s.chartOrder);
  const chartLayout = useStore(spcStore, (s: SPCState) => s.chartLayout);
  const focusedChartId = useStore(spcStore, (s: SPCState) => s.focusedChartId);
  const points = useStore(spcStore, (s: SPCState) => s.points);
  const selectedPointIndex = useStore(spcStore, (s: SPCState) => s.selectedPointIndex);
  const columnConfig = useStore(spcStore, (s: SPCState) => s.columnConfig);
  const chartToggles = useStore(spcStore, (s: SPCState) => s.chartToggles);
  const contextMenu = useStore(spcStore, (s: SPCState) => s.ui.contextMenu);

  const state: ArenaState = {
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

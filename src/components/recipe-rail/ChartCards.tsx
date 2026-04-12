import { spcStore } from "../../store/spc-store.js";
import { focusChart, addChart } from "../../core/state/chart.js";
import { togglePaneDataTable } from "../../core/state/ui.js";
import { applyParamsToContext } from "../../data/params.js";
import { saveLayout, reanalyze } from "../../store/actions.js";
import ChartChips from "./ChartChips.jsx";
import type { ChartSlot, ChartParams, ChartContext, SPCState } from "../../types/state.ts";
import type { ColumnOut } from "../../types/api.ts";
import type { RecipeRailState } from "./RecipeRail.jsx";

function collapsedSummary(slot: ChartSlot): string {
  if (!slot) return "\u2014";
  const metric = slot.context.metric?.label || "\u2014";
  const sigma = slot.context.sigma?.label || "";
  const tests = (slot.params.nelson_tests || []).map((id: number) => `R${id}`).join(",");
  const parts = [metric, sigma, tests].filter(Boolean);
  return parts.join(" \u00b7 ") || "\u2014";
}

interface CollapsedChartCardProps {
  state: RecipeRailState;
  chartId: string;
}

export function CollapsedChartCard({ state, chartId }: CollapsedChartCardProps) {
  const slot = state.charts[chartId];
  if (!slot) return null;
  const chartLabel = slot.context.chartType?.label || "\u2014";
  const idx = state.chartOrder.indexOf(chartId) + 1;
  const accentIdx = state.chartOrder.indexOf(chartId) % 8;
  const summary = collapsedSummary(slot);

  return (
    <div
      className="rail-card rail-card--collapsed"
      onClick={() => spcStore.setState((s: SPCState) => focusChart(s, chartId))}
      data-chart-id={chartId}
      data-accent={accentIdx}
      style={{ cursor: "pointer" }}
    >
      <div className="rail-card-header rail-card-header--collapsed">
        <span className="rail-card-dot"></span>
        <span className="rail-card-label">{chartLabel}</span>
        <span className="rail-card-id">Chart {idx}</span>
      </div>
      <div className="rail-card-summary">{summary}</div>
    </div>
  );
}

interface ExpandedChartCardProps {
  state: RecipeRailState;
  chartId: string;
  slot: ChartSlot;
  ae: string | null;
  cols: { name: string; ordinal: number; dtype: string; role: string | null }[];
}

export function ExpandedChartCard({ state, chartId, slot, ae, cols }: ExpandedChartCardProps) {
  const chartLabel = slot.context.chartType?.label || "\u2014";
  const idx = state.chartOrder.indexOf(chartId) + 1;
  const accentIdx = state.chartOrder.indexOf(chartId) % 8;

  return (
    <div className="rail-card rail-card--focused" data-chart-id={chartId} data-accent={accentIdx}>
      <div className="rail-card-header rail-card-header--focused">
        <span className="rail-card-dot"></span>
        <span className="rail-card-label">{chartLabel}</span>
        <span className="rail-card-id">Chart {idx}</span>
      </div>
      <ChartChips state={state} prefix={chartId} params={slot.params} context={slot.context} ae={ae} cols={cols} />
      <button
        className={`recipe-chip recipe-chip--table ${slot.showDataTable ? "chip-editing" : ""}`}
        onClick={() => spcStore.setState((s: SPCState) => togglePaneDataTable(s, chartId))}
        type="button"
      >
        <span className="chip-label">Data Table</span>
        <strong>{slot.showDataTable ? "Visible" : "Hidden"}</strong>
      </button>
    </div>
  );
}

interface PendingChartCardProps {
  state: RecipeRailState;
}

export function PendingChartCard({ state }: PendingChartCardProps) {
  const pending = state.ui.pendingNewChart;
  if (!pending) return null;
  const ae = state.activeChipEditor;
  const cols = state.columnConfig.columns || [];
  const focusedSlot = state.charts[state.focusedChartId];

  const baseContext: ChartContext = focusedSlot
    ? focusedSlot.context
    : {
        title: "",
        metric: { id: "", label: "Value", unit: "" },
        subgroup: { id: "", label: "Individual (n=1)", detail: "" },
        phase: { id: "", label: "No phases", detail: "" },
        chartType: { id: "imr", label: "IMR", detail: "" },
        sigma: { label: "3 Sigma", detail: "Moving Range" },
        tests: { label: "R1,R2,R5", detail: "" },
        compare: { label: "", detail: "" },
        window: "",
        methodBadge: "IMR",
        status: "",
      };
  const pendingAsParams = pending as unknown as ChartParams;
  const context: ChartContext = applyParamsToContext(baseContext, pendingAsParams);
  const activeTests: number[] = pendingAsParams.nelson_tests || [];
  context.tests = { label: activeTests.map((id: number) => `R${id}`).join(",") || "None", detail: "" };

  const handleCancel = (): void => {
    spcStore.setState((s: SPCState) => ({ ...s, ui: { ...s.ui, pendingNewChart: null } }));
  };

  const handleConfirm = (): void => {
    spcStore.setState((s: SPCState) => {
      const pendingParams = s.ui.pendingNewChart as unknown as ChartParams | null;
      if (!pendingParams) return s;
      let next: SPCState = { ...s, ui: { ...s.ui, pendingNewChart: null } };
      next = addChart(next, { chartType: pendingParams.chart_type });
      const newId = `chart-${next.nextChartId - 1}`;
      if (next.charts[newId]) {
        next = {
          ...next,
          charts: {
            ...next.charts,
            [newId]: { ...next.charts[newId], params: { ...pendingParams } },
          },
        };
      }
      return next;
    });
    saveLayout();
    const s = spcStore.getState();
    if (s.activeDatasetId) reanalyze();
  };

  return (
    <div className="rail-card rail-card--pending">
      <div className="rail-card-header rail-card-header--pending">
        <span className="rail-card-dot"></span>
        <span className="rail-card-label">New Chart</span>
        <button className="rail-card-close" onClick={handleCancel} type="button" aria-label="Cancel new chart" title="Cancel">&#10005;</button>
      </div>
      <ChartChips state={state} prefix="_pending" params={pendingAsParams} context={context} ae={ae} cols={cols} />
      <div className="rail-card-actions">
        <button className="rail-card-btn rail-card-btn--cancel" onClick={handleCancel} type="button">Cancel</button>
        <button className="rail-card-btn rail-card-btn--confirm" onClick={handleConfirm} type="button">Add</button>
      </div>
    </div>
  );
}

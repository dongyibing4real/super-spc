import { spcStore } from "../../store/spc-store.js";
import { focusChart, addChart } from "../../core/state/chart.js";
import { togglePaneDataTable } from "../../core/state/ui.js";
import { applyParamsToContext } from "../../data/params.js";
import { saveLayout, reanalyze } from "../../store/actions.js";
import ChartChips from "./ChartChips.jsx";

function collapsedSummary(slot) {
  if (!slot) return "\u2014";
  const metric = slot.context.metric?.label || "\u2014";
  const sigma = slot.context.sigma?.label || "";
  const tests = (slot.params.nelson_tests || []).map((id) => `R${id}`).join(",");
  const parts = [metric, sigma, tests].filter(Boolean);
  return parts.join(" \u00b7 ") || "\u2014";
}

export function CollapsedChartCard({ state, chartId }) {
  const slot = state.charts[chartId];
  if (!slot) return null;
  const chartLabel = slot.context.chartType?.label || "\u2014";
  const idx = state.chartOrder.indexOf(chartId) + 1;
  const accentIdx = state.chartOrder.indexOf(chartId) % 8;
  const summary = collapsedSummary(slot);

  return (
    <div
      className="rail-card rail-card--collapsed"
      onClick={() => spcStore.setState((s) => focusChart(s, chartId))}
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

export function ExpandedChartCard({ state, chartId, slot, ae, cols }) {
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
        onClick={() => spcStore.setState((s) => togglePaneDataTable(s, chartId))}
        type="button"
      >
        <span className="chip-label">Data Table</span>
        <strong>{slot.showDataTable ? "Visible" : "Hidden"}</strong>
      </button>
    </div>
  );
}

export function PendingChartCard({ state }) {
  const pending = state.ui.pendingNewChart;
  if (!pending) return null;
  const ae = state.activeChipEditor;
  const cols = state.columnConfig.columns || [];
  const focusedSlot = state.charts[state.focusedChartId];

  const baseContext = focusedSlot
    ? focusedSlot.context
    : {
        metric: { id: "", label: "Value", unit: "" },
        subgroup: { id: "", label: "Individual (n=1)", detail: "" },
        phase: { id: "", label: "No phases", detail: "" },
        chartType: { id: "imr", label: "IMR", detail: "" },
        sigma: { label: "3 Sigma", detail: "Moving Range" },
        tests: { label: "R1,R2,R5", detail: "" },
        methodBadge: "IMR",
      };
  const context = applyParamsToContext(baseContext, pending);
  const activeTests = pending.nelson_tests || [];
  context.tests = { label: activeTests.map((id) => `R${id}`).join(",") || "None", detail: "" };

  const handleCancel = () => {
    spcStore.setState((s) => ({ ...s, ui: { ...s.ui, pendingNewChart: null } }));
  };

  const handleConfirm = () => {
    spcStore.setState((s) => {
      const pendingParams = s.ui.pendingNewChart;
      if (!pendingParams) return s;
      let next = { ...s, ui: { ...s.ui, pendingNewChart: null } };
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
      <ChartChips state={state} prefix="_pending" params={pending} context={context} ae={ae} cols={cols} />
      <div className="rail-card-actions">
        <button className="rail-card-btn rail-card-btn--cancel" onClick={handleCancel} type="button">Cancel</button>
        <button className="rail-card-btn rail-card-btn--confirm" onClick={handleConfirm} type="button">Add</button>
      </div>
    </div>
  );
}

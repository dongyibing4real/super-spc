import { useRef, useLayoutEffect } from "react";
import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import { getFocused } from "../core/state/selectors.js";
import { collectChartIds } from "../core/state/layout.js";
import { DEFAULT_PARAMS, createSlot } from "../core/state/init.js";
import { focusChart, setChartParams, setActiveChipEditor, addChart } from "../core/state/chart.js";
import { setRecipeParams } from "../core/state/reconcile-params.js";
import { togglePaneDataTable, setLoadingState, setDatasets, setError } from "../core/state/ui.js";
import { CHART_TYPE_LABELS, INDIVIDUAL_ONLY, SUBGROUP_REQUIRED } from "../constants.js";
import { applyParamsToContext, getDisabledChartTypes } from "../data/params.js";
import {
  reanalyze,
  loadDatasetById,
  saveLayout,
  restoreLayout,
} from "../store/actions.js";
import { fetchDatasets } from "../data/api.js";

const CHART_TYPES = [
  ["Variables", [["imr","IMR"],["xbar_r","X-Bar R"],["xbar_s","X-Bar S"],["r","R"],["s","S"],["mr","MR"]]],
  ["Attributes", [["p","P"],["np","NP"],["c","C"],["u","U"],["laney_p","Laney P\u2019"],["laney_u","Laney U\u2019"]]],
  ["Advanced", [["cusum","CUSUM"],["ewma","EWMA"],["levey_jennings","Levey-Jennings"],["cusum_vmask","CUSUM V-Mask"],["three_way","Three-Way"],["presummarize","Presummarize"],["run","Run Chart"]]],
  ["Short Run", [["short_run","Short Run"]]],
  ["Rare Event", [["g","G"],["t","T"]]],
  ["Multivariate", [["hotelling_t2","Hotelling T\u00B2"],["mewma","MEWMA"]]],
];
const SIGMA_METHODS = [["moving_range","Moving Range"],["median_moving_range","Median MR"],["range","Range"],["stddev","Std Dev"],["levey_jennings","Levey-Jennings"]];
const NELSON_RULES = [[1,"1: Beyond 3\u03c3"],[2,"2: 9 same side"],[3,"3: 6 trending"],[4,"4: 14 alternating"],[5,"5: 2/3 beyond 2\u03c3"],[6,"6: 4/5 beyond 1\u03c3"],[7,"7: 15 within 1\u03c3"],[8,"8: 8 beyond 1\u03c3"]];

const SIGMA_METHOD_CHARTS = new Set(["imr"]);
const NO_SIGMA_CHARTS = new Set(["p","np","c","u","laney_p","laney_u","cusum","ewma","cusum_vmask","hotelling_t2","mewma","run"]);

function parseNullableNumber(value) {
  const trimmed = value.trim();
  return trimmed !== "" ? parseFloat(trimmed) : null;
}

function ChipSelect({ onChange, options, current, resetKey }) {
  return (
    <select
      key={resetKey || current}
      className="chip-select"
      onClick={(e) => e.stopPropagation()}
      onChange={onChange}
      defaultValue={current}
    >
      {options.map(([val, label]) => (
        <option key={val} value={val}>{label}</option>
      ))}
    </select>
  );
}

function ChipGroupSelect({ onChange, groups, current, disabledSet = new Set(), resetKey }) {
  return (
    <select
      key={resetKey || current}
      className="chip-select"
      onClick={(e) => e.stopPropagation()}
      onChange={onChange}
      defaultValue={current}
    >
      {groups.map(([group, items]) => (
        <optgroup key={group} label={group}>
          {items.map(([val, label]) => (
            <option
              key={val}
              value={val}
              disabled={disabledSet.has(val)}
            >
              {label}{disabledSet.has(val) ? " \u2014" : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function specSummary(params) {
  const parts = [];
  if (params.lsl != null) parts.push(`LSL ${params.lsl}`);
  if (params.target != null) parts.push(`T ${params.target}`);
  if (params.usl != null) parts.push(`USL ${params.usl}`);
  return parts.length > 0 ? parts.join(" \u2013 ") : "Not set";
}

/* --- Dispatch helpers for chart param changes --- */

const RECIPE_KEYS = new Set(["chart_type", "value_column", "subgroup_column", "phase_column"]);

function dispatchChartParam(prefix, paramUpdate) {
  const needsReconcile = Object.keys(paramUpdate).some((k) => RECIPE_KEYS.has(k));
  if (prefix === "_pending") {
    spcStore.setState((s) => {
      const pending = { ...s.ui.pendingNewChart, ...paramUpdate };
      let next = { ...s, ui: { ...s.ui, pendingNewChart: pending } };
      return setActiveChipEditor(next, null);
    });
  } else {
    spcStore.setState((s) => {
      const setter = needsReconcile ? setRecipeParams : setChartParams;
      let next = setter(s, prefix, paramUpdate);
      return setActiveChipEditor(next, null);
    });
    reanalyze();
  }
}

function dispatchPendingParamNoClose(prefix, paramUpdate) {
  if (prefix === "_pending") {
    spcStore.setState((s) => ({
      ...s,
      ui: { ...s.ui, pendingNewChart: { ...s.ui.pendingNewChart, ...paramUpdate } },
    }));
  } else {
    const needsReconcile = Object.keys(paramUpdate).some((k) => RECIPE_KEYS.has(k));
    const setter = needsReconcile ? setRecipeParams : setChartParams;
    spcStore.setState((s) => setter(s, prefix, paramUpdate));
    reanalyze();
  }
}

function SpecEditor({ prefix, params }) {
  return (
    <span className="chip-sigma-editor">
      <label className="chip-sigma-row">
        <span className="chip-sigma-label">LSL</span>
        <input
          type="number"
          className="chip-k-input"
          onChange={(e) => dispatchChartParam(prefix, { lsl: parseNullableNumber(e.target.value) })}
          defaultValue={params.lsl ?? ""}
          step="any"
          onClick={(e) => e.stopPropagation()}
          placeholder="\u2014"
        />
      </label>
      <label className="chip-sigma-row">
        <span className="chip-sigma-label">Target</span>
        <input
          type="number"
          className="chip-k-input"
          onChange={(e) => dispatchChartParam(prefix, { target: parseNullableNumber(e.target.value) })}
          defaultValue={params.target ?? ""}
          step="any"
          onClick={(e) => e.stopPropagation()}
          placeholder="\u2014"
        />
      </label>
      <label className="chip-sigma-row">
        <span className="chip-sigma-label">USL</span>
        <input
          type="number"
          className="chip-k-input"
          onChange={(e) => dispatchChartParam(prefix, { usl: parseNullableNumber(e.target.value) })}
          defaultValue={params.usl ?? ""}
          step="any"
          onClick={(e) => e.stopPropagation()}
          placeholder="\u2014"
        />
      </label>
    </span>
  );
}

function SigmaEditor({ prefix, params }) {
  const showMethod = SIGMA_METHOD_CHARTS.has(params.chart_type);
  return (
    <span className="chip-sigma-editor">
      <label className="chip-sigma-row">
        <span className="chip-sigma-label">k</span>
        <input
          type="number"
          className="chip-k-input"
          onChange={(e) => {
            const k = parseFloat(e.target.value);
            if (k > 0 && k <= 6) dispatchPendingParamNoClose(prefix, { k_sigma: k });
          }}
          defaultValue={params.k_sigma}
          min="0.5"
          max="6"
          step="0.5"
          onClick={(e) => e.stopPropagation()}
        />
      </label>
      {showMethod && (
        <label className="chip-sigma-row">
          <span className="chip-sigma-label">Method</span>
          <ChipSelect
            resetKey={prefix}
            onChange={(e) => dispatchChartParam(prefix, { sigma_method: e.target.value })}
            options={SIGMA_METHODS}
            current={params.sigma_method}
          />
        </label>
      )}
    </span>
  );
}

function ChartChips({ state, prefix, params, context, ae, cols }) {
  const numericCols = cols.filter((c) => c.dtype === "numeric");
  const allNonValue = cols.filter((c) => c.role !== "value");
  const currentSg = params.subgroup_column || "";
  const currentPh = params.phase_column || "";
  const activeTests = params.nelson_tests || [];

  const handleToggleChip = (chipId, isLocked) => {
    if (isLocked) return;
    spcStore.setState((s) => setActiveChipEditor(s, ae === chipId ? null : chipId));
  };

  const chips = [
    {
      id: `${prefix}-metric`,
      label: "Metric",
      value: ae === `${prefix}-metric`
        ? <ChipSelect
            resetKey={prefix}
            onChange={(e) => dispatchChartParam(prefix, { value_column: e.target.value || null })}
            options={numericCols.map((c) => [c.name, c.name])}
            current={numericCols.find((c) => c.role === "value")?.name || ""}
          />
        : context.metric.label,
      detail: context.metric.unit,
    },
    {
      id: `${prefix}-subgroup`,
      label: "Subgroup",
      value: ae === `${prefix}-subgroup`
        ? <ChipSelect
            resetKey={prefix}
            onChange={(e) => dispatchChartParam(prefix, { subgroup_column: e.target.value || null })}
            options={[
              ["", "Individual (n=1)"],
              ...allNonValue.map((c) => [c.name, c.name]),
            ]}
            current={currentSg}
          />
        : context.subgroup.label,
      detail: ae === `${prefix}-subgroup` ? "" : context.subgroup.detail,
    },
    {
      id: `${prefix}-phase`,
      label: "Phase",
      value: ae === `${prefix}-phase`
        ? <ChipSelect
            resetKey={prefix}
            onChange={(e) => dispatchChartParam(prefix, { phase_column: e.target.value || null })}
            options={[["", "No phases"], ...allNonValue.map((c) => [c.name, c.name])]}
            current={currentPh}
          />
        : context.phase.label,
      detail: ae === `${prefix}-phase` ? "" : context.phase.detail,
    },
    {
      id: `${prefix}-chart`,
      label: "Chart",
      value: ae === `${prefix}-chart`
        ? <ChipGroupSelect
            resetKey={prefix}
            onChange={(e) => dispatchChartParam(prefix, { chart_type: e.target.value || null })}
            groups={CHART_TYPES}
            current={params.chart_type || ""}
            disabledSet={getDisabledChartTypes(params, cols)}
          />
        : context.chartType.label,
      detail: ae === `${prefix}-chart` ? "" : context.chartType.detail,
    },
    // Progressive disclosure: hide Sigma/Tests/Specs when chart_type is null
    ...(params.chart_type && !NO_SIGMA_CHARTS.has(params.chart_type) ? [{
      id: `${prefix}-sigma`,
      label: "Sigma",
      value: ae === `${prefix}-sigma`
        ? <SigmaEditor prefix={prefix} params={params} />
        : context.sigma.label,
      detail: ae === `${prefix}-sigma` ? "" : (SIGMA_METHOD_CHARTS.has(params.chart_type) ? context.sigma.detail : ""),
    }] : []),
    // Progressive disclosure: Tests and Specs hidden when chart_type is null
    ...(params.chart_type ? [{
      id: `${prefix}-tests`,
      label: "Tests",
      value: ae === `${prefix}-tests`
        ? (
          <span className="chip-tests-inline">
            {NELSON_RULES.map(([id, ruleLabel]) => (
              <label key={id} className="chip-test-toggle" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  onChange={(e) => {
                    const ruleId = id;
                    if (prefix === "_pending") {
                      spcStore.setState((s) => {
                        const current = s.ui.pendingNewChart.nelson_tests || [];
                        const nextRules = e.target.checked ? [...current, ruleId] : current.filter((r) => r !== ruleId);
                        return { ...s, ui: { ...s.ui, pendingNewChart: { ...s.ui.pendingNewChart, nelson_tests: nextRules } } };
                      });
                    } else {
                      spcStore.setState((s) => {
                        const current = s.charts[prefix].params.nelson_tests || [];
                        const nextRules = e.target.checked ? [...current, ruleId] : current.filter((r) => r !== ruleId);
                        return setChartParams(s, prefix, { nelson_tests: nextRules });
                      });
                      reanalyze();
                    }
                  }}
                  data-value={id}
                  defaultChecked={activeTests.includes(id)}
                />
                {id}
              </label>
            ))}
          </span>
        )
        : context.tests.label,
      detail: ae === `${prefix}-tests` ? "" : context.tests.detail,
    }] : []),
    ...(params.chart_type ? [{
      id: `${prefix}-specs`,
      label: "Specs",
      value: ae === `${prefix}-specs`
        ? <SpecEditor prefix={prefix} params={params} />
        : specSummary(params),
      detail: "",
    }] : []),
  ];

  return chips.map((chip) => {
    const isEditing = ae === chip.id;
    const isChart = chip.id.endsWith("-chart");
    const isPlaceholder = isChart && !params.chart_type;
    const specVal = chip.id.endsWith("-specs") ? (typeof chip.value === "string" ? chip.value : "") : "";
    const isSpecsUnset = chip.id.endsWith("-specs") && specVal === "Not set";
    const warnClass = isSpecsUnset ? "chip--warn" : "";
    const placeholderClass = isPlaceholder ? "chip--placeholder" : "";
    const titleAttr = isSpecsUnset
      ? "Set LSL / USL to enable Cpk, Ppk capability analysis"
      : isPlaceholder
        ? "Select a chart type to begin analysis"
        : undefined;
    const ariaLabel = isPlaceholder
      ? "Chart type: not selected. Click to choose."
      : undefined;

    return (
      <button
        key={chip.id}
        className={`recipe-chip ${isEditing ? "chip-editing" : ""} ${warnClass} ${placeholderClass}`}
        onClick={() => handleToggleChip(chip.id, false)}
        type="button"
        title={titleAttr}
        aria-label={ariaLabel}
        disabled={undefined}
      >
        <span className="chip-label">{chip.label}</span>
        <strong>{typeof chip.value === "string" ? chip.value : chip.value}</strong>
        {chip.detail ? <span className="chip-detail">{chip.detail}</span> : null}
      </button>
    );
  });
}

function collapsedSummary(slot) {
  if (!slot) return "\u2014";
  const metric = slot.context.metric?.label || "\u2014";
  const sigma = slot.context.sigma?.label || "";
  const tests = (slot.params.nelson_tests || []).map((id) => `R${id}`).join(",");
  const parts = [metric, sigma, tests].filter(Boolean);
  return parts.join(" \u00b7 ") || "\u2014";
}

function CollapsedChartCard({ state, chartId }) {
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

function ExpandedChartCard({ state, chartId, slot, ae, cols }) {
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

function PendingChartCard({ state }) {
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

function AddChartSection({ state }) {
  if (state.ui.pendingNewChart) {
    return <PendingChartCard state={state} />;
  }

  const handleOpenAddChart = () => {
    const s = spcStore.getState();
    // Check workspace capacity
    const arenaEl = document.querySelector(".chart-arena");
    if (arenaEl) {
      const maxPerRow = Math.floor(arenaEl.clientWidth / 250);
      const maxRows = Math.floor(arenaEl.clientHeight / 180);
      const maxCharts = maxPerRow * maxRows;
      if (collectChartIds(s.chartLayout).length >= maxCharts) {
        spcStore.setState({
          ...s,
          ui: {
            ...s.ui,
            notice: { tone: "warning", title: "Workspace is full", body: "Close a chart to add another." },
          },
        });
        return;
      }
    }
    const focused = getFocused(s);
    spcStore.setState({
      ...s,
      ui: {
        ...s.ui,
        pendingNewChart: {
          ...DEFAULT_PARAMS,
          chart_type: focused.params.chart_type,
          value_column: focused.params.value_column,
          subgroup_column: focused.params.subgroup_column,
          phase_column: focused.params.phase_column,
        },
      },
    });
  };

  return (
    <button className="rail-card rail-card--add" onClick={handleOpenAddChart} type="button">
      <div className="rail-card-header rail-card-header--add">
        <span className="rail-card-dot"></span>
        <span className="rail-card-label">New Chart</span>
        <span className="rail-card-id">+</span>
      </div>
    </button>
  );
}

export default function RecipeRail() {
  const ae = useStore(spcStore, (s) => s.activeChipEditor);
  const focusedChartId = useStore(spcStore, (s) => s.focusedChartId);
  const chartOrder = useStore(spcStore, (s) => s.chartOrder);
  const charts = useStore(spcStore, (s) => s.charts);
  const activeDatasetId = useStore(spcStore, (s) => s.activeDatasetId);
  const datasets = useStore(spcStore, (s) => s.datasets);
  const columnConfig = useStore(spcStore, (s) => s.columnConfig);
  const pendingNewChart = useStore(spcStore, (s) => s.ui.pendingNewChart);

  // --- FLIP animation for card reordering ---
  const railRef = useRef(null);
  const positionsRef = useRef(null);

  // FLIP: capture "before" positions during render (synchronous, before DOM commit).
  // This runs during the render phase, before useLayoutEffect, so it sees the OLD DOM.
  const prevFocusedRef = useRef(focusedChartId);
  const prevOrderRef = useRef(chartOrder);
  if (focusedChartId !== prevFocusedRef.current || chartOrder !== prevOrderRef.current) {
    // focusedChartId or chartOrder changed — snapshot positions from current (old) DOM
    if (railRef.current && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const map = new Map();
      railRef.current.querySelectorAll(".rail-card[data-chart-id]").forEach((el) => {
        map.set(el.dataset.chartId, el.getBoundingClientRect());
      });
      if (map.size > 0) positionsRef.current = map;
    }
    prevFocusedRef.current = focusedChartId;
    prevOrderRef.current = chartOrder;
  }

  // FLIP: after React commits the new card order, animate from old → new positions.
  useLayoutEffect(() => {
    const firstMap = positionsRef.current;
    positionsRef.current = null;
    if (!firstMap || !railRef.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    railRef.current.querySelectorAll(".rail-card[data-chart-id]").forEach((el) => {
      const first = firstMap.get(el.dataset.chartId);
      if (!first) return;
      const last = el.getBoundingClientRect();
      const deltaY = first.top - last.top;
      if (Math.abs(deltaY) < 2) return;
      el.animate(
        [{ transform: `translateY(${deltaY}px)` }, { transform: "translateY(0)" }],
        { duration: 250, easing: "cubic-bezier(0.25, 1, 0.5, 1)", composite: "replace" }
      );
    });
  }, [focusedChartId, chartOrder]);

  const cols = columnConfig.columns || [];
  const activeDs = datasets.find((ds) => ds.id === activeDatasetId);
  const datasetVal = activeDs ? activeDs.name : "No dataset";
  const focusedSlot = charts[focusedChartId];

  // Build a state-like object to pass down (keeps sub-components unchanged)
  const state = { activeChipEditor: ae, focusedChartId, chartOrder, charts, activeDatasetId, datasets, columnConfig, ui: { pendingNewChart } };

  const otherIds = chartOrder.filter((id) => id !== focusedChartId);

  const handleDatasetToggle = () => {
    spcStore.setState((s) => setActiveChipEditor(s, ae === "dataset" ? null : "dataset"));
  };

  const handleSwitchDataset = async (e) => {
    const dsId = e.target.value;
    const s = spcStore.getState();
    spcStore.setState(setLoadingState(s, true));
    try {
      const dsList = await fetchDatasets();
      let next = setDatasets(spcStore.getState(), dsList);
      const saved = restoreLayout();
      if (saved && saved.chartOrder.length > 0) {
        const restoredCharts = {};
        for (const cid of saved.chartOrder) {
          const p = saved.chartParams[cid];
          const mem = saved.cascadeMemory?.[cid] || null;
          // Restore params as-is; setChartParams will reconcile on next param change
          restoredCharts[cid] = createSlot(p ? { params: p, _cascadeMemory: mem } : {});
        }
        next = {
          ...next,
          charts: restoredCharts,
          chartOrder: saved.chartOrder,
          nextChartId: saved.nextChartId || saved.chartOrder.length + 1,
          focusedChartId: saved.focusedChartId || saved.chartOrder[0],
          chartLayout: { rows: saved.rows, colWeights: saved.colWeights, rowWeights: saved.rowWeights },
        };
      }
      spcStore.setState(next);
      await loadDatasetById(dsId);
    } catch (err) {
      spcStore.setState(setError(spcStore.getState(), err.message));
    }
  };

  return (
    <div className="recipe-rail" ref={railRef}>
      {/* Dataset card */}
      <div className="rail-card rail-card--dataset">
        <div className="rail-card-header rail-card-header--dataset">
          <span className="rail-card-dot"></span>
          <span className="rail-card-label">Dataset</span>
        </div>
        <button
          className={`recipe-chip ${ae === "dataset" ? "chip-editing" : ""}`}
          onClick={handleDatasetToggle}
          type="button"
        >
          <strong>
            {ae === "dataset"
              ? (
                <ChipSelect
                  onChange={handleSwitchDataset}
                  options={datasets.map((ds) => [String(ds.id), `${ds.name} (${ds.point_count} pts)`])}
                  current={String(activeDatasetId || "")}
                />
              )
              : datasetVal}
          </strong>
        </button>
      </div>

      <div className="recipe-divider"></div>

      {/* Add chart section */}
      <AddChartSection state={state} />

      {/* Focused chart card (expanded) */}
      {focusedSlot && (
        <ExpandedChartCard state={state} chartId={focusedChartId} slot={focusedSlot} ae={ae} cols={cols} />
      )}

      {/* Collapsed count badge */}
      {otherIds.length > 0 && (
        <div className="rail-collapsed-count">
          {otherIds.length} other chart{otherIds.length > 1 ? "s" : ""}
        </div>
      )}

      {/* Collapsed cards for non-focused charts */}
      {otherIds.map((id) => (
        <CollapsedChartCard key={id} state={state} chartId={id} />
      ))}
    </div>
  );
}

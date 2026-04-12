import { useRef, useLayoutEffect } from "react";
import { useStore } from "zustand";
import { spcStore } from "../../store/spc-store.js";
import { setActiveChipEditor } from "../../core/state/chart.js";
import { createSlot } from "../../core/state/init.js";
import { setLoadingState, setDatasets, setError } from "../../core/state/ui.js";
import { loadDatasetById, saveLayout, restoreLayout, reanalyze } from "../../store/actions.js";
import { fetchDatasets } from "../../data/api.js";
import { ChipSelect } from "./ChipSelect.jsx";
import { CollapsedChartCard, ExpandedChartCard } from "./ChartCards.jsx";
import AddChartSection from "./AddChartSection.jsx";

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

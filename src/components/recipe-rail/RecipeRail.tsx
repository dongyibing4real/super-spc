import { useRef, useLayoutEffect, type RefObject } from "react";
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
import type { SPCState, ChartSlot, ChartParams, CascadeMemory, ColumnConfig } from "../../types/state.ts";
import type { ChangeEvent } from "react";
import type { DatasetSummary } from "../../types/api.ts";

export interface RecipeRailState {
  activeChipEditor: string | null;
  focusedChartId: string;
  chartOrder: string[];
  charts: Record<string, ChartSlot>;
  activeDatasetId: string | null;
  datasets: { id: string; name: string }[];
  columnConfig: ColumnConfig;
  ui: { pendingNewChart: Record<string, unknown> | null };
}

export default function RecipeRail() {
  const ae = useStore(spcStore, (s: SPCState) => s.activeChipEditor);
  const focusedChartId = useStore(spcStore, (s: SPCState) => s.focusedChartId);
  const chartOrder = useStore(spcStore, (s: SPCState) => s.chartOrder);
  const charts = useStore(spcStore, (s: SPCState) => s.charts);
  const activeDatasetId = useStore(spcStore, (s: SPCState) => s.activeDatasetId);
  const datasets = useStore(spcStore, (s: SPCState) => s.datasets);
  const columnConfig = useStore(spcStore, (s: SPCState) => s.columnConfig);
  const pendingNewChart = useStore(spcStore, (s: SPCState) => s.ui.pendingNewChart);

  // --- FLIP animation for card reordering ---
  const railRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<Map<string, DOMRect> | null>(null);

  // FLIP: capture "before" positions during render (synchronous, before DOM commit).
  // This runs during the render phase, before useLayoutEffect, so it sees the OLD DOM.
  const prevFocusedRef = useRef<string>(focusedChartId);
  const prevOrderRef = useRef<string[]>(chartOrder);
  if (focusedChartId !== prevFocusedRef.current || chartOrder !== prevOrderRef.current) {
    // focusedChartId or chartOrder changed — snapshot positions from current (old) DOM
    if (railRef.current && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const map = new Map<string, DOMRect>();
      railRef.current.querySelectorAll<HTMLElement>(".rail-card[data-chart-id]").forEach((el) => {
        map.set(el.dataset.chartId!, el.getBoundingClientRect());
      });
      if (map.size > 0) positionsRef.current = map;
    }
    prevFocusedRef.current = focusedChartId;
    prevOrderRef.current = chartOrder;
  }

  // FLIP: after React commits the new card order, animate from old -> new positions.
  useLayoutEffect(() => {
    const firstMap = positionsRef.current;
    positionsRef.current = null;
    if (!firstMap || !railRef.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    railRef.current.querySelectorAll<HTMLElement>(".rail-card[data-chart-id]").forEach((el) => {
      const first = firstMap.get(el.dataset.chartId!);
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
  const state: RecipeRailState = { activeChipEditor: ae, focusedChartId, chartOrder, charts, activeDatasetId, datasets, columnConfig, ui: { pendingNewChart } };

  const otherIds = chartOrder.filter((id: string) => id !== focusedChartId);

  const handleDatasetToggle = (): void => {
    spcStore.setState((s: SPCState) => setActiveChipEditor(s, ae === "dataset" ? null : "dataset"));
  };

  const handleSwitchDataset = async (e: ChangeEvent<HTMLSelectElement>): Promise<void> => {
    const dsId = e.target.value;
    const s = spcStore.getState();
    spcStore.setState(setLoadingState(s, true));
    try {
      const dsList = await fetchDatasets();
      let next: SPCState = setDatasets(spcStore.getState(), dsList);
      const saved = restoreLayout();
      if (saved && saved.chartOrder.length > 0) {
        const restoredCharts: Record<string, ChartSlot> = {};
        for (const cid of saved.chartOrder) {
          const p = saved.chartParams[cid];
          const mem = saved.cascadeMemory?.[cid] || null;
          // Restore params as-is; setChartParams will reconcile on next param change
          restoredCharts[cid] = createSlot(p ? { params: p, _cascadeMemory: mem } as Partial<ChartSlot> : {});
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
      spcStore.setState(setError(spcStore.getState(), (err as Error).message));
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
                  options={datasets.map((ds) => [String(ds.id), `${ds.name}`] as [string, string])}
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
      {otherIds.map((id: string) => (
        <CollapsedChartCard key={id} state={state} chartId={id} />
      ))}
    </div>
  );
}

import { useEffect } from "react";
import { spcStore } from "../store/spc-store.js";
import { setupDragInteractions } from "../runtime/drag-runtime.js";
import { renderGhostRows } from "../components/ChartArena.jsx";
import { buildChartData } from "../data/chart-data-builder.js";
import { collectChartIds, computeGridPreview, insertChart, setColWeight, setRowWeight } from "../core/state/layout.js";
import { CHART_TYPE_LABELS } from "../constants.js";
import { saveLayout } from "../store/actions.js";

export default function useDragInteractions(rootRef) {
  useEffect(() => {
    if (!rootRef.current) return;
    const root = rootRef.current;

    // Create a minimal chartRuntime stub for drag interactions
    // (drag-runtime only needs destroyChart for pane removal during drag)
    const chartRuntime = { destroyChart() {}, getCharts() { return {}; } };

    const commitLayout = (next) => {
      spcStore.setState(next);
      saveLayout();
    };

    setupDragInteractions({
      root,
      documentRef: document,
      getState: () => spcStore.getState(),
      chartRuntime,
      collectChartIds,
      renderGhostRows,
      computeGridPreview,
      commitLayout,
      saveLayout,
      setColWeight,
      setRowWeight,
      buildChartData,
      insertChart,
      chartTypeLabels: CHART_TYPE_LABELS,
    });

    // Note: setupDragInteractions attaches event listeners internally.
    // No cleanup needed — listeners are on `root` which React manages.
  }, []);
}

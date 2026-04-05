/**
 * useChartData.js -- Memoized chart data selector.
 *
 * Consolidates Chart.jsx's 5 useStore selectors into one hook that
 * only recomputes buildChartData when chart-relevant state changes.
 * Prevents unnecessary D3 rebuilds when unrelated state changes
 * (other chart's params, context menu, notice bar, etc.).
 */
import { useRef } from "react";
import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import { buildChartData } from "../store/chart-data-builder.js";

/**
 * @param {string} chartId
 * @returns {object|null} Chart data for D3, or null if no valid chart
 */
export function useChartData(chartId) {
  const cacheRef = useRef({ key: null, data: null });

  return useStore(spcStore, (s) => {
    const slot = s.charts[chartId];
    if (!slot) return null;

    const key = makeKey(slot, s);
    if (key === cacheRef.current.key) return cacheRef.current.data;

    const data = buildChartData(chartId, s);
    cacheRef.current = { key, data };
    return data;
  });
}

function makeKey(slot, s) {
  // Geometry fields: ref-identity changes on analysis/dataset load
  // Visual fields: value or ref changes on user interaction
  return [
    slot.chartValues,
    slot.limits,
    slot.phases,
    slot.violations,
    slot.forecast,
    slot.overrides,
    s.points,
    s.chartToggles,
    slot.selectedPointIndex,
    slot.selectedPointIndices,
    slot.selectedPhaseIndex,
    s.selectedPointIndex,
    s.selectedPointIndices,
  ].join("|");
}

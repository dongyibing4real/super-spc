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
import { buildChartData } from "../data/chart-data-builder.js";

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
  // Arrays stringify fine with .join() but plain objects become "[object Object]".
  // Flatten object fields to their scalar properties.
  const f = slot.forecast;
  const t = s.chartToggles;
  return [
    // Geometry — ref-identity changes on analysis/dataset load
    slot.chartValues,
    slot.limits,
    slot.phases,
    slot.violations,
    // Forecast — scalar fields so key changes on mode/horizon/result transitions
    f?.mode, f?.selected, f?.horizon, f?.result?.predMean?.length ?? 0,
    // Overrides — scalar fields
    slot.overrides?.x, slot.overrides?.y,
    // Global data ref
    s.points,
    // Toggles — flatten the boolean object
    t?.overlay, t?.specLimits, t?.grid, t?.phaseTags, t?.events, t?.excludedMarkers, t?.confidenceBand,
    // Selection
    slot.selectedPointIndex,
    slot.selectedPointIndices,
    slot.selectedPhaseIndex,
    s.selectedPointIndex,
    s.selectedPointIndices,
  ].join("|");
}

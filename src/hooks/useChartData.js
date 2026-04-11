/**
 * useChartData.js -- Memoized chart data selector.
 *
 * Only recomputes buildChartData when chart-relevant state changes.
 * Uses reference identity for objects/arrays (Zustand produces new refs
 * on mutation) and value comparison for scalars.
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
  const cacheRef = useRef({ deps: null, data: null });

  return useStore(spcStore, (s) => {
    const slot = s.charts[chartId];
    if (!slot) return null;

    const f = slot.forecast;
    const t = s.chartToggles;
    const deps = {
      // Object refs — Zustand replaces these on mutation
      chartValues: slot.chartValues,
      limits: slot.limits,
      phases: slot.phases,
      violations: slot.violations,
      points: s.points,
      overridesX: slot.overrides?.x,
      overridesY: slot.overrides?.y,
      // Forecast — mode + result ref + predicting flag
      forecastMode: f?.mode,
      forecastResult: f?.result,
      forecastPredicting: f?.predicting,
      // Toggles
      overlay: t?.overlay,
      specLimits: t?.specLimits,
      grid: t?.grid,
      phaseTags: t?.phaseTags,
      events: t?.events,
      excludedMarkers: t?.excludedMarkers,
      confidenceBand: t?.confidenceBand,
      // Selection
      selectedPointIndex: slot.selectedPointIndex,
      selectedPointIndices: slot.selectedPointIndices,
      selectedPhaseIndex: slot.selectedPhaseIndex,
      globalSelectedIndex: s.selectedPointIndex,
      globalSelectedIndices: s.selectedPointIndices,
    };

    if (cacheRef.current.deps && shallowEqual(deps, cacheRef.current.deps)) {
      return cacheRef.current.data;
    }

    const data = buildChartData(chartId, s);
    cacheRef.current = { deps, data };
    return data;
  });
}

function shallowEqual(a, b) {
  for (const key in a) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

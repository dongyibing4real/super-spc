/**
 * useChartData.ts -- Memoized chart data selector.
 *
 * Only recomputes buildChartData when chart-relevant state changes.
 * Uses reference identity for objects/arrays (Zustand produces new refs
 * on mutation) and value comparison for scalars.
 */
import { useRef } from "react";
import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import { buildChartData } from "../data/chart-data-builder.js";
import type { SPCState, ChartPoint, ChartLimits, SlotPhase, Violation, ForecastResult, ForecastMode } from "../types/state.ts";

interface ChartDataDeps {
  chartValues: number[];
  limits: ChartLimits;
  phases: SlotPhase[];
  violations: Violation[];
  points: ChartPoint[];
  overridesX: { min: number; max: number } | null | undefined;
  overridesY: { yMin: number; yMax: number } | null | undefined;
  forecastMode: ForecastMode | undefined;
  forecastResult: ForecastResult | null | undefined;
  forecastPredicting: boolean | undefined;
  overlay: boolean | undefined;
  specLimits: boolean | undefined;
  grid: boolean | undefined;
  phaseTags: boolean | undefined;
  events: boolean | undefined;
  excludedMarkers: boolean | undefined;
  confidenceBand: boolean | undefined;
  selectedPointIndex: number | null;
  selectedPointIndices: number[] | null;
  selectedPhaseIndex: number | null;
  globalSelectedIndex: number | null;
  globalSelectedIndices: number[] | null;
}

export function useChartData(chartId: string): ReturnType<typeof buildChartData> | null {
  const cacheRef = useRef<{ deps: ChartDataDeps | null; data: ReturnType<typeof buildChartData> | null }>({ deps: null, data: null });

  return useStore(spcStore, (s: SPCState) => {
    const slot = s.charts[chartId];
    if (!slot) return null;

    const f = slot.forecast;
    const t = s.chartToggles;
    const deps: ChartDataDeps = {
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
      forecastPredicting: (f as unknown as Record<string, unknown>)?.predicting as boolean | undefined,
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

function shallowEqual(a: ChartDataDeps, b: ChartDataDeps): boolean {
  for (const key in a) {
    if (a[key as keyof ChartDataDeps] !== b[key as keyof ChartDataDeps]) return false;
  }
  return true;
}

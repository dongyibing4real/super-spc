/**
 * chart-data-builder.js -- Pure function that assembles chart data for D3 rendering.
 *
 * Extracted from legacy-boot.js to be importable by both legacy code and React Chart.jsx.
 */
import { spcStore } from "./spc-store.js";
import { buildForecastView } from "../prediction/build-forecast-view.js";
import { detectRuleViolations, getCapability } from "../helpers.js";

function getChartPoints(slot, globalPoints) {
  const hasChartValues = slot.chartValues && slot.chartValues.length > 0;
  return hasChartValues
    ? slot.chartValues.map((v, i) => ({
        primaryValue: v,
        label: slot.chartLabels[i] || `pt-${i}`,
        subgroupLabel: slot.chartLabels[i] || `pt-${i}`,
        excluded: false,
        annotation: null,
        raw: {},
      }))
    : globalPoints;
}

/**
 * Build the full data payload a D3 chart needs to render.
 * @param {string} id — chart slot ID (e.g. "chart-1")
 * @returns {object} — { points, limits, phases, forecast, toggles, selectedIndex, ... }
 */
export function buildChartData(id) {
  const state = spcStore.getState();
  const slot = state.charts[id];
  if (!slot) return null;

  const points = getChartPoints(slot, state.points);
  const hasChartValues = slot.chartValues && slot.chartValues.length > 0;
  const lastIdx = Math.max(0, points.length - 1);
  const xDefaultDomain = { min: 0, max: lastIdx };

  const forecast = buildForecastView({
    points,
    limits: slot.limits,
    forecast: slot.forecast,
    xDomainOverride: slot.overrides.x,
    xDefaultDomain,
    chartTypeId: slot.context.chartType?.id,
  });

  return {
    points,
    limits: slot.limits,
    phases: slot.phases || [],
    forecast,
    toggles: {
      ...state.chartToggles,
      overlay: false,
      xDomainOverride: slot.overrides.x,
      xDefaultDomain,
      yDomainOverride: slot.overrides.y,
    },
    selectedIndex: hasChartValues ? (slot.selectedPointIndex ?? -1) : state.selectedPointIndex,
    selectedIndices: hasChartValues ? (slot.selectedPointIndices || null) : (state.selectedPointIndices || null),
    selectedPhaseIndex: slot.selectedPhaseIndex ?? null,
    violations: detectRuleViolations(state, id),
    capability: getCapability(state, id),
    metric: slot.context.metric,
    subgroup: slot.context.subgroup,
    phase: slot.context.phase,
    chartType: slot.context.chartType,
    seriesKey: "primaryValue",
    seriesType: id,
  };
}

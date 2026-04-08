/**
 * chart-data-builder.js -- Pure function that assembles chart data for D3 rendering.
 *
 * Extracted from legacy-boot.js to be importable by both legacy code and React Chart.jsx.
 */
import { buildForecastView } from "../prediction/build-forecast-view.js";
import { detectRuleViolations, getCapability } from "../core/state/selectors.js";
import { setXDomainOverride, setForecastHorizon } from "../core/state/chart.js";
import { DEFAULT_FORECAST_HORIZON } from "../prediction/constants.js";

export function getChartPoints(slot, globalPoints) {
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

export function ensureForecastVisible(nextState, id) {
  const slot = nextState.charts[id];
  if (!slot) return nextState;
  const points = getChartPoints(slot, nextState.points);
  const lastIdx = Math.max(0, points.length - 1);
  const horizon = slot.forecast?.horizon ?? DEFAULT_FORECAST_HORIZON;
  const requiredMax = lastIdx + horizon;
  const currentOverride = slot.overrides?.x;
  if (!currentOverride || currentOverride.max >= requiredMax) {
    return nextState;
  }
  return setXDomainOverride(nextState, currentOverride.min, requiredMax, id);
}

export function extendForecastToViewport(nextState, id, nextXMax) {
  const slot = nextState.charts[id];
  if (!slot || slot.forecast?.mode !== "active") return nextState;
  const points = getChartPoints(slot, nextState.points);
  const lastIdx = Math.max(0, points.length - 1);
  const requiredHorizon = Math.max(1, Math.ceil(Math.max(0, nextXMax - lastIdx)));
  const currentHorizon = slot.forecast?.horizon ?? DEFAULT_FORECAST_HORIZON;
  if (requiredHorizon <= currentHorizon) return nextState;
  return setForecastHorizon(nextState, requiredHorizon, id);
}

/**
 * Build the full data payload a D3 chart needs to render.
 * @param {string} id — chart slot ID (e.g. "chart-1")
 * @param {object} state — full app state (required)
 * @returns {object} — { points, limits, phases, forecast, toggles, selectedIndex, ... }
 */
export function buildChartData(id, state) {
  const slot = state.charts[id];
  if (!slot) return null;

  // No chart type selected: render empty canvas
  if (!slot.params?.chart_type) {
    return null;
  }

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

export function createChartRuntimeManager({
  root,
  createChart,
  collectChartIds,
  clearForecastPromptTimer,
  forecastPromptEligibility,
  buildChartData,
  onSelectPoint,
  onSelectPhase,
  onContextMenu,
  onAxisDrag,
  onForecastDrag,
  onForecastActivity,
  onForecastPromptEligibilityChange,
  onActivateForecast,
  onSelectForecast,
  onCancelForecast,
  onAxisReset,
}) {
  const charts = {};

  function ensureChart(id, mount) {
    const svgStale = charts[id] && !charts[id].svg?.node()?.isConnected;
    if (!charts[id] || svgStale) {
      if (charts[id]) {
        charts[id].destroy();
        charts[id] = null;
      }
      charts[id] = createChart(mount, {
        onSelectPoint: (index) => onSelectPoint(id, index),
        onSelectPhase: (phaseIndex) => onSelectPhase(id, phaseIndex),
        onContextMenu: (x, y, info) => onContextMenu(id, x, y, info),
        onAxisDrag: (info) => onAxisDrag(id, info),
        onForecastDrag: (info) => onForecastDrag(id, info),
        onForecastActivity: () => onForecastActivity(id),
        onForecastPromptEligibilityChange: (payload) => onForecastPromptEligibilityChange(id, payload),
        onActivateForecast: () => onActivateForecast(id),
        onSelectForecast: (selected) => onSelectForecast(id, selected),
        onCancelForecast: () => onCancelForecast(id),
        onAxisReset: (axis) => onAxisReset(id, axis),
      });
    }
    return charts[id];
  }

  function syncWorkspace(state) {
    const visibleIds = collectChartIds(state.chartLayout);

    for (const id of visibleIds) {
      const mount = document.getElementById(`chart-mount-${id}`);
      if (!mount) continue;
      const chart = ensureChart(id, mount);
      chart.update(buildChartData(id));
    }

    requestAnimationFrame(() => {
      for (const id of visibleIds) {
        if (charts[id]) charts[id].update(buildChartData(id));
      }
    });

    for (const id of Object.keys(charts)) {
      if (!visibleIds.includes(id) && charts[id]) {
        clearForecastPromptTimer(id);
        forecastPromptEligibility.delete(id);
        charts[id].destroy();
        charts[id] = null;
      }
    }
  }

  function updateVisibleCharts(state) {
    for (const id of state.chartOrder) {
      if (charts[id]) charts[id].update(buildChartData(id));
    }
  }

  function destroyInactive(state) {
    for (const id of state.chartOrder) {
      clearForecastPromptTimer(id);
      forecastPromptEligibility.delete(id);
      if (charts[id]) {
        charts[id].destroy();
        charts[id] = null;
      }
    }
  }

  function destroyChart(id) {
    if (charts[id]) {
      charts[id].destroy();
      delete charts[id];
    }
  }

  function getCharts() {
    return charts;
  }

  return {
    syncWorkspace,
    updateVisibleCharts,
    destroyInactive,
    destroyChart,
    getCharts,
  };
}

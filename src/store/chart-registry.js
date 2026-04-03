/**
 * chart-registry.js -- Shared registry for the chart runtime manager.
 *
 * Legacy-boot sets the runtime after creating it. Chart.jsx reads it
 * to create/update/destroy D3 chart instances.
 */

let _chartRuntime = null;

export function setChartRuntime(runtime) {
  _chartRuntime = runtime;
}

export function getChartRuntime() {
  return _chartRuntime;
}

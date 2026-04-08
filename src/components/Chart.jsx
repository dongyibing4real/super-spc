import { useRef, useEffect } from "react";
import { useChartData } from "../hooks/useChartData.js";
import { createChart } from "./chart/index.js";
import { buildChartCallbacks, cleanupChartCallbacks } from "./chart-callbacks.js";

/**
 * React wrapper around the D3 createChart factory.
 * React manages the mount lifecycle; D3 owns the SVG content.
 */
export default function Chart({ chartId, onContextMenu: onContextMenuProp }) {
  const mountRef = useRef(null);
  const chartRef = useRef(null);

  // Single memoized selector — only recomputes when chart-relevant state changes
  const data = useChartData(chartId);

  // Create D3 chart on mount, destroy on unmount
  useEffect(() => {
    if (!mountRef.current) return;

    chartRef.current = createChart(mountRef.current, buildChartCallbacks(chartId));

    return () => {
      cleanupChartCallbacks(chartId);
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [chartId]); // Only re-create if chartId changes

  // Update D3 chart when data changes.
  // Defer to rAF so flex layout has settled and syncSize reads correct dimensions.
  // `data` is memoized by useChartData — only changes when chart-relevant state changes.
  useEffect(() => {
    if (!chartRef.current || !data) return;
    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled || !chartRef.current) return;
      requestAnimationFrame(() => {
        if (cancelled || !chartRef.current) return;
        chartRef.current.update(data);
      });
    });
    return () => { cancelled = true; };
  }, [data]);

  return (
    <div
      ref={mountRef}
      className="chart-stage"
      id={`chart-mount-${chartId}`}
      tabIndex={0}
      data-chart-focus="true"
      aria-label={`${chartId} control chart`}
      onContextMenu={onContextMenuProp}
    />
  );
}

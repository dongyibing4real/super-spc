import { spcStore } from "../../store/spc-store.js";
import { getFocused } from "../../core/state/selectors.js";
import { collectChartIds } from "../../core/state/layout.js";
import { DEFAULT_PARAMS } from "../../core/state/init.js";
import { PendingChartCard } from "./ChartCards.jsx";

export default function AddChartSection({ state }) {
  if (state.ui.pendingNewChart) {
    return <PendingChartCard state={state} />;
  }

  const handleOpenAddChart = () => {
    const s = spcStore.getState();
    // Check workspace capacity
    const arenaEl = document.querySelector(".chart-arena");
    if (arenaEl) {
      const maxPerRow = Math.floor(arenaEl.clientWidth / 250);
      const maxRows = Math.floor(arenaEl.clientHeight / 180);
      const maxCharts = maxPerRow * maxRows;
      if (collectChartIds(s.chartLayout).length >= maxCharts) {
        spcStore.setState({
          ...s,
          ui: {
            ...s.ui,
            notice: { tone: "warning", title: "Workspace is full", body: "Close a chart to add another." },
          },
        });
        return;
      }
    }
    const focused = getFocused(s);
    spcStore.setState({
      ...s,
      ui: {
        ...s.ui,
        pendingNewChart: {
          ...DEFAULT_PARAMS,
          chart_type: focused.params.chart_type,
          value_column: focused.params.value_column,
          subgroup_column: focused.params.subgroup_column,
          phase_column: focused.params.phase_column,
        },
      },
    });
  };

  return (
    <button className="rail-card rail-card--add" onClick={handleOpenAddChart} type="button">
      <div className="rail-card-header rail-card-header--add">
        <span className="rail-card-dot"></span>
        <span className="rail-card-label">New Chart</span>
        <span className="rail-card-id">+</span>
      </div>
    </button>
  );
}

export function updateChartPaneSurface(root, state, { getCapability, capClass }) {
  for (const id of state.chartOrder) {
    const paneMethod = root.querySelector(`.chart-pane[data-chart-id="${id}"] .pane-method`);
    if (paneMethod) paneMethod.textContent = state.charts[id].context.chartType?.label || "";

    const titlebar = root.querySelector(`.chart-pane[data-chart-id="${id}"] .chart-pane-titlebar`);
    if (!titlebar) continue;

    const existing = titlebar.querySelector(".pane-caps");
    const cap = getCapability(state, id);

    if (cap.cpk) {
      const html = `<span class="cap-item"><span class="cap-label">Cpk</span><span class="cap-value ${capClass(cap.cpk)}">${cap.cpk}</span></span>
        <span class="cap-item"><span class="cap-label">Ppk</span><span class="cap-value ${capClass(cap.ppk)}">${cap.ppk}</span></span>`;
      if (existing) {
        existing.innerHTML = html;
      } else {
        const div = document.createElement("div");
        div.className = "pane-caps";
        div.innerHTML = html;
        titlebar.querySelector(".pane-actions")?.before(div);
      }
    } else if (existing) {
      existing.remove();
    }
  }

  root.querySelectorAll(".chart-pane").forEach((pane) => {
    pane.classList.toggle("pane-focused", pane.dataset.chartId === state.focusedChartId);
  });
}

export function setupChartSubscribers(store, root, { chartRuntime, getCapability, capClass }) {
  store.subscribe((nextState, prevState) => {
    if (nextState.route !== "workspace") return;

    if (
      nextState.charts !== prevState.charts ||
      nextState.chartOrder !== prevState.chartOrder ||
      nextState.chartToggles !== prevState.chartToggles ||
      nextState.selectedPointIndex !== prevState.selectedPointIndex ||
      nextState.points !== prevState.points
    ) {
      chartRuntime.updateVisibleCharts(nextState);
    }

    if (
      nextState.charts !== prevState.charts ||
      nextState.chartOrder !== prevState.chartOrder ||
      nextState.focusedChartId !== prevState.focusedChartId
    ) {
      updateChartPaneSurface(root, nextState, { getCapability, capClass });
    }
  });
}

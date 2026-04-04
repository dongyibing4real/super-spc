export function getDropZone(paneEl, clientX, clientY, prevZone) {
  const rect = paneEl.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;

  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;
  let zone;
  if (relY < 0.25) zone = "top";
  else if (relY > 0.75) zone = "bottom";
  else if (relX < 0.25) zone = "left";
  else if (relX > 0.75) zone = "right";
  else zone = "center";

  if (prevZone && prevZone !== zone) {
    const hysteresis = 15;
    const topBoundary = rect.top + rect.height * 0.25;
    const bottomBoundary = rect.bottom - rect.height * 0.25;
    const leftBoundary = rect.left + rect.width * 0.25;
    const rightBoundary = rect.right - rect.width * 0.25;
    const nearBoundary =
      Math.abs(clientY - topBoundary) < hysteresis ||
      Math.abs(clientY - bottomBoundary) < hysteresis ||
      Math.abs(clientX - leftBoundary) < hysteresis ||
      Math.abs(clientX - rightBoundary) < hysteresis;
    if (nearBoundary) return prevZone;
  }

  return zone;
}

export function setupDragInteractions({
  root,
  documentRef,
  getState,
  chartRuntime,
  collectChartIds,
  renderGhostRows,
  computeGridPreview,
  commitLayout,
  saveLayout,
  setColWeight,
  setRowWeight,
  buildChartData,
  insertChart,
  chartTypeLabels,
}) {
  let pendingDrag = null;
  let dragState = null;
  let ghostOverlay = null;
  let ghostRafId = null;
  let dividerDrag = null;

  function updateGhostOverlay(ghostRows, incomingId) {
    if (!ghostOverlay || !ghostRows) return;
    if (ghostRafId) cancelAnimationFrame(ghostRafId);
    ghostRafId = requestAnimationFrame(() => {
      ghostOverlay.innerHTML = renderGhostRows(ghostRows, incomingId);
      ghostOverlay.style.display = "flex";
      ghostRafId = null;
    });
  }

  function removeGhostOverlay() {
    if (ghostRafId) {
      cancelAnimationFrame(ghostRafId);
      ghostRafId = null;
    }
    if (ghostOverlay) {
      const el = ghostOverlay;
      ghostOverlay = null;
      // Soft fade-out before removal
      el.style.transition = 'opacity 150ms cubic-bezier(0.25, 1, 0.5, 1)';
      el.style.opacity = '0';
      el.addEventListener('transitionend', () => el.remove(), { once: true });
      // Safety timeout in case transitionend doesn't fire
      setTimeout(() => { if (el.parentNode) el.remove(); }, 200);
    }
  }

  function endDrag() {
    pendingDrag = null;
    if (!dragState) return;

    const state = getState();
    const { pane, ghost, chartId, dropTarget, dropZone } = dragState;
    pane.classList.remove("dragging");
    // Soft fade-out for the floating drag label
    ghost.style.transition = 'opacity 120ms ease, transform 120ms ease';
    ghost.style.opacity = '0';
    ghost.style.transform = 'scale(0.9)';
    setTimeout(() => ghost.remove(), 150);
    removeGhostOverlay();
    documentRef.body.style.userSelect = "";

    if (dropTarget && dropZone && dropTarget !== chartId) {
      commitLayout(insertChart(state, chartId, dropTarget, dropZone));
      saveLayout();
    }
    dragState = null;
  }

  function endDividerDrag() {
    if (!dividerDrag) return;

    const state = getState();
    root.querySelectorAll(".grid-divider-active").forEach((el) => el.classList.remove("grid-divider-active"));
    if (dividerDrag.pendingRatio !== undefined) {
      let next = state;
      if (dividerDrag.type === "col") next = setColWeight(state, dividerDrag.row, dividerDrag.col, dividerDrag.pendingRatio);
      else next = setRowWeight(state, dividerDrag.row, dividerDrag.pendingRatio);

      commitLayout(next);
      saveLayout();

      const visibleIds = collectChartIds(next.chartLayout);
      requestAnimationFrame(() => {
        for (const id of visibleIds) {
          const chart = chartRuntime.getCharts()[id];
          if (chart) chart.update(buildChartData(id));
        }
      });
    }
    dividerDrag = null;
  }

  root.addEventListener("pointerdown", (e) => {
    const divider = e.target.closest(".grid-divider");
    if (divider) {
      e.preventDefault();
      e.stopPropagation();
      divider.setPointerCapture(e.pointerId);
      divider.classList.add("grid-divider-active");

      const arenaRect = root.querySelector(".chart-arena").getBoundingClientRect();
      if (divider.classList.contains("grid-divider-col")) {
        dividerDrag = { type: "col", row: +divider.dataset.row, col: +divider.dataset.col, arenaRect };
      } else {
        dividerDrag = { type: "row", row: +divider.dataset.row, arenaRect };
      }
      return;
    }

    const handle = e.target.closest("[data-drag-handle]");
    const state = getState();
    if (!handle || state.chartOrder.length < 2) return;
    const pane = handle.closest(".chart-pane");
    if (!pane || e.target.closest("button")) return;

    e.preventDefault();
    pendingDrag = {
      chartId: handle.dataset.dragHandle,
      pane,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
    };
  });

  root.addEventListener("pointermove", (e) => {
    const state = getState();

    if (dividerDrag) {
      if (dividerDrag.type === "col") {
        const rowEl = root.querySelectorAll(".chart-row")[dividerDrag.row];
        if (!rowEl) return;
        const wraps = rowEl.querySelectorAll(":scope > .chart-pane-wrap");
        const leftWrap = wraps[dividerDrag.col];
        const rightWrap = wraps[dividerDrag.col + 1];
        if (leftWrap && rightWrap) {
          const totalPct = parseFloat(leftWrap.style.flex.split(" ")[2]) + parseFloat(rightWrap.style.flex.split(" ")[2]);
          const paneLeftEdge = leftWrap.getBoundingClientRect().left;
          const combinedWidth = leftWrap.getBoundingClientRect().width + rightWrap.getBoundingClientRect().width;
          const localRatio = Math.max(0.1, Math.min(0.9, (e.clientX - paneLeftEdge) / combinedWidth));
          leftWrap.style.flex = `0 0 ${(totalPct * localRatio).toFixed(2)}%`;
          rightWrap.style.flex = `0 0 ${(totalPct * (1 - localRatio)).toFixed(2)}%`;
          dividerDrag.pendingRatio = localRatio;
        }
      } else {
        const rowEls = root.querySelectorAll(".chart-row");
        const topEl = rowEls[dividerDrag.row];
        const bottomEl = rowEls[dividerDrag.row + 1];
        if (topEl && bottomEl) {
          const topEdge = topEl.getBoundingClientRect().top;
          const combinedHeight = topEl.getBoundingClientRect().height + bottomEl.getBoundingClientRect().height;
          const localRatio = Math.max(0.1, Math.min(0.9, (e.clientY - topEdge) / combinedHeight));
          const totalPct = parseFloat(topEl.style.flex.split(" ")[2]) + parseFloat(bottomEl.style.flex.split(" ")[2]);
          topEl.style.flex = `0 0 ${(totalPct * localRatio).toFixed(2)}%`;
          bottomEl.style.flex = `0 0 ${(totalPct * (1 - localRatio)).toFixed(2)}%`;
          dividerDrag.pendingRatio = localRatio;
        }
      }
      return;
    }

    if (pendingDrag && !dragState) {
      const dx = e.clientX - pendingDrag.startX;
      const dy = e.clientY - pendingDrag.startY;
      if (Math.sqrt(dx * dx + dy * dy) < 4) return;

      const { chartId, pane, pointerId } = pendingDrag;
      pendingDrag = null;
      pane.setPointerCapture(pointerId);
      documentRef.body.style.userSelect = "none";

      const ghost = documentRef.createElement("div");
      ghost.className = "drag-ghost";
      ghost.textContent = (state.charts[chartId]?.params?.chart_type && chartTypeLabels[state.charts[chartId].params.chart_type]) || "Chart";
      documentRef.body.appendChild(ghost);
      pane.classList.add("dragging");

      const arenaEl = root.querySelector(".chart-arena");
      if (arenaEl) {
        ghostOverlay = documentRef.createElement("div");
        ghostOverlay.className = "arena-ghost-overlay";
        ghostOverlay.style.display = "none";
        arenaEl.appendChild(ghostOverlay);
      }

      dragState = { chartId, pane, ghost, dropTarget: null, dropZone: null };
      updateGhostOverlay(state.chartLayout, chartId);
    }

    if (!dragState) return;

    const { ghost, chartId } = dragState;
    ghost.style.left = `${e.clientX + 12}px`;
    ghost.style.top = `${e.clientY - 10}px`;

    let foundTarget = null;
    let foundZone = null;
    for (const pane of root.querySelectorAll(".chart-pane:not(.dragging)")) {
      const zone = getDropZone(pane, e.clientX, e.clientY, dragState.dropZone);
      if (zone) {
        foundTarget = pane.dataset.chartId;
        foundZone = zone;
        break;
      }
    }

    // Only re-render ghost when drop target or zone actually changes
    const targetChanged = foundTarget !== dragState.dropTarget || foundZone !== dragState.dropZone;
    dragState.dropTarget = foundTarget;
    dragState.dropZone = foundZone;

    if (targetChanged) {
      if (foundTarget && foundZone) {
        const previewLayout = computeGridPreview(state.chartLayout, chartId, foundTarget, foundZone);
        updateGhostOverlay(previewLayout, chartId);
      } else {
        updateGhostOverlay(state.chartLayout, chartId);
      }
    }
  });

  documentRef.addEventListener("pointerup", () => {
    endDividerDrag();
    endDrag();
  });

  documentRef.addEventListener("pointercancel", () => {
    endDividerDrag();
    endDrag();
  });

  root.addEventListener("dblclick", (e) => {
    const divider = e.target.closest(".grid-divider");
    if (!divider) return;
    const state = getState();
    if (divider.classList.contains("grid-divider-col")) {
      commitLayout(setColWeight(state, +divider.dataset.row, +divider.dataset.col, 0.5));
    } else {
      commitLayout(setRowWeight(state, +divider.dataset.row, 0.5));
    }
    saveLayout();
  });
}

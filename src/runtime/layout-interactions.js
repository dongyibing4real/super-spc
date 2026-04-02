export function getDropZone(paneEl, clientX, clientY, prevZone) {
  const rect = paneEl.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return null;
  }

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

export function createLayoutInteractionRuntime(ctx) {
  const {
    root,
    documentRef,
    requestAnimationFrameRef,
    cancelAnimationFrameRef,
    getState,
    chartTypeLabels,
    renderGhostRows,
    computeGridPreview,
    commitLayout,
    insertChart,
    saveLayout,
    setColWeight,
    setRowWeight,
    collectChartIds,
    chartRuntime,
    buildChartData,
    openContextMenu,
    commitContextMenu,
    focusChart,
  } = ctx;

  let pendingDrag = null;
  let dragState = null;
  let ghostOverlay = null;
  let ghostRafId = null;
  let dividerDrag = null;
  let paneMenu = null;

  function updateGhostOverlay(ghostRows, incomingId) {
    if (!ghostOverlay || !ghostRows) return;
    if (ghostRafId) cancelAnimationFrameRef(ghostRafId);
    ghostRafId = requestAnimationFrameRef(() => {
      ghostOverlay.innerHTML = renderGhostRows(ghostRows, incomingId);
      ghostOverlay.style.display = "flex";
      ghostRafId = null;
    });
  }

  function removeGhostOverlay() {
    if (ghostRafId) {
      cancelAnimationFrameRef(ghostRafId);
      ghostRafId = null;
    }
    if (ghostOverlay) {
      ghostOverlay.remove();
      ghostOverlay = null;
    }
  }

  function endDrag() {
    pendingDrag = null;
    if (!dragState) return;
    const { pane, ghost, chartId, dropTarget, dropZone } = dragState;
    pane.classList.remove("dragging");
    ghost.remove();
    removeGhostOverlay();
    documentRef.body.style.userSelect = "";

    if (dropTarget && dropZone && dropTarget !== chartId) {
      commitLayout(insertChart(getState(), chartId, dropTarget, dropZone));
      saveLayout();
    }
    dragState = null;
  }

  function endDividerDrag() {
    if (!dividerDrag) return;
    root.querySelectorAll(".grid-divider-active").forEach((el) => el.classList.remove("grid-divider-active"));
    if (dividerDrag.pendingRatio !== undefined) {
      let next = getState();
      if (dividerDrag.type === "col") {
        next = setColWeight(next, dividerDrag.row, dividerDrag.col, dividerDrag.pendingRatio);
      } else {
        next = setRowWeight(next, dividerDrag.row, dividerDrag.pendingRatio);
      }
      commitLayout(next);
      saveLayout();
      const visibleIds = collectChartIds(getState().chartLayout);
      requestAnimationFrameRef(() => {
        for (const id of visibleIds) {
          if (chartRuntime.getCharts()[id]) chartRuntime.getCharts()[id].update(buildChartData(id));
        }
      });
    }
    dividerDrag = null;
  }

  function closePaneMenu() {
    if (paneMenu) {
      paneMenu.remove();
      paneMenu = null;
    }
  }

  function showPaneContextMenu(x, y, chartId) {
    closePaneMenu();
    const isOnly = collectChartIds(getState().chartLayout).length <= 1;
    const menu = documentRef.createElement("div");
    menu.className = "pane-context-menu";
    menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:9999`;
    menu.innerHTML = `
      <button data-action="remove-chart" data-chart-id="${chartId}" ${isOnly ? "disabled" : ""}>Close Pane</button>
    `;
    documentRef.body.appendChild(menu);
    paneMenu = menu;
  }

  return {
    handlePointerDown(event) {
      const divider = event.target.closest(".grid-divider");
      if (divider) {
        event.preventDefault();
        event.stopPropagation();
        divider.setPointerCapture(event.pointerId);
        divider.classList.add("grid-divider-active");
        const arenaRect = root.querySelector(".chart-arena").getBoundingClientRect();
        if (divider.classList.contains("grid-divider-col")) {
          dividerDrag = { type: "col", row: +divider.dataset.row, col: +divider.dataset.col, arenaRect };
        } else {
          dividerDrag = { type: "row", row: +divider.dataset.row, arenaRect };
        }
        return;
      }

      const handle = event.target.closest("[data-drag-handle]");
      if (!handle) return;
      if (getState().chartOrder.length < 2) return;
      const pane = handle.closest(".chart-pane");
      if (!pane) return;
      if (event.target.closest("button")) return;

      event.preventDefault();
      pendingDrag = {
        chartId: handle.dataset.dragHandle,
        pane,
        startX: event.clientX,
        startY: event.clientY,
        pointerId: event.pointerId,
      };
    },

    handlePointerMove(event) {
      if (dividerDrag) {
        if (dividerDrag.type === "col") {
          const rowEl = root.querySelectorAll(".chart-row")[dividerDrag.row];
          if (!rowEl) return;
          const wraps = rowEl.querySelectorAll(":scope > .chart-pane-wrap");
          const leftW = wraps[dividerDrag.col];
          const rightW = wraps[dividerDrag.col + 1];
          if (leftW && rightW) {
            const totalPct = parseFloat(leftW.style.flex.split(" ")[2]) + parseFloat(rightW.style.flex.split(" ")[2]);
            const paneLeftEdge = leftW.getBoundingClientRect().left;
            const combinedWidth = leftW.getBoundingClientRect().width + rightW.getBoundingClientRect().width;
            const localRatio = Math.max(0.1, Math.min(0.9, (event.clientX - paneLeftEdge) / combinedWidth));
            leftW.style.flex = `0 0 ${(totalPct * localRatio).toFixed(2)}%`;
            rightW.style.flex = `0 0 ${(totalPct * (1 - localRatio)).toFixed(2)}%`;
            dividerDrag.pendingRatio = localRatio;
          }
        } else {
          const rowEls = root.querySelectorAll(".chart-row");
          const topEl = rowEls[dividerDrag.row];
          const botEl = rowEls[dividerDrag.row + 1];
          if (topEl && botEl) {
            const topEdge = topEl.getBoundingClientRect().top;
            const combinedHeight = topEl.getBoundingClientRect().height + botEl.getBoundingClientRect().height;
            const localRatio = Math.max(0.1, Math.min(0.9, (event.clientY - topEdge) / combinedHeight));
            const totalPct = parseFloat(topEl.style.flex.split(" ")[2]) + parseFloat(botEl.style.flex.split(" ")[2]);
            topEl.style.flex = `0 0 ${(totalPct * localRatio).toFixed(2)}%`;
            botEl.style.flex = `0 0 ${(totalPct * (1 - localRatio)).toFixed(2)}%`;
            dividerDrag.pendingRatio = localRatio;
          }
        }
        return;
      }

      if (pendingDrag && !dragState) {
        const dx = event.clientX - pendingDrag.startX;
        const dy = event.clientY - pendingDrag.startY;
        if (Math.sqrt(dx * dx + dy * dy) < 4) return;

        const { chartId, pane, pointerId } = pendingDrag;
        pendingDrag = null;

        pane.setPointerCapture(pointerId);
        documentRef.body.style.userSelect = "none";

        const ghost = documentRef.createElement("div");
        ghost.className = "drag-ghost";
        ghost.textContent = chartTypeLabels[getState().charts[chartId]?.params?.chart_type] || "Chart";
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
        updateGhostOverlay(getState().chartLayout, chartId);
      }

      if (!dragState) return;
      const { ghost, chartId } = dragState;
      ghost.style.left = `${event.clientX + 12}px`;
      ghost.style.top = `${event.clientY - 10}px`;

      let foundTarget = null;
      let foundZone = null;
      for (const pane of root.querySelectorAll(".chart-pane:not(.dragging)")) {
        const zone = getDropZone(pane, event.clientX, event.clientY, dragState.dropZone);
        if (zone) {
          foundTarget = pane.dataset.chartId;
          foundZone = zone;
          break;
        }
      }

      dragState.dropTarget = foundTarget;
      dragState.dropZone = foundZone;

      if (foundTarget && foundZone) {
        const previewLayout = computeGridPreview(getState().chartLayout, chartId, foundTarget, foundZone);
        updateGhostOverlay(previewLayout, chartId);
      } else {
        updateGhostOverlay(getState().chartLayout, chartId);
      }
    },

    handlePointerUp() {
      endDividerDrag();
      endDrag();
    },

    handlePointerCancel() {
      endDividerDrag();
      endDrag();
    },

    handleDoubleClick(event) {
      const divider = event.target.closest(".grid-divider");
      if (!divider) return;
      if (divider.classList.contains("grid-divider-col")) {
        commitLayout(setColWeight(getState(), +divider.dataset.row, +divider.dataset.col, 0.5));
      } else {
        commitLayout(setRowWeight(getState(), +divider.dataset.row, 0.5));
      }
      saveLayout();
    },

    handleDocumentPointerDownCapture(event) {
      if (paneMenu && !paneMenu.contains(event.target)) closePaneMenu();
    },

    handleContextMenu(event) {
      const titlebar = event.target.closest(".chart-pane-titlebar");
      if (titlebar) {
        event.preventDefault();
        const pane = titlebar.closest(".chart-pane[data-chart-id]");
        if (pane?.dataset.chartId) showPaneContextMenu(event.clientX, event.clientY, pane.dataset.chartId);
        return;
      }

      if (event.defaultPrevented) return;
      const chartStage = event.target.closest(".chart-stage");
      if (!chartStage) return;
      event.preventDefault();
      const state = getState();
      const pane = chartStage.closest(".chart-pane[data-chart-id]");
      const next = pane && pane.dataset.chartId !== state.focusedChartId
        ? focusChart(state, pane.dataset.chartId)
        : state;
      const rootRect = root.getBoundingClientRect();
      commitContextMenu(
        openContextMenu(next, event.clientX - rootRect.left, event.clientY - rootRect.top, {
          target: "canvas",
          role: next.focusedChartId,
        })
      );
    },
  };
}

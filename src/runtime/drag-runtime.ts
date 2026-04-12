import type { SPCState, ChartLayout } from "../types/state.ts";

type DropZone = "top" | "bottom" | "left" | "right" | "center";

export function getDropZone(paneEl: HTMLElement, clientX: number, clientY: number, prevZone: DropZone | null): DropZone | null {
  const rect = paneEl.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;

  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;
  let zone: DropZone;
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

interface ChartRuntime {
  destroyChart(): void;
  getCharts(): Record<string, { update(data: unknown): void }>;
}

interface DragInteractionsDeps {
  root: HTMLElement;
  documentRef: Document;
  getState: () => SPCState;
  chartRuntime: ChartRuntime;
  collectChartIds: (layout: ChartLayout) => string[];
  renderGhostRows: (layout: ChartLayout, incomingId: string) => string;
  computeGridPreview: (layout: ChartLayout, draggingId: string, targetId: string, zone: DropZone) => ChartLayout;
  commitLayout: (next: SPCState) => void;
  saveLayout: () => void;
  setColWeight: (state: SPCState, rowIndex: number, leftCol: number, ratio: number) => SPCState;
  setRowWeight: (state: SPCState, topRow: number, ratio: number) => SPCState;
  buildChartData: (chartId: string, state: SPCState) => unknown;
  insertChart: (state: SPCState, chartId: string, targetId: string, zone: DropZone) => SPCState;
  chartTypeLabels: Record<string, string>;
}

interface PendingDrag {
  chartId: string;
  pane: HTMLElement;
  startX: number;
  startY: number;
  pointerId: number;
}

interface DragState {
  chartId: string;
  pane: HTMLElement;
  ghost: HTMLDivElement;
  dropTarget: string | null;
  dropZone: DropZone | null;
}

interface DividerDrag {
  type: "col" | "row";
  row: number;
  col?: number;
  arenaRect: DOMRect;
  pendingRatio?: number;
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
}: DragInteractionsDeps): void {
  let pendingDrag: PendingDrag | null = null;
  let dragState: DragState | null = null;
  let ghostOverlay: HTMLDivElement | null = null;
  let ghostRafId: number | null = null;
  let dividerDrag: DividerDrag | null = null;

  function updateGhostOverlay(ghostRows: ChartLayout, incomingId: string): void {
    if (!ghostOverlay || !ghostRows) return;
    if (ghostRafId) cancelAnimationFrame(ghostRafId);
    ghostRafId = requestAnimationFrame(() => {
      ghostOverlay!.innerHTML = renderGhostRows(ghostRows, incomingId);
      ghostOverlay!.style.display = "flex";
      ghostRafId = null;
    });
  }

  function removeGhostOverlay(): void {
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

  function endDrag(): void {
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

  function endDividerDrag(): void {
    if (!dividerDrag) return;

    const state = getState();
    root.querySelectorAll(".grid-divider-active").forEach((el) => el.classList.remove("grid-divider-active"));
    if (dividerDrag.pendingRatio !== undefined) {
      let next: SPCState = state;
      if (dividerDrag.type === "col") next = setColWeight(state, dividerDrag.row, dividerDrag.col!, dividerDrag.pendingRatio);
      else next = setRowWeight(state, dividerDrag.row, dividerDrag.pendingRatio);

      commitLayout(next);
      saveLayout();

      const visibleIds = collectChartIds(next.chartLayout);
      const stateForUpdate = getState();
      requestAnimationFrame(() => {
        for (const id of visibleIds) {
          const chart = chartRuntime.getCharts()[id];
          if (chart) chart.update(buildChartData(id, stateForUpdate));
        }
      });
    }
    dividerDrag = null;
  }

  root.addEventListener("pointerdown", (e: PointerEvent) => {
    const divider = (e.target as HTMLElement).closest(".grid-divider") as HTMLElement | null;
    if (divider) {
      e.preventDefault();
      e.stopPropagation();
      divider.setPointerCapture(e.pointerId);
      divider.classList.add("grid-divider-active");

      const arenaRect = (root.querySelector(".chart-arena") as HTMLElement).getBoundingClientRect();
      if (divider.classList.contains("grid-divider-col")) {
        dividerDrag = { type: "col", row: +divider.dataset.row!, col: +divider.dataset.col!, arenaRect };
      } else {
        dividerDrag = { type: "row", row: +divider.dataset.row!, arenaRect };
      }
      return;
    }

    const handle = (e.target as HTMLElement).closest("[data-drag-handle]") as HTMLElement | null;
    const state = getState();
    if (!handle || state.chartOrder.length < 2) return;
    const pane = handle.closest(".chart-pane") as HTMLElement | null;
    if (!pane || (e.target as HTMLElement).closest("button")) return;

    e.preventDefault();
    pendingDrag = {
      chartId: handle.dataset.dragHandle!,
      pane,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
    };
  });

  root.addEventListener("pointermove", (e: PointerEvent) => {
    const state = getState();

    if (dividerDrag) {
      if (dividerDrag.type === "col") {
        const rowEl = root.querySelectorAll(".chart-row")[dividerDrag.row] as HTMLElement | undefined;
        if (!rowEl) return;
        const wraps = rowEl.querySelectorAll<HTMLElement>(":scope > .chart-pane-wrap");
        const leftWrap = wraps[dividerDrag.col!];
        const rightWrap = wraps[dividerDrag.col! + 1];
        if (leftWrap && rightWrap) {
          const leftWeight = parseFloat(leftWrap.style.flex.split(" ")[0]) || 1;
          const rightWeight = parseFloat(rightWrap.style.flex.split(" ")[0]) || 1;
          const totalWeight = leftWeight + rightWeight;
          const paneLeftEdge = leftWrap.getBoundingClientRect().left;
          const combinedWidth = leftWrap.getBoundingClientRect().width + rightWrap.getBoundingClientRect().width;
          const localRatio = Math.max(0.1, Math.min(0.9, (e.clientX - paneLeftEdge) / combinedWidth));
          leftWrap.style.flex = `${(totalWeight * localRatio).toFixed(4)} 1 0`;
          rightWrap.style.flex = `${(totalWeight * (1 - localRatio)).toFixed(4)} 1 0`;
          dividerDrag.pendingRatio = localRatio;
        }
      } else {
        const rowEls = root.querySelectorAll<HTMLElement>(".chart-row");
        const topEl = rowEls[dividerDrag.row];
        const bottomEl = rowEls[dividerDrag.row + 1];
        if (topEl && bottomEl) {
          const topWeight = parseFloat(topEl.style.flex.split(" ")[0]) || 1;
          const bottomWeight = parseFloat(bottomEl.style.flex.split(" ")[0]) || 1;
          const totalWeight = topWeight + bottomWeight;
          const topEdge = topEl.getBoundingClientRect().top;
          const combinedHeight = topEl.getBoundingClientRect().height + bottomEl.getBoundingClientRect().height;
          const localRatio = Math.max(0.1, Math.min(0.9, (e.clientY - topEdge) / combinedHeight));
          topEl.style.flex = `${(totalWeight * localRatio).toFixed(4)} 1 0`;
          bottomEl.style.flex = `${(totalWeight * (1 - localRatio)).toFixed(4)} 1 0`;
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
      ghost.textContent = (state.charts[chartId]?.params?.chart_type && chartTypeLabels[state.charts[chartId].params.chart_type!]) || "Chart";
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

    let foundTarget: string | null = null;
    let foundZone: DropZone | null = null;
    for (const pane of root.querySelectorAll(".chart-pane:not(.dragging)") as NodeListOf<HTMLElement>) {
      const zone = getDropZone(pane, e.clientX, e.clientY, dragState.dropZone);
      if (zone) {
        foundTarget = pane.dataset.chartId!;
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

  root.addEventListener("dblclick", (e: MouseEvent) => {
    const divider = (e.target as HTMLElement).closest(".grid-divider") as HTMLElement | null;
    if (!divider) return;
    const state = getState();
    if (divider.classList.contains("grid-divider-col")) {
      commitLayout(setColWeight(state, +divider.dataset.row!, +divider.dataset.col!, 0.5));
    } else {
      commitLayout(setRowWeight(state, +divider.dataset.row!, 0.5));
    }
    saveLayout();
  });
}

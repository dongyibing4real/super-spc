import { createSlot } from './init.js';

/** Get all chart IDs visible in the current layout */
export function collectChartIds(layout) {
  if (!layout?.rows) {
    // Legacy fallback ---auto-migrate
    if (layout?.tree) return _collect(layout.tree);
    if (layout?.slots) return [...layout.slots];
    return [];
  }
  return layout.rows.flat();
}

/* --- Tree helpers (kept temporarily for migration only) --- */
function _collect(node) {
  if (!node) return [];
  if (node.type === "pane") return [node.chartId];
  return node.children.flatMap(_collect);
}

/** Insert a chart at a position relative to a target chart */
export function insertChart(state, chartId, targetId, zone) {
  const rows = state.chartLayout.rows.map(r => [...r]);
  const colWeights = state.chartLayout.colWeights.map(r => [...r]);
  const rowWeights = [...state.chartLayout.rowWeights];

  if (zone === "center") {
    // Swap: exchange positions and weights
    const aR = rows.findIndex(r => r.includes(chartId));
    const aC = rows[aR].indexOf(chartId);
    const bR = rows.findIndex(r => r.includes(targetId));
    const bC = rows[bR].indexOf(targetId);
    rows[aR][aC] = targetId;
    rows[bR][bC] = chartId;
    const tmpW = colWeights[aR][aC];
    colWeights[aR][aC] = colWeights[bR][bC];
    colWeights[bR][bC] = tmpW;
    return { ...state, chartLayout: { rows, colWeights, rowWeights } };
  }

  const tR = rows.findIndex(r => r.includes(targetId));

  // Remove chartId from current position
  const sR = rows.findIndex(r => r.includes(chartId));
  if (sR >= 0) {
    const sC = rows[sR].indexOf(chartId);
    rows[sR].splice(sC, 1);
    colWeights[sR].splice(sC, 1);
    if (rows[sR].length === 0) {
      rows.splice(sR, 1);
      colWeights.splice(sR, 1);
      rowWeights.splice(sR, 1);
    }
  }

  // Recompute target after removal
  const tR2 = rows.findIndex(r => r.includes(targetId));
  const tC2 = rows[tR2].indexOf(targetId);

  switch (zone) {
    case "right":
      rows[tR2].splice(tC2 + 1, 0, chartId);
      colWeights[tR2].splice(tC2 + 1, 0, 1);
      break;
    case "left":
      rows[tR2].splice(tC2, 0, chartId);
      colWeights[tR2].splice(tC2, 0, 1);
      break;
    case "bottom":
      rows.splice(tR2 + 1, 0, [chartId]);
      colWeights.splice(tR2 + 1, 0, [1]);
      rowWeights.splice(tR2 + 1, 0, 1);
      break;
    case "top":
      rows.splice(tR2, 0, [chartId]);
      colWeights.splice(tR2, 0, [1]);
      rowWeights.splice(tR2, 0, 1);
      break;
  }

  return { ...state, chartLayout: { rows, colWeights, rowWeights } };
}

/** Compute a preview of the grid after a drag-drop ---does NOT modify state */
export function computeGridPreview(layout, draggingId, targetId, zone) {
  const { rows, colWeights, rowWeights } = layout;
  if (!draggingId || !targetId || draggingId === targetId) return layout;

  if (zone === "center") {
    const preview = rows.map(r => r.map(id =>
      id === draggingId ? targetId : id === targetId ? draggingId : id
    ));
    return { rows: preview, colWeights, rowWeights };
  }

  // Remove dragging from current position, keeping weights in sync
  const pRows = [];
  const pColW = [];
  const pRowW = [];
  for (let r = 0; r < rows.length; r++) {
    const filtered = [];
    const filteredW = [];
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] !== draggingId) {
        filtered.push(rows[r][c]);
        filteredW.push(colWeights[r][c]);
      }
    }
    if (filtered.length > 0) {
      pRows.push(filtered);
      pColW.push(filteredW);
      pRowW.push(rowWeights[r]);
    }
  }

  const tR = pRows.findIndex(r => r.includes(targetId));
  if (tR < 0) return layout;
  const tC = pRows[tR].indexOf(targetId);

  switch (zone) {
    case "right":  pRows[tR].splice(tC + 1, 0, draggingId); pColW[tR].splice(tC + 1, 0, 1); break;
    case "left":   pRows[tR].splice(tC, 0, draggingId); pColW[tR].splice(tC, 0, 1); break;
    case "bottom": pRows.splice(tR + 1, 0, [draggingId]); pColW.splice(tR + 1, 0, [1]); pRowW.splice(tR + 1, 0, 1); break;
    case "top":    pRows.splice(tR, 0, [draggingId]); pColW.splice(tR, 0, [1]); pRowW.splice(tR, 0, 1); break;
  }
  return { rows: pRows, colWeights: pColW, rowWeights: pRowW };
}

/** Set column weight ratio between two adjacent panes in a row */
export function setColWeight(state, rowIndex, leftCol, ratio) {
  const colWeights = state.chartLayout.colWeights.map(r => [...r]);
  const total = colWeights[rowIndex][leftCol] + colWeights[rowIndex][leftCol + 1];
  colWeights[rowIndex][leftCol] = total * ratio;
  colWeights[rowIndex][leftCol + 1] = total * (1 - ratio);
  return { ...state, chartLayout: { ...state.chartLayout, colWeights } };
}

/** Set row weight ratio between two adjacent rows */
export function setRowWeight(state, topRow, ratio) {
  const rowWeights = [...state.chartLayout.rowWeights];
  const total = rowWeights[topRow] + rowWeights[topRow + 1];
  rowWeights[topRow] = total * ratio;
  rowWeights[topRow + 1] = total * (1 - ratio);
  return { ...state, chartLayout: { ...state.chartLayout, rowWeights } };
}

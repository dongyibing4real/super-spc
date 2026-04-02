import {
  navigate,
  setPrepParsedData,
  loadPrepPoints,
  setPrepError,
  resetAxis,
  closeContextMenu,
  setActiveChipEditor,
  selectPrepDataset,
  setColumns,
  deletePrepDataset,
  setDatasets,
  setExpandedProfileColumn,
} from "../core/state.js";
import { fetchPoints, fetchColumns, fetchDatasets, deleteDataset } from "../data/api.js";
import { createTable } from "../data/data-prep-engine.js";

export async function handleAppClick(event, { store, root, render, loadDatasetById }) {
  const state = store.getState();

  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return false;

  switch (actionTarget.dataset.action) {
    case "close-shortcut-overlay":
      store.setState({ ...state, ui: { ...state.ui, shortcutOverlay: false } });
      render();
      return true;
    case "navigate": {
      const navigatedState = navigate(state, actionTarget.dataset.route);
      store.setState(navigatedState);
      render();
      if (
        actionTarget.dataset.route === "dataprep" &&
        navigatedState.dataPrep.selectedDatasetId &&
        navigatedState.dataPrep.datasetPoints.length === 0
      ) {
        try {
          const dsId = navigatedState.dataPrep.selectedDatasetId;
          const [pts, cols] = await Promise.all([
            fetchPoints(dsId),
            fetchColumns(dsId).catch(() => []),
          ]);
          const rawRows = pts.map((p) => p.raw_data || {});
          const fallbackColumns = cols.length > 0 ? cols : navigatedState.columnConfig.columns;
          const arqueroTable = createTable(rawRows, fallbackColumns);
          let next = setPrepParsedData(navigatedState, {
            rawRows,
            arqueroTable,
            columns: fallbackColumns,
          });
          next = loadPrepPoints(next, pts);
          store.setState(next);
          render();
        } catch (err) {
          store.setState(setPrepError(navigatedState, err.message));
          render();
        }
      }
      return true;
    }
    case "reset-axis": {
      const axisRole = state.ui.contextMenu?.role || state.focusedChartId;
      store.setState(resetAxis(state, actionTarget.dataset.axis, axisRole));
      store.setState(closeContextMenu(store.getState()));
      return true;
    }
    case "toggle-chip-editor":
      store.setState(setActiveChipEditor(state, actionTarget.dataset.chip));
      return true;
    case "select-prep-dataset": {
      const dsId = actionTarget.dataset.datasetId;
      store.setState(selectPrepDataset(state, dsId));
      render();
      try {
        const [pts, cols] = await Promise.all([
          fetchPoints(dsId),
          fetchColumns(dsId).catch(() => []),
        ]);
        let next = setColumns(store.getState(), cols);
        next = loadPrepPoints(next, pts);
        const rawRows = pts.map((p) => p.raw_data || {});
        const arqueroTable = createTable(rawRows, cols);
        next = setPrepParsedData(next, { rawRows, arqueroTable, columns: cols });
        next = loadPrepPoints(next, pts);
        store.setState(next);
        render();
      } catch (err) {
        store.setState(setPrepError(store.getState(), err.message));
        render();
      }
      return true;
    }
    case "delete-dataset": {
      const dsId = actionTarget.dataset.datasetId;
      if (state.dataPrep.confirmingDeleteId === dsId) {
        const next = { ...state, dataPrep: { ...state.dataPrep, confirmingDeleteId: null } };
        try {
          await deleteDataset(dsId);
          const datasets = await fetchDatasets();
          store.setState(deletePrepDataset(setDatasets(next, datasets), dsId));
          render();
        } catch (err) {
          store.setState(setPrepError(next, err.message));
          render();
        }
      } else {
        store.setState({ ...state, dataPrep: { ...state.dataPrep, confirmingDeleteId: dsId } });
        render();
      }
      return true;
    }
    case "cancel-delete":
      store.setState({ ...state, dataPrep: { ...state.dataPrep, confirmingDeleteId: null } });
      render();
      return true;
    case "load-prep-to-chart": {
      if (state.dataPrep.selectedDatasetId) {
        await loadDatasetById(state.dataPrep.selectedDatasetId);
        const excludedSet = new Set(state.dataPrep.excludedRows || []);
        let next = state;
        if (excludedSet.size > 0 && state.points.length > 0) {
          next = {
            ...state,
            points: state.points.map((p, i) => (excludedSet.has(i) ? { ...p, excluded: true } : p)),
          };
        }
        store.setState(navigate(next, "workspace"));
        render();
      }
      return true;
    }
    case "select-column":
      store.setState(setExpandedProfileColumn(state, actionTarget.dataset.column));
      render();
      return true;
    default:
      return false;
  }
}

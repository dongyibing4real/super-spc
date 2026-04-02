export async function handleAppClick(event, ctx) {
  const {
    state,
    root,
    setState,
    render,
    commit,
    commitChart,
    commitContextMenu,
    commitRecipeRail,
    patchUi,
    navigate,
    fetchPoints,
    fetchColumns,
    createTable,
    setPrepParsedData,
    loadPrepPoints,
    setPrepError,
    resetAxis,
    closeContextMenu,
    setActiveChipEditor,
    selectPrepDataset,
    setColumns,
    deleteDataset,
    fetchDatasets,
    deletePrepDataset,
    setDatasets,
    loadDatasetById,
    setExpandedProfileColumn,
  } = ctx;

  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return false;

  switch (actionTarget.dataset.action) {
    case "close-shortcut-overlay":
      setState(patchUi({ shortcutOverlay: false }));
      render();
      return true;
    case "navigate": {
      const navigatedState = navigate(state, actionTarget.dataset.route);
      commit(navigatedState);
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
          setState(next);
          render();
        } catch (err) {
          commit(setPrepError(navigatedState, err.message));
        }
      }
      return true;
    }
    case "reset-axis": {
      const axisRole = state.ui.contextMenu?.role || state.focusedChartId;
      commitChart(resetAxis(state, actionTarget.dataset.axis, axisRole));
      commitContextMenu(closeContextMenu(state));
      return true;
    }
    case "toggle-chip-editor":
      commitRecipeRail(setActiveChipEditor(state, actionTarget.dataset.chip));
      return true;
    case "select-prep-dataset": {
      const dsId = actionTarget.dataset.datasetId;
      commit(selectPrepDataset(state, dsId));
      try {
        const [pts, cols] = await Promise.all([
          fetchPoints(dsId),
          fetchColumns(dsId).catch(() => []),
        ]);
        let next = setColumns(state, cols);
        next = loadPrepPoints(next, pts);
        const rawRows = pts.map((p) => p.raw_data || {});
        const arqueroTable = createTable(rawRows, cols);
        next = setPrepParsedData(next, { rawRows, arqueroTable, columns: cols });
        next = loadPrepPoints(next, pts);
        setState(next);
        render();
      } catch (err) {
        commit(setPrepError(state, err.message));
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
          commit(deletePrepDataset(setDatasets(next, datasets), dsId));
        } catch (err) {
          commit(setPrepError(next, err.message));
        }
      } else {
        commit({ ...state, dataPrep: { ...state.dataPrep, confirmingDeleteId: dsId } });
      }
      return true;
    }
    case "cancel-delete":
      commit({ ...state, dataPrep: { ...state.dataPrep, confirmingDeleteId: null } });
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
        commit(navigate(next, "workspace"));
      }
      return true;
    }
    case "select-column":
      commit(setExpandedProfileColumn(state, actionTarget.dataset.column));
      return true;
    default:
      return false;
  }
}

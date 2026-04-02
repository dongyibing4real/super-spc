export function selectPrepDataset(state, datasetId) {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, selectedDatasetId: datasetId, datasetPoints: [], loading: true, error: null }
  };
}

export function loadPrepPoints(state, points) {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, datasetPoints: points, loading: false, error: null }
  };
}

export function setPrepError(state, message) {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, loading: false, error: message }
  };
}

export function deletePrepDataset(state, datasetId) {
  const datasets = state.datasets.filter(d => d.id !== datasetId);
  const dp = state.dataPrep.selectedDatasetId === datasetId
    ? { ...state.dataPrep, selectedDatasetId: null, datasetPoints: [], error: null }
    : state.dataPrep;
  const activeDatasetId = state.activeDatasetId === datasetId ? null : state.activeDatasetId;
  return { ...state, datasets, dataPrep: dp, activeDatasetId };
}

/* ---Client-side data prep actions ---*/

export function setPrepParsedData(state, { rawRows, arqueroTable, columns }) {
  return {
    ...state,
    dataPrep: {
      ...state.dataPrep,
      rawRows,
      originalColumns: columns, // preserved for undo replay (immune to rename/type changes)
      arqueroTable,
      transforms: [],
      hiddenColumns: [],
      columnOrder: columns.map(c => c.name),
      unsavedChanges: false,
      loading: false,
      error: null,
    },
    columnConfig: { ...state.columnConfig, columns, loading: false },
  };
}

export function setPrepTable(state, arqueroTable) {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, arqueroTable, unsavedChanges: true },
  };
}

export function addPrepTransform(state, transform) {
  return {
    ...state,
    dataPrep: {
      ...state.dataPrep,
      transforms: [...state.dataPrep.transforms, { ...transform, timestamp: Date.now() }],
      unsavedChanges: true,
    },
  };
}

export function undoPrepTransform(state) {
  const transforms = state.dataPrep.transforms.slice(0, -1);
  return {
    ...state,
    dataPrep: { ...state.dataPrep, transforms, unsavedChanges: transforms.length > 0 },
  };
}

/** Tail-trim: undo all transforms from stepIndex onward (view-only ledger, end-trimmable). */
export function undoPrepTransformTo(state, stepIndex) {
  const transforms = state.dataPrep.transforms.slice(0, stepIndex);
  return {
    ...state,
    dataPrep: { ...state.dataPrep, transforms, unsavedChanges: transforms.length > 0 },
  };
}

export function clearPrepTransforms(state) {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, transforms: [], unsavedChanges: false },
  };
}

export function setPrepHiddenColumns(state, hiddenColumns) {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, hiddenColumns },
  };
}

export function markPrepSaved(state) {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, unsavedChanges: false },
  };
}

export function setActivePanel(state, panel) {
  const toggled = state.dataPrep.activePanel === panel ? null : panel;
  return {
    ...state,
    dataPrep: { ...state.dataPrep, activePanel: toggled },
  };
}

export function closeActivePanel(state) {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, activePanel: null },
  };
}

/**
 * Update column metadata (for rename, change dtype).
 * Also updates hiddenColumns if a column name changed.
 */
export function updateColumnMeta(state, oldName, updates) {
  const columns = state.columnConfig.columns.map(c =>
    c.name === oldName ? { ...c, ...updates } : c
  );
  let hiddenColumns = state.dataPrep.hiddenColumns;
  if (updates.name && updates.name !== oldName) {
    hiddenColumns = hiddenColumns.map(h => h === oldName ? updates.name : h);
  }
  return {
    ...state,
    columnConfig: { ...state.columnConfig, columns },
    dataPrep: { ...state.dataPrep, hiddenColumns },
  };
}

/**
 * Add new column metadata (for calculated, split, concat, recode-to-new, bin).
 * @param {Object} state
 * @param {Array<{name: string, dtype: string, role: string|null}>} newColumns
 */
export function addColumnMeta(state, newColumns) {
  const startOrdinal = state.columnConfig.columns.length;
  const withOrdinals = newColumns.map((c, i) => ({
    ...c,
    role: c.role ?? null,
    ordinal: startOrdinal + i,
  }));
  return {
    ...state,
    columnConfig: {
      ...state.columnConfig,
      columns: [...state.columnConfig.columns, ...withOrdinals],
    },
  };
}

// ---Phase 3 ---Row Exclusion ---

export function toggleRowExclusion(state, rowIdx) {
  const excluded = [...state.dataPrep.excludedRows];
  const pos = excluded.indexOf(rowIdx);
  if (pos >= 0) excluded.splice(pos, 1);
  else excluded.push(rowIdx);
  return { ...state, dataPrep: { ...state.dataPrep, excludedRows: excluded } };
}

export function bulkExcludeRows(state, indices) {
  const excluded = [...new Set([...state.dataPrep.excludedRows, ...indices])];
  return { ...state, dataPrep: { ...state.dataPrep, excludedRows: excluded } };
}

export function clearAllExclusions(state) {
  return { ...state, dataPrep: { ...state.dataPrep, excludedRows: [] } };
}


import type { SPCState, ChartPoint } from '../../types/state.js';
import type { ColumnOut } from '../../types/api.js';

export function selectPrepDataset(state: SPCState, datasetId: string): SPCState {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, selectedDatasetId: datasetId, datasetPoints: [], loading: true, error: null }
  };
}

export function loadPrepPoints(state: SPCState, points: ChartPoint[]): SPCState {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, datasetPoints: points, loading: false, error: null }
  };
}

export function setPrepError(state: SPCState, message: string): SPCState {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, loading: false, error: message }
  };
}

export function deletePrepDataset(state: SPCState, datasetId: string): SPCState {
  const datasets = state.datasets.filter(d => d.id !== datasetId);
  const dp = state.dataPrep.selectedDatasetId === datasetId
    ? { ...state.dataPrep, selectedDatasetId: null, datasetPoints: [], error: null }
    : state.dataPrep;
  const activeDatasetId = state.activeDatasetId === datasetId ? null : state.activeDatasetId;
  return { ...state, datasets, dataPrep: dp, activeDatasetId };
}

/* ---Client-side data prep actions ---*/

interface ParsedDataPayload {
  rawRows: unknown[];
  arqueroTable: unknown;
  columns: ColumnOut[];
}

export function setPrepParsedData(state: SPCState, { rawRows, arqueroTable, columns }: ParsedDataPayload): SPCState {
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

export function setPrepTable(state: SPCState, arqueroTable: unknown): SPCState {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, arqueroTable, unsavedChanges: true },
  };
}

interface Transform {
  timestamp?: number;
  [key: string]: unknown;
}

export function addPrepTransform(state: SPCState, transform: Transform): SPCState {
  return {
    ...state,
    dataPrep: {
      ...state.dataPrep,
      transforms: [...state.dataPrep.transforms, { ...transform, timestamp: Date.now() }],
      unsavedChanges: true,
    },
  };
}

export function undoPrepTransform(state: SPCState): SPCState {
  const transforms = state.dataPrep.transforms.slice(0, -1);
  return {
    ...state,
    dataPrep: { ...state.dataPrep, transforms, unsavedChanges: transforms.length > 0 },
  };
}

export function clearPrepTransforms(state: SPCState): SPCState {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, transforms: [], unsavedChanges: false },
  };
}

export function markPrepSaved(state: SPCState): SPCState {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, unsavedChanges: false },
  };
}

export function setActivePanel(state: SPCState, panel: string): SPCState {
  const toggled = state.dataPrep.activePanel === panel ? null : panel;
  return {
    ...state,
    dataPrep: { ...state.dataPrep, activePanel: toggled },
  };
}

export function closeActivePanel(state: SPCState): SPCState {
  return {
    ...state,
    dataPrep: { ...state.dataPrep, activePanel: null },
  };
}

/**
 * Update column metadata (for rename, change dtype).
 * Also updates hiddenColumns if a column name changed.
 */
export function updateColumnMeta(state: SPCState, oldName: string, updates: Partial<ColumnOut>): SPCState {
  const columns = state.columnConfig.columns.map(c =>
    c.name === oldName ? { ...c, ...updates } : c
  );
  let hiddenColumns = state.dataPrep.hiddenColumns;
  if (updates.name && updates.name !== oldName) {
    hiddenColumns = hiddenColumns.map(h => h === oldName ? updates.name! : h);
  }
  return {
    ...state,
    columnConfig: { ...state.columnConfig, columns },
    dataPrep: { ...state.dataPrep, hiddenColumns },
  };
}

interface NewColumnDef {
  name: string;
  dtype: string;
  role?: string | null;
}

/**
 * Add new column metadata (for calculated, split, concat, recode-to-new, bin).
 */
export function addColumnMeta(state: SPCState, newColumns: NewColumnDef[]): SPCState {
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

export function toggleRowExclusion(state: SPCState, rowIdx: number): SPCState {
  const excluded = [...state.dataPrep.excludedRows];
  const pos = excluded.indexOf(rowIdx);
  if (pos >= 0) excluded.splice(pos, 1);
  else excluded.push(rowIdx);
  return { ...state, dataPrep: { ...state.dataPrep, excludedRows: excluded } };
}

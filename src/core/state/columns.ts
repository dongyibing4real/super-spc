import type { SPCState } from '../../types/state.js';
import type { ColumnOut } from '../../types/api.js';

export function setColumns(state: SPCState, columns: ColumnOut[]): SPCState {
  return {
    ...state,
    columnConfig: { ...state.columnConfig, columns, loading: false },
  };
}

export function setExpandedProfileColumn(state: SPCState, colName: string): SPCState {
  const current = state.dataPrep.expandedProfileColumn;
  return {
    ...state,
    dataPrep: {
      ...state.dataPrep,
      expandedProfileColumn: current === colName ? null : colName,
    },
  };
}

export function setProfileCache(state: SPCState, cache: Record<string, unknown>): SPCState {
  return { ...state, dataPrep: { ...state.dataPrep, profileCache: cache } };
}

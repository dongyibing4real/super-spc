export function setColumns(state, columns) {
  return {
    ...state,
    columnConfig: { ...state.columnConfig, columns, loading: false },
  };
}

export function setColumnsLoading(state) {
  return {
    ...state,
    columnConfig: { ...state.columnConfig, loading: true },
  };
}

export function setExpandedProfileColumn(state, colName) {
  const current = state.dataPrep.expandedProfileColumn;
  return {
    ...state,
    dataPrep: {
      ...state.dataPrep,
      expandedProfileColumn: current === colName ? null : colName,
    },
  };
}

export function setProfileCache(state, cache) {
  return { ...state, dataPrep: { ...state.dataPrep, profileCache: cache } };
}

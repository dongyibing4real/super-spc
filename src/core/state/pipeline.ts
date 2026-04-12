export function loadDataset(state, { points, slots, datasetId }) {
  const updatedCharts = { ...state.charts };
  for (const [id, result] of Object.entries(slots)) {
    if (updatedCharts[id]) {
      updatedCharts[id] = { ...updatedCharts[id], ...result, overrides: { x: null, y: null } };
    }
  }
  return {
    ...state,
    loading: false,
    error: null,
    activeDatasetId: datasetId,
    points,
    selectedPointIndex: points.length > 0 ? points.length - 1 : 0,
    structuralFindings: [],
    selectedFindingId: null,
    findingsChartId: null,
    charts: updatedCharts,
  };
}


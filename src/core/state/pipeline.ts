import type { SPCState, ChartSlot, ChartPoint } from '../../types/state.js';

interface LoadDatasetPayload {
  points: ChartPoint[];
  slots: Record<string, Partial<ChartSlot>>;
  datasetId: string;
}

export function loadDataset(state: SPCState, { points, slots, datasetId }: LoadDatasetPayload): SPCState {
  const updatedCharts: Record<string, ChartSlot> = { ...state.charts };
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

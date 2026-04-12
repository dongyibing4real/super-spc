import type { SPCState } from '../../types/state.js';

export interface Finding {
  id: string;
  generatorId: string;
  category: string;
  severity: string;
  title: string;
  detail: string;
  metric: { label: string; value: string; raw: number };
  context: Record<string, unknown>;
}

export function setStructuralFindings(state: SPCState, findings: Finding[], chartId?: string): SPCState {
  return {
    ...state,
    structuralFindings: findings,
    selectedFindingId: findings.length > 0 ? findings[0].id : null,
    findingsChartId: chartId || state.focusedChartId || state.chartOrder[0],
  };
}

export function selectStructuralFinding(state: SPCState, findingId: string): SPCState {
  return { ...state, selectedFindingId: findingId };
}

export function setFindingsChart(state: SPCState, chartId: string): SPCState {
  return { ...state, findingsChartId: chartId };
}

export function setFindingsStandard(state: SPCState, key: string, value: number): SPCState {
  return {
    ...state,
    findingsStandards: { ...state.findingsStandards, [key]: value },
  };
}

export function toggleFindingsStandardsBar(state: SPCState): SPCState {
  return { ...state, findingsStandardsExpanded: !state.findingsStandardsExpanded };
}

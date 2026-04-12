export function setStructuralFindings(state, findings, chartId) {
  return {
    ...state,
    structuralFindings: findings,
    selectedFindingId: findings.length > 0 ? findings[0].id : null,
    findingsChartId: chartId || state.focusedChartId || state.chartOrder[0],
  };
}

export function selectStructuralFinding(state, findingId) {
  return { ...state, selectedFindingId: findingId };
}

export function setFindingsChart(state, chartId) {
  return { ...state, findingsChartId: chartId };
}

export function setFindingsStandard(state, key, value) {
  return {
    ...state,
    findingsStandards: { ...state.findingsStandards, [key]: value },
  };
}

export function toggleFindingsStandardsBar(state) {
  return { ...state, findingsStandardsExpanded: !state.findingsStandardsExpanded };
}

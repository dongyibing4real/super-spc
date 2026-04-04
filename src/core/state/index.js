// Barrel — re-exports everything from domain modules
export { clamp, getFailedTransformCount, DEFAULT_PARAMS, createSlot, updateSlot, migrateTreeToRows, createInitialState } from './init.js';
export { getFirstChart, getPrimary, getFocused, getSelectedPoint, getPhaseLabel, buildSignalNarrative, buildWhyTriggered, buildMethodLabComparison, buildDisagreements, deriveWorkspace } from './selectors.js';
export { selectPoint, selectPoints, moveSelection, setChartParams, setActiveChipEditor, toggleChartOption, togglePointExclusion, focusChart, addChart, removeChart, setXDomainOverride, setYDomainOverride, resetAxis, activateForecast, selectForecast, setForecastPrompt, setForecastHorizon, cancelForecast, selectPhase } from './chart.js';
export { setRecipeParams } from './reconcile-params.js';
export { collectChartIds, insertChart, computeGridPreview, setColWeight, setRowWeight } from './layout.js';
export { selectPrepDataset, loadPrepPoints, setPrepError, deletePrepDataset, setPrepParsedData, setPrepTable, addPrepTransform, undoPrepTransform, undoPrepTransformTo, clearPrepTransforms, setPrepHiddenColumns, markPrepSaved, setActivePanel, closeActivePanel, updateColumnMeta, addColumnMeta, toggleRowExclusion, bulkExcludeRows, clearAllExclusions } from './data-prep.js';
export { setStructuralFindings, selectStructuralFinding, setFindingsChart, setFindingsStandard, toggleFindingsStandardsBar } from './findings.js';
export { clearNotice, toggleLayers, openContextMenu, closeContextMenu, navigate, setError, setLoadingState, setDatasets, toggleDataTable, togglePaneDataTable, toggleMethodLabChart } from './ui.js';
export { loadDataset, toggleTransform, failTransformStep, recoverTransformStep, setChallengerStatus } from './pipeline.js';
export { setColumns, setColumnsLoading, setExpandedProfileColumn, setProfileCache } from './columns.js';

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

export function toggleTransform(state, stepId) {
  const stepIndex = state.transforms.findIndex((c) => c.id === stepId);
  const step = state.transforms[stepIndex];
  if (!step || step.status === "failed") return state;

  const newActive = !step.active;
  const newTransforms = state.transforms.map((s, i) =>
    i === stepIndex ? { ...s, active: newActive, status: newActive ? "active" : "inactive" } : s
  );

  return {
    ...state,
    transforms: newTransforms,
  };
}

export function failTransformStep(state, stepId) {
  const stepIndex = state.transforms.findIndex((c) => c.id === stepId);
  const step = state.transforms[stepIndex];
  if (!step) return state;

  const newTransforms = state.transforms.map((s, i) =>
    i === stepIndex ? { ...s, status: "failed", active: false } : s
  );

  return {
    ...state,
    transforms: newTransforms,
    pipeline: { ...state.pipeline, status: "partial", rescueMode: "retain-previous-compute" },
  };
}

export function recoverTransformStep(state, stepId) {
  const stepIndex = state.transforms.findIndex((c) => c.id === stepId);
  const step = state.transforms[stepIndex];
  if (!step) return state;

  const newTransforms = state.transforms.map((s, i) =>
    i === stepIndex ? { ...s, status: "active", active: true } : s
  );
  const failedCount = newTransforms.filter((s) => s.status === "failed").length;
  const newPipelineStatus = failedCount > 0 ? "partial" : "ready";

  return {
    ...state,
    transforms: newTransforms,
    pipeline: {
      ...state.pipeline,
      status: newPipelineStatus,
      rescueMode: newPipelineStatus === "ready" ? "none" : "retain-previous-compute"
    },
  };
}

/** @deprecated Legacy status action — kept for backward compatibility. */
export function setChallengerStatus(state, status) {
  return {
    ...state,
    ui: {
      ...state.ui,
      notice: {
        tone: status === "ready" ? "positive" : status === "partial" ? "warning" : "critical",
        title: "Method lab updated",
        body:
          status === "ready"
            ? "Methods are now fully comparable."
            : status === "partial"
              ? "Analysis incomplete — some charts need another run."
              : "Analysis timed out."
      }
    }
  };
}

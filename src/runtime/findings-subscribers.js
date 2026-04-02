import { renderFindingsLayout, renderFindingsContent } from "../views/findings.js";
import { morphEl } from "../core/morph.js";

export function updateFindingsSurface(root, state) {
  const layout = root.querySelector(".findings-layout");
  if (!layout) return;
  morphEl(layout, renderFindingsLayout(state));
}

export function updateFindingsContentOnly(root, state) {
  const content = root.querySelector(".findings-content");
  if (!content) return;
  morphEl(content, renderFindingsContent(state));
}

export function setupFindingsSubscribers(store, root) {
  store.subscribe((nextState, prevState) => {
    if (nextState.route !== "findings") return;

    // Structural changes: chart switch, standards toggle — morph full layout
    if (
      nextState.findingsChartId !== prevState.findingsChartId ||
      nextState.findingsStandardsExpanded !== prevState.findingsStandardsExpanded
    ) {
      updateFindingsSurface(root, nextState);
      return;
    }

    // Content changes: finding selection, findings data, standards values — morph content only
    if (
      nextState.selectedFindingId !== prevState.selectedFindingId ||
      nextState.structuralFindings !== prevState.structuralFindings ||
      nextState.findingsStandards !== prevState.findingsStandards
    ) {
      updateFindingsContentOnly(root, nextState);
    }
  });
}

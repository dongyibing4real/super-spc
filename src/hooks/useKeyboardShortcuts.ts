import { useEffect } from "react";
import { spcStore } from "../store/spc-store.js";
import { moveSelection, selectPoint } from "../core/state/chart.js";
import { openContextMenu, closeContextMenu } from "../core/state/ui.js";
import { setActivePanel } from "../core/state/data-prep.js";
import { getFocused } from "../core/state/selectors.js";

export function navigateSelectionToViolation(indices, currentIndex, directionKey) {
  if (directionKey === "n") {
    return indices.find((index) => index > currentIndex) ?? indices[0];
  }
  const prev = [...indices].reverse().find((index) => index < currentIndex);
  return prev ?? indices[indices.length - 1];
}

export default function useKeyboardShortcuts(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    function handleKeydown(event) {
      const state = spcStore.getState();

      // Context menu arrow navigation
      if (state.ui.contextMenu && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        const menu = root.querySelector(".context-menu");
        if (!menu) return;
        const items = Array.from(menu.querySelectorAll("[role='menuitem']"));
        const idx = items.indexOf(document.activeElement);
        const next = event.key === "ArrowDown"
          ? items[(idx + 1) % items.length]
          : items[(idx - 1 + items.length) % items.length];
        next?.focus();
        return;
      }

      // Close shortcut overlay
      if (state.ui.shortcutOverlay) {
        if (event.key === "Escape" || event.key === "?") {
          event.preventDefault();
          spcStore.setState({ ...state, ui: { ...state.ui, shortcutOverlay: false } });
          return;
        }
      }

      const tag = document.activeElement?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (!inInput && !event.metaKey && !event.ctrlKey && !event.altKey) {
        // Open shortcut overlay
        if (event.key === "?") {
          event.preventDefault();
          spcStore.setState({ ...state, ui: { ...state.ui, shortcutOverlay: true } });
          return;
        }

        // DataPrep shortcuts
        if (state.route === "dataprep" && state.dataPrep.selectedDatasetId) {
          const dpKey = event.key.toLowerCase();
          const panel = { f: "filter", d: "find", r: "rename", t: "change_type", c: "calculated" }[dpKey];
          if (panel) {
            event.preventDefault();
            spcStore.setState(setActivePanel(state, panel));
            return;
          }
          if (dpKey === "z" && state.dataPrep.transforms.length > 0) {
            event.preventDefault();
            root.querySelector('[data-action="prep-undo"]')?.click();
            return;
          }
        }

        // Violation navigation (N/P)
        if ((event.key === "n" || event.key === "p") && state.route === "workspace") {
          event.preventDefault();
          const focused = getFocused(state);
          if (!focused) return;
          const violations = focused.violations || [];
          const indices = [...new Set(violations.flatMap((v) => v.indices || []))].sort((a, b) => a - b);
          if (indices.length === 0) return;
          const target = navigateSelectionToViolation(indices, state.selectedPointIndex ?? -1, event.key);
          spcStore.setState(selectPoint(state, target));
          return;
        }
      }

      // Chart-scoped shortcuts (Arrow keys, Enter, Shift+F10, Escape)
      const chartTarget = event.target.closest("[data-chart-focus], [data-action='select-point']");
      if (!chartTarget) return;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        spcStore.setState(moveSelection(state, 1));
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        spcStore.setState(moveSelection(state, -1));
        return;
      }
      if (event.key === "Enter" && event.target.matches("[data-action='select-point']")) {
        event.preventDefault();
        spcStore.setState(selectPoint(state, Number(event.target.dataset.index)));
        return;
      }
      if (event.key === "F10" && event.shiftKey) {
        event.preventDefault();
        spcStore.setState(openContextMenu(state, 400, 200));
        return;
      }
      if (event.key === "Escape" && state.ui.contextMenu) {
        spcStore.setState(closeContextMenu(state));
        return;
      }
      if (event.key === "Escape" && state.ui.pendingNewChart) {
        spcStore.setState({ ...state, ui: { ...state.ui, pendingNewChart: null } });
        return;
      }
    }

    root.addEventListener("keydown", handleKeydown);
    return () => root.removeEventListener("keydown", handleKeydown);
  }, [rootRef]);
}

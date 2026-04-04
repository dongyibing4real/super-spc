import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import {
  togglePointExclusion,
  closeContextMenu,
  navigate,
  toggleChartOption,
  resetAxis,
} from "../core/state.js";

const LAYERS = [
  ["specLimits", "Limits & zones"],
  ["grid", "Grid"],
  ["phaseTags", "Phases"],
  ["events", "Events"],
  ["excludedMarkers", "Exclusions"],
  ["confidenceBand", "Conf. band"],
];

function PointMenu({ x, y, pointIndex, isExcluded }) {
  return (
    <div className="context-menu" style={{ left: x, top: y }} role="menu">
      <div className="context-menu-header">Point</div>
      <button
        onClick={() => {
          spcStore.setState((s) => closeContextMenu(togglePointExclusion(s, pointIndex)));
        }}
        role="menuitem"
        type="button"
      >
        {isExcluded ? "Restore point" : "Exclude point"}
      </button>
      <button
        onClick={() => {
          spcStore.setState((s) => closeContextMenu(navigate(s, "methodlab")));
        }}
        role="menuitem"
        type="button"
      >
        Open in Method Lab
      </button>
    </div>
  );
}

function LineMenu({ x, y }) {
  return (
    <div className="context-menu" style={{ left: x, top: y }} role="menu">
      <div className="context-menu-header">Line</div>
      <button
        onClick={() => {
          spcStore.setState((s) => closeContextMenu(navigate(s, "methodlab")));
        }}
        role="menuitem"
        type="button"
      >
        Open in Method Lab
      </button>
    </div>
  );
}

function CanvasMenu({ x, y, toggles }) {
  return (
    <div
      className="context-menu canvas-context-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      <div className="context-menu-header">Canvas</div>
      {LAYERS.map(([k, label]) => (
        <button
          key={k}
          className={`context-toggle ${toggles[k] ? "is-on" : ""}`}
          onClick={() => {
            spcStore.setState((s) => closeContextMenu(toggleChartOption(s, k)));
          }}
          role="menuitem"
          type="button"
        >
          <span>{label}</span>
          <span className="toggle-dot" />
        </button>
      ))}
    </div>
  );
}

function AxisMenu({ x, y, axis }) {
  const label = axis === "x" ? "X-Axis" : "Y-Axis";
  return (
    <div
      className="context-menu axis-context-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      <div className="context-menu-header">{label}</div>
      <button
        onClick={() => {
          spcStore.setState((s) => closeContextMenu(resetAxis(s, axis)));
        }}
        role="menuitem"
        type="button"
      >
        Reset axis
      </button>
    </div>
  );
}

export default function ContextMenu() {
  const contextMenu = useStore(spcStore, (s) => s.ui.contextMenu);
  const focusedChartId = useStore(spcStore, (s) => s.focusedChartId);
  const toggles = useStore(spcStore, (s) => s.chartToggles);
  const points = useStore(spcStore, (s) => s.points);
  const selectedPointIndex = useStore(spcStore, (s) => s.selectedPointIndex);
  const menuRef = useRef(null);

  useEffect(() => {
    if (menuRef.current) {
      menuRef.current.querySelector("[role='menuitem']")?.focus();
    }
  }, [contextMenu]);

  if (!contextMenu) return null;

  const stage = document.getElementById(`chart-mount-${focusedChartId}`);
  if (!stage) return null;

  const { x, y, target, axis } = contextMenu;
  let menu;

  if (axis) {
    menu = <AxisMenu x={x} y={y} axis={axis} />;
  } else {
    switch (target) {
      case "point":
        menu = (
          <PointMenu
            x={x}
            y={y}
            pointIndex={selectedPointIndex}
            isExcluded={points[selectedPointIndex]?.excluded}
          />
        );
        break;
      case "line":
        menu = <LineMenu x={x} y={y} />;
        break;
      default:
        menu = <CanvasMenu x={x} y={y} toggles={toggles} />;
    }
  }

  return createPortal(<div ref={menuRef}>{menu}</div>, stage);
}

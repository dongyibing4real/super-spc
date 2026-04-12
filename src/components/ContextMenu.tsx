import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import { togglePointExclusion, toggleChartOption, resetAxis } from "../core/state/chart.js";
import { closeContextMenu, navigate } from "../core/state/ui.js";
import type { SPCState, ChartToggles, ChartPoint } from "../types/state.js";

const LAYERS: [string, string][] = [
  ["specLimits", "Limits & zones"],
  ["grid", "Grid"],
  ["phaseTags", "Phases"],
  ["events", "Events"],
  ["excludedMarkers", "Exclusions"],
  ["confidenceBand", "Conf. band"],
];

interface PointMenuProps {
  x: number;
  y: number;
  pointIndex: number | null;
  isExcluded: boolean | undefined;
}

function PointMenu({ x, y, pointIndex, isExcluded }: PointMenuProps): React.JSX.Element {
  return (
    <div className="context-menu" style={{ left: x, top: y }} role="menu">
      <div className="context-menu-header">Point</div>
      <button
        onClick={() => {
          spcStore.setState((s: SPCState) => closeContextMenu(togglePointExclusion(s, pointIndex as number)));
        }}
        role="menuitem"
        type="button"
      >
        {isExcluded ? "Restore point" : "Exclude point"}
      </button>
      <button
        onClick={() => {
          spcStore.setState((s: SPCState) => closeContextMenu(navigate(s, "methodlab")));
        }}
        role="menuitem"
        type="button"
      >
        Open in Method Lab
      </button>
    </div>
  );
}

interface LineMenuProps {
  x: number;
  y: number;
}

function LineMenu({ x, y }: LineMenuProps): React.JSX.Element {
  return (
    <div className="context-menu" style={{ left: x, top: y }} role="menu">
      <div className="context-menu-header">Line</div>
      <button
        onClick={() => {
          spcStore.setState((s: SPCState) => closeContextMenu(navigate(s, "methodlab")));
        }}
        role="menuitem"
        type="button"
      >
        Open in Method Lab
      </button>
    </div>
  );
}

interface CanvasMenuProps {
  x: number;
  y: number;
  toggles: ChartToggles;
}

function CanvasMenu({ x, y, toggles }: CanvasMenuProps): React.JSX.Element {
  return (
    <div
      className="context-menu canvas-context-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      <div className="context-menu-header">Canvas</div>
      {LAYERS.map(([k, label]: [string, string]) => (
        <button
          key={k}
          className={`context-toggle ${toggles[k as keyof ChartToggles] ? "is-on" : ""}`}
          onClick={() => {
            spcStore.setState((s: SPCState) => closeContextMenu(toggleChartOption(s, k as keyof ChartToggles)));
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

interface AxisMenuProps {
  x: number;
  y: number;
  axis: string;
}

function AxisMenu({ x, y, axis }: AxisMenuProps): React.JSX.Element {
  const label: string = axis === "x" ? "X-Axis" : "Y-Axis";
  return (
    <div
      className="context-menu axis-context-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      <div className="context-menu-header">{label}</div>
      <button
        onClick={() => {
          spcStore.setState((s: SPCState) => closeContextMenu(resetAxis(s, axis as "x" | "y")));
        }}
        role="menuitem"
        type="button"
      >
        Reset axis
      </button>
    </div>
  );
}

export default function ContextMenu(): React.JSX.Element | null {
  const contextMenu = useStore(spcStore, (s: SPCState) => s.ui.contextMenu);
  const focusedChartId = useStore(spcStore, (s: SPCState) => s.focusedChartId);
  const toggles = useStore(spcStore, (s: SPCState) => s.chartToggles);
  const points = useStore(spcStore, (s: SPCState) => s.points);
  const selectedPointIndex = useStore(spcStore, (s: SPCState) => s.selectedPointIndex);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menuRef.current) {
      (menuRef.current.querySelector("[role='menuitem']") as HTMLElement | null)?.focus();
    }
  }, [contextMenu]);

  if (!contextMenu) return null;

  const stage: HTMLElement | null = document.getElementById(`chart-mount-${focusedChartId}`);
  if (!stage) return null;

  const { x, y, target, axis } = contextMenu;
  let menu: React.JSX.Element;

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
            isExcluded={points[selectedPointIndex as number]?.excluded}
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

import React, { lazy, Suspense } from "react";
import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import { LoadingState, ErrorState, EmptyState } from "./Notice.jsx";
import type { SPCState } from "../types/state.js";

const WorkspaceView = lazy(() => import("../views/WorkspaceView.jsx"));
const DataPrepView = lazy(() => import("../views/data-prep/DataPrepView.jsx"));
const FindingsView = lazy(() => import("../views/FindingsView.jsx"));
const MethodLabView = lazy(() => import("../views/MethodLabView.jsx"));

export default function Router(): React.JSX.Element {
  const route = useStore(spcStore, (s: SPCState) => s.route);
  const loading = useStore(spcStore, (s: SPCState) => s.loading);
  const error = useStore(spcStore, (s: SPCState) => s.error);
  const pointsLen = useStore(spcStore, (s: SPCState) => s.points.length);
  const activeDatasetId = useStore(spcStore, (s: SPCState) => s.activeDatasetId);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
  if (pointsLen === 0 && !activeDatasetId) return <EmptyState />;

  let view: React.JSX.Element;
  switch (route) {
    case "dataprep":
      view = <DataPrepView />;
      break;
    case "methodlab":
      view = <MethodLabView />;
      break;
    case "findings":
      view = <FindingsView />;
      break;
    default:
      view = <WorkspaceView />;
  }

  return <Suspense fallback={<LoadingState />}>{view}</Suspense>;
}

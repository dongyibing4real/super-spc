import { lazy, Suspense } from "react";
import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import { LoadingState, ErrorState, EmptyState } from "./Notice.jsx";

const WorkspaceView = lazy(() => import("../views/WorkspaceView.jsx"));
const DataPrepView = lazy(() => import("../views/data-prep/DataPrepView.jsx"));
const FindingsView = lazy(() => import("../views/FindingsView.jsx"));
const MethodLabView = lazy(() => import("../views/MethodLabView.jsx"));

export default function Router() {
  const route = useStore(spcStore, (s) => s.route);
  const loading = useStore(spcStore, (s) => s.loading);
  const error = useStore(spcStore, (s) => s.error);
  const pointsLen = useStore(spcStore, (s) => s.points.length);
  const activeDatasetId = useStore(spcStore, (s) => s.activeDatasetId);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
  if (pointsLen === 0 && !activeDatasetId) return <EmptyState />;

  let view;
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

import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import WorkspaceView from "../views/WorkspaceView.jsx";
import DataPrepView from "../views/DataPrepView.jsx";
import FindingsView from "../views/FindingsView.jsx";
import MethodLabView from "../views/MethodLabView.jsx";
import { LoadingState, ErrorState, EmptyState } from "./Notice.jsx";

export default function Router() {
  const route = useStore(spcStore, (s) => s.route);
  const loading = useStore(spcStore, (s) => s.loading);
  const error = useStore(spcStore, (s) => s.error);
  const pointsLen = useStore(spcStore, (s) => s.points.length);
  const activeDatasetId = useStore(spcStore, (s) => s.activeDatasetId);

  if (loading) return <LoadingState />;
  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          // Dispatch retry — the legacy boot's main() handles this
          // via the retry-load data-action on the parent
        }}
      />
    );
  }
  if (pointsLen === 0 && !activeDatasetId) return <EmptyState />;

  switch (route) {
    case "dataprep":
      return <DataPrepView />;
    case "methodlab":
      return <MethodLabView />;
    case "findings":
      return <FindingsView />;
    default:
      return <WorkspaceView />;
  }
}

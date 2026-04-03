import { useRef, useEffect } from "react";
import { useStore } from "zustand";
import { bootLegacyApp } from "./legacy-boot.js";
import { spcStore } from "./store/spc-store.js";
import Sidebar from "./components/Sidebar.jsx";
import Notice from "./components/Notice.jsx";
import ContextMenu from "./components/ContextMenu.jsx";
import WorkspaceView from "./views/WorkspaceView.jsx";

export default function App() {
  const legacyRef = useRef(null);
  const bootedRef = useRef(false);
  const route = useStore(spcStore, (s) => s.route);

  useEffect(() => {
    if (!bootedRef.current && legacyRef.current) {
      bootLegacyApp(legacyRef.current);
      bootedRef.current = true;
    }
  }, []);

  const isWorkspace = route === "workspace";

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-shell">
        <Notice />
        {isWorkspace && <WorkspaceView />}
        <div
          ref={legacyRef}
          style={{
            flex: isWorkspace ? "none" : 1,
            overflow: "hidden",
            minHeight: 0,
            display: isWorkspace ? "none" : "flex",
            flexDirection: "column",
          }}
        />
      </main>
      <ContextMenu />
    </div>
  );
}

import { useRef, useEffect } from "react";
import { bootLegacyApp } from "./legacy-boot.js";
import Sidebar from "./components/Sidebar.jsx";
import Notice from "./components/Notice.jsx";
import ContextMenu from "./components/ContextMenu.jsx";
import Router from "./components/Router.jsx";
import ShortcutOverlay from "./components/ShortcutOverlay.jsx";

export default function App() {
  const legacyRef = useRef(null);
  const bootedRef = useRef(false);

  useEffect(() => {
    if (!bootedRef.current && legacyRef.current) {
      bootLegacyApp(legacyRef.current);
      bootedRef.current = true;
    }
  }, []);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-shell">
        <Notice />
        <Router />
        {/* Legacy morphRoot — hidden, used for event listener scope */}
        <div ref={legacyRef} style={{ display: "none" }} />
        <ShortcutOverlay />
      </main>
      <ContextMenu />
    </div>
  );
}

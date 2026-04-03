import { useRef, useEffect } from "react";
import { bootLegacyApp } from "./legacy-boot.js";
import Sidebar from "./components/Sidebar.jsx";
import Notice from "./components/Notice.jsx";
import ContextMenu from "./components/ContextMenu.jsx";

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
        <div ref={legacyRef} />
      </main>
      <ContextMenu />
    </div>
  );
}

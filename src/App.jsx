import { useRef } from "react";
import useAppBoot from "./hooks/useAppBoot.js";
import useKeyboardShortcuts from "./hooks/useKeyboardShortcuts.js";
import useDragInteractions from "./hooks/useDragInteractions.js";
import Sidebar from "./components/Sidebar.jsx";
import Notice from "./components/Notice.jsx";
import ContextMenu from "./components/ContextMenu.jsx";
import Router from "./components/Router.jsx";
import ShortcutOverlay from "./components/ShortcutOverlay.jsx";

export default function App() {
  const mainRef = useRef(null);

  useAppBoot();
  useKeyboardShortcuts(mainRef);
  useDragInteractions(mainRef);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-shell" ref={mainRef}>
        <Notice />
        <Router />
        <ShortcutOverlay />
      </main>
      <ContextMenu />
    </div>
  );
}

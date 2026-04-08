import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// Apply theme before first paint to prevent flash
{
  const pref = localStorage.getItem('super-spc-theme') || 'system';
  const resolved = pref === 'dark' || pref === 'light'
    ? pref
    : (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.dataset.theme = resolved;
}

const root = createRoot(document.getElementById("app"));
root.render(<App />);

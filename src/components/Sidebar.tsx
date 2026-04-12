import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import { navigate, setTheme } from "../core/state/ui.js";
import { NAV } from "../constants.js";

function BrandMark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="28" height="28" rx="4" fill="#1C2733" />
      <line x1="4" y1="8" x2="24" y2="8" stroke="#CD4246" strokeOpacity="0.45" strokeWidth="0.75" strokeDasharray="1.5 1.5" />
      <line x1="4" y1="14" x2="24" y2="14" stroke="#238551" strokeOpacity="0.55" strokeWidth="0.75" />
      <line x1="4" y1="20" x2="24" y2="20" stroke="#CD4246" strokeOpacity="0.45" strokeWidth="0.75" strokeDasharray="1.5 1.5" />
      <polyline points="5,15 8,12 11,16 14,13 17,6 20,11 23,14" stroke="#4C90F0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17" cy="6" r="2" fill="#CD4246" />
      <circle cx="5" cy="15" r="1.2" fill="#4C90F0" />
      <circle cx="8" cy="12" r="1.2" fill="#4C90F0" />
      <circle cx="11" cy="16" r="1.2" fill="#4C90F0" />
      <circle cx="14" cy="13" r="1.2" fill="#4C90F0" />
      <circle cx="20" cy="11" r="1.2" fill="#4C90F0" />
      <circle cx="23" cy="14" r="1.2" fill="#4C90F0" />
    </svg>
  );
}

const THEME_CYCLE = { dark: 'light', light: 'system', system: 'dark' };
const THEME_LABEL = { dark: 'Dark', light: 'Light', system: 'Auto' };

function ThemeIcon({ resolved }) {
  if (resolved === 'light') {
    // Sun
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  // Moon (dark + system)
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M13.5 9.5a5.5 5.5 0 0 1-7-7 5.5 5.5 0 1 0 7 7Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Sidebar() {
  const route = useStore(spcStore, (s) => s.route);
  const pipelineStatus = useStore(spcStore, (s) => s.pipeline.status);
  const themePreference = useStore(spcStore, (s) => s.ui.themePreference);
  const themeResolved = useStore(spcStore, (s) => s.ui.themeResolved);

  function handleNavigate(targetRoute) {
    spcStore.setState(navigate(spcStore.getState(), targetRoute));
  }

  function cycleTheme() {
    const next = THEME_CYCLE[themePreference] || 'dark';
    spcStore.setState(setTheme(spcStore.getState(), next));
  }

  return (
    <aside className="sidebar">
      <div className="brand-block">
        <BrandMark />
        <h1>
          Super <span className="brand-spc">SPC</span>
        </h1>
      </div>
      <span className="nav-section-label">Views</span>
      <nav className="nav-list">
        {NAV.map(([r, abbr, label]) => (
          <button
            key={r}
            className={`nav-item ${route === r ? "active" : ""}`}
            onClick={() => handleNavigate(r)}
            type="button"
          >
            <span className="nav-abbr">{abbr}</span>
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <span
          className={`status-dot-live ${pipelineStatus === "ready" ? "" : "offline"}`}
        />
        <span>Pipeline {pipelineStatus}</span>
        <button
          className="theme-toggle"
          onClick={cycleTheme}
          type="button"
          title={`Theme: ${THEME_LABEL[themePreference]}`}
        >
          <ThemeIcon resolved={themeResolved} />
          <span className="theme-label">{THEME_LABEL[themePreference]}</span>
        </button>
      </div>
    </aside>
  );
}

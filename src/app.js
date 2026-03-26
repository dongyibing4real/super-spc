import {
  clearNotice,
  closeContextMenu,
  createFindingFromSelection,
  createInitialState,
  deriveWorkspace,
  exportReport,
  failTransformStep,
  generateReportDraft,
  moveSelection,
  navigate,
  openContextMenu,
  recoverTransformStep,
  selectFinding,
  selectPoint,
  setChartLayout,
  setChallengerStatus,
  toggleChartOption,
  togglePointExclusion,
  toggleReportFailureMode,
  toggleTransform
} from "./core/state.js";
import { createChart } from "./chart/index.js";
import { fmt } from "./chart/utils.js";

const root = document.getElementById("app");
let state = createInitialState();
let charts = { primary: null, challenger: null }; // D3 chart instances

function toneClass(tone) {
  return { critical: "critical", info: "info", neutral: "neutral", positive: "positive", warning: "warning" }[tone] || "neutral";
}

/* pointToSvg and buildPath removed — D3 scales and d3.line() handle this now */

/* ═══ Capability index computation ═══ */
function computeCapability() {
  const vals = state.points.filter(p => !p.excluded).map(p => p.primaryValue);
  const n = vals.length;
  if (n < 2) return { cpk: null, ppk: null };
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const stddev = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
  if (stddev === 0) return { cpk: null, ppk: null };
  const usl = state.limits.usl;
  const lsl = state.limits.lsl;
  const cpu = (usl - mean) / (3 * stddev);
  const cpl = (mean - lsl) / (3 * stddev);
  const cpk = Math.min(cpu, cpl);
  const pp = (usl - lsl) / (6 * stddev);
  const ppu = (usl - mean) / (3 * stddev);
  const ppl = (mean - lsl) / (3 * stddev);
  const ppk = Math.min(ppu, ppl);
  return { cpk: cpk.toFixed(2), ppk: ppk.toFixed(2), cp: pp.toFixed(2) };
}

function capClass(val) {
  const v = parseFloat(val);
  if (v >= 1.33) return "good";
  if (v >= 1.0) return "marginal";
  return "poor";
}

/* ═══ Challenger capability computation ═══ */
function computeChallengerCapability() {
  if (!state.challengerLimits) return { cpk: null, ppk: null };
  const vals = state.points.filter(p => !p.excluded).map(p => p.challengerValue);
  const n = vals.length;
  if (n < 2) return { cpk: null, ppk: null };
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const stddev = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
  if (stddev === 0) return { cpk: null, ppk: null };
  const ucl = state.challengerLimits.ucl;
  const lcl = state.challengerLimits.lcl;
  const cpu = (ucl - mean) / (3 * stddev);
  const cpl = (mean - lcl) / (3 * stddev);
  const cpk = Math.min(cpu, cpl);
  const pp = (ucl - lcl) / (6 * stddev);
  return { cpk: cpk.toFixed(2), ppk: pp.toFixed(2), cp: pp.toFixed(2) };
}

/* ═══ Rule violation detection ═══ */
function detectRuleViolations() {
  const violations = new Map(); // index -> [rule names]
  const pts = state.points;
  const ucl = state.limits.ucl;
  const lcl = state.limits.lcl;
  const cl = state.limits.center;

  pts.forEach((p, i) => {
    if (p.excluded) return;
    const rules = [];

    // Rule 1: Point beyond 3σ (UCL/LCL)
    if (p.primaryValue > ucl || p.primaryValue < lcl) {
      rules.push("R1");
    }

    // Rule 2: 8+ consecutive points on same side of CL
    if (i >= 7) {
      const slice = pts.slice(i - 7, i + 1).filter(q => !q.excluded);
      if (slice.length === 8) {
        const allAbove = slice.every(q => q.primaryValue > cl);
        const allBelow = slice.every(q => q.primaryValue < cl);
        if (allAbove || allBelow) rules.push("R2");
      }
    }

    // Rule 5: 6+ consecutive increasing or decreasing
    if (i >= 5) {
      const slice = pts.slice(i - 5, i + 1).filter(q => !q.excluded);
      if (slice.length === 6) {
        let inc = true, dec = true;
        for (let k = 1; k < slice.length; k++) {
          if (slice[k].primaryValue <= slice[k - 1].primaryValue) inc = false;
          if (slice[k].primaryValue >= slice[k - 1].primaryValue) dec = false;
        }
        if (inc || dec) rules.push("R5");
      }
    }

    if (rules.length > 0) violations.set(i, rules);
  });

  return violations;
}

/* ═══ NAV ICONS (abbreviated labels) ═══ */
const NAV = [
  ["workspace", "WK", "Workspace"],
  ["dataprep", "DP", "Data Prep"],
  ["methodlab", "ML", "Method Lab"],
  ["findings", "FD", "Findings"],
  ["reports", "RP", "Reports"]
];

/* ═══════════════════════════════════════════════════
   SIDEBAR — Palantir icon rail
   ═══════════════════════════════════════════════════ */
function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="brand-block">
        <div class="logo">SP</div>
        <div>
          <h1>Super SPC</h1>
          <span class="muted">v0.1.0</span>
        </div>
      </div>
      <span class="nav-section-label">Views</span>
      <nav class="nav-list">
        ${NAV.map(([route, abbr, label]) => `
          <button class="nav-item ${state.route === route ? "active" : ""}"
            data-action="navigate" data-route="${route}" type="button">
            <span class="nav-abbr">${abbr}</span><span class="nav-label">${label}</span>
          </button>
        `).join("")}
      </nav>
      <div class="sidebar-foot">
        <span class="status-dot-live ${state.pipeline.status === "ready" ? "" : "offline"}"></span>
        <span>Pipeline ${state.pipeline.status}</span>
      </div>
    </aside>
  `;
}

/* ═══════════════════════════════════════════════════
   HEADER — breadcrumb bar
   ═══════════════════════════════════════════════════ */
function renderHeader() {
  return `
    <header class="header-band">
      <div>
        <h2>${state.context.title}</h2>
        <p class="header-context">
          <span>${state.context.fab}</span>
          <span>${state.context.tool}</span>
          <span>${state.context.recipeFamily}</span>
          <span>${state.context.window}</span>
        </p>
      </div>
      <div class="header-badges">
        <span class="status-chip info"><span class="sdot"></span> ${state.context.metric.label} \u00b7 ${state.context.chartType.label}</span>
        <span class="status-chip warning"><span class="sdot"></span> ${state.context.status}</span>
        <span class="status-chip"><span class="sdot" style="background:var(--teal-bright)"></span> ${state.compare.primaryMethod}</span>
      </div>
    </header>
  `;
}

/* ═══════════════════════════════════════════════════
   RECIPE RAIL — JMP-style control panel (vertical)
   Single source of truth for ALL chart configuration
   ═══════════════════════════════════════════════════ */
function renderRecipeRail() {
  const chips = [
    ["Metric", state.context.metric.label, state.context.metric.unit, true],
    ["Subgroup", state.context.subgroup.label, state.context.subgroup.detail],
    ["Phase", state.context.phase.label, state.context.phase.detail],
    ["Chart", state.context.chartType.label, state.context.chartType.detail, true],
  ];
  const chips2 = [
    ["Sigma", state.context.sigma.label, state.context.sigma.detail],
    ["Tests", state.context.tests.label, state.context.tests.detail],
    ["Compare", state.context.compare.label, state.context.compare.detail],
  ];

  return `
    <div class="recipe-rail">
      <div class="recipe-rail-title">Variables</div>
      ${chips.map(([label, value, detail, active]) => `
        <button class="recipe-chip ${active ? "active-chip" : ""}" type="button">
          <span class="chip-label">${label}</span>
          <strong>${value}</strong>
          <span class="chip-detail">${detail}</span>
        </button>
      `).join("")}
      <div class="recipe-divider"></div>
      <div class="recipe-rail-title">Config</div>
      ${chips2.map(([label, value, detail]) => `
        <button class="recipe-chip compact" type="button">
          <span class="chip-label">${label}</span>
          <strong>${value}</strong>
          <span class="chip-detail">${detail}</span>
        </button>
      `).join("")}
      <div class="recipe-divider"></div>
      <div class="recipe-rail-title">Layers</div>
      <div class="overlay-toggles">
        ${[["specLimits","Limits & zones"],["grid","Grid"],["phaseTags","Phases"],["events","Events"],["excludedMarkers","Exclusions"],["confidenceBand","Conf. band"]]
          .map(([k,l]) => `
            <button class="overlay-toggle ${state.chartToggles[k] ? "is-on" : ""}"
              data-action="toggle-chart" data-option="${k}" type="button">
              <span>${l}</span>
              <span class="toggle-dot"></span>
            </button>
          `).join("")}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════
   CONTEXT MENU
   ═══════════════════════════════════════════════════ */
function renderContextMenu() {
  const { x, y } = state.ui.contextMenu;
  const sp = state.points[state.selectedPointIndex];
  return `
    <div class="context-menu" style="left:${x}px;top:${y}px;" role="menu">
      <button data-action="exclude-point" data-index="${state.selectedPointIndex}" type="button">${sp?.excluded ? "Restore point" : "Exclude point"}</button>
      <button data-action="create-finding" type="button">Create finding from selection</button>
      <button data-action="navigate" data-route="methodlab" type="button">Open in Method Lab</button>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════
   CHART — D3-powered light canvas island
   SVG rendering handled by src/chart/ modules
   ═══════════════════════════════════════════════════ */
function renderChartPane(role, method, caps, sp, limits, seriesKey) {
  const val = sp[seriesKey];
  const ooc = val >= limits.ucl || val <= limits.lcl;
  const violations = detectRuleViolations();

  return `
    <div class="chart-pane" data-role="${role}" data-series-key="${seriesKey}">
      <div class="chart-pane-titlebar" data-drag-handle="${role}">
        <span class="grip-icon">⠿</span>
        <span class="method-dot ${role}"></span>
        <span class="pane-role">${role === "primary" ? "Primary" : "Challenger"}</span>
        <strong class="pane-method">${method}</strong>
        ${caps.cpk ? `
          <div class="pane-caps">
            <span class="cap-item"><span class="cap-label">Cpk</span><span class="cap-value ${capClass(caps.cpk)}">${caps.cpk}</span></span>
            <span class="cap-item"><span class="cap-label">Ppk</span><span class="cap-value ${capClass(caps.ppk)}">${caps.ppk}</span></span>
          </div>
        ` : ""}
      </div>
      <div class="chart-stage" id="chart-mount-${role}" tabindex="0" data-chart-focus="true" aria-label="${role} control chart">
        ${role === "primary" && state.ui.contextMenu ? renderContextMenu() : ""}
      </div>
      <div class="chart-readout" data-readout="${role}">
        <div class="readout-group"><span class="readout-label">Lot</span><span class="readout-value">${sp.lot}</span></div>
        <div class="readout-sep"></div>
        <div class="readout-group"><span class="readout-label">Value</span><span class="readout-value">${fmt(val)} ${state.context.metric.unit}</span></div>
        <span class="readout-status" style="color:${sp.excluded ? "var(--amber)" : ooc ? "var(--red)" : "var(--chart-text-2)"}">${sp.excluded ? "Excl" : ooc ? "OOC" : "OK"}</span>
        ${violations.has(state.selectedPointIndex) && role === "primary" ? `
          <div class="readout-sep"></div>
          <div class="readout-group"><span class="readout-label">Rules</span><span class="readout-value" style="color:var(--red)">${violations.get(state.selectedPointIndex).join(", ")}</span></div>
        ` : ""}
      </div>
    </div>
  `;
}

function renderChartArena() {
  const sp = state.points[state.selectedPointIndex];
  const primaryCap = computeCapability();
  const challengerCap = computeChallengerCapability();
  const hasChallenger = state.compare.challengerStatus === "ready";
  const layout = state.chartLayout;
  const arrangement = hasChallenger ? layout.arrangement : "single";

  // Determine pane order based on primaryPosition
  const primaryFirst = layout.primaryPosition === "left" || layout.primaryPosition === "top";

  const primaryPane = renderChartPane("primary", state.compare.primaryMethod, primaryCap, sp, state.limits, "primaryValue");
  const showChallenger = hasChallenger && arrangement !== "single";
  const challengerPane = showChallenger
    ? renderChartPane("challenger", `${state.compare.challengerMethod} ${state.compare.challengerVersion}`, challengerCap, sp, state.challengerLimits, "challengerValue")
    : "";

  // Build inline grid template from splitRatio
  const ratio = layout.splitRatio ?? 0.5;
  const isHoriz = arrangement === "horizontal" || arrangement === "primary-wide" || arrangement === "challenger-wide";
  const isVert = arrangement === "vertical" || arrangement === "primary-tall" || arrangement === "challenger-tall";
  let gridStyle = "";
  if (showChallenger && isHoriz) {
    gridStyle = `grid-template-columns: ${ratio}fr auto ${1 - ratio}fr; grid-template-rows: 1fr;`;
  } else if (showChallenger && isVert) {
    gridStyle = `grid-template-columns: 1fr; grid-template-rows: ${ratio}fr auto ${1 - ratio}fr;`;
  }

  const divider = showChallenger ? `<div class="chart-divider" data-divider="${isHoriz ? "horizontal" : "vertical"}"></div>` : "";

  const firstPane = primaryFirst ? primaryPane : challengerPane;
  const secondPane = primaryFirst ? challengerPane : primaryPane;

  return `
    <section class="chart-card">
      <div class="chart-toolbar">
        <div class="toolbar-title">
          <h3>${state.context.metric.label} — ${state.context.chartType.label}</h3>
          <span class="toolbar-window">${state.context.window}</span>
        </div>
        ${hasChallenger ? `
          <div class="layout-controls">
            <button class="layout-btn ${arrangement === "horizontal" ? "active" : ""}" data-action="set-layout" data-arrangement="horizontal" title="Side by side (50/50)">◫</button>
            <button class="layout-btn ${arrangement === "vertical" ? "active" : ""}" data-action="set-layout" data-arrangement="vertical" title="Stacked (50/50)">◩</button>
            <button class="layout-btn ${arrangement === "primary-wide" ? "active" : ""}" data-action="set-layout" data-arrangement="primary-wide" title="Primary wide (2/3)">◧</button>
            <button class="layout-btn ${arrangement === "primary-tall" ? "active" : ""}" data-action="set-layout" data-arrangement="primary-tall" title="Primary tall (2/3)">⬒</button>
            <button class="layout-btn ${arrangement === "single" ? "active" : ""}" data-action="set-layout" data-arrangement="single" title="Primary only">▣</button>
          </div>
        ` : ""}
      </div>
      <div class="chart-arena" data-layout="${arrangement}" style="${gridStyle}">
        ${firstPane}${divider}${secondPane}
      </div>
      <div class="chart-footer">
        <button class="footer-action" data-action="exclude-point" data-index="${state.selectedPointIndex}" type="button">${sp.excluded ? "Restore" : "Exclude"}</button>
        <button class="footer-action" data-action="create-finding" type="button">Finding</button>
        <button class="footer-action" data-action="navigate" data-route="methodlab" type="button">Method lab</button>
        <span class="chart-a11y">← → navigate · Shift+F10 actions</span>
      </div>
    </section>
  `;
}

/* ═══════════════════════════════════════════════════
   WORKSPACE — 3-column: control panel | chart | evidence
   ═══════════════════════════════════════════════════ */
function renderWorkspace() {
  const workspace = deriveWorkspace(state);

  return `
    <div class="workspace-layout">
      ${renderRecipeRail()}
      <div class="workspace-main">
        ${renderChartArena()}
        <div class="compare-strip">
          ${workspace.compareCards.map(item => `
            <div class="compare-card ${toneClass(item.tone)}">
              <p>${item.label}</p>
              <strong>${item.value}</strong>
            </div>
          `).join("")}
        </div>
        <div class="lineage-strip">
          <div><span>Data</span><strong>2026-03-25 11:12</strong></div>
          <div><span>Limits</span><strong>${state.limits.version}</strong></div>
          <div><span>Transforms</span><strong>${workspace.lineageCount}</strong></div>
          <div><span>Excluded</span><strong>${workspace.excludedCount}</strong></div>
          <div><span>Pipeline</span><strong>${state.pipeline.status}</strong></div>
        </div>
      </div>
      <aside class="evidence-rail">
        <div class="rail-section signal-hero">
          <p class="eyebrow">Signal</p>
          <h3>${workspace.signal.title}</h3>
          <span class="status-chip ${toneClass(workspace.signal.statusTone)}" style="margin-top:4px"><span class="sdot"></span> ${workspace.signal.confidence}</span>
        </div>
        <div class="rail-section">
          <p class="eyebrow">Why it triggered</p>
          <ul class="rail-list">
            ${workspace.whyTriggered.map(item => `<li>${item}</li>`).join("")}
          </ul>
        </div>
        <div class="rail-section">
          <p class="eyebrow">Evidence ledger</p>
          <ul class="evidence-list">
            ${workspace.evidence.map(item => `
              <li class="${item.resolved ? "" : "unresolved"}">
                <span>${item.label}</span>
                <strong>${item.value}</strong>
              </li>
            `).join("")}
          </ul>
        </div>
        <div class="rail-section">
          <p class="eyebrow">Checks</p>
          <ul class="rail-list">
            ${workspace.recommendations.map(item => `<li>${item}</li>`).join("")}
          </ul>
        </div>
        <div class="rail-section">
          <p class="eyebrow">Finding</p>
          <h3>${workspace.activeFinding?.title || "No draft"}</h3>
          <p>${workspace.activeFinding?.summary || "Create from signal."}</p>
          <div class="rail-actions">
            <button data-action="create-finding" type="button">Create</button>
            <button data-action="navigate" data-route="findings" type="button">View all</button>
          </div>
        </div>
      </aside>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════
   DATA PREP
   ═══════════════════════════════════════════════════ */
function renderDataPrep() {
  return `
    <section class="route-panel">
      <div class="route-header">
        <div>
          <h3>Data Prep</h3>
          <p class="muted">Reversible transform pipeline</p>
        </div>
        <span class="status-chip ${state.pipeline.status === "ready" ? "success" : "warning"}">
          <span class="sdot"></span> ${state.pipeline.status === "ready" ? "All valid" : "Partial"}
        </span>
      </div>
      <div class="prep-grid">
        <div class="panel-card">
          <h4>Pipeline Steps</h4>
          <div class="step-list">
            ${state.transforms.map(step => `
              <article class="step-card ${step.status}">
                <div class="step-head">
                  <div>
                    <p class="eyebrow">${step.id}</p>
                    <h5>${step.title}</h5>
                  </div>
                  <span class="status-chip ${step.status === "failed" ? "danger" : step.active ? "info" : "neutral"}">
                    <span class="sdot"></span> ${step.status}
                  </span>
                </div>
                <p class="muted">${step.detail}</p>
                <p class="rescue-note">${step.rescue}</p>
                <div class="step-actions">
                  <button data-action="toggle-transform" data-step-id="${step.id}" type="button" ${step.status === "failed" ? "disabled" : ""}>${step.active ? "Disable" : "Enable"}</button>
                  <button data-action="fail-transform" data-step-id="${step.id}" type="button">Fail</button>
                  <button data-action="recover-transform" data-step-id="${step.id}" type="button">Recover</button>
                </div>
              </article>
            `).join("")}
          </div>
        </div>
        <div class="panel-card dark">
          <h4>Failure & Rescue</h4>
          <ul class="rail-list light">
            <li>Schema mismatch blocks ingest before compute.</li>
            <li>Invalid config retains prior chart result.</li>
            <li>Missing boundaries fall back to unphased mode.</li>
            <li>Every transform remains reversible.</li>
          </ul>
          <div class="meta-grid">
            <div><span>Pipeline</span><strong>${state.pipeline.status}</strong></div>
            <div><span>Rescue</span><strong>${state.pipeline.rescueMode}</strong></div>
            <div><span>Last OK</span><strong>${state.pipeline.lastSuccessfulAt}</strong></div>
          </div>
        </div>
      </div>
    </section>
  `;
}

/* ═══════════════════════════════════════════════════
   METHOD LAB
   ═══════════════════════════════════════════════════ */
function renderMethodLab() {
  const workspace = deriveWorkspace(state);
  return `
    <section class="route-panel">
      <div class="route-header">
        <div>
          <h3>Method Lab</h3>
          <p class="muted">Primary vs challenger comparison</p>
        </div>
        <div class="segmented">
          ${["ready","partial","timeout"].map(s => `
            <button data-action="set-challenger-status" data-status="${s}" type="button" class="${state.compare.challengerStatus === s ? "active" : ""}">${s === "timeout" ? "Timeout" : s.charAt(0).toUpperCase() + s.slice(1)}</button>
          `).join("")}
        </div>
      </div>
      <div class="method-grid">
        <article class="panel-card">
          <p class="eyebrow">Primary</p>
          <h4>${state.compare.primaryMethod}</h4>
          <ul class="metric-stack">
            <li><span>Detection</span><strong>Classical EWMA</strong></li>
            <li><span>Conclusion</span><strong>Shift confirmed</strong></li>
            <li><span>Rule pressure</span><strong>Rule 1 + run</strong></li>
          </ul>
        </article>
        <article class="panel-card dark">
          <p class="eyebrow">Challenger</p>
          <h4>${state.compare.challengerMethod} ${state.compare.challengerVersion}</h4>
          <ul class="metric-stack">
            <li><span>Status</span><strong>${state.compare.challengerStatus}</strong></li>
            <li><span>Detection</span><strong>${workspace.compareCards[1].value}</strong></li>
            <li><span>False alarms</span><strong>${workspace.compareCards[0].value}</strong></li>
          </ul>
        </article>
        <article class="panel-card span-two">
          <h4>Decision Posture</h4>
          <p class="muted">Challenger never silently replaces primary. Review deltas and keep disagreement visible.</p>
          <div class="comparison-lanes">
            ${workspace.compareCards.map(item => `
              <div class="lane-card ${toneClass(item.tone)}"><span>${item.label}</span><strong>${item.value}</strong></div>
            `).join("")}
          </div>
        </article>
      </div>
    </section>
  `;
}

/* ═══════════════════════════════════════════════════
   FINDINGS
   ═══════════════════════════════════════════════════ */
function renderFindings() {
  const af = state.findings.find(f => f.id === state.activeFindingId) || state.findings[0];
  return `
    <section class="route-panel">
      <div class="route-header">
        <div><h3>Findings</h3><p class="muted">Evidence-backed decision drafts</p></div>
        <button class="primary-action" data-action="create-finding" type="button">Create</button>
      </div>
      <div class="findings-grid">
        <div class="finding-queue">
          ${state.findings.map(f => `
            <button class="finding-item ${f.id === af.id ? "active" : ""}"
              data-action="select-finding" data-finding-id="${f.id}" type="button">
              <p class="eyebrow">${f.status}</p>
              <h4>${f.title}</h4>
              <p>${f.summary}</p>
            </button>
          `).join("")}
        </div>
        <article class="finding-detail panel-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <h4>${af.title}</h4>
            <span class="status-chip ${af.severity === "High" ? "danger" : "warning"}"><span class="sdot"></span> ${af.severity}</span>
          </div>
          <p class="muted">${af.summary}</p>
          <div class="meta-grid">
            <div><span>Confidence</span><strong>${af.confidence}</strong></div>
            <div><span>Owner</span><strong>${af.owner}</strong></div>
            <div><span>Status</span><strong>${af.status}</strong></div>
          </div>
          <h5>Citations</h5>
          <ul class="evidence-list light">
            ${af.citations.map(c => `
              <li class="${c.resolved ? "" : "unresolved"}"><span>${c.label}</span><strong>${c.value}</strong></li>
            `).join("")}
          </ul>
        </article>
      </div>
    </section>
  `;
}

/* ═══════════════════════════════════════════════════
   REPORTS
   ═══════════════════════════════════════════════════ */
function renderReports() {
  const af = state.findings.find(f => f.id === state.activeFindingId) || null;
  return `
    <section class="route-panel">
      <div class="route-header">
        <div><h3>Reports</h3><p class="muted">Audit-ready artifacts</p></div>
        <div class="route-actions">
          <button class="primary-action" data-action="generate-report" type="button">Generate</button>
          <button class="btn" data-action="export-report" type="button">Export</button>
          <button class="btn" data-action="toggle-export-failure" type="button">${state.reportExport.failNext ? "Fail queued" : "Queue fail"}</button>
        </div>
      </div>
      <div class="reports-grid">
        <article class="panel-card">
          <h4>Report State</h4>
          <div class="meta-grid">
            <div><span>Finding</span><strong>${af ? af.title : "None"}</strong></div>
            <div><span>Draft</span><strong>${state.reportDraft ? state.reportDraft.id : "\u2014"}</strong></div>
            <div><span>Export</span><strong>${state.reportExport.status}</strong></div>
          </div>
          ${state.reportDraft ? `
            <div class="report-preview">
              <p class="eyebrow">Draft</p>
              <h4>${state.reportDraft.title}</h4>
              <p class="muted">${state.reportDraft.findingTitle}</p>
              <p class="mono" style="color:var(--t-4);margin-top:2px">${state.reportDraft.generatedAt}</p>
              ${state.reportDraft.partial
                ? `<div class="warning-panel"><strong>Blocked</strong><p>${state.reportDraft.unresolved.length} gaps remain.</p></div>`
                : `<div class="success-panel"><strong>Ready</strong><p>All citations resolved.</p></div>`}
            </div>
          ` : `<p class="muted" style="margin-top:6px">Generate from selected finding.</p>`}
        </article>
        <article class="panel-card dark">
          <h4>Export Contract</h4>
          <ul class="rail-list light">
            <li>Blocked when citations unresolved.</li>
            <li>Failure preserves draft, supports retry.</li>
            <li>Artifacts carry full lineage.</li>
            <li>Reports derive from workspace state.</li>
          </ul>
        </article>
      </div>
    </section>
  `;
}

/* ═══════════════════════════════════════════════════
   NOTICE & ROUTER
   ═══════════════════════════════════════════════════ */
function renderNotice() {
  if (!state.ui.notice) return "";
  return `
    <div class="notice ${toneClass(state.ui.notice.tone)}">
      <div><strong>${state.ui.notice.title}</strong> <span class="muted">${state.ui.notice.body}</span></div>
      <button class="ghost-action" data-action="clear-notice" type="button">\u00d7</button>
    </div>
  `;
}

function renderRoute() {
  switch (state.route) {
    case "dataprep": return renderDataPrep();
    case "methodlab": return renderMethodLab();
    case "findings": return renderFindings();
    case "reports": return renderReports();
    default: return renderWorkspace();
  }
}

/** Helper: build update data for a chart pane */
function buildChartData(role) {
  const isPrimary = role === "primary";
  const toggles = { ...state.chartToggles, overlay: false }; // No overlay in split view
  return {
    points: state.points,
    limits: isPrimary ? state.limits : state.challengerLimits,
    phases: state.phases,
    toggles,
    selectedIndex: state.selectedPointIndex,
    violations: isPrimary ? detectRuleViolations() : new Map(),
    capability: isPrimary ? computeCapability() : computeChallengerCapability(),
    metric: state.context.metric,
    chartType: isPrimary ? state.context.chartType : { label: state.compare.challengerMethod },
    seriesKey: isPrimary ? "primaryValue" : "challengerValue",
    seriesType: role,
  };
}

function render() {
  // Detach chart SVGs before innerHTML destroys them
  const savedSvgs = {};
  for (const role of ["primary", "challenger"]) {
    const svgNode = charts[role]?.svg?.node();
    if (svgNode?.parentNode) {
      savedSvgs[role] = svgNode;
      svgNode.remove();
    }
  }

  root.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <main class="main-shell">
        ${renderHeader()}
        ${renderNotice()}
        ${renderRoute()}
      </main>
    </div>
  `;

  // Mount charts if workspace is active
  if (state.route === "workspace") {
    const hasChallenger = state.compare.challengerStatus === "ready";
    const roles = hasChallenger ? ["primary", "challenger"] : ["primary"];

    for (const role of roles) {
      const mount = document.getElementById(`chart-mount-${role}`);
      if (!mount) continue;

      if (savedSvgs[role]) {
        // Reattach preserved SVG to new mount element
        mount.appendChild(savedSvgs[role]);
        // Update container reference so ResizeObserver tracks the new element
        charts[role].remount(mount);
      } else {
        // Destroy orphaned chart instance if it exists (e.g. after "single" mode hid the pane)
        if (charts[role]) { charts[role].destroy(); charts[role] = null; }
        // Create fresh chart instance
        charts[role] = createChart(mount, {
          onSelectPoint: (index) => commitChart(selectPoint(state, index)),
          onContextMenu: role === "primary"
            ? (x, y) => commit(openContextMenu(state, x, y))
            : null,
        });
      }

      // Update with current data
      charts[role].update(buildChartData(role));
    }

    // Deferred re-render: CSS Grid needs a full layout pass before containers have final size.
    // Double rAF: first triggers layout, second reads the settled dimensions.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const role of roles) {
          if (charts[role]) charts[role].update(buildChartData(role));
        }
      });
    });

    // Destroy challenger chart if no longer active
    if (!hasChallenger && charts.challenger) {
      charts.challenger.destroy();
      charts.challenger = null;
    }
  } else {
    // Not on workspace — clean up all charts
    for (const role of ["primary", "challenger"]) {
      if (charts[role]) { charts[role].destroy(); charts[role] = null; }
    }
  }
}

function commit(next) { state = next; render(); }

/**
 * Fast commit for chart-only state changes.
 * Updates the D3 chart + readout bar + footer without touching innerHTML.
 * The sidebar, header, recipe rail, and evidence rail stay untouched.
 */
function commitChart(next) {
  state = next;
  const hasChallenger = state.compare.challengerStatus === "ready";
  const sp = state.points[state.selectedPointIndex];

  // Update all chart instances in-place
  for (const role of ["primary", "challenger"]) {
    if (charts[role]) {
      charts[role].update(buildChartData(role));
    }
  }

  // Surgically update each pane's readout bar
  for (const role of ["primary", "challenger"]) {
    const readout = root.querySelector(`[data-readout="${role}"]`);
    if (!readout) continue;
    const seriesKey = role === "primary" ? "primaryValue" : "challengerValue";
    const limits = role === "primary" ? state.limits : state.challengerLimits;
    const val = sp[seriesKey];
    const ooc = val >= limits.ucl || val <= limits.lcl;
    const violations = detectRuleViolations();
    readout.innerHTML = `
      <div class="readout-group"><span class="readout-label">Lot</span><span class="readout-value">${sp.lot}</span></div>
      <div class="readout-sep"></div>
      <div class="readout-group"><span class="readout-label">Value</span><span class="readout-value">${fmt(val)} ${state.context.metric.unit}</span></div>
      <span class="readout-status" style="color:${sp.excluded ? "var(--amber)" : ooc ? "var(--red)" : "var(--chart-text-2)"}">${sp.excluded ? "Excl" : ooc ? "OOC" : "OK"}</span>
      ${violations.has(state.selectedPointIndex) && role === "primary" ? `
        <div class="readout-sep"></div>
        <div class="readout-group"><span class="readout-label">Rules</span><span class="readout-value" style="color:var(--red)">${violations.get(state.selectedPointIndex).join(", ")}</span></div>
      ` : ""}
    `;
  }

  // Surgically update footer exclude button label
  const excludeBtn = root.querySelector('.footer-action[data-action="exclude-point"]');
  if (excludeBtn) {
    excludeBtn.textContent = sp?.excluded ? "Restore" : "Exclude";
    excludeBtn.dataset.index = state.selectedPointIndex;
  }

  // Update pane title bar capability indices
  for (const role of ["primary", "challenger"]) {
    const paneCaps = root.querySelector(`.chart-pane[data-role="${role}"] .pane-caps`);
    if (!paneCaps) continue;
    const cap = role === "primary" ? computeCapability() : computeChallengerCapability();
    if (cap.cpk) {
      paneCaps.innerHTML = `
        <span class="cap-item"><span class="cap-label">Cpk</span><span class="cap-value ${capClass(cap.cpk)}">${cap.cpk}</span></span>
        <span class="cap-item"><span class="cap-label">Ppk</span><span class="cap-value ${capClass(cap.ppk)}">${cap.ppk}</span></span>
      `;
    }
  }

  // Update toggle states in recipe rail
  root.querySelectorAll(".overlay-toggle").forEach(btn => {
    const key = btn.dataset.option;
    if (key) btn.classList.toggle("is-on", !!state.chartToggles[key]);
  });
}

/**
 * Surgical layout commit — updates grid, divider, pane visibility, and buttons
 * without touching innerHTML. No flash, no SVG detach/reattach.
 */
function commitLayout(next) {
  state = next;
  const arena = root.querySelector(".chart-arena");
  if (!arena) return;

  const hasChallenger = state.compare.challengerStatus === "ready";
  const layout = state.chartLayout;
  const arrangement = hasChallenger ? layout.arrangement : "single";
  const ratio = layout.splitRatio ?? 0.5;
  const isHoriz = arrangement === "horizontal" || arrangement === "primary-wide" || arrangement === "challenger-wide";
  const isVert = arrangement === "vertical" || arrangement === "primary-tall" || arrangement === "challenger-tall";
  const showChallenger = hasChallenger && arrangement !== "single";

  // Update grid template
  if (showChallenger && isHoriz) {
    arena.style.gridTemplateColumns = `${ratio}fr auto ${1 - ratio}fr`;
    arena.style.gridTemplateRows = "1fr";
  } else if (showChallenger && isVert) {
    arena.style.gridTemplateColumns = "1fr";
    arena.style.gridTemplateRows = `${ratio}fr auto ${1 - ratio}fr`;
  } else {
    arena.style.gridTemplateColumns = "1fr";
    arena.style.gridTemplateRows = "1fr";
  }
  arena.dataset.layout = arrangement;

  // Update divider orientation
  const divider = arena.querySelector(".chart-divider");
  if (divider && showChallenger) {
    divider.style.display = "";
    divider.dataset.divider = isHoriz ? "horizontal" : "vertical";
  } else if (divider) {
    divider.style.display = "none";
  }

  // Show/hide challenger pane
  const challengerPane = arena.querySelector('.chart-pane[data-role="challenger"]');
  if (challengerPane) {
    challengerPane.style.display = showChallenger ? "" : "none";
  }

  // Reorder panes if needed (primary first or second)
  const primaryFirst = layout.primaryPosition === "left" || layout.primaryPosition === "top";
  const primaryPane = arena.querySelector('.chart-pane[data-role="primary"]');
  if (primaryPane && challengerPane && divider) {
    if (primaryFirst) {
      arena.insertBefore(primaryPane, arena.firstChild);
      arena.insertBefore(divider, challengerPane);
    } else {
      arena.insertBefore(challengerPane, arena.firstChild);
      arena.insertBefore(divider, primaryPane);
    }
  }

  // Update layout button active states
  root.querySelectorAll(".layout-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.arrangement === arrangement);
  });

  // Let grid settle, then update chart sizing
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      for (const role of ["primary", "challenger"]) {
        if (charts[role]) charts[role].update(buildChartData(role));
      }
    });
  });
}

/* ═══════════════════════════════════════════════════
   EVENT HANDLERS
   ═══════════════════════════════════════════════════ */
root.addEventListener("click", (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) { if (state.ui.contextMenu) commit(closeContextMenu(state)); return; }
  const a = t.dataset.action;
  switch (a) {
    case "navigate":           commit(navigate(state, t.dataset.route)); break;
    case "select-point":       commitChart(selectPoint(state, Number(t.dataset.index))); break;
    case "toggle-chart":       commitChart(toggleChartOption(state, t.dataset.option)); break;
    case "exclude-point":      commitChart(togglePointExclusion(state, Number(t.dataset.index))); break;
    case "toggle-transform":   commit(toggleTransform(state, t.dataset.stepId)); break;
    case "fail-transform":     commit(failTransformStep(state, t.dataset.stepId)); break;
    case "recover-transform":  commit(recoverTransformStep(state, t.dataset.stepId)); break;
    case "set-challenger-status": commit(setChallengerStatus(state, t.dataset.status)); break;
    case "select-finding":     commit(selectFinding(state, t.dataset.findingId)); break;
    case "create-finding":     commit(createFindingFromSelection(state)); break;
    case "generate-report":    commit(generateReportDraft(state)); break;
    case "export-report":      commit(exportReport(state)); break;
    case "toggle-export-failure": commit(toggleReportFailureMode(state)); break;
    case "clear-notice":       commit(clearNotice(state)); break;
    case "set-layout": {
      const arr = t.dataset.arrangement;
      const posMap = { horizontal: "left", vertical: "top", "primary-wide": "left", "primary-tall": "top", single: "left" };
      commitLayout(setChartLayout(state, arr, posMap[arr] || "left"));
      break;
    }
  }
});

root.addEventListener("keydown", (e) => {
  const ch = e.target.closest("[data-chart-focus], [data-action='select-point']");
  if (!ch) return;
  if (e.key === "ArrowRight") { e.preventDefault(); commitChart(moveSelection(state, 1)); }
  if (e.key === "ArrowLeft") { e.preventDefault(); commitChart(moveSelection(state, -1)); }
  if (e.key === "Enter" && e.target.matches("[data-action='select-point']")) { e.preventDefault(); commitChart(selectPoint(state, Number(e.target.dataset.index))); }
  if (e.key === "F10" && e.shiftKey) { e.preventDefault(); commit(openContextMenu(state, 400, 200)); }
  if (e.key === "Escape" && state.ui.contextMenu) commit(closeContextMenu(state));
});

/* ═══ Drag-to-arrange chart panes ═══ */
let dragState = null;

root.addEventListener("pointerdown", (e) => {
  const handle = e.target.closest("[data-drag-handle]");
  if (!handle) return;
  const pane = handle.closest(".chart-pane");
  const arena = pane?.closest(".chart-arena");
  if (!pane || !arena) return;

  e.preventDefault();
  const role = handle.dataset.dragHandle;
  const rect = arena.getBoundingClientRect();

  // Create ghost
  const ghost = pane.cloneNode(true);
  ghost.classList.add("drag-ghost");
  ghost.style.width = pane.offsetWidth + "px";
  ghost.style.height = pane.offsetHeight + "px";
  document.body.appendChild(ghost);

  pane.classList.add("dragging");

  // Create drop zone overlays
  const zones = ["left", "right", "top", "bottom"].map(pos => {
    const zone = document.createElement("div");
    zone.classList.add("drop-zone");
    zone.dataset.dropPosition = pos;
    arena.style.position = "relative";
    arena.appendChild(zone);
    // Position based on direction
    Object.assign(zone.style, {
      position: "absolute", zIndex: "100",
      ...(pos === "left"   ? { left: 0, top: 0, width: "50%", height: "100%" } : {}),
      ...(pos === "right"  ? { right: 0, top: 0, width: "50%", height: "100%" } : {}),
      ...(pos === "top"    ? { left: 0, top: 0, width: "100%", height: "50%" } : {}),
      ...(pos === "bottom" ? { left: 0, bottom: 0, width: "100%", height: "50%" } : {}),
    });
    return zone;
  });

  dragState = { role, pane, arena, ghost, zones, arenaRect: rect };
});

root.addEventListener("pointermove", (e) => {
  if (!dragState) return;
  const { ghost, zones, arenaRect } = dragState;

  // Move ghost
  ghost.style.left = (e.clientX - ghost.offsetWidth / 2) + "px";
  ghost.style.top = (e.clientY - 20) + "px";

  // Detect which zone cursor is over
  const x = e.clientX - arenaRect.left;
  const y = e.clientY - arenaRect.top;
  const w = arenaRect.width;
  const h = arenaRect.height;

  let activePos = null;
  if (x < w * 0.35) activePos = "left";
  else if (x > w * 0.65) activePos = "right";
  else if (y < h * 0.35) activePos = "top";
  else if (y > h * 0.65) activePos = "bottom";

  zones.forEach(z => z.classList.toggle("active", z.dataset.dropPosition === activePos));
  dragState.activePos = activePos;
});

function endDrag() {
  if (!dragState) return;
  const { pane, ghost, zones, activePos, role } = dragState;

  pane.classList.remove("dragging");
  ghost.remove();
  zones.forEach(z => z.remove());

  if (activePos) {
    const arrangement = (activePos === "left" || activePos === "right") ? "horizontal" : "vertical";
    // If dragged role goes to right/bottom, primary position is the opposite
    let primaryPosition;
    if (role === "primary") {
      primaryPosition = activePos;
    } else {
      // Challenger dragged to X → primary goes to opposite
      const opposites = { left: "right", right: "left", top: "bottom", bottom: "top" };
      primaryPosition = opposites[activePos];
    }
    commitLayout(setChartLayout(state, arrangement, primaryPosition));
  }

  dragState = null;
}

root.addEventListener("pointerup", endDrag);
root.addEventListener("pointercancel", endDrag);

/* ═══ Resize divider between chart panes ═══ */
let dividerDrag = null;

root.addEventListener("pointerdown", (e) => {
  const divider = e.target.closest(".chart-divider");
  if (!divider) return;
  e.preventDefault();
  divider.setPointerCapture(e.pointerId);

  const arena = divider.closest(".chart-arena");
  if (!arena) return;
  const rect = arena.getBoundingClientRect();
  const isHoriz = divider.dataset.divider === "horizontal";

  divider.classList.add("active");
  document.body.style.cursor = isHoriz ? "col-resize" : "row-resize";

  dividerDrag = { divider, arena, rect, isHoriz, pointerId: e.pointerId };
});

root.addEventListener("pointermove", (e) => {
  if (!dividerDrag) return;
  const { rect, isHoriz, arena } = dividerDrag;

  let ratio;
  if (isHoriz) {
    ratio = Math.max(0.2, Math.min(0.8, (e.clientX - rect.left) / rect.width));
    arena.style.gridTemplateColumns = `${ratio}fr auto ${1 - ratio}fr`;
  } else {
    ratio = Math.max(0.2, Math.min(0.8, (e.clientY - rect.top) / rect.height));
    arena.style.gridTemplateRows = `${ratio}fr auto ${1 - ratio}fr`;
  }
  dividerDrag.lastRatio = ratio;
});

function endDividerDrag(e) {
  if (!dividerDrag) return;
  const { divider, lastRatio } = dividerDrag;
  divider.classList.remove("active");
  document.body.style.cursor = "";

  // Persist the ratio to state so it survives re-renders
  if (lastRatio != null) {
    state = setChartLayout(state, state.chartLayout.arrangement, state.chartLayout.primaryPosition, lastRatio);
  }
  dividerDrag = null;

  // Trigger chart resize after the grid settles
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      for (const role of ["primary", "challenger"]) {
        if (charts[role]) charts[role].update(buildChartData(role));
      }
    });
  });
}

root.addEventListener("pointerup", endDividerDrag);
root.addEventListener("pointercancel", endDividerDrag);

root.addEventListener("contextmenu", (e) => {
  const ch = e.target.closest(".chart-stage");
  if (!ch) return;
  e.preventDefault();
  const r = root.getBoundingClientRect();
  commit(openContextMenu(state, e.clientX - r.left, e.clientY - r.top));
});

render();

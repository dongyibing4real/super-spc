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
let chart = null; // D3 chart instance

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
        ${[["overlay","Robust overlay"],["specLimits","Limits & zones"],["grid","Grid"],["phaseTags","Phases"],["events","Events"],["excludedMarkers","Exclusions"],["confidenceBand","Conf. band"]]
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
function renderChart() {
  const workspace = deriveWorkspace(state);
  const sp = workspace.selectedPoint;
  const cap = computeCapability();
  const violations = detectRuleViolations();

  return `
    <section class="chart-card">
      <div class="chart-toolbar">
        <h3>${state.context.metric.label} \u2014 ${state.context.chartType.label}</h3>
        ${cap.cpk ? `
          <div class="capability-box">
            <div class="cap-item"><span class="cap-label">Cpk</span><span class="cap-value ${capClass(cap.cpk)}">${cap.cpk}</span></div>
            <div class="cap-item"><span class="cap-label">Ppk</span><span class="cap-value ${capClass(cap.ppk)}">${cap.ppk}</span></div>
            <div class="cap-item"><span class="cap-label">Cp</span><span class="cap-value ${capClass(cap.cp)}">${cap.cp}</span></div>
          </div>
        ` : ""}
      </div>
      <div class="chart-stage" id="chart-mount" tabindex="0" data-chart-focus="true" aria-label="Control chart">
        ${state.ui.contextMenu ? renderContextMenu() : ""}
      </div>
      <div class="chart-readout">
        <div class="readout-group"><span class="readout-label">Lot</span><span class="readout-value">${sp.lot}</span></div>
        <div class="readout-group"><span class="readout-label">Value</span><span class="readout-value">${fmt(sp.primaryValue)} ${state.context.metric.unit}</span></div>
        <div class="readout-group"><span class="readout-label">Phase</span><span class="readout-value">${sp.phaseId}</span></div>
        <div class="readout-group"><span class="readout-label">Status</span><span class="readout-value" style="color:${sp.excluded ? "var(--amber)" : (sp.primaryValue >= state.limits.ucl || sp.primaryValue <= state.limits.lcl) ? "var(--red)" : "var(--chart-text-2)"}">${sp.excluded ? "Excluded" : (sp.primaryValue >= state.limits.ucl || sp.primaryValue <= state.limits.lcl) ? "OOC" : "OK"}</span></div>
        ${violations.has(state.selectedPointIndex) ? `<div class="readout-group"><span class="readout-label">Rules</span><span class="readout-value" style="color:var(--red)">${violations.get(state.selectedPointIndex).join(", ")}</span></div>` : ""}
      </div>
      <div class="chart-footer">
        <button class="footer-action" data-action="exclude-point" data-index="${state.selectedPointIndex}" type="button">${sp.excluded ? "Restore" : "Exclude"}</button>
        <button class="footer-action" data-action="create-finding" type="button">Finding</button>
        <button class="footer-action" data-action="navigate" data-route="methodlab" type="button">Method lab</button>
        <span class="chart-a11y">\u2190 \u2192 navigate \u00b7 Shift+F10 actions</span>
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
        ${renderChart()}
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

function render() {
  // Detach chart SVG before innerHTML destroys it
  const chartSvgNode = chart?.svg?.node();
  const savedSvg = chartSvgNode?.parentNode ? chartSvgNode : null;
  if (savedSvg) savedSvg.remove();

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

  // Reattach or create D3 chart if workspace is active
  if (state.route === "workspace") {
    const mount = document.getElementById("chart-mount");
    if (mount) {
      if (savedSvg) {
        // Reattach the preserved SVG — no teardown/rebuild
        mount.appendChild(savedSvg);
      } else if (!chart) {
        // First time — create new chart
        chart = createChart(mount, {
          onSelectPoint: (index) => commitChart(selectPoint(state, index)),
          onContextMenu: (x, y) => commit(openContextMenu(state, x, y)),
        });
      }

      // Update chart with current state (D3 enter/update/exit — surgical)
      chart.update({
        points: state.points,
        limits: state.limits,
        phases: state.phases,
        toggles: state.chartToggles,
        selectedIndex: state.selectedPointIndex,
        violations: detectRuleViolations(),
        capability: computeCapability(),
        metric: state.context.metric,
        chartType: state.context.chartType,
      });
    }
  } else {
    // Not on workspace — clean up chart if it exists
    if (chart) { chart.destroy(); chart = null; }
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

  // Update D3 chart in-place (surgical SVG updates)
  if (chart) {
    chart.update({
      points: state.points,
      limits: state.limits,
      phases: state.phases,
      toggles: state.chartToggles,
      selectedIndex: state.selectedPointIndex,
      violations: detectRuleViolations(),
      capability: computeCapability(),
      metric: state.context.metric,
      chartType: state.context.chartType,
    });
  }

  // Surgically update readout bar
  const readout = root.querySelector(".chart-readout");
  if (readout) {
    const workspace = deriveWorkspace(state);
    const sp = workspace.selectedPoint;
    const violations = detectRuleViolations();
    const ooc = sp.primaryValue >= state.limits.ucl || sp.primaryValue <= state.limits.lcl;
    readout.innerHTML = `
      <div class="readout-group"><span class="readout-label">Lot</span><span class="readout-value">${sp.lot}</span></div>
      <div class="readout-group"><span class="readout-label">Value</span><span class="readout-value">${fmt(sp.primaryValue)} ${state.context.metric.unit}</span></div>
      <div class="readout-group"><span class="readout-label">Phase</span><span class="readout-value">${sp.phaseId}</span></div>
      <div class="readout-group"><span class="readout-label">Status</span><span class="readout-value" style="color:${sp.excluded ? "var(--amber)" : ooc ? "var(--red)" : "var(--chart-text-2)"}">${sp.excluded ? "Excluded" : ooc ? "OOC" : "OK"}</span></div>
      ${violations.has(state.selectedPointIndex) ? `<div class="readout-group"><span class="readout-label">Rules</span><span class="readout-value" style="color:var(--red)">${violations.get(state.selectedPointIndex).join(", ")}</span></div>` : ""}
    `;
  }

  // Surgically update footer exclude button label
  const excludeBtn = root.querySelector('.footer-action[data-action="exclude-point"]');
  if (excludeBtn) {
    const sp = state.points[state.selectedPointIndex];
    excludeBtn.textContent = sp?.excluded ? "Restore" : "Exclude";
    excludeBtn.dataset.index = state.selectedPointIndex;
  }

  // Update capability indices
  const capBox = root.querySelector(".capability-box");
  if (capBox) {
    const cap = computeCapability();
    if (cap.cpk) {
      capBox.innerHTML = `
        <div class="cap-item"><span class="cap-label">Cpk</span><span class="cap-value ${capClass(cap.cpk)}">${cap.cpk}</span></div>
        <div class="cap-item"><span class="cap-label">Ppk</span><span class="cap-value ${capClass(cap.ppk)}">${cap.ppk}</span></div>
        <div class="cap-item"><span class="cap-label">Cp</span><span class="cap-value ${capClass(cap.cp)}">${cap.cp}</span></div>
      `;
    }
  }

  // Update toggle states in recipe rail
  root.querySelectorAll(".overlay-toggle").forEach(btn => {
    const key = btn.dataset.option;
    if (key) btn.classList.toggle("is-on", !!state.chartToggles[key]);
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

root.addEventListener("contextmenu", (e) => {
  const ch = e.target.closest(".chart-stage");
  if (!ch) return;
  e.preventDefault();
  const r = root.getBoundingClientRect();
  commit(openContextMenu(state, e.clientX - r.left, e.clientY - r.top));
});

render();

import { deriveFindings } from "../core/findings-engine.js";
import { CHART_TYPE_LABELS, capClass } from "../helpers.js";

const CATEGORY_LABELS = {
  stability: "Stability",
  capability: "Capability",
  statistical: "Statistical",
  pattern: "Pattern",
};

const STANDARDS_FIELDS = [
  { key: "cpkThreshold", label: "Cpk Good" },
  { key: "cpkMarginal", label: "Cpk Marginal" },
  { key: "maxOocPercent", label: "Max OOC %" },
  { key: "maxOocCount", label: "Max OOC Count" },
  { key: "centeringRatio", label: "Centering Ratio" },
  { key: "runsZThreshold", label: "Runs Z" },
  { key: "zoneDeviation", label: "Zone Deviation" },
];

// ─── Chart Rail ─────────────────────────────────────

function renderChartRail(state, activeChartId) {
  const cards = state.chartOrder.map(id => {
    const s = state.charts[id];
    const label = s?.context?.chartType?.label || CHART_TYPE_LABELS[s?.params?.chart_type] || id;
    const roleLabel = CHART_TYPE_LABELS[s?.params?.chart_type] || id;
    const isActive = id === activeChartId;
    const violations = s?.violations || [];
    const oocCount = violations.reduce((sum, v) => sum + v.indices.length, 0);
    const cap = s?.capability;
    const cpkStr = cap?.cpk != null ? cap.cpk.toFixed(2) : "\u2014";

    return `
      <button class="chart-rail-card ${isActive ? "active" : ""}"
        data-action="switch-findings-chart" data-chart-id="${id}" type="button">
        <p class="eyebrow">${roleLabel}</p>
        <div class="chart-rail-card-name">${label}</div>
        <div class="chart-rail-card-stats">
          <span class="${oocCount > 0 ? "danger" : "good"}">OOC ${oocCount}</span>
          <span>Cpk ${cpkStr}</span>
        </div>
      </button>`;
  }).join("");

  return `
    <div class="panel-card findings-chart-rail">
      <h4>Charts</h4>
      <div class="chart-rail-list">${cards}</div>
    </div>`;
}

// ─── Header Bar ─────────────────────────────────────

function renderHeaderBar(health, slot, stats, chartId) {
  const chartLabel = slot?.context?.chartType?.label || "\u2014";
  const params = slot?.params || {};

  const cells = [
    { label: "Cpk", value: health.cpk, cls: health.cpkSeverity },
    { label: "OOC", value: health.oocCount, cls: health.oocCount > 0 ? "danger" : "good" },
    { label: "N", value: health.n, cls: "" },
  ];

  if (stats) {
    cells.push(
      { label: "Mean", value: stats.mean, cls: "" },
      { label: "\u03C3 Within", value: stats.sigmaWithin, cls: "" },
      { label: "\u03C3 Overall", value: stats.std, cls: "" },
      { label: "Min", value: stats.min, cls: "" },
      { label: "Max", value: stats.max, cls: "" },
      { label: "Range", value: stats.range, cls: "" },
      { label: "Median", value: stats.median, cls: "" },
    );
  }

  return `
    <div class="findings-header-bar">
      <div class="health-badge ${health.severity}">
        <span class="sdot"></span>
        ${health.label}
      </div>
      <div class="header-bar-metrics">
        ${cells.map(c => `
          <div class="header-bar-cell">
            <span class="eyebrow">${c.label}</span>
            <strong class="mono ${c.cls}">${c.value}</strong>
          </div>
        `).join("")}
      </div>
      <div class="header-bar-specs">
        <div class="header-bar-cell">
          <span class="eyebrow">LSL</span>
          <input type="number" class="standard-input" data-spec-key="lsl"
            data-chart-id="${chartId}" value="${params.lsl ?? ""}" step="any" placeholder="\u2014" />
        </div>
        <div class="header-bar-cell">
          <span class="eyebrow">Target</span>
          <input type="number" class="standard-input" data-spec-key="target"
            data-chart-id="${chartId}" value="${params.target ?? ""}" step="any" placeholder="\u2014" />
        </div>
        <div class="header-bar-cell">
          <span class="eyebrow">USL</span>
          <input type="number" class="standard-input" data-spec-key="usl"
            data-chart-id="${chartId}" value="${params.usl ?? ""}" step="any" placeholder="\u2014" />
        </div>
      </div>
      <div class="header-bar-chart">
        <strong>${chartLabel}</strong>
      </div>
    </div>
  `;
}

// ─── Standards Bar ──────────────────────────────────

function renderStandardsBar(state) {
  const std = state.findingsStandards || {};
  const expanded = state.findingsStandardsExpanded;

  return `
    <div class="findings-standards-bar">
      <button class="standards-toggle" data-action="toggle-findings-standards" type="button">
        <span class="eyebrow">Standards</span>
        <span class="chevron ${expanded ? "open" : ""}">\u25BE</span>
      </button>
      ${expanded ? `
        <div class="standards-inputs">
          ${STANDARDS_FIELDS.map(f => `
            <div class="standard-field">
              <span class="eyebrow">${f.label}</span>
              <input type="number" class="standard-input" data-standard-key="${f.key}"
                value="${std[f.key] ?? ""}" step="any" min="0" />
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

// ─── Finding Card ───────────────────────────────────

function renderFindingCard(f, isActive) {
  return `
    <button class="finding-card ${isActive ? "active" : ""} ${f.severity}"
      data-action="select-structural-finding" data-finding-id="${f.id}" type="button">
      <div class="finding-card-head">
        <span class="finding-severity-dot ${f.severity}"></span>
        <h4>${f.title}</h4>
      </div>
      ${f.metric ? `<span class="finding-card-metric mono">${f.metric.label}: ${f.metric.value}</span>` : ""}
    </button>
  `;
}

// ─── Detail Panel: Shared Header ────────────────────

function detailHeader(finding) {
  return `
    <div class="finding-detail-head">
      <h4>${finding.title}</h4>
      <span class="health-badge ${finding.severity}"><span class="sdot"></span>${finding.severity}</span>
    </div>
    <p class="finding-detail-text">${finding.detail}</p>
    ${finding.metric ? `
      <div class="finding-metric-hero">
        <span class="eyebrow">${finding.metric.label}</span>
        <strong class="mono data-large">${finding.metric.value}</strong>
      </div>
    ` : ""}
  `;
}

function indexChips(indices) {
  if (!indices || indices.length === 0) return "";
  const capped = indices.slice(0, 30);
  return `
    <div class="finding-detail-section">
      <span class="eyebrow">Affected Points</span>
      <div class="index-chips">
        ${capped.map(i => `<span class="index-chip mono">${i}</span>`).join("")}
        ${indices.length > 30 ? `<span class="index-chip muted">+${indices.length - 30} more</span>` : ""}
      </div>
    </div>
  `;
}

// ─── Type-Specific Renderers ────────────────────────

function renderStabilityDetail(f) {
  const ctx = f.context || {};
  const violations = ctx.violations || [];

  const byRule = new Map();
  for (const v of violations) {
    if (!byRule.has(v.testId)) byRule.set(v.testId, { testId: v.testId, description: v.description, count: 0 });
    byRule.get(v.testId).count += v.indices.length;
  }
  const rows = [...byRule.values()];

  const oocPct = ctx.oocPctRaw ?? 0;
  const barWidth = Math.min(oocPct, 100);

  return `
    <article class="finding-detail-panel panel-card">
      ${detailHeader(f)}
      ${rows.length > 0 ? `
        <div class="finding-detail-section">
          <span class="eyebrow">Rule Breakdown</span>
          <table class="finding-rule-table">
            <thead><tr><th>Rule</th><th>Description</th><th>Count</th></tr></thead>
            <tbody>${rows.map(r => `
              <tr><td class="mono">R${r.testId}</td><td>${r.description}</td><td class="mono">${r.count}</td></tr>
            `).join("")}</tbody>
          </table>
        </div>
      ` : ""}
      <div class="finding-detail-section">
        <span class="eyebrow">OOC Rate</span>
        <div class="finding-bar-track">
          <div class="finding-bar-fill ${oocPct > 0 ? "danger" : "good"}" style="width: ${barWidth}%"></div>
        </div>
        <div class="finding-bar-labels">
          <span class="mono">${ctx.oocRate || "0%"}</span>
          <span class="muted">threshold: ${ctx.maxOocPercent ?? 2}% / ${ctx.maxOocCount ?? 3} pts</span>
        </div>
      </div>
    </article>
  `;
}

function renderViolationDetail(f) {
  const ctx = f.context || {};
  return `
    <article class="finding-detail-panel panel-card">
      ${detailHeader(f)}
      ${indexChips(ctx.indices)}
    </article>
  `;
}

function renderPhaseDetail(f) {
  const ctx = f.context || {};
  const fmt = v => v != null ? Number(v).toFixed(4) : "\u2014";
  return `
    <article class="finding-detail-panel panel-card">
      ${detailHeader(f)}
      <div class="finding-detail-section">
        <span class="eyebrow">Phase Comparison</span>
        <div class="finding-comparison-row">
          <div class="finding-compare-col">
            <span class="eyebrow">${ctx.fromPhase || "Before"}</span>
            <div class="header-bar-cell"><span class="eyebrow">Mean</span><strong class="mono">${fmt(ctx.prevMean)}</strong></div>
            <div class="header-bar-cell"><span class="eyebrow">\u03C3</span><strong class="mono">${fmt(ctx.prevSigma)}</strong></div>
          </div>
          <div class="finding-compare-arrow">\u2192</div>
          <div class="finding-compare-col">
            <span class="eyebrow">${ctx.toPhase || "After"}</span>
            <div class="header-bar-cell"><span class="eyebrow">Mean</span><strong class="mono">${fmt(ctx.currMean)}</strong></div>
            <div class="header-bar-cell"><span class="eyebrow">\u03C3</span><strong class="mono">${fmt(ctx.currSigma)}</strong></div>
          </div>
        </div>
        <div class="finding-context-grid">
          <div><span class="eyebrow">Shift in \u03C3</span><strong class="mono">${ctx.shiftInSigmas ?? "\u2014"}</strong></div>
          <div><span class="eyebrow">\u03C3 Change</span><strong class="mono">${ctx.sigmaChange ?? "\u2014"}%</strong></div>
        </div>
      </div>
    </article>
  `;
}

function renderCapabilityDetail(f) {
  const ctx = f.context || {};
  const threshold = ctx.threshold ?? 1.33;
  const marginal = ctx.marginal ?? 1.0;

  function capCell(label, val) {
    if (val == null) return `<div class="finding-cap-cell"><span class="eyebrow">${label}</span><strong class="mono muted">\u2014</strong></div>`;
    const cls = capClass(val, threshold, marginal);
    return `<div class="finding-cap-cell"><span class="eyebrow">${label}</span><strong class="mono ${cls}">${val.toFixed(2)}</strong></div>`;
  }

  const cpk = ctx.cpk ?? null;
  const barPct = cpk != null ? Math.min((cpk / (threshold * 1.5)) * 100, 100) : 0;
  const threshPct = (threshold / (threshold * 1.5)) * 100;

  return `
    <article class="finding-detail-panel panel-card">
      ${detailHeader(f)}
      <div class="finding-detail-section">
        <span class="eyebrow">Capability Indices</span>
        <div class="finding-2x2-grid">
          ${capCell("Cp", ctx.cp)}
          ${capCell("Cpk", ctx.cpk)}
          ${capCell("Pp", ctx.pp)}
          ${capCell("Ppk", ctx.ppk)}
        </div>
      </div>
      ${cpk != null ? `
        <div class="finding-detail-section">
          <span class="eyebrow">Cpk vs Standard (${threshold})</span>
          <div class="finding-threshold-track">
            <div class="finding-threshold-fill ${capClass(cpk, threshold, marginal)}" style="width: ${barPct}%"></div>
            <div class="finding-threshold-mark" style="left: ${threshPct}%"></div>
          </div>
        </div>
      ` : ""}
    </article>
  `;
}

function renderCenteringDetail(f) {
  const ctx = f.context || {};
  const hasSpecs = ctx.usl != null && ctx.lsl != null && ctx.mean != null;

  let centeringBar = "";
  if (hasSpecs) {
    const range = ctx.usl - ctx.lsl;
    const meanPct = range > 0 ? ((ctx.mean - ctx.lsl) / range * 100) : 50;
    const clampedPct = Math.max(2, Math.min(98, meanPct));
    centeringBar = `
      <div class="finding-detail-section">
        <span class="eyebrow">Mean Position</span>
        <div class="finding-centering-bar">
          <span class="centering-label lsl">LSL ${Number(ctx.lsl).toFixed(2)}</span>
          <div class="centering-track">
            <div class="centering-mean" style="left: ${clampedPct}%"></div>
          </div>
          <span class="centering-label usl">USL ${Number(ctx.usl).toFixed(2)}</span>
        </div>
      </div>
    `;
  }

  return `
    <article class="finding-detail-panel panel-card">
      ${detailHeader(f)}
      <div class="finding-context-grid">
        <div><span class="eyebrow">Cp</span><strong class="mono">${ctx.cp?.toFixed(2) ?? "\u2014"}</strong></div>
        <div><span class="eyebrow">Cpk</span><strong class="mono">${ctx.cpk?.toFixed(2) ?? "\u2014"}</strong></div>
        <div><span class="eyebrow">Standard</span><strong class="mono">${ctx.centeringStandard != null ? (ctx.centeringStandard * 100).toFixed(0) + "%" : "\u2014"}</strong></div>
      </div>
      ${centeringBar}
    </article>
  `;
}

function renderStatisticalDetail(f) {
  const ctx = f.context || {};
  const rows = [
    ["N", ctx.n], ["Mean", ctx.mean], ["\u03C3 Within", ctx.sigmaWithin],
    ["\u03C3 Overall", ctx.std], ["Min", ctx.min], ["Max", ctx.max],
    ["Range", ctx.range], ["Median", ctx.median],
  ];
  if (ctx.subgroupCount != null) rows.push(["Subgroups", ctx.subgroupCount]);

  return `
    <article class="finding-detail-panel panel-card">
      ${detailHeader(f)}
      <div class="finding-detail-section">
        <table class="finding-stats-table">
          <tbody>${rows.map(([label, val]) => `
            <tr><td class="eyebrow">${label}</td><td class="mono">${val ?? "\u2014"}</td></tr>
          `).join("")}</tbody>
        </table>
      </div>
    </article>
  `;
}

function renderSigmaMethodDetail(f) {
  const ctx = f.context || {};
  return `
    <article class="finding-detail-panel panel-card">
      ${detailHeader(f)}
      <div class="finding-context-grid">
        <div><span class="eyebrow">Method</span><strong>${ctx.label || ctx.method || "\u2014"}</strong></div>
        <div><span class="eyebrow">\u03C3\u0302</span><strong class="mono">${ctx.sigmaHat?.toFixed(4) ?? "\u2014"}</strong></div>
        <div><span class="eyebrow">N Used</span><strong class="mono">${ctx.nUsed ?? "\u2014"}</strong></div>
      </div>
    </article>
  `;
}

function renderZoneDetail(f) {
  const ctx = f.context || {};
  const z = ctx;
  const exp = ctx.expected || {};

  const segments = [
    { label: "C", pct: z.zoneC?.pct ?? 0, cls: "zone-c" },
    { label: "B", pct: z.zoneB?.pct ?? 0, cls: "zone-b" },
    { label: "A", pct: z.zoneA?.pct ?? 0, cls: "zone-a" },
    { label: "Beyond", pct: z.beyond?.pct ?? 0, cls: "zone-beyond" },
  ];

  return `
    <article class="finding-detail-panel panel-card">
      ${detailHeader(f)}
      <div class="finding-detail-section">
        <span class="eyebrow">Distribution</span>
        <div class="finding-zone-bar">
          ${segments.map(s => `<div class="finding-zone-segment ${s.cls}" style="width: ${Math.max(parseFloat(s.pct) || 0, 1)}%"><span>${s.label}</span></div>`).join("")}
        </div>
        <table class="finding-rule-table">
          <thead><tr><th>Zone</th><th>Actual</th><th>Expected</th><th>Count</th></tr></thead>
          <tbody>
            <tr><td>C (\u00B11\u03C3)</td><td class="mono">${z.zoneC?.pct ?? "\u2014"}%</td><td class="mono">${exp.c ?? "68.3"}%</td><td class="mono">${z.zoneC?.count ?? "\u2014"}</td></tr>
            <tr><td>B (1-2\u03C3)</td><td class="mono">${z.zoneB?.pct ?? "\u2014"}%</td><td class="mono">${exp.b ?? "27.2"}%</td><td class="mono">${z.zoneB?.count ?? "\u2014"}</td></tr>
            <tr><td>A (2-3\u03C3)</td><td class="mono">${z.zoneA?.pct ?? "\u2014"}%</td><td class="mono">${exp.a ?? "4.3"}%</td><td class="mono">${z.zoneA?.count ?? "\u2014"}</td></tr>
            <tr><td>Beyond (>3\u03C3)</td><td class="mono">${z.beyond?.pct ?? "\u2014"}%</td><td class="mono">${exp.beyond ?? "0.3"}%</td><td class="mono">${z.beyond?.count ?? "\u2014"}</td></tr>
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderRunsDetail(f) {
  const ctx = f.context || {};
  return `
    <article class="finding-detail-panel panel-card">
      ${detailHeader(f)}
      <div class="finding-context-grid">
        <div><span class="eyebrow">Observed Runs</span><strong class="mono">${ctx.runs ?? "\u2014"}</strong></div>
        <div><span class="eyebrow">Expected Runs</span><strong class="mono">${ctx.expected ?? "\u2014"}</strong></div>
        <div><span class="eyebrow">Z-Score</span><strong class="mono">${ctx.z ?? "\u2014"}</strong></div>
        <div><span class="eyebrow">Z Threshold</span><strong class="mono">\u00B1${ctx.zThreshold ?? "1.96"}</strong></div>
        <div><span class="eyebrow">Above CL</span><strong class="mono">${ctx.above ?? "\u2014"}</strong></div>
        <div><span class="eyebrow">Below CL</span><strong class="mono">${ctx.below ?? "\u2014"}</strong></div>
      </div>
      <div class="finding-detail-section">
        <span class="eyebrow">Interpretation</span>
        <p class="finding-detail-text">${ctx.interpretation || "\u2014"}</p>
      </div>
    </article>
  `;
}

function renderPatternDetail(f) {
  const ctx = f.context || {};
  return `
    <article class="finding-detail-panel panel-card">
      ${detailHeader(f)}
      ${indexChips(ctx.indices)}
    </article>
  `;
}

function renderGenericDetail(f) {
  const ctx = f.context || {};
  const entries = Object.entries(ctx).filter(([, val]) => val != null && typeof val !== "object");
  return `
    <article class="finding-detail-panel panel-card">
      ${detailHeader(f)}
      ${entries.length > 0 ? `
        <div class="finding-context-grid">
          ${entries.map(([key, val]) => {
            const label = key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
            return `<div><span class="eyebrow">${label}</span><strong class="mono">${val}</strong></div>`;
          }).join("")}
        </div>
      ` : ""}
    </article>
  `;
}

// ─── Detail Panel Dispatcher ────────────────────────

const DETAIL_RENDERERS = {
  stabilityVerdict: renderStabilityDetail,
  violationSummary: renderViolationDetail,
  phaseComparison: renderPhaseDetail,
  capabilityVerdict: renderCapabilityDetail,
  centeringAssessment: renderCenteringDetail,
  statisticalSummary: renderStatisticalDetail,
  sigmaMethodNote: renderSigmaMethodDetail,
  zoneDistribution: renderZoneDetail,
  runsDetection: renderRunsDetail,
  trendDetection: renderPatternDetail,
  stratificationDetection: renderPatternDetail,
  mixtureDetection: renderPatternDetail,
};

function renderDetailPanel(finding) {
  if (!finding) {
    return `
      <article class="finding-detail-panel panel-card">
        <p class="muted">No findings generated. Load a dataset and run analysis.</p>
      </article>
    `;
  }
  const renderer = DETAIL_RENDERERS[finding.generatorId] || renderGenericDetail;
  return renderer(finding);
}

// ─── AI Section ─────────────────────────────────────

function renderAISection() {
  return `
    <div class="findings-ai-section">
      <div class="findings-ai-header">
        <div>
          <span class="eyebrow">AI Agent</span>
          <p>Deeper pattern analysis, root cause hypotheses, and recommended actions.</p>
        </div>
        <button class="btn" disabled type="button">Connect</button>
      </div>
      <div class="findings-ai-cards">
        <div class="ai-placeholder-card">
          <span class="eyebrow">Root Cause</span>
          <p class="muted">AI-generated root cause hypotheses will appear here.</p>
        </div>
        <div class="ai-placeholder-card">
          <span class="eyebrow">Recommendations</span>
          <p class="muted">Actionable next steps based on pattern analysis.</p>
        </div>
        <div class="ai-placeholder-card">
          <span class="eyebrow">Correlation</span>
          <p class="muted">Cross-chart and cross-variable insights.</p>
        </div>
      </div>
    </div>
  `;
}

// ─── Helpers ────────────────────────────────────────

function getStatsContext(state) {
  const f = (state.structuralFindings || []).find(f => f.generatorId === "statisticalSummary");
  return f?.context || null;
}

// ─── Layout Exports ─────────────────────────────────

/** Morphable content area — everything EXCEPT the standards bar inputs. */
export function renderFindingsContent(state) {
  const derived = deriveFindings(state);
  const activeChartId = state.findingsChartId || state.chartOrder[0];
  const slot = state.charts[activeChartId];
  const stats = getStatsContext(state);
  const categories = ["stability", "capability", "statistical", "pattern"];

  return `
    <div class="findings-content">
      ${renderHeaderBar(derived.health, slot, stats, activeChartId)}

      <div class="findings-dashboard-grid">
        <div class="findings-card-column">
          ${categories.map(cat => {
            const items = derived.grouped[cat] || [];
            if (items.length === 0) return "";
            return `
              <div class="finding-category-group">
                <span class="eyebrow">${CATEGORY_LABELS[cat]}</span>
                ${items.map(f => renderFindingCard(f, derived.selected?.id === f.id)).join("")}
              </div>
            `;
          }).join("")}
        </div>

        <div class="findings-detail-column">
          ${renderDetailPanel(derived.selected)}
        </div>
      </div>

      ${renderAISection()}
    </div>
  `;
}

export function renderFindingsLayout(state) {
  return `
    <div class="findings-layout">
      ${renderChartRail(state, state.findingsChartId || state.chartOrder[0])}

      <div class="findings-main">
        ${renderStandardsBar(state)}
        ${renderFindingsContent(state)}
      </div>
    </div>
  `;
}

export function renderFindings(state) {
  const derived = deriveFindings(state);

  return `
    <section class="route-panel">
      <div class="route-header">
        <div><h3>Findings</h3><p class="muted">Evidence-backed process health assessment</p></div>
        <div class="route-actions">
          <span class="findings-count-badge">
            ${derived.dangerCount > 0 ? `<span class="danger">${derived.dangerCount} critical</span>` : ""}
            ${derived.warningCount > 0 ? `<span class="warning">${derived.warningCount} warning</span>` : ""}
          </span>
        </div>
      </div>

      ${renderFindingsLayout(state)}
    </section>
  `;
}

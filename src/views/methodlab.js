import { buildMethodLabComparison, buildDisagreements } from "../core/state.js";
import { capClass } from "../helpers.js";

function fmt(v, decimals = 4) {
  if (v == null || isNaN(v)) return "\u2014";
  return Number(v).toFixed(decimals);
}

// ─── Atomic renderers ───────────────────────────────

/** A single metric cell: eyebrow label + monospace value. */
function metricCell(label, value, tone) {
  const cls = tone ? ` ${tone}` : "";
  return `<div class="ml-cell${cls}">
    <span class="eyebrow">${label}</span>
    <strong class="mono">${value}</strong>
  </div>`;
}

/** Capability metric with grade coloring. */
function capMetric(label, value) {
  if (value == null) return metricCell(label, "\u2014");
  return metricCell(label, value.toFixed(2), `cap-${capClass(value)}`);
}

/** Rule breakdown as compact chips: "R1: 3pts  R2: 1pt" */
function ruleChips(breakdown) {
  if (!breakdown || breakdown.length === 0) return `<span class="muted">None</span>`;
  return breakdown.map(r =>
    `<span class="ml-rule-chip">R${r.testId}: ${r.count}pt${r.count !== 1 ? "s" : ""}</span>`
  ).join("");
}

// ─── Section renderers ──────────────────────────────

/** Header bar: key metrics at a glance (like findings header bar pattern). */
function renderHeaderBar(charts) {
  const totalOOC = charts.reduce((s, c) => s + c.oocCount, 0);
  const totalRules = charts.reduce((s, c) => s + c.ruleCount, 0);
  const anyUnstable = totalOOC > 0;
  const badgeClass = anyUnstable ? "warning" : "good";
  const badgeLabel = anyUnstable ? `${totalOOC} OOC` : "Stable";

  const cells = [
    metricCell("Charts", String(charts.length), ""),
    metricCell("Total OOC", String(totalOOC), totalOOC > 0 ? "danger" : "good"),
    metricCell("Rules Fired", String(totalRules), totalRules > 0 ? "warning" : "good"),
  ];

  // Show Cpk if any chart has it
  const cpks = charts.filter(c => c.cpk != null);
  if (cpks.length > 0) {
    const worst = Math.min(...cpks.map(c => c.cpk));
    const grade = capClass(worst);
    cells.push(metricCell("Worst Cpk", worst.toFixed(2), `cap-${grade}`));
  }

  return `
    <div class="ml-header-bar">
      <div class="health-badge ${badgeClass}"><span class="sdot"></span>${badgeLabel}</div>
      <div class="ml-header-metrics">${cells.join("")}</div>
    </div>`;
}

/** One chart column inside a section card. */
function chartColumn(chart, sectionRows) {
  const focusCls = chart.isFocused ? " ml-focused-col" : "";
  return `
    <div class="ml-chart-col${focusCls}">
      <div class="ml-col-head">
        <strong class="mono">${chart.chartType}</strong>
      </div>
      <div class="ml-col-body">${sectionRows}</div>
    </div>`;
}

/** A structured section: eyebrow title + columns side by side. */
function renderSection(title, charts, rowDefs) {
  const columns = charts.map(c => {
    const rows = rowDefs.map(def => {
      const value = def.value(c);
      const tone = def.tone ? def.tone(c) : "";
      return metricCell(def.label, value, tone);
    }).join("");
    return chartColumn(c, rows);
  }).join("");

  return `
    <div class="ml-section-card">
      <span class="eyebrow">${title}</span>
      <div class="ml-columns">${columns}</div>
    </div>`;
}

/** Configuration section — method identity. */
function renderConfig(charts) {
  return renderSection("Configuration", charts, [
    { label: "Chart Type", value: c => c.chartType },
    { label: "Sigma Method", value: c => c.sigmaMethod },
    { label: "K-Sigma", value: c => fmt(c.kSigma, 1) },
    { label: "Subgroup", value: c => c.subgroup },
    { label: "Phase Column", value: c => c.phaseColumn },
    { label: "Nelson Rules", value: c => c.enabledRules.length > 0 ? c.enabledRules.join(", ") : "Default" },
  ]);
}

/** Results section — limits and sigma. */
function renderResults(charts) {
  return renderSection("Results", charts, [
    { label: "UCL", value: c => fmt(c.ucl) },
    { label: "Center Line", value: c => fmt(c.center) },
    { label: "LCL", value: c => fmt(c.lcl) },
    { label: "\u03C3\u0302 (sigma hat)", value: c => fmt(c.sigmaHat) },
    { label: "Limits Scope", value: c => c.limitsScope },
    { label: "Phases", value: c => String(c.phaseCount) },
  ]);
}

/** Detection section — violations and rules. */
function renderDetection(charts) {
  const columns = charts.map(c => {
    const rows = [
      metricCell("OOC Points", String(c.oocCount), c.oocCount > 0 ? "danger" : "good"),
      metricCell("Rules Triggered", String(c.ruleCount), c.ruleCount > 0 ? "warning" : "good"),
    ].join("");

    const chips = `<div class="ml-cell"><span class="eyebrow">Rule Breakdown</span><div class="ml-rule-chips">${ruleChips(c.ruleBreakdown)}</div></div>`;

    return chartColumn(c, rows + chips);
  }).join("");

  return `
    <div class="ml-section-card">
      <span class="eyebrow">Detection</span>
      <div class="ml-columns">${columns}</div>
    </div>`;
}

/** Capability section — Cpk/Ppk with grade colors. */
function renderCapability(charts) {
  const hasAnyCap = charts.some(c => c.cpk != null);

  if (!hasAnyCap) {
    return `
      <div class="ml-section-card">
        <span class="eyebrow">Capability</span>
        <p class="muted ml-no-cap">No spec limits set \u2014 configure USL/LSL to enable capability indices.</p>
      </div>`;
  }

  const columns = charts.map(c => {
    const rows = [capMetric("Cpk", c.cpk), capMetric("Ppk", c.ppk)].join("");
    return chartColumn(c, rows);
  }).join("");

  return `
    <div class="ml-section-card">
      <span class="eyebrow">Capability</span>
      <div class="ml-columns">${columns}</div>
    </div>`;
}

/** Disagreement section — the headline feature. */
function renderDisagreements(disagreements) {
  const { items, summary } = disagreements;

  if (items.length === 0) {
    return `
      <div class="ml-section-card ml-agree">
        <span class="eyebrow">Method Agreement</span>
        <div class="ml-agreement">
          <span class="sdot good"></span>
          <strong>All methods agree on every point</strong>
          <span class="muted">${summary.totalPoints} points analyzed</span>
        </div>
      </div>`;
  }

  const capped = items.slice(0, 20);
  const uniqueLine = summary.uniqueCounts.map(
    u => `<span class="ml-unique-chip">${u.label}: ${u.uniqueCount} unique</span>`
  ).join("");

  return `
    <div class="ml-section-card ml-disagree">
      <span class="eyebrow">Method Disagreements</span>
      <div class="ml-disagree-header">
        <div class="ml-disagree-stat">
          <strong class="mono">${summary.disagreementCount}</strong>
          <span class="muted">of ${summary.totalPoints} points (${summary.pct}%)</span>
        </div>
        <div class="ml-unique-chips">${uniqueLine}</div>
      </div>
      <div class="ml-disagree-list">
        ${capped.map(d => `
          <div class="ml-disagree-row">
            <div class="ml-disagree-point">
              <strong>${d.label}</strong>
              <span class="mono muted">${d.value != null ? fmt(d.value) : "\u2014"}</span>
            </div>
            <div class="ml-disagree-verdicts">
              ${d.flaggedBy.map(f => `
                <span class="ml-verdict critical">${f.chartLabel}: ${f.rules.join("; ")}</span>
              `).join("")}
              ${d.clearedBy.map(label => `
                <span class="ml-verdict positive">${label}: in-control</span>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
      ${items.length > 20 ? `<p class="muted ml-more">Showing 20 of ${items.length} disagreements</p>` : ""}
    </div>`;
}

/** Chart picker — checkbox multi-select for which charts to include. */
function renderChartPicker(allCharts, selectedIds) {
  if (allCharts.length === 0) return "";
  const count = [...selectedIds].filter(id => allCharts.some(c => c.id === id)).length;
  return `
    <div class="ml-picker">
      <span class="eyebrow">Compare</span>
      <span class="ml-picker-count">${count}/${allCharts.length}</span>
      <div class="ml-picker-list">
        ${allCharts.map(c => {
          const sel = selectedIds.has(c.id);
          return `<div class="ml-picker-item${sel ? " active" : ""}"
            data-action="toggle-ml-chart" data-chart-id="${c.id}" role="checkbox"
            aria-checked="${sel}" tabindex="0">
            <span class="ml-picker-check"></span>
            <span class="ml-picker-label">${c.chartType}</span>
          </div>`;
        }).join("")}
      </div>
    </div>`;
}

// ─── Main render ────────────────────────────────────

export function renderMethodLab(state) {
  const allCharts = buildMethodLabComparison(state);

  // Filter to selected charts (default: all)
  const selectedIds = new Set(state.methodLabCharts && state.methodLabCharts.length > 0
    ? state.methodLabCharts.filter(id => state.charts[id])
    : state.chartOrder);
  const charts = allCharts.filter(c => selectedIds.has(c.id));

  const disagreements = buildDisagreements(state, [...selectedIds]);
  const chartCount = charts.length;

  return `
    <section class="route-panel">
      <div class="route-header">
        <div>
          <h3>Method Lab</h3>
          <p class="muted">${chartCount} of ${allCharts.length} chart${allCharts.length !== 1 ? "s" : ""} selected</p>
        </div>
      </div>

      ${allCharts.length === 0 ? `
        <p class="muted" style="padding: 16px;">No charts to compare. Add a chart in the workspace first.</p>
      ` : `
        <div class="ml-body">
          ${renderChartPicker(allCharts, selectedIds)}
          ${chartCount === 0 ? `<p class="muted" style="padding: 8px;">Select charts above to compare.</p>` : `
            ${renderHeaderBar(charts)}
            <div class="ml-sections">
              ${renderConfig(charts)}
              ${renderResults(charts)}
              ${renderDetection(charts)}
              ${renderCapability(charts)}
              ${chartCount >= 2 ? renderDisagreements(disagreements) : ""}
            </div>
            <p class="ml-guidance muted">Compare method deltas \u2014 the method with fewer false signals and better detection wins.</p>
          `}
        </div>
      `}
    </section>
  `;
}

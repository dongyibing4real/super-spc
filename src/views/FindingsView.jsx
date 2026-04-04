import React, { useMemo, useCallback } from "react";
import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import { deriveFindings, generateFindings } from "../core/findings-engine.js";
import {
  setFindingsChart,
  toggleFindingsStandardsBar,
  selectStructuralFinding,
  setFindingsStandard,
  setStructuralFindings,
  setChartParams,
} from "../core/state.js";
import { reanalyze } from "../store/actions.js";
import { CHART_TYPE_LABELS, capClass } from "../helpers.js";

/* ── Constants ─────────────────────────────────────── */

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

const CATEGORIES = ["stability", "capability", "statistical", "pattern"];

/* ── Shared Detail Helpers ─────────────────────────── */

function DetailHeader({ finding }) {
  return (
    <>
      <div className="finding-detail-head">
        <h4>{finding.title}</h4>
        <span className={`health-badge ${finding.severity}`}>
          <span className="sdot"></span>{finding.severity}
        </span>
      </div>
      <p className="finding-detail-text">{finding.detail}</p>
      {finding.metric ? (
        <div className="finding-metric-hero">
          <span className="eyebrow">{finding.metric.label}</span>
          <strong className="mono data-large">{finding.metric.value}</strong>
        </div>
      ) : null}
    </>
  );
}

function IndexChips({ indices }) {
  if (!indices || indices.length === 0) return null;
  const capped = indices.slice(0, 30);
  return (
    <div className="finding-detail-section">
      <span className="eyebrow">Affected Points</span>
      <div className="index-chips">
        {capped.map((i, idx) => (
          <span key={idx} className="index-chip mono">{i}</span>
        ))}
        {indices.length > 30 ? (
          <span className="index-chip muted">+{indices.length - 30} more</span>
        ) : null}
      </div>
    </div>
  );
}

/* ── Type-Specific Detail Renderers ────────────────── */

function StabilityDetail({ finding }) {
  const ctx = finding.context || {};
  const violations = ctx.violations || [];

  const byRule = useMemo(() => {
    const map = new Map();
    for (const v of violations) {
      if (!map.has(v.testId)) map.set(v.testId, { testId: v.testId, description: v.description, count: 0 });
      map.get(v.testId).count += v.indices.length;
    }
    return [...map.values()];
  }, [violations]);

  const oocPct = ctx.oocPctRaw ?? 0;
  const barWidth = Math.min(oocPct, 100);

  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      {byRule.length > 0 ? (
        <div className="finding-detail-section">
          <span className="eyebrow">Rule Breakdown</span>
          <table className="finding-rule-table">
            <thead><tr><th>Rule</th><th>Description</th><th>Count</th></tr></thead>
            <tbody>
              {byRule.map((r) => (
                <tr key={r.testId}>
                  <td className="mono">R{r.testId}</td>
                  <td>{r.description}</td>
                  <td className="mono">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="finding-detail-section">
        <span className="eyebrow">OOC Rate</span>
        <div className="finding-bar-track">
          <div
            className={`finding-bar-fill ${oocPct > 0 ? "danger" : "good"}`}
            style={{ width: `${barWidth}%` }}
          ></div>
        </div>
        <div className="finding-bar-labels">
          <span className="mono">{ctx.oocRate || "0%"}</span>
          <span className="muted">threshold: {ctx.maxOocPercent ?? 2}% / {ctx.maxOocCount ?? 3} pts</span>
        </div>
      </div>
    </article>
  );
}

function ViolationDetail({ finding }) {
  const ctx = finding.context || {};
  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      <IndexChips indices={ctx.indices} />
    </article>
  );
}

function PhaseDetail({ finding }) {
  const ctx = finding.context || {};
  const fmt = (v) => (v != null ? Number(v).toFixed(4) : "\u2014");
  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      <div className="finding-detail-section">
        <span className="eyebrow">Phase Comparison</span>
        <div className="finding-comparison-row">
          <div className="finding-compare-col">
            <span className="eyebrow">{ctx.fromPhase || "Before"}</span>
            <div className="header-bar-cell">
              <span className="eyebrow">Mean</span>
              <strong className="mono">{fmt(ctx.prevMean)}</strong>
            </div>
            <div className="header-bar-cell">
              <span className="eyebrow">{"\u03C3"}</span>
              <strong className="mono">{fmt(ctx.prevSigma)}</strong>
            </div>
          </div>
          <div className="finding-compare-arrow">{"\u2192"}</div>
          <div className="finding-compare-col">
            <span className="eyebrow">{ctx.toPhase || "After"}</span>
            <div className="header-bar-cell">
              <span className="eyebrow">Mean</span>
              <strong className="mono">{fmt(ctx.currMean)}</strong>
            </div>
            <div className="header-bar-cell">
              <span className="eyebrow">{"\u03C3"}</span>
              <strong className="mono">{fmt(ctx.currSigma)}</strong>
            </div>
          </div>
        </div>
        <div className="finding-context-grid">
          <div>
            <span className="eyebrow">Shift in {"\u03C3"}</span>
            <strong className="mono">{ctx.shiftInSigmas ?? "\u2014"}</strong>
          </div>
          <div>
            <span className="eyebrow">{"\u03C3"} Change</span>
            <strong className="mono">{ctx.sigmaChange ?? "\u2014"}%</strong>
          </div>
        </div>
      </div>
    </article>
  );
}

function CapabilityDetail({ finding }) {
  const ctx = finding.context || {};
  const threshold = ctx.threshold ?? 1.33;
  const marginal = ctx.marginal ?? 1.0;

  const capCell = (label, val) => {
    if (val == null) {
      return (
        <div className="finding-cap-cell">
          <span className="eyebrow">{label}</span>
          <strong className="mono muted">{"\u2014"}</strong>
        </div>
      );
    }
    const cls = capClass(val, threshold, marginal);
    return (
      <div className="finding-cap-cell">
        <span className="eyebrow">{label}</span>
        <strong className={`mono ${cls}`}>{val.toFixed(2)}</strong>
      </div>
    );
  };

  const cpk = ctx.cpk ?? null;
  const barPct = cpk != null ? Math.min((cpk / (threshold * 1.5)) * 100, 100) : 0;
  const threshPct = (threshold / (threshold * 1.5)) * 100;

  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      <div className="finding-detail-section">
        <span className="eyebrow">Capability Indices</span>
        <div className="finding-2x2-grid">
          {capCell("Cp", ctx.cp)}
          {capCell("Cpk", ctx.cpk)}
          {capCell("Pp", ctx.pp)}
          {capCell("Ppk", ctx.ppk)}
        </div>
      </div>
      {cpk != null ? (
        <div className="finding-detail-section">
          <span className="eyebrow">Cpk vs Standard ({threshold})</span>
          <div className="finding-threshold-track">
            <div
              className={`finding-threshold-fill ${capClass(cpk, threshold, marginal)}`}
              style={{ width: `${barPct}%` }}
            ></div>
            <div className="finding-threshold-mark" style={{ left: `${threshPct}%` }}></div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function CenteringDetail({ finding }) {
  const ctx = finding.context || {};
  const hasSpecs = ctx.usl != null && ctx.lsl != null && ctx.mean != null;

  let centeringBar = null;
  if (hasSpecs) {
    const range = ctx.usl - ctx.lsl;
    const meanPct = range > 0 ? ((ctx.mean - ctx.lsl) / range) * 100 : 50;
    const clampedPct = Math.max(2, Math.min(98, meanPct));
    centeringBar = (
      <div className="finding-detail-section">
        <span className="eyebrow">Mean Position</span>
        <div className="finding-centering-bar">
          <span className="centering-label lsl">LSL {Number(ctx.lsl).toFixed(2)}</span>
          <div className="centering-track">
            <div className="centering-mean" style={{ left: `${clampedPct}%` }}></div>
          </div>
          <span className="centering-label usl">USL {Number(ctx.usl).toFixed(2)}</span>
        </div>
      </div>
    );
  }

  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      <div className="finding-context-grid">
        <div>
          <span className="eyebrow">Cp</span>
          <strong className="mono">{ctx.cp?.toFixed(2) ?? "\u2014"}</strong>
        </div>
        <div>
          <span className="eyebrow">Cpk</span>
          <strong className="mono">{ctx.cpk?.toFixed(2) ?? "\u2014"}</strong>
        </div>
        <div>
          <span className="eyebrow">Standard</span>
          <strong className="mono">
            {ctx.centeringStandard != null
              ? (ctx.centeringStandard * 100).toFixed(0) + "%"
              : "\u2014"}
          </strong>
        </div>
      </div>
      {centeringBar}
    </article>
  );
}

function StatisticalDetail({ finding }) {
  const ctx = finding.context || {};
  const rows = [
    ["N", ctx.n],
    ["Mean", ctx.mean],
    ["\u03C3 Within", ctx.sigmaWithin],
    ["\u03C3 Overall", ctx.std],
    ["Min", ctx.min],
    ["Max", ctx.max],
    ["Range", ctx.range],
    ["Median", ctx.median],
  ];
  if (ctx.subgroupCount != null) rows.push(["Subgroups", ctx.subgroupCount]);

  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      <div className="finding-detail-section">
        <table className="finding-stats-table">
          <tbody>
            {rows.map(([label, val]) => (
              <tr key={label}>
                <td className="eyebrow">{label}</td>
                <td className="mono">{val ?? "\u2014"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function SigmaMethodDetail({ finding }) {
  const ctx = finding.context || {};
  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      <div className="finding-context-grid">
        <div>
          <span className="eyebrow">Method</span>
          <strong>{ctx.label || ctx.method || "\u2014"}</strong>
        </div>
        <div>
          <span className="eyebrow">{"\u03C3\u0302"}</span>
          <strong className="mono">{ctx.sigmaHat?.toFixed(4) ?? "\u2014"}</strong>
        </div>
        <div>
          <span className="eyebrow">N Used</span>
          <strong className="mono">{ctx.nUsed ?? "\u2014"}</strong>
        </div>
      </div>
    </article>
  );
}

function ZoneDetail({ finding }) {
  const ctx = finding.context || {};
  const z = ctx;
  const exp = ctx.expected || {};

  const segments = [
    { label: "C", pct: z.zoneC?.pct ?? 0, cls: "zone-c" },
    { label: "B", pct: z.zoneB?.pct ?? 0, cls: "zone-b" },
    { label: "A", pct: z.zoneA?.pct ?? 0, cls: "zone-a" },
    { label: "Beyond", pct: z.beyond?.pct ?? 0, cls: "zone-beyond" },
  ];

  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      <div className="finding-detail-section">
        <span className="eyebrow">Distribution</span>
        <div className="finding-zone-bar">
          {segments.map((s) => (
            <div
              key={s.label}
              className={`finding-zone-segment ${s.cls}`}
              style={{ width: `${Math.max(parseFloat(s.pct) || 0, 1)}%` }}
            >
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        <table className="finding-rule-table">
          <thead>
            <tr><th>Zone</th><th>Actual</th><th>Expected</th><th>Count</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>C ({"\u00B1"}1{"\u03C3"})</td>
              <td className="mono">{z.zoneC?.pct ?? "\u2014"}%</td>
              <td className="mono">{exp.c ?? "68.3"}%</td>
              <td className="mono">{z.zoneC?.count ?? "\u2014"}</td>
            </tr>
            <tr>
              <td>B (1-2{"\u03C3"})</td>
              <td className="mono">{z.zoneB?.pct ?? "\u2014"}%</td>
              <td className="mono">{exp.b ?? "27.2"}%</td>
              <td className="mono">{z.zoneB?.count ?? "\u2014"}</td>
            </tr>
            <tr>
              <td>A (2-3{"\u03C3"})</td>
              <td className="mono">{z.zoneA?.pct ?? "\u2014"}%</td>
              <td className="mono">{exp.a ?? "4.3"}%</td>
              <td className="mono">{z.zoneA?.count ?? "\u2014"}</td>
            </tr>
            <tr>
              <td>Beyond ({">"}3{"\u03C3"})</td>
              <td className="mono">{z.beyond?.pct ?? "\u2014"}%</td>
              <td className="mono">{exp.beyond ?? "0.3"}%</td>
              <td className="mono">{z.beyond?.count ?? "\u2014"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  );
}

function RunsDetail({ finding }) {
  const ctx = finding.context || {};
  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      <div className="finding-context-grid">
        <div>
          <span className="eyebrow">Observed Runs</span>
          <strong className="mono">{ctx.runs ?? "\u2014"}</strong>
        </div>
        <div>
          <span className="eyebrow">Expected Runs</span>
          <strong className="mono">{ctx.expected ?? "\u2014"}</strong>
        </div>
        <div>
          <span className="eyebrow">Z-Score</span>
          <strong className="mono">{ctx.z ?? "\u2014"}</strong>
        </div>
        <div>
          <span className="eyebrow">Z Threshold</span>
          <strong className="mono">{"\u00B1"}{ctx.zThreshold ?? "1.96"}</strong>
        </div>
        <div>
          <span className="eyebrow">Above CL</span>
          <strong className="mono">{ctx.above ?? "\u2014"}</strong>
        </div>
        <div>
          <span className="eyebrow">Below CL</span>
          <strong className="mono">{ctx.below ?? "\u2014"}</strong>
        </div>
      </div>
      <div className="finding-detail-section">
        <span className="eyebrow">Interpretation</span>
        <p className="finding-detail-text">{ctx.interpretation || "\u2014"}</p>
      </div>
    </article>
  );
}

function PatternDetail({ finding }) {
  const ctx = finding.context || {};
  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      <IndexChips indices={ctx.indices} />
    </article>
  );
}

function GenericDetail({ finding }) {
  const ctx = finding.context || {};
  const entries = Object.entries(ctx).filter(
    ([, val]) => val != null && typeof val !== "object"
  );
  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      {entries.length > 0 ? (
        <div className="finding-context-grid">
          {entries.map(([key, val]) => {
            const label = key
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, (s) => s.toUpperCase());
            return (
              <div key={key}>
                <span className="eyebrow">{label}</span>
                <strong className="mono">{val}</strong>
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

/* ── Detail Panel Dispatcher ───────────────────────── */

const DETAIL_RENDERERS = {
  stabilityVerdict: StabilityDetail,
  violationSummary: ViolationDetail,
  phaseComparison: PhaseDetail,
  capabilityVerdict: CapabilityDetail,
  centeringAssessment: CenteringDetail,
  statisticalSummary: StatisticalDetail,
  sigmaMethodNote: SigmaMethodDetail,
  zoneDistribution: ZoneDetail,
  runsDetection: RunsDetail,
  trendDetection: PatternDetail,
  stratificationDetection: PatternDetail,
  mixtureDetection: PatternDetail,
};

function DetailPanel({ finding }) {
  if (!finding) {
    return (
      <article className="finding-detail-panel panel-card">
        <p className="muted">No findings generated. Load a dataset and run analysis.</p>
      </article>
    );
  }
  const Renderer = DETAIL_RENDERERS[finding.generatorId] || GenericDetail;
  return <Renderer finding={finding} />;
}

/* ── Sub-Components ────────────────────────────────── */

function ChartRailCard({ id, charts, isActive, onSwitch }) {
  const s = charts[id];
  const label =
    s?.context?.chartType?.label ||
    CHART_TYPE_LABELS[s?.params?.chart_type] ||
    (s?.params?.chart_type ? id : "Select\u2026");
  const roleLabel = CHART_TYPE_LABELS[s?.params?.chart_type] || (s?.params?.chart_type ? id : "Select\u2026");
  const violations = s?.violations || [];
  const oocCount = violations.reduce((sum, v) => sum + v.indices.length, 0);
  const cap = s?.capability;
  const cpkStr = cap?.cpk != null ? cap.cpk.toFixed(2) : "\u2014";

  return (
    <button
      className={`chart-rail-card ${isActive ? "active" : ""}`}
      onClick={() => onSwitch(id)}
      type="button"
    >
      <p className="eyebrow">{roleLabel}</p>
      <div className="chart-rail-card-name">{label}</div>
      <div className="chart-rail-card-stats">
        <span className={oocCount > 0 ? "danger" : "good"}>OOC {oocCount}</span>
        <span>Cpk {cpkStr}</span>
      </div>
    </button>
  );
}

function ChartRail({ charts, chartOrder, activeChartId, onSwitch }) {
  return (
    <div className="panel-card findings-chart-rail">
      <h4>Charts</h4>
      <div className="chart-rail-list">
        {chartOrder.map((id) => (
          <ChartRailCard
            key={id}
            id={id}
            charts={charts}
            isActive={id === activeChartId}
            onSwitch={onSwitch}
          />
        ))}
      </div>
    </div>
  );
}

function HeaderBar({ health, slot, stats, chartId }) {
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

  const handleSpecChange = useCallback((key, e) => {
    const raw = e.target.value.trim();
    const value = raw !== "" ? parseFloat(raw) : null;
    if (key && chartId && (value === null || !isNaN(value))) {
      spcStore.setState(setChartParams(spcStore.getState(), chartId, { [key]: value }));
      reanalyze();
    }
  }, [chartId]);

  return (
    <div className="findings-header-bar">
      <div className={`health-badge ${health.severity}`}>
        <span className="sdot"></span>
        {health.label}
      </div>
      <div className="header-bar-metrics">
        {cells.map((c) => (
          <div key={c.label} className="header-bar-cell">
            <span className="eyebrow">{c.label}</span>
            <strong className={`mono ${c.cls}`}>{c.value}</strong>
          </div>
        ))}
      </div>
      <div className="header-bar-specs">
        <div className="header-bar-cell">
          <span className="eyebrow">LSL</span>
          <input
            type="number"
            className="standard-input"
            onChange={(e) => handleSpecChange("lsl", e)}
            defaultValue={params.lsl ?? ""}
            step="any"
            placeholder={"\u2014"}
          />
        </div>
        <div className="header-bar-cell">
          <span className="eyebrow">Target</span>
          <input
            type="number"
            className="standard-input"
            onChange={(e) => handleSpecChange("target", e)}
            defaultValue={params.target ?? ""}
            step="any"
            placeholder={"\u2014"}
          />
        </div>
        <div className="header-bar-cell">
          <span className="eyebrow">USL</span>
          <input
            type="number"
            className="standard-input"
            onChange={(e) => handleSpecChange("usl", e)}
            defaultValue={params.usl ?? ""}
            step="any"
            placeholder={"\u2014"}
          />
        </div>
      </div>
      <div className="header-bar-chart">
        <strong>{chartLabel}</strong>
      </div>
    </div>
  );
}

function StandardsBar({ findingsStandards, findingsStandardsExpanded }) {
  const std = findingsStandards || {};
  const expanded = findingsStandardsExpanded;

  const handleToggle = useCallback(() => {
    spcStore.setState(toggleFindingsStandardsBar(spcStore.getState()));
  }, []);

  const handleStandardChange = useCallback((key, e) => {
    const value = parseFloat(e.target.value);
    if (!key || isNaN(value) || value < 0) return;
    let next = setFindingsStandard(spcStore.getState(), key, value);
    try { localStorage.setItem("spc-findings-standards", JSON.stringify(next.findingsStandards)); } catch { /* */ }
    const chartId = next.findingsChartId || next.chartOrder[0];
    next = setStructuralFindings(next, generateFindings(next, chartId), chartId);
    spcStore.setState(next);
  }, []);

  return (
    <div className="findings-standards-bar">
      <button
        className="standards-toggle"
        onClick={handleToggle}
        type="button"
      >
        <span className="eyebrow">Standards</span>
        <span className={`chevron ${expanded ? "open" : ""}`}>{"\u25BE"}</span>
      </button>
      {expanded ? (
        <div className="standards-inputs">
          {STANDARDS_FIELDS.map((f) => (
            <div key={f.key} className="standard-field">
              <span className="eyebrow">{f.label}</span>
              <input
                type="number"
                className="standard-input"
                onChange={(e) => handleStandardChange(f.key, e)}
                defaultValue={std[f.key] ?? ""}
                step="any"
                min="0"
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FindingCard({ finding, isActive, onSelect }) {
  return (
    <button
      className={`finding-card ${isActive ? "active" : ""} ${finding.severity}`}
      onClick={() => onSelect(finding.id)}
      type="button"
    >
      <div className="finding-card-head">
        <span className={`finding-severity-dot ${finding.severity}`}></span>
        <h4>{finding.title}</h4>
      </div>
      {finding.metric ? (
        <span className="finding-card-metric mono">
          {finding.metric.label}: {finding.metric.value}
        </span>
      ) : null}
    </button>
  );
}

function AISection() {
  return (
    <div className="findings-ai-section">
      <div className="findings-ai-header">
        <div>
          <span className="eyebrow">AI Agent</span>
          <p>Deeper pattern analysis, root cause hypotheses, and recommended actions.</p>
        </div>
        <button className="btn" disabled type="button">Connect</button>
      </div>
      <div className="findings-ai-cards">
        <div className="ai-placeholder-card">
          <span className="eyebrow">Root Cause</span>
          <p className="muted">AI-generated root cause hypotheses will appear here.</p>
        </div>
        <div className="ai-placeholder-card">
          <span className="eyebrow">Recommendations</span>
          <p className="muted">Actionable next steps based on pattern analysis.</p>
        </div>
        <div className="ai-placeholder-card">
          <span className="eyebrow">Correlation</span>
          <p className="muted">Cross-chart and cross-variable insights.</p>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ────────────────────────────────── */

export default function FindingsView() {
  const charts = useStore(spcStore, (s) => s.charts);
  const chartOrder = useStore(spcStore, (s) => s.chartOrder);
  const focusedChartId = useStore(spcStore, (s) => s.focusedChartId);
  const findingsChartId = useStore(spcStore, (s) => s.findingsChartId);
  const findingsStandards = useStore(spcStore, (s) => s.findingsStandards);
  const findingsStandardsExpanded = useStore(spcStore, (s) => s.findingsStandardsExpanded);
  const selectedFindingId = useStore(spcStore, (s) => s.selectedFindingId);
  const structuralFindings = useStore(spcStore, (s) => s.structuralFindings);
  const points = useStore(spcStore, (s) => s.points);
  const columnConfig = useStore(spcStore, (s) => s.columnConfig);

  // Build the state-like object that deriveFindings expects
  const stateSlice = useMemo(
    () => ({
      charts,
      chartOrder,
      focusedChartId,
      findingsChartId,
      findingsStandards,
      findingsStandardsExpanded,
      selectedFindingId,
      structuralFindings,
      points,
      columnConfig,
    }),
    [
      charts,
      chartOrder,
      focusedChartId,
      findingsChartId,
      findingsStandards,
      findingsStandardsExpanded,
      selectedFindingId,
      structuralFindings,
      points,
      columnConfig,
    ],
  );

  const derived = useMemo(() => deriveFindings(stateSlice), [stateSlice]);
  const activeChartId = findingsChartId || chartOrder[0];
  const slot = charts[activeChartId];

  const stats = useMemo(() => {
    const f = (structuralFindings || []).find(
      (item) => item.generatorId === "statisticalSummary",
    );
    return f?.context || null;
  }, [structuralFindings]);

  const handleSwitchChart = useCallback((chartId) => {
    const state = spcStore.getState();
    const withChart = setFindingsChart(state, chartId);
    const next = setStructuralFindings(withChart, generateFindings(withChart, chartId), chartId);
    spcStore.setState(next);
  }, []);

  const handleSelectFinding = useCallback((findingId) => {
    spcStore.setState(selectStructuralFinding(spcStore.getState(), findingId));
  }, []);

  return (
    <section className="route-panel">
      <div className="route-header">
        <div>
          <h3>Findings</h3>
          <p className="muted">Evidence-backed process health assessment</p>
        </div>
        <div className="route-actions">
          <span className="findings-count-badge">
            {derived.dangerCount > 0 ? (
              <span className="danger">{derived.dangerCount} critical</span>
            ) : null}
            {derived.warningCount > 0 ? (
              <span className="warning">{derived.warningCount} warning</span>
            ) : null}
          </span>
        </div>
      </div>

      {/* Layout */}
      <div className="findings-layout">
        <ChartRail
          charts={charts}
          chartOrder={chartOrder}
          activeChartId={activeChartId}
          onSwitch={handleSwitchChart}
        />

        <div className="findings-main">
          <StandardsBar
            findingsStandards={findingsStandards}
            findingsStandardsExpanded={findingsStandardsExpanded}
          />

          {/* Content */}
          <div className="findings-content">
            <HeaderBar
              key={activeChartId}
              health={derived.health}
              slot={slot}
              stats={stats}
              chartId={activeChartId}
            />

            <div className="findings-dashboard-grid">
              <div className="findings-card-column">
                {CATEGORIES.map((cat) => {
                  const items = derived.grouped[cat] || [];
                  if (items.length === 0) return null;
                  return (
                    <div key={cat} className="finding-category-group">
                      <span className="eyebrow">{CATEGORY_LABELS[cat]}</span>
                      {items.map((f) => (
                        <FindingCard
                          key={f.id}
                          finding={f}
                          isActive={derived.selected?.id === f.id}
                          onSelect={handleSelectFinding}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>

              <div className="findings-detail-column">
                <DetailPanel finding={derived.selected} />
              </div>
            </div>

            <AISection />
          </div>
        </div>
      </div>
    </section>
  );
}

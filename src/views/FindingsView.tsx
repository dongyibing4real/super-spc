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
} from "../core/state/findings.js";
import { setChartParams } from "../core/state/chart.js";
import { reanalyze } from "../store/actions.js";
import { CHART_TYPE_LABELS } from "../constants.js";
import { capClass } from "../helpers.js";
import type {
  SPCState,
  ChartSlot,
  FindingsStandards,
  ColumnConfig,
  ChartPoint,
} from "../types/state.js";

/* ── Local interfaces ─────────────────────────────────── */

interface FindingMetric {
  label: string;
  value: string | number;
}

interface Finding {
  id: string;
  title: string;
  detail: string;
  severity: string;
  category: string;
  generatorId: string;
  metric: FindingMetric | null;
  context: Record<string, unknown>;
}

interface DerivedFindings {
  grouped: Record<string, Finding[]>;
  selected: Finding | null;
  health: HealthData;
  dangerCount: number;
  warningCount: number;
}

interface HealthData {
  label: string;
  severity: string;
  cpk: string | number;
  cpkSeverity: string;
  oocCount: number;
  n: number;
}

interface StatsData {
  mean?: string | number;
  sigmaWithin?: string | number;
  std?: string | number;
  min?: string | number;
  max?: string | number;
  range?: string | number;
  median?: string | number;
}

/* ── Constants ─────────────────────────────────────── */

const CATEGORY_LABELS: Record<string, string> = {
  stability: "Stability",
  capability: "Capability",
  statistical: "Statistical",
  pattern: "Pattern",
};

interface StandardField {
  key: string;
  label: string;
}

const STANDARDS_FIELDS: StandardField[] = [
  { key: "cpkThreshold", label: "Cpk Good" },
  { key: "cpkMarginal", label: "Cpk Marginal" },
  { key: "maxOocPercent", label: "Max OOC %" },
  { key: "maxOocCount", label: "Max OOC Count" },
  { key: "centeringRatio", label: "Centering Ratio" },
  { key: "runsZThreshold", label: "Runs Z" },
  { key: "zoneDeviation", label: "Zone Deviation" },
];

const CATEGORIES: string[] = ["stability", "capability", "statistical", "pattern"];

/* ── Shared Detail Helpers ─────────────────────────── */

interface DetailHeaderProps {
  finding: Finding;
}

function DetailHeader({ finding }: DetailHeaderProps): React.JSX.Element {
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

interface IndexChipsProps {
  indices: number[] | undefined;
}

function IndexChips({ indices }: IndexChipsProps): React.JSX.Element | null {
  if (!indices || indices.length === 0) return null;
  const capped: number[] = indices.slice(0, 30);
  return (
    <div className="finding-detail-section">
      <span className="eyebrow">Affected Points</span>
      <div className="index-chips">
        {capped.map((i: number, idx: number) => (
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

interface FindingDetailProps {
  finding: Finding;
}

function StabilityDetail({ finding }: FindingDetailProps): React.JSX.Element {
  const ctx = finding.context || {};
  const violations = (ctx.violations || []) as Array<{ testId: string; description: string; indices: number[] }>;

  const byRule = useMemo(() => {
    const map = new Map<string, { testId: string; description: string; count: number }>();
    for (const v of violations) {
      if (!map.has(v.testId)) map.set(v.testId, { testId: v.testId, description: v.description, count: 0 });
      map.get(v.testId)!.count += v.indices.length;
    }
    return [...map.values()];
  }, [violations]);

  const oocPct = (ctx.oocPctRaw as number) ?? 0;
  const barWidth: number = Math.min(oocPct, 100);

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
          <span className="mono">{(ctx.oocRate as string) || "0%"}</span>
          <span className="muted">threshold: {(ctx.maxOocPercent as number) ?? 2}% / {(ctx.maxOocCount as number) ?? 3} pts</span>
        </div>
      </div>
    </article>
  );
}

function ViolationDetail({ finding }: FindingDetailProps): React.JSX.Element {
  const ctx = finding.context || {};
  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      <IndexChips indices={ctx.indices as number[] | undefined} />
    </article>
  );
}

function PhaseDetail({ finding }: FindingDetailProps): React.JSX.Element {
  const ctx = finding.context || {};
  const fmt = (v: unknown): string => (v != null ? Number(v).toFixed(4) : "\u2014");
  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      <div className="finding-detail-section">
        <span className="eyebrow">Phase Comparison</span>
        <div className="finding-comparison-row">
          <div className="finding-compare-col">
            <span className="eyebrow">{(ctx.fromPhase as string) || "Before"}</span>
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
            <span className="eyebrow">{(ctx.toPhase as string) || "After"}</span>
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
            <strong className="mono">{(ctx.shiftInSigmas as string) ?? "\u2014"}</strong>
          </div>
          <div>
            <span className="eyebrow">{"\u03C3"} Change</span>
            <strong className="mono">{(ctx.sigmaChange as string) ?? "\u2014"}%</strong>
          </div>
        </div>
      </div>
    </article>
  );
}

function CapabilityDetail({ finding }: FindingDetailProps): React.JSX.Element {
  const ctx = finding.context || {};
  const threshold: number = (ctx.threshold as number) ?? 1.33;
  const marginal: number = (ctx.marginal as number) ?? 1.0;

  const capCell = (label: string, val: number | null | undefined): React.JSX.Element => {
    if (val == null) {
      return (
        <div className="finding-cap-cell">
          <span className="eyebrow">{label}</span>
          <strong className="mono muted">{"\u2014"}</strong>
        </div>
      );
    }
    const cls: string = capClass(val, threshold, marginal);
    return (
      <div className="finding-cap-cell">
        <span className="eyebrow">{label}</span>
        <strong className={`mono ${cls}`}>{val.toFixed(2)}</strong>
      </div>
    );
  };

  const cpk: number | null = (ctx.cpk as number) ?? null;
  const barPct: number = cpk != null ? Math.min((cpk / (threshold * 1.5)) * 100, 100) : 0;
  const threshPct: number = (threshold / (threshold * 1.5)) * 100;

  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      <div className="finding-detail-section">
        <span className="eyebrow">Capability Indices</span>
        <div className="finding-2x2-grid">
          {capCell("Cp", ctx.cp as number | null | undefined)}
          {capCell("Cpk", ctx.cpk as number | null | undefined)}
          {capCell("Pp", ctx.pp as number | null | undefined)}
          {capCell("Ppk", ctx.ppk as number | null | undefined)}
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

function CenteringDetail({ finding }: FindingDetailProps): React.JSX.Element {
  const ctx = finding.context || {};
  const hasSpecs: boolean = ctx.usl != null && ctx.lsl != null && ctx.mean != null;

  let centeringBar: React.JSX.Element | null = null;
  if (hasSpecs) {
    const range: number = (ctx.usl as number) - (ctx.lsl as number);
    const meanPct: number = range > 0 ? (((ctx.mean as number) - (ctx.lsl as number)) / range) * 100 : 50;
    const clampedPct: number = Math.max(2, Math.min(98, meanPct));
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
          <strong className="mono">{(ctx.cp as number)?.toFixed(2) ?? "\u2014"}</strong>
        </div>
        <div>
          <span className="eyebrow">Cpk</span>
          <strong className="mono">{(ctx.cpk as number)?.toFixed(2) ?? "\u2014"}</strong>
        </div>
        <div>
          <span className="eyebrow">Standard</span>
          <strong className="mono">
            {ctx.centeringStandard != null
              ? ((ctx.centeringStandard as number) * 100).toFixed(0) + "%"
              : "\u2014"}
          </strong>
        </div>
      </div>
      {centeringBar}
    </article>
  );
}

function StatisticalDetail({ finding }: FindingDetailProps): React.JSX.Element {
  const ctx = finding.context || {};
  const rows: [string, unknown][] = [
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
            {rows.map(([label, val]: [string, unknown]) => (
              <tr key={label}>
                <td className="eyebrow">{label}</td>
                <td className="mono">{(val as string | number) ?? "\u2014"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function SigmaMethodDetail({ finding }: FindingDetailProps): React.JSX.Element {
  const ctx = finding.context || {};
  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      <div className="finding-context-grid">
        <div>
          <span className="eyebrow">Method</span>
          <strong>{(ctx.label as string) || (ctx.method as string) || "\u2014"}</strong>
        </div>
        <div>
          <span className="eyebrow">{"\u03C3\u0302"}</span>
          <strong className="mono">{(ctx.sigmaHat as number)?.toFixed(4) ?? "\u2014"}</strong>
        </div>
        <div>
          <span className="eyebrow">N Used</span>
          <strong className="mono">{(ctx.nUsed as number) ?? "\u2014"}</strong>
        </div>
      </div>
    </article>
  );
}

interface ZoneData {
  pct?: string | number;
  count?: number;
}

function ZoneDetail({ finding }: FindingDetailProps): React.JSX.Element {
  const ctx = finding.context || {};
  const z = ctx as Record<string, unknown>;
  const exp = (ctx.expected || {}) as Record<string, string>;

  const segments: { label: string; pct: string | number; cls: string }[] = [
    { label: "C", pct: (z.zoneC as ZoneData)?.pct ?? 0, cls: "zone-c" },
    { label: "B", pct: (z.zoneB as ZoneData)?.pct ?? 0, cls: "zone-b" },
    { label: "A", pct: (z.zoneA as ZoneData)?.pct ?? 0, cls: "zone-a" },
    { label: "Beyond", pct: (z.beyond as ZoneData)?.pct ?? 0, cls: "zone-beyond" },
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
              style={{ width: `${Math.max(parseFloat(String(s.pct)) || 0, 1)}%` }}
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
              <td className="mono">{(z.zoneC as ZoneData)?.pct ?? "\u2014"}%</td>
              <td className="mono">{exp.c ?? "68.3"}%</td>
              <td className="mono">{(z.zoneC as ZoneData)?.count ?? "\u2014"}</td>
            </tr>
            <tr>
              <td>B (1-2{"\u03C3"})</td>
              <td className="mono">{(z.zoneB as ZoneData)?.pct ?? "\u2014"}%</td>
              <td className="mono">{exp.b ?? "27.2"}%</td>
              <td className="mono">{(z.zoneB as ZoneData)?.count ?? "\u2014"}</td>
            </tr>
            <tr>
              <td>A (2-3{"\u03C3"})</td>
              <td className="mono">{(z.zoneA as ZoneData)?.pct ?? "\u2014"}%</td>
              <td className="mono">{exp.a ?? "4.3"}%</td>
              <td className="mono">{(z.zoneA as ZoneData)?.count ?? "\u2014"}</td>
            </tr>
            <tr>
              <td>Beyond ({">"}3{"\u03C3"})</td>
              <td className="mono">{(z.beyond as ZoneData)?.pct ?? "\u2014"}%</td>
              <td className="mono">{exp.beyond ?? "0.3"}%</td>
              <td className="mono">{(z.beyond as ZoneData)?.count ?? "\u2014"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  );
}

function RunsDetail({ finding }: FindingDetailProps): React.JSX.Element {
  const ctx = finding.context || {};
  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      <div className="finding-context-grid">
        <div>
          <span className="eyebrow">Observed Runs</span>
          <strong className="mono">{(ctx.runs as number) ?? "\u2014"}</strong>
        </div>
        <div>
          <span className="eyebrow">Expected Runs</span>
          <strong className="mono">{(ctx.expected as number) ?? "\u2014"}</strong>
        </div>
        <div>
          <span className="eyebrow">Z-Score</span>
          <strong className="mono">{(ctx.z as number) ?? "\u2014"}</strong>
        </div>
        <div>
          <span className="eyebrow">Z Threshold</span>
          <strong className="mono">{"\u00B1"}{(ctx.zThreshold as string) ?? "1.96"}</strong>
        </div>
        <div>
          <span className="eyebrow">Above CL</span>
          <strong className="mono">{(ctx.above as number) ?? "\u2014"}</strong>
        </div>
        <div>
          <span className="eyebrow">Below CL</span>
          <strong className="mono">{(ctx.below as number) ?? "\u2014"}</strong>
        </div>
      </div>
      <div className="finding-detail-section">
        <span className="eyebrow">Interpretation</span>
        <p className="finding-detail-text">{(ctx.interpretation as string) || "\u2014"}</p>
      </div>
    </article>
  );
}

function PatternDetail({ finding }: FindingDetailProps): React.JSX.Element {
  const ctx = finding.context || {};
  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      <IndexChips indices={ctx.indices as number[] | undefined} />
    </article>
  );
}

function GenericDetail({ finding }: FindingDetailProps): React.JSX.Element {
  const ctx = finding.context || {};
  const entries: [string, unknown][] = Object.entries(ctx).filter(
    ([, val]: [string, unknown]) => val != null && typeof val !== "object"
  );
  return (
    <article className="finding-detail-panel panel-card">
      <DetailHeader finding={finding} />
      {entries.length > 0 ? (
        <div className="finding-context-grid">
          {entries.map(([key, val]: [string, unknown]) => {
            const label: string = key
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, (s: string) => s.toUpperCase());
            return (
              <div key={key}>
                <span className="eyebrow">{label}</span>
                <strong className="mono">{val as string | number}</strong>
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

/* ── Detail Panel Dispatcher ───────────────────────── */

const DETAIL_RENDERERS: Record<string, React.ComponentType<FindingDetailProps>> = {
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

interface DetailPanelProps {
  finding: Finding | null;
}

function DetailPanel({ finding }: DetailPanelProps): React.JSX.Element {
  if (!finding) {
    return (
      <article className="finding-detail-panel panel-card">
        <p className="muted">No findings generated. Load a dataset and run analysis.</p>
      </article>
    );
  }
  const Renderer: React.ComponentType<FindingDetailProps> = DETAIL_RENDERERS[finding.generatorId] || GenericDetail;
  return <Renderer finding={finding} />;
}

/* ── Sub-Components ────────────────────────────────── */

interface ChartRailCardProps {
  id: string;
  charts: Record<string, ChartSlot>;
  isActive: boolean;
  onSwitch: (id: string) => void;
}

function ChartRailCard({ id, charts, isActive, onSwitch }: ChartRailCardProps): React.JSX.Element {
  const s: ChartSlot | undefined = charts[id];
  const label: string =
    s?.context?.chartType?.label ||
    CHART_TYPE_LABELS[s?.params?.chart_type ?? ""] ||
    (s?.params?.chart_type ? id : "Select\u2026");
  const roleLabel: string = CHART_TYPE_LABELS[s?.params?.chart_type ?? ""] || (s?.params?.chart_type ? id : "Select\u2026");
  const violations = s?.violations || [];
  const oocCount: number = violations.reduce((sum: number, v) => sum + v.indices.length, 0);
  const cap = s?.capability;
  const cpkStr: string = cap?.cpk != null ? cap.cpk.toFixed(2) : "\u2014";

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

interface ChartRailProps {
  charts: Record<string, ChartSlot>;
  chartOrder: string[];
  activeChartId: string;
  onSwitch: (id: string) => void;
}

function ChartRail({ charts, chartOrder, activeChartId, onSwitch }: ChartRailProps): React.JSX.Element {
  return (
    <div className="panel-card findings-chart-rail">
      <h4>Charts</h4>
      <div className="chart-rail-list">
        {chartOrder.map((id: string) => (
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

interface HeaderBarProps {
  health: HealthData;
  slot: ChartSlot | undefined;
  stats: StatsData | null;
  chartId: string;
}

function HeaderBar({ health, slot, stats, chartId }: HeaderBarProps): React.JSX.Element {
  const chartLabel: string = slot?.context?.chartType?.label || "\u2014";
  const params = slot?.params || {} as Record<string, unknown>;

  const cells: { label: string; value: string | number; cls: string }[] = [
    { label: "Cpk", value: health.cpk, cls: health.cpkSeverity },
    { label: "OOC", value: health.oocCount, cls: health.oocCount > 0 ? "danger" : "good" },
    { label: "N", value: health.n, cls: "" },
  ];

  if (stats) {
    cells.push(
      { label: "Mean", value: stats.mean ?? "", cls: "" },
      { label: "\u03C3 Within", value: stats.sigmaWithin ?? "", cls: "" },
      { label: "\u03C3 Overall", value: stats.std ?? "", cls: "" },
      { label: "Min", value: stats.min ?? "", cls: "" },
      { label: "Max", value: stats.max ?? "", cls: "" },
      { label: "Range", value: stats.range ?? "", cls: "" },
      { label: "Median", value: stats.median ?? "", cls: "" },
    );
  }

  const handleSpecChange = useCallback((key: string, e: React.ChangeEvent<HTMLInputElement>): void => {
    const raw: string = e.target.value.trim();
    const value: number | null = raw !== "" ? parseFloat(raw) : null;
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSpecChange("lsl", e)}
            defaultValue={(params as Record<string, unknown>).lsl as number ?? ""}
            step="any"
            placeholder={"\u2014"}
          />
        </div>
        <div className="header-bar-cell">
          <span className="eyebrow">Target</span>
          <input
            type="number"
            className="standard-input"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSpecChange("target", e)}
            defaultValue={(params as Record<string, unknown>).target as number ?? ""}
            step="any"
            placeholder={"\u2014"}
          />
        </div>
        <div className="header-bar-cell">
          <span className="eyebrow">USL</span>
          <input
            type="number"
            className="standard-input"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSpecChange("usl", e)}
            defaultValue={(params as Record<string, unknown>).usl as number ?? ""}
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

interface StandardsBarProps {
  findingsStandards: FindingsStandards;
  findingsStandardsExpanded: boolean;
}

function StandardsBar({ findingsStandards, findingsStandardsExpanded }: StandardsBarProps): React.JSX.Element {
  const std = findingsStandards || {} as FindingsStandards;
  const expanded: boolean = findingsStandardsExpanded;

  const handleToggle = useCallback((): void => {
    spcStore.setState(toggleFindingsStandardsBar(spcStore.getState()));
  }, []);

  const handleStandardChange = useCallback((key: string, e: React.ChangeEvent<HTMLInputElement>): void => {
    const value: number = parseFloat(e.target.value);
    if (!key || isNaN(value) || value < 0) return;
    let next = setFindingsStandard(spcStore.getState(), key, value) as SPCState;
    try { localStorage.setItem("spc-findings-standards", JSON.stringify(next.findingsStandards)); } catch { /* */ }
    const chartId: string = next.findingsChartId || next.chartOrder[0];
    next = setStructuralFindings(next, generateFindings(next, chartId), chartId) as SPCState;
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
          {STANDARDS_FIELDS.map((f: StandardField) => (
            <div key={f.key} className="standard-field">
              <span className="eyebrow">{f.label}</span>
              <input
                type="number"
                className="standard-input"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleStandardChange(f.key, e)}
                defaultValue={(std as unknown as Record<string, number>)[f.key] ?? ""}
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

interface FindingCardProps {
  finding: Finding;
  isActive: boolean;
  onSelect: (id: string) => void;
}

function FindingCard({ finding, isActive, onSelect }: FindingCardProps): React.JSX.Element {
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

function AISection(): React.JSX.Element {
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

export default function FindingsView(): React.JSX.Element {
  const charts = useStore(spcStore, (s: SPCState) => s.charts);
  const chartOrder = useStore(spcStore, (s: SPCState) => s.chartOrder);
  const focusedChartId = useStore(spcStore, (s: SPCState) => s.focusedChartId);
  const findingsChartId = useStore(spcStore, (s: SPCState) => s.findingsChartId);
  const findingsStandards = useStore(spcStore, (s: SPCState) => s.findingsStandards);
  const findingsStandardsExpanded = useStore(spcStore, (s: SPCState) => s.findingsStandardsExpanded);
  const selectedFindingId = useStore(spcStore, (s: SPCState) => s.selectedFindingId);
  const structuralFindings = useStore(spcStore, (s: SPCState) => s.structuralFindings);
  const points = useStore(spcStore, (s: SPCState) => s.points);
  const columnConfig = useStore(spcStore, (s: SPCState) => s.columnConfig);

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

  const derived: DerivedFindings = useMemo(() => deriveFindings(stateSlice as unknown as SPCState) as DerivedFindings, [stateSlice]);
  const activeChartId: string = findingsChartId || chartOrder[0];
  const slot: ChartSlot | undefined = charts[activeChartId];

  const stats: StatsData | null = useMemo(() => {
    const f = (structuralFindings as Finding[] || []).find(
      (item: Finding) => item.generatorId === "statisticalSummary",
    );
    return (f?.context as StatsData) || null;
  }, [structuralFindings]);

  const handleSwitchChart = useCallback((chartId: string): void => {
    const state: SPCState = spcStore.getState() as SPCState;
    const withChart = setFindingsChart(state, chartId);
    const next = setStructuralFindings(withChart, generateFindings(withChart, chartId), chartId);
    spcStore.setState(next);
  }, []);

  const handleSelectFinding = useCallback((findingId: string): void => {
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
                {CATEGORIES.map((cat: string) => {
                  const items: Finding[] = derived.grouped[cat] || [];
                  if (items.length === 0) return null;
                  return (
                    <div key={cat} className="finding-category-group">
                      <span className="eyebrow">{CATEGORY_LABELS[cat]}</span>
                      {items.map((f: Finding) => (
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

import React, { useCallback } from "react";
import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import { buildMethodLabComparison, buildDisagreements, toggleMethodLabChart } from "../core/state.js";
import { capClass } from "../helpers.js";

function fmt(v, decimals = 4) {
  if (v == null || isNaN(v)) return "\u2014";
  return Number(v).toFixed(decimals);
}

// ─── Atomic renderers ───────────────────────────────

function MetricCell({ label, value, tone }) {
  const cls = tone ? ` ${tone}` : "";
  return (
    <div className={`ml-cell${cls}`}>
      <span className="eyebrow">{label}</span>
      <strong className="mono">{value}</strong>
    </div>
  );
}

function CapMetric({ label, value }) {
  if (value == null) return <MetricCell label={label} value="\u2014" />;
  return <MetricCell label={label} value={value.toFixed(2)} tone={`cap-${capClass(value)}`} />;
}

function RuleChips({ breakdown }) {
  if (!breakdown || breakdown.length === 0) return <span className="muted">None</span>;
  return (
    <>
      {breakdown.map((r) => (
        <span className="ml-rule-chip" key={r.testId}>
          R{r.testId}: {r.count}pt{r.count !== 1 ? "s" : ""}
        </span>
      ))}
    </>
  );
}

// ─── Section renderers ──────────────────────────────

function HeaderBar({ charts }) {
  const totalOOC = charts.reduce((s, c) => s + c.oocCount, 0);
  const totalRules = charts.reduce((s, c) => s + c.ruleCount, 0);
  const anyUnstable = totalOOC > 0;
  const badgeClass = anyUnstable ? "warning" : "good";
  const badgeLabel = anyUnstable ? `${totalOOC} OOC` : "Stable";

  const cpks = charts.filter((c) => c.cpk != null);
  const worstCpk = cpks.length > 0 ? Math.min(...cpks.map((c) => c.cpk)) : null;

  return (
    <div className="ml-header-bar">
      <div className={`health-badge ${badgeClass}`}>
        <span className="sdot"></span>{badgeLabel}
      </div>
      <div className="ml-header-metrics">
        <MetricCell label="Charts" value={String(charts.length)} tone="" />
        <MetricCell label="Total OOC" value={String(totalOOC)} tone={totalOOC > 0 ? "danger" : "good"} />
        <MetricCell label="Rules Fired" value={String(totalRules)} tone={totalRules > 0 ? "warning" : "good"} />
        {worstCpk != null && (
          <MetricCell label="Worst Cpk" value={worstCpk.toFixed(2)} tone={`cap-${capClass(worstCpk)}`} />
        )}
      </div>
    </div>
  );
}

function ChartColumn({ chart, children }) {
  const focusCls = chart.isFocused ? " ml-focused-col" : "";
  return (
    <div className={`ml-chart-col${focusCls}`}>
      <div className="ml-col-head">
        <strong className="mono">{chart.chartType}</strong>
      </div>
      <div className="ml-col-body">{children}</div>
    </div>
  );
}

function Section({ title, charts, rowDefs }) {
  return (
    <div className="ml-section-card">
      <span className="eyebrow">{title}</span>
      <div className="ml-columns">
        {charts.map((c) => (
          <ChartColumn key={c.id} chart={c}>
            {rowDefs.map((def) => (
              <MetricCell
                key={def.label}
                label={def.label}
                value={def.value(c)}
                tone={def.tone ? def.tone(c) : ""}
              />
            ))}
          </ChartColumn>
        ))}
      </div>
    </div>
  );
}

function ConfigSection({ charts }) {
  return (
    <Section
      title="Configuration"
      charts={charts}
      rowDefs={[
        { label: "Chart Type", value: (c) => c.chartType },
        { label: "Sigma Method", value: (c) => c.sigmaMethod },
        { label: "K-Sigma", value: (c) => fmt(c.kSigma, 1) },
        { label: "Subgroup", value: (c) => c.subgroup },
        { label: "Phase Column", value: (c) => c.phaseColumn },
        { label: "Nelson Rules", value: (c) => c.enabledRules.length > 0 ? c.enabledRules.join(", ") : "Default" },
      ]}
    />
  );
}

function ResultsSection({ charts }) {
  return (
    <Section
      title="Results"
      charts={charts}
      rowDefs={[
        { label: "UCL", value: (c) => fmt(c.ucl) },
        { label: "Center Line", value: (c) => fmt(c.center) },
        { label: "LCL", value: (c) => fmt(c.lcl) },
        { label: "\u03C3\u0302 (sigma hat)", value: (c) => fmt(c.sigmaHat) },
        { label: "Limits Scope", value: (c) => c.limitsScope },
        { label: "Phases", value: (c) => String(c.phaseCount) },
      ]}
    />
  );
}

function DetectionSection({ charts }) {
  return (
    <div className="ml-section-card">
      <span className="eyebrow">Detection</span>
      <div className="ml-columns">
        {charts.map((c) => (
          <ChartColumn key={c.id} chart={c}>
            <MetricCell label="OOC Points" value={String(c.oocCount)} tone={c.oocCount > 0 ? "danger" : "good"} />
            <MetricCell label="Rules Triggered" value={String(c.ruleCount)} tone={c.ruleCount > 0 ? "warning" : "good"} />
            <div className="ml-cell">
              <span className="eyebrow">Rule Breakdown</span>
              <div className="ml-rule-chips">
                <RuleChips breakdown={c.ruleBreakdown} />
              </div>
            </div>
          </ChartColumn>
        ))}
      </div>
    </div>
  );
}

function CapabilitySection({ charts }) {
  const hasAnyCap = charts.some((c) => c.cpk != null);

  if (!hasAnyCap) {
    return (
      <div className="ml-section-card">
        <span className="eyebrow">Capability</span>
        <p className="muted ml-no-cap">No spec limits set — configure USL/LSL to enable capability indices.</p>
      </div>
    );
  }

  return (
    <div className="ml-section-card">
      <span className="eyebrow">Capability</span>
      <div className="ml-columns">
        {charts.map((c) => (
          <ChartColumn key={c.id} chart={c}>
            <CapMetric label="Cpk" value={c.cpk} />
            <CapMetric label="Ppk" value={c.ppk} />
          </ChartColumn>
        ))}
      </div>
    </div>
  );
}

function DisagreementsSection({ disagreements }) {
  const { items, summary } = disagreements;

  if (items.length === 0) {
    return (
      <div className="ml-section-card ml-agree">
        <span className="eyebrow">Method Agreement</span>
        <div className="ml-agreement">
          <span className="sdot good"></span>
          <strong>All methods agree on every point</strong>
          <span className="muted">{summary.totalPoints} points analyzed</span>
        </div>
      </div>
    );
  }

  const capped = items.slice(0, 20);

  return (
    <div className="ml-section-card ml-disagree">
      <span className="eyebrow">Method Disagreements</span>
      <div className="ml-disagree-header">
        <div className="ml-disagree-stat">
          <strong className="mono">{summary.disagreementCount}</strong>
          <span className="muted">of {summary.totalPoints} points ({summary.pct}%)</span>
        </div>
        <div className="ml-unique-chips">
          {summary.uniqueCounts.map((u) => (
            <span className="ml-unique-chip" key={u.label}>{u.label}: {u.uniqueCount} unique</span>
          ))}
        </div>
      </div>
      <div className="ml-disagree-list">
        {capped.map((d, i) => (
          <div className="ml-disagree-row" key={i}>
            <div className="ml-disagree-point">
              <strong>{d.label}</strong>
              <span className="mono muted">{d.value != null ? fmt(d.value) : "\u2014"}</span>
            </div>
            <div className="ml-disagree-verdicts">
              {d.flaggedBy.map((f) => (
                <span className="ml-verdict critical" key={f.chartLabel}>
                  {f.chartLabel}: {f.rules.join("; ")}
                </span>
              ))}
              {d.clearedBy.map((label) => (
                <span className="ml-verdict positive" key={label}>
                  {label}: in-control
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      {items.length > 20 && (
        <p className="muted ml-more">Showing 20 of {items.length} disagreements</p>
      )}
    </div>
  );
}

function ChartPicker({ allCharts, selectedIds, onToggle }) {
  if (allCharts.length === 0) return null;
  const count = [...selectedIds].filter((id) => allCharts.some((c) => c.id === id)).length;
  return (
    <div className="ml-picker">
      <span className="eyebrow">Compare</span>
      <span className="ml-picker-count">{count}/{allCharts.length}</span>
      <div className="ml-picker-list">
        {allCharts.map((c) => {
          const sel = selectedIds.has(c.id);
          return (
            <div
              key={c.id}
              className={`ml-picker-item${sel ? " active" : ""}`}
              onClick={() => onToggle(c.id)}
              role="checkbox"
              aria-checked={sel}
              tabIndex={0}
            >
              <span className="ml-picker-check"></span>
              <span className="ml-picker-label">{c.chartType}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────

export default function MethodLabView() {
  const charts = useStore(spcStore, (s) => s.charts);
  const chartOrder = useStore(spcStore, (s) => s.chartOrder);
  const methodLabCharts = useStore(spcStore, (s) => s.methodLabCharts);

  const state = spcStore.getState();
  const allCharts = buildMethodLabComparison(state);

  const selectedIds = new Set(
    methodLabCharts && methodLabCharts.length > 0
      ? methodLabCharts.filter((id) => charts[id])
      : chartOrder
  );
  const selected = allCharts.filter((c) => selectedIds.has(c.id));

  const disagreements = buildDisagreements(state, [...selectedIds]);
  const chartCount = selected.length;

  const handleToggleChart = useCallback((chartId) => {
    if (chartId) spcStore.setState(toggleMethodLabChart(spcStore.getState(), chartId));
  }, []);

  return (
    <section className="route-panel">
      <div className="route-header">
        <div>
          <h3>Method Lab</h3>
          <p className="muted">
            {chartCount} of {allCharts.length} chart{allCharts.length !== 1 ? "s" : ""} selected
          </p>
        </div>
      </div>

      {allCharts.length === 0 ? (
        <p className="muted" style={{ padding: 16 }}>
          No charts to compare. Add a chart in the workspace first.
        </p>
      ) : (
        <div className="ml-body">
          <ChartPicker allCharts={allCharts} selectedIds={selectedIds} onToggle={handleToggleChart} />
          {chartCount === 0 ? (
            <p className="muted" style={{ padding: 8 }}>Select charts above to compare.</p>
          ) : (
            <>
              <HeaderBar charts={selected} />
              <div className="ml-sections">
                <ConfigSection charts={selected} />
                <ResultsSection charts={selected} />
                <DetectionSection charts={selected} />
                <CapabilitySection charts={selected} />
                {chartCount >= 2 && <DisagreementsSection disagreements={disagreements} />}
              </div>
              <p className="ml-guidance muted">
                Compare method deltas — the method with fewer false signals and better detection wins.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

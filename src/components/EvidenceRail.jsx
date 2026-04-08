import { useMemo } from "react";
import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import { deriveWorkspace, getFocused } from "../core/state/selectors.js";
import { toneClass } from "../helpers.js";


function fmtVal(v) {
  return v != null ? Number(v).toFixed(3) : "-";
}

function Breakdown({ breakdown }) {
  if (!breakdown) return null;
  const { inControl, oocCount, ruleBreakdown } = breakdown;
  const nelsonRules = ruleBreakdown.filter((r) => r.testId !== "1");
  return (
    <div className="rail-section breakdown-stats">
      <p className="eyebrow">Status</p>
      <ul className="evidence-list">
        <li>
          <span>In Control</span>
          <strong className="positive">{inControl}</strong>
        </li>
        <li>
          <span>Beyond Limits</span>
          <strong className={oocCount > 0 ? "danger" : ""}>{oocCount}</strong>
        </li>
      </ul>
      {nelsonRules.length > 0 && (
        <>
          <p className="eyebrow" style={{ marginTop: 6 }}>
            Nelson Tests
          </p>
          <ul className="evidence-list">
            {nelsonRules.map((r) => (
              <li key={r.testId}>
                <span>R{r.testId}</span>
                <strong className="warning">
                  {r.count} pt{r.count !== 1 ? "s" : ""}
                </strong>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function EvidenceRail() {
  const focusedChartId = useStore(spcStore, (s) => s.focusedChartId);
  const selectedPointIndex = useStore(spcStore, (s) => s.selectedPointIndex);
  const selectedPointIndices = useStore(spcStore, (s) => s.selectedPointIndices);
  const points = useStore(spcStore, (s) => s.points);
  const transforms = useStore(spcStore, (s) => s.transforms);
  const pipeline = useStore(spcStore, (s) => s.pipeline);
  const charts = useStore(spcStore, (s) => s.charts);
  const chartOrder = useStore(spcStore, (s) => s.chartOrder);

  const workspace = useMemo(
    () => deriveWorkspace(spcStore.getState()),
    [focusedChartId, selectedPointIndex, selectedPointIndices, points, transforms, pipeline, charts, chartOrder]
  );

  const {
    signal,
    selectedPoint,
    hasPointSelection,
    pointBreakdown,
    selectedPoints,
    rulesAtPoint,
    whyTriggered,
    evidence,
    selectedPhase,
  } = workspace;

  const tone = toneClass(signal.statusTone);
  const chartEvidence = evidence.filter((e) => e.category === "chart");
  const focusedSlot = getFocused(spcStore.getState());
  const chartLabel = focusedSlot?.context?.chartType?.label || "-";

  return (
    <aside className="evidence-rail">
      {/* --- POINT TIER (only when user explicitly selected a point) --- */}
      {hasPointSelection && selectedPoint && (
        <>
          <div className="rail-tier-label">
            <span className="eyebrow">Point</span>
            <span className="rail-tier-badge">{selectedPoint.label}</span>
          </div>

          <div className={`rail-section signal-hero ${tone}`}>
            <p className="eyebrow">Signal</p>
            <h3>{signal.title}</h3>
            <div className="signal-meta">
              <span className={`status-chip ${tone}`}>
                <span className="sdot"></span>
                {signal.confidence}
              </span>
              {rulesAtPoint.length > 0 && (
                <div className="rule-tags">
                  {rulesAtPoint.map((r) => (
                    <span
                      key={r.testId}
                      className="rule-tag"
                      title={r.description}
                    >
                      R{r.testId}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <Breakdown breakdown={pointBreakdown} />
        </>
      )}

      {/* --- SELECTION TIER (multi-point marquee) --- */}
      {selectedPoints && (
        <>
          <div className="rail-tier-label">
            <span className="eyebrow">Selection</span>
            <span className="rail-tier-badge selection-badge">
              {selectedPoints.count} pts
            </span>
          </div>

          <div className="rail-section signal-hero selection-hero">
            <p className="eyebrow">Selected Points</p>
            <h3>{selectedPoints.count} Points</h3>
            <div className="signal-meta">
              <span
                className={`status-chip ${selectedPoints.oocCount > 0 ? "critical" : "positive"}`}
              >
                <span className="sdot"></span>
                {selectedPoints.oocCount > 0
                  ? `${selectedPoints.oocCount} OOC`
                  : "All In Control"}
              </span>
              {selectedPoints.excludedCount > 0 && (
                <span className="selection-excluded-count">
                  {selectedPoints.excludedCount} excl
                </span>
              )}
            </div>
          </div>

          <Breakdown breakdown={selectedPoints} />

          <div className="rail-section selection-stats">
            <p className="eyebrow">Summary Statistics</p>
            <ul className="evidence-list">
              <li>
                <span>Mean</span>
                <strong>{fmtVal(selectedPoints.mean)}</strong>
              </li>
              <li>
                <span>Std Dev</span>
                <strong>{fmtVal(selectedPoints.stdDev)}</strong>
              </li>
              <li>
                <span>Min</span>
                <strong>{fmtVal(selectedPoints.min)}</strong>
              </li>
              <li>
                <span>Max</span>
                <strong>{fmtVal(selectedPoints.max)}</strong>
              </li>
              <li>
                <span>Range</span>
                <strong>{fmtVal(selectedPoints.range)}</strong>
              </li>
            </ul>
          </div>
        </>
      )}

      {/* --- PHASE TIER --- */}
      {selectedPhase && (
        <>
          <div className="rail-tier-label">
            <span className="eyebrow">Phase</span>
            <span className="rail-tier-badge phase-badge">
              {selectedPhase.index + 1}
            </span>
          </div>

          <div className="rail-section signal-hero phase-hero">
            <p className="eyebrow">Selected Phase</p>
            <h3>{selectedPhase.label}</h3>
            <div className="signal-meta">
              <span
                className={`status-chip ${selectedPhase.oocCount > 0 ? "critical" : "positive"}`}
              >
                <span className="sdot"></span>
                {selectedPhase.oocCount > 0
                  ? `${selectedPhase.oocCount} OOC`
                  : "In Control"}
              </span>
              <span className="phase-point-count">
                {selectedPhase.pointCount} pts
              </span>
            </div>
          </div>

          <Breakdown breakdown={selectedPhase} />

          <div className="rail-section phase-limits">
            <p className="eyebrow">Control Limits</p>
            <ul className="evidence-list">
              <li className="limit-ucl">
                <span>UCL</span>
                <strong>{fmtVal(selectedPhase.ucl)}</strong>
              </li>
              <li className="limit-cl">
                <span>CL</span>
                <strong>{fmtVal(selectedPhase.center)}</strong>
              </li>
              <li className="limit-lcl">
                <span>LCL</span>
                <strong>{fmtVal(selectedPhase.lcl)}</strong>
              </li>
            </ul>
          </div>

          <div className="rail-section phase-stats">
            <p className="eyebrow">Spread</p>
            <ul className="evidence-list">
              <li>
                <span>Range</span>
                <strong>{fmtVal(selectedPhase.range)}</strong>
              </li>
              <li>
                <span>1&#963;</span>
                <strong>{fmtVal(selectedPhase.sigma)}</strong>
              </li>
            </ul>
          </div>
        </>
      )}

      {/* --- CHART TIER --- */}
      <div className="rail-tier-label">
        <span className="eyebrow">Chart</span>
        <span className="rail-tier-badge">{chartLabel}</span>
      </div>

      <div className="rail-section">
        <p className="eyebrow">Violations</p>
        <ul className="rail-list">
          {whyTriggered.map((item, i) =>
            typeof item === "string" ? (
              <li key={i}>{item}</li>
            ) : (
              <li key={item.description || i}>
                {item.description} -{" "}
                <strong className="violation-count">
                  {item.count} point{item.count !== 1 ? "s" : ""}
                </strong>{" "}
                flagged.
              </li>
            )
          )}
        </ul>
      </div>

      <div className="rail-section">
        <p className="eyebrow">Method</p>
        <ul className="evidence-list">
          {chartEvidence.map((item) => (
            <li
              key={item.label}
              className={item.resolved ? "" : "unresolved"}
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

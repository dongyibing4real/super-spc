import React, { useCallback } from "react";
import { spcStore } from "../../store/spc-store.js";
import { ROLE_LABELS, fmt, fmtShort } from "./data-prep-utils.js";
import { profileColumn } from "../../data/data-prep-engine.js";
import { setExpandedProfileColumn } from "../../core/state/columns.js";
import type { DataPrepState, SPCState } from "../../types/state.js";
import type { ColumnTable } from "arquero";

interface ColumnInfo {
  name: string;
  ordinal: number;
  dtype: string;
  role: string | null;
}

interface DatasetItem {
  id: string;
  name: string;
}

interface ProfileData {
  histogram?: number[];
  min?: number;
  max?: number;
  median?: number;
  mean?: number;
  std?: number;
  count: number;
  missing: number;
  distinct?: number;
  minLength?: number;
  maxLength?: number;
  topValues?: { value: string; count: number }[];
  p10?: number;
  p90?: number;
  q1?: number;
  q3?: number;
  cv?: number;
  skewness?: number;
  kurtosis?: number;
  outlierCount?: number;
  balanceRatio?: number;
  emptyStrings?: number;
}

interface StatRowProps {
  label: string;
  value: string | number;
  cls?: string;
}

function StatRow({ label, value, cls }: StatRowProps): React.JSX.Element {
  return (
    <div className={`stat-row${cls ? " " + cls : ""}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

interface DetailedProfileProps {
  col: ColumnInfo;
  profile: ProfileData;
  onBack: () => void;
}

function DetailedProfile({ col, profile, onBack }: DetailedProfileProps): React.JSX.Element {
  const roleLabel: string | null = col.role ? (ROLE_LABELS as Record<string, string>)[col.role] || col.role : null;
  const completePct: number =
    profile.count > 0 ? ((profile.count - profile.missing) / profile.count) * 100 : 0;

  let distributionHtml: React.JSX.Element | null = null;
  let quantileHtml: React.JSX.Element | null = null;
  let momentsHtml: React.JSX.Element | null = null;
  let outlierHtml: React.JSX.Element | null = null;
  let normalityChip: React.JSX.Element | null = null;

  if (col.dtype === "numeric" && profile.histogram && profile.histogram.length > 0) {
    const skew: number = profile.skewness ?? 0;
    const kurt: number = profile.kurtosis ?? 0;
    let normLabel: string;
    let normClass: string;
    if (Math.abs(skew) < 0.5 && Math.abs(kurt) < 1) {
      normLabel = "Approx. normal";
      normClass = "col-normality-ok";
    } else if (Math.abs(skew) < 1 && Math.abs(kurt) < 2) {
      normLabel = "Mild non-normality";
      normClass = "col-normality-warn";
    } else {
      normLabel = "Non-normal";
      normClass = "col-normality-bad";
    }
    normalityChip = <span className={`col-normality-chip ${normClass}`}>{normLabel}</span>;

    distributionHtml = (
      <div className="col-detail-section">
        <div className="col-detail-section-head">
          <span className="col-detail-label">Distribution</span>
          {normalityChip}
        </div>
        <div className="col-hist col-hist-lg">
          {profile.histogram.map((h: number, i: number) => (
            <span
              key={i}
              className="col-hist-bar"
              style={{ height: `${Math.max(h * 100, 4)}%` }}
            />
          ))}
        </div>
      </div>
    );

    quantileHtml = (
      <div className="col-detail-section">
        <div className="col-detail-label">Quantiles</div>
        <table className="col-quant-table">
          <tbody>
            <tr>
              <td className="cqt-label">Min</td>
              <td className="cqt-val">{fmtShort(profile.min)}</td>
              <td className="cqt-label">Max</td>
              <td className="cqt-val">{fmtShort(profile.max)}</td>
            </tr>
            <tr>
              <td className="cqt-label">P10</td>
              <td className="cqt-val">{fmtShort(profile.p10)}</td>
              <td className="cqt-label">P90</td>
              <td className="cqt-val">{fmtShort(profile.p90)}</td>
            </tr>
            <tr>
              <td className="cqt-label">Q1 (25%)</td>
              <td className="cqt-val">{fmtShort(profile.q1)}</td>
              <td className="cqt-label">Q3 (75%)</td>
              <td className="cqt-val">{fmtShort(profile.q3)}</td>
            </tr>
            <tr>
              <td className="cqt-label">Median</td>
              <td className="cqt-val cqt-val-accent">{fmtShort(profile.median)}</td>
              <td className="cqt-label">IQR</td>
              <td className="cqt-val">
                {profile.q1 != null && profile.q3 != null
                  ? fmtShort(profile.q3 - profile.q1)
                  : "\u2014"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );

    const cvStr: string = profile.cv != null ? `${profile.cv.toFixed(1)}%` : "\u2014";
    const skewStr: string = profile.skewness != null ? profile.skewness.toFixed(3) : "\u2014";
    const kurtStr: string =
      profile.kurtosis != null ? `${profile.kurtosis.toFixed(3)} (excess)` : "\u2014";

    momentsHtml = (
      <div className="col-detail-section">
        <div className="col-detail-label">Moments</div>
        <StatRow label="Count" value={profile.count.toLocaleString()} />
        <StatRow
          label="Missing"
          value={
            profile.missing > 0
              ? `${profile.missing} (${(100 - completePct).toFixed(1)}%)`
              : "0"
          }
          cls={profile.missing > 0 ? "stat-row-warn" : ""}
        />
        <StatRow label="Mean" value={fmt(profile.mean)} />
        <StatRow label="Std Dev" value={fmt(profile.std)} />
        <StatRow label="CV" value={cvStr} />
        <StatRow label="Skewness" value={skewStr} />
        <StatRow label="Kurtosis" value={kurtStr} />
      </div>
    );

    if (profile.outlierCount != null) {
      const outlierPct: string =
        profile.count > 0 ? ((profile.outlierCount / profile.count) * 100).toFixed(1) : "0";
      outlierHtml = (
        <div className="col-detail-section">
          <div className="col-detail-label">Outliers (beyond &plusmn;3&sigma;)</div>
          <div
            className={`col-outlier-row${profile.outlierCount > 0 ? " col-outlier-row-warn" : ""}`}
          >
            <span className="col-outlier-count">{profile.outlierCount}</span>
            <span className="col-outlier-desc">
              {profile.outlierCount === 0
                ? "None detected"
                : `${outlierPct}% of rows \u2014 review in table`}
            </span>
          </div>
        </div>
      );
    }
  } else if (profile.topValues && profile.topValues.length > 0) {
    const maxCount: number = profile.topValues[0].count;

    const br: number | undefined = profile.balanceRatio;
    let balanceNote: string = "";
    let balanceClass: string = "";
    if (br != null) {
      if (br <= 1.5) {
        balanceNote = `Even distribution (ratio ${br.toFixed(1)}:1)`;
        balanceClass = "col-normality-ok";
      } else if (br <= 3) {
        balanceNote = `Slightly uneven (ratio ${br.toFixed(1)}:1)`;
        balanceClass = "col-normality-warn";
      } else {
        balanceNote = `Skewed distribution (ratio ${br.toFixed(0)}:1) \u2014 check subgroup balance`;
        balanceClass = "col-normality-bad";
      }
      normalityChip = <span className={`col-normality-chip ${balanceClass}`}>{balanceNote}</span>;
    }

    distributionHtml = (
      <div className="col-detail-section">
        <div className="col-detail-section-head">
          <span className="col-detail-label">Value Frequencies</span>
          {normalityChip}
        </div>
        <div className="col-top-values">
          {profile.topValues.slice(0, 10).map((t: { value: string; count: number }, i: number) => {
            const pct: string = maxCount > 0 ? ((t.count / maxCount) * 100).toFixed(0) : "0";
            const countPct: string =
              profile.count > 0 ? ((t.count / profile.count) * 100).toFixed(1) : "0";
            return (
              <div key={i} className="col-top-row">
                <span className="col-top-label mono">
                  {String(t.value).length > 16
                    ? String(t.value).slice(0, 16) + "\u2026"
                    : t.value}
                </span>
                <div className="col-top-track">
                  <div className="col-top-bar" style={{ width: `${pct}%` }} />
                </div>
                <span className="col-top-pct">{countPct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    );

    momentsHtml = (
      <div className="col-detail-section">
        <div className="col-detail-label">Summary</div>
        <StatRow label="Count" value={profile.count.toLocaleString()} />
        <StatRow
          label="Missing"
          value={
            profile.missing > 0
              ? `${profile.missing} (${(100 - completePct).toFixed(1)}%)`
              : "0"
          }
          cls={profile.missing > 0 ? "stat-row-warn" : ""}
        />
        <StatRow label="Distinct values" value={profile.distinct ?? 0} />
        <StatRow
          label="Cardinality"
          value={`${(((profile.distinct ?? 0) / Math.max(profile.count, 1)) * 100).toFixed(1)}% unique`}
        />
        {profile.minLength != null && (
          <StatRow label="Value length" value={`${profile.minLength}\u2013${profile.maxLength} chars`} />
        )}
        {(profile.emptyStrings ?? 0) > 0 && (
          <StatRow label="Empty strings" value={profile.emptyStrings!} cls="stat-row-warn" />
        )}
      </div>
    );
  }

  return (
    <div className="panel-card col-detail-panel">
      <div className="col-detail-header">
        <button
          className="col-detail-back"
          onClick={onBack}
          type="button"
        >
          &larr; Back
        </button>
      </div>
      <div className="col-detail-title">
        <span className="col-profile-name mono" style={{ fontSize: "12px" }}>
          {col.name}
        </span>
        <div className="col-profile-badges">
          {roleLabel && <span className="role-badge">{roleLabel}</span>}
          <span className="col-dtype-pill">{col.dtype}</span>
        </div>
      </div>
      <div className="col-completeness" style={{ margin: "8px 0" }}>
        <div className="col-completeness-track">
          <div
            className="col-completeness-fill"
            style={{ width: `${completePct.toFixed(1)}%` }}
          />
        </div>
        <span className="col-completeness-label">
          {completePct.toFixed(1)}% complete
          {profile.missing > 0 && ` \u00b7 ${profile.missing} missing`}
        </span>
      </div>
      {distributionHtml}
      {quantileHtml}
      {momentsHtml}
      {outlierHtml}
    </div>
  );
}

interface DatasetMetadataProps {
  dataPrep: DataPrepState;
  columns: ColumnInfo[];
}

export default function DatasetMetadata({ dataPrep, columns }: DatasetMetadataProps): React.JSX.Element {
  const state: SPCState = spcStore.getState();
  const datasets = state.datasets as unknown as DatasetItem[];
  const ds: DatasetItem | undefined = datasets.find((d: DatasetItem) => d.id === dataPrep.selectedDatasetId);

  const handleBack = useCallback((): void => {
    const s: SPCState = spcStore.getState();
    spcStore.setState({ ...s, dataPrep: { ...s.dataPrep, expandedProfileColumn: null } });
  }, []);

  if (!ds) {
    return (
      <div className="prep-sidepanel">
        <div className="panel-card">
          <p className="muted" style={{ fontSize: "11px" }}>
            Select a dataset to see details.
          </p>
        </div>
      </div>
    );
  }

  const cols: ColumnInfo[] = columns || [];
  const table = dataPrep.arqueroTable as ColumnTable | null;
  const cache: Record<string, ProfileData> = (dataPrep.profileCache || {}) as Record<string, ProfileData>;
  const selectedCol: string | null = dataPrep.expandedProfileColumn;

  if (table && cols.length > 0) {
    for (const c of cols) {
      if (!cache[c.name]) {
        try {
          cache[c.name] = profileColumn(table, c.name, c.dtype) as ProfileData;
        } catch {
          /* skip */
        }
      }
    }
  }

  let panel: React.JSX.Element | null = null;
  if (selectedCol) {
    const c: ColumnInfo | undefined = cols.find((col: ColumnInfo) => col.name === selectedCol);
    if (c && cache[c.name]) {
      panel = <DetailedProfile col={c} profile={cache[c.name]} onBack={handleBack} />;
    }
  }

  const totalRows: number = table ? table.numRows() : dataPrep.datasetPoints.length;
  const numCols: ColumnInfo[] = cols.filter((c: ColumnInfo) => c.dtype === "numeric");
  const textCols: ColumnInfo[] = cols.filter((c: ColumnInfo) => c.dtype !== "numeric");
  const totalMissing: number = Object.values(cache).reduce((sum: number, p: ProfileData) => sum + (p.missing || 0), 0);

  if (!panel) {
    panel = (
      <div className="panel-card prep-summary-panel">
        <h4>Summary</h4>
        <div className="prep-summary-grid">
          <div className="prep-summary-stat">
            <span className="prep-summary-label">Rows</span>
            <strong className="prep-summary-value">{totalRows.toLocaleString()}</strong>
          </div>
          <div className="prep-summary-stat">
            <span className="prep-summary-label">Columns</span>
            <strong className="prep-summary-value">{cols.length}</strong>
          </div>
          <div className="prep-summary-stat">
            <span className="prep-summary-label">Numeric</span>
            <strong className="prep-summary-value">{numCols.length}</strong>
          </div>
          <div className="prep-summary-stat">
            <span className="prep-summary-label">Text</span>
            <strong className="prep-summary-value">{textCols.length}</strong>
          </div>
          <div className="prep-summary-stat">
            <span className="prep-summary-label">Missing</span>
            <strong className="prep-summary-value">{totalMissing.toLocaleString()}</strong>
          </div>
          <div className="prep-summary-stat">
            <span className="prep-summary-label">Transforms</span>
            <strong className="prep-summary-value">{dataPrep.transforms.length}</strong>
          </div>
        </div>
      </div>
    );
  }

  return <div className="prep-sidepanel">{panel}</div>;
}

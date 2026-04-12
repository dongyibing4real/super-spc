import { useCallback } from "react";
import { spcStore } from "../../store/spc-store.js";
import { ROLE_LABELS, fmt, fmtShort } from "./data-prep-utils.js";
import { profileColumn } from "../../data/data-prep-engine.js";
import { setExpandedProfileColumn } from "../../core/state/columns.js";

function StatRow({ label, value, cls }) {
  return (
    <div className={`stat-row${cls ? " " + cls : ""}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function DetailedProfile({ col, profile, onBack }) {
  const roleLabel = col.role ? ROLE_LABELS[col.role] || col.role : null;
  const completePct =
    profile.count > 0 ? ((profile.count - profile.missing) / profile.count) * 100 : 0;

  let distributionHtml = null;
  let quantileHtml = null;
  let momentsHtml = null;
  let outlierHtml = null;
  let normalityChip = null;

  if (col.dtype === "numeric" && profile.histogram && profile.histogram.length > 0) {
    const skew = profile.skewness ?? 0;
    const kurt = profile.kurtosis ?? 0;
    let normLabel, normClass;
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
          {profile.histogram.map((h, i) => (
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

    const cvStr = profile.cv != null ? `${profile.cv.toFixed(1)}%` : "\u2014";
    const skewStr = profile.skewness != null ? profile.skewness.toFixed(3) : "\u2014";
    const kurtStr =
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
      const outlierPct =
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
    const maxCount = profile.topValues[0].count;

    const br = profile.balanceRatio;
    let balanceNote = "";
    let balanceClass = "";
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
          {profile.topValues.slice(0, 10).map((t, i) => {
            const pct = maxCount > 0 ? ((t.count / maxCount) * 100).toFixed(0) : 0;
            const countPct =
              profile.count > 0 ? ((t.count / profile.count) * 100).toFixed(1) : 0;
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
        <StatRow label="Distinct values" value={profile.distinct} />
        <StatRow
          label="Cardinality"
          value={`${((profile.distinct / Math.max(profile.count, 1)) * 100).toFixed(1)}% unique`}
        />
        {profile.minLength != null && (
          <StatRow label="Value length" value={`${profile.minLength}\u2013${profile.maxLength} chars`} />
        )}
        {profile.emptyStrings > 0 && (
          <StatRow label="Empty strings" value={profile.emptyStrings} cls="stat-row-warn" />
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

export default function DatasetMetadata({ dataPrep, columns }) {
  const datasets = spcStore.getState().datasets;
  const ds = datasets.find((d) => d.id === dataPrep.selectedDatasetId);

  const handleBack = useCallback(() => {
    spcStore.setState(setExpandedProfileColumn(spcStore.getState(), null));
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

  const cols = columns || [];
  const table = dataPrep.arqueroTable;
  const cache = dataPrep.profileCache || {};
  const selectedCol = dataPrep.expandedProfileColumn;

  if (table && cols.length > 0) {
    for (const c of cols) {
      if (!cache[c.name]) {
        try {
          cache[c.name] = profileColumn(table, c.name, c.dtype);
        } catch {
          /* skip */
        }
      }
    }
  }

  let panel = null;
  if (selectedCol) {
    const c = cols.find((col) => col.name === selectedCol);
    if (c && cache[c.name]) {
      panel = <DetailedProfile col={c} profile={cache[c.name]} onBack={handleBack} />;
    }
  }

  const totalRows = table ? table.numRows() : dataPrep.datasetPoints.length;
  const numCols = cols.filter((c) => c.dtype === "numeric");
  const textCols = cols.filter((c) => c.dtype !== "numeric");
  const totalMissing = Object.values(cache).reduce((sum, p) => sum + (p.missing || 0), 0);

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

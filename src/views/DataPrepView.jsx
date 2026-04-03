import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import { formatDate } from "../helpers.js";
import {
  getPage,
  previewTypeConversion,
  validateAllColumns,
  profileColumn,
} from "../data/data-prep-engine.js";

const ROW_OPS = [
  { action: "prep-filter", label: "Filter", short: "Flt", panel: "filter", key: "F" },
  { action: "prep-find-replace", label: "Find", short: "Fnd", panel: "find", key: "D" },
  { action: "prep-dedup", label: "Dedup", short: "Dup", panel: "dedup" },
  { action: "prep-missing", label: "Missing", short: "Miss", panel: "missing" },
  { action: "prep-trim", label: "Trim", short: "Trm", panel: null },
];

const COL_OPS = [
  { action: "prep-rename", label: "Rename", panel: "rename", key: "R" },
  { action: "prep-change-type", label: "Type", panel: "change_type", key: "T" },
  { action: "prep-calc", label: "Calc", panel: "calculated", key: "C" },
  { action: "prep-recode", label: "Recode", panel: "recode" },
  { action: "prep-bin", label: "Bin", panel: "bin" },
  { action: "prep-split", label: "Split", panel: "split" },
  { action: "prep-concat", label: "Concat", panel: "concat" },
];

const TRANSFORM_LABELS = {
  filter: "Filter",
  find: "Find/Replace",
  dedup: "Dedup",
  missing: "Missing",
  trim: "Trim",
  rename: "Rename",
  change_type: "Type",
  calculated: "Calc",
  recode: "Recode",
  bin: "Bin",
  split: "Split",
  concat: "Concat",
  validate: "Validate",
};

const ROLE_LABELS = { value: "Y", subgroup: "SG", phase: "PH", label: "LB" };

/* ── formatting helpers ──────────────────────────────────────────────── */

function fmtMini(v) {
  if (v == null) return "\u2014";
  const abs = Math.abs(v);
  if (abs >= 1000 || (abs > 0 && abs < 0.01)) return v.toExponential(1);
  if (abs >= 100) return v.toFixed(0);
  if (abs >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function fmt(v) {
  if (v == null) return "\u2014";
  const abs = Math.abs(v);
  if (abs >= 1000 || (abs < 0.01 && v !== 0)) return v.toExponential(3);
  return v.toFixed(4);
}

function fmtShort(v) {
  if (v == null) return "\u2014";
  const abs = Math.abs(v);
  if (abs >= 1000 || (abs < 0.01 && v !== 0)) return v.toExponential(2);
  return v.toFixed(3);
}

function transformSummary(tr) {
  const p = tr.params || {};
  switch (tr.type) {
    case "filter":
      return `${p.column} ${p.op} ${p.value || ""}`;
    case "find":
      return `${p.column === "__all__" ? "All" : p.column}: ${p.search}\u2192${p.replace}`;
    case "dedup":
      return `${(p.columns || []).length} keys`;
    case "missing":
      return `${p.column}: ${p.strategy}`;
    case "trim":
      return "";
    case "rename":
      return `${p.oldName}\u2192${p.newName}`;
    case "change_type":
      return `${p.column}\u2192${p.targetType}`;
    case "calculated":
      return p.newColName || "";
    case "recode":
      return p.column || "";
    case "bin":
      return `${p.column}\u2192${p.newColName || "binned"}`;
    case "split":
      return `${p.column} by "${p.delimiter}"`;
    case "concat":
      return p.newColName || "";
    case "validate":
      return `${p.column}: ${p.type}`;
    default:
      return "";
  }
}

/* ── sub-components ──────────────────────────────────────────────────── */

function StatRow({ label, value, cls }) {
  return (
    <div className={`stat-row${cls ? " " + cls : ""}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function ThProfile({ profile, dtype }) {
  if (!profile) return null;

  let distribution = null;
  let statsLine = null;

  if (dtype === "numeric" && profile.histogram?.length > 0) {
    distribution = (
      <div className="th-mini-hist-wrap">
        <div className="th-mini-hist">
          {profile.histogram.map((h, i) => (
            <span
              key={i}
              className="th-hist-bar"
              style={{ height: `${Math.max(h * 100, 4)}%` }}
            />
          ))}
        </div>
        <div className="th-mini-axis">
          <span>{fmtMini(profile.min)}</span>
          <span>{fmtMini(profile.max)}</span>
        </div>
      </div>
    );
    statsLine = (
      <div className="th-mini-stats">
        med {fmtMini(profile.median)} &middot; &sigma; {fmtMini(profile.std)}
      </div>
    );
  } else if (dtype !== "numeric" && profile.topValues?.length > 0) {
    const maxCount = profile.topValues[0]?.count || 0;
    distribution = (
      <div className="th-mini-heatmap">
        {Array.from({ length: 10 }, (_, i) => {
          const count = profile.topValues[i]?.count || 0;
          const intensity = maxCount > 0 ? count / maxCount : 0;
          return (
            <span
              key={i}
              className={`th-heat-cell${count === 0 ? " is-empty" : ""}`}
              style={{ "--heat-alpha": (0.16 + intensity * 0.72).toFixed(3) }}
            />
          );
        })}
      </div>
    );
    statsLine = (
      <div className="th-mini-stats">
        {profile.distinct} distinct
        {profile.minLength != null && ` \u00b7 len ${profile.minLength}\u2013${profile.maxLength}`}
      </div>
    );
  }

  if (!distribution) return null;

  const completePct =
    profile.count > 0
      ? (((profile.count - profile.missing) / profile.count) * 100).toFixed(0)
      : 0;

  return (
    <div className="th-profile">
      {profile.missing > 0 && (
        <div className="th-mini-complete">
          <div className="th-mini-complete-fill" style={{ width: `${completePct}%` }} />
        </div>
      )}
      {distribution}
      {statsLine}
    </div>
  );
}

function DetailedProfile({ col, profile }) {
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
          data-action="select-column"
          data-column={col.name}
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

/* ── DatasetList ─────────────────────────────────────────────────────── */

function DatasetList({ datasets, dataPrep }) {
  return (
    <div className="panel-card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <h4>Datasets</h4>
      <div className="ds-list">
        {datasets.length === 0 ? (
          <p className="muted" style={{ fontSize: "11px" }}>
            No datasets uploaded yet.
          </p>
        ) : (
          datasets.map((ds) => {
            const active = ds.id === dataPrep.selectedDatasetId;
            const confirming = dataPrep.confirmingDeleteId === ds.id;
            const meta = ds.metadata || {};
            return (
              <div
                key={ds.id}
                className={`ds-card${active ? " active" : ""}`}
                data-action="select-prep-dataset"
                data-dataset-id={ds.id}
              >
                <div className="ds-card-name">{ds.name}</div>
                <div className="ds-card-meta">
                  {ds.point_count} pts &middot; {formatDate(ds.created_at)}
                </div>
                {meta.value_column && (
                  <div className="ds-card-meta">col: {meta.value_column}</div>
                )}
                {active && (
                  <div className="ds-card-actions">
                    <button data-action="load-prep-to-chart" type="button">
                      Load to Chart
                    </button>
                    {confirming ? (
                      <>
                        <span className="ds-confirm-msg">Delete?</span>
                        <button
                          className="danger"
                          data-action="delete-dataset"
                          data-dataset-id={ds.id}
                          type="button"
                        >
                          Yes
                        </button>
                        <button data-action="cancel-delete" type="button">
                          No
                        </button>
                      </>
                    ) : (
                      <button
                        className="danger"
                        data-action="delete-dataset"
                        data-dataset-id={ds.id}
                        type="button"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <label className="ds-upload-btn">
        + Upload CSV
        <input type="file" accept=".csv" data-action="upload-csv" hidden />
      </label>
    </div>
  );
}

/* ── UtilityBar ──────────────────────────────────────────────────────── */

function UtilityBar({ dataPrep, datasets, columnConfig }) {
  const count = dataPrep.transforms.length;
  const unsaved = dataPrep.unsavedChanges;
  const ds = datasets.find((d) => d.id === dataPrep.selectedDatasetId);
  const table = dataPrep.arqueroTable;
  const totalRows = table ? table.numRows() : dataPrep.datasetPoints.length;
  const cols = (columnConfig.columns || []).length;
  const excl = dataPrep.excludedRows.length;
  const resetting = dataPrep.confirmingReset;

  return (
    <div className="prep-menubar">
      <div className="prep-menubar-left">
        <div className="prep-ds-block">
          <span className="prep-ds-nameplate">
            {ds ? (
              <span className="prep-ds-nameplate-name">{ds.name}</span>
            ) : (
              <span className="prep-ds-nameplate-empty">No dataset selected</span>
            )}
          </span>
          <div className="prep-meta-strip">
            {unsaved && (
              <span className="prep-meta-chip prep-meta-chip--warn">Unsaved</span>
            )}
            {ds && totalRows > 0 && (
              <span className="prep-meta-chip">{totalRows.toLocaleString()} rows</span>
            )}
            {ds && totalRows > 0 && (
              <span className="prep-meta-chip">{cols} cols</span>
            )}
            {count > 0 && (
              <span className="prep-meta-chip">{count} transforms</span>
            )}
            {excl > 0 && (
              <span className="prep-meta-chip prep-meta-chip--warn">{excl} excluded</span>
            )}
          </div>
        </div>
      </div>
      <div className="prep-menubar-right">
        <div className="prep-menubar-actions">
          <button
            data-action="prep-save"
            type="button"
            className={`prep-mbtn prep-mbtn-primary${unsaved ? " prep-mbtn-primary-active" : ""}`}
            title="Save cleaned dataset"
          >
            Save
          </button>
          <button
            data-action="prep-undo"
            type="button"
            className="prep-mbtn"
            title="Undo last transform (Z)"
            disabled={count === 0}
          >
            Undo{count > 0 && <span className="prep-undo-badge">{count}</span>}
          </button>
          <button
            data-action="prep-export-csv"
            type="button"
            className="prep-mbtn prep-mbtn-quiet"
            title="Download current data as CSV"
            disabled={!ds}
          >
            Export
          </button>
          <button
            data-action="prep-validate"
            type="button"
            className="prep-mbtn prep-mbtn-quiet"
            title="Validate data quality rules"
          >
            Validate
          </button>
        </div>
        <div className="prep-menubar-dangerzone">
          <button
            data-action="prep-reset"
            type="button"
            className={`prep-mbtn prep-mbtn-danger${resetting ? " prep-mbtn-danger-confirm" : ""}`}
            title="Discard all transforms and restore original data"
            disabled={count === 0}
          >
            {resetting ? "Confirm?" : "Reset"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── TransformToolbar ────────────────────────────────────────────────── */

function OpGroup({ label, groupClass, ops, activePanel }) {
  return (
    <div className={`prep-op-group prep-op-group--${groupClass}`}>
      <span className="prep-op-group-label">{label}</span>
      <div className="prep-op-group-actions" aria-label={`${label} operations`}>
        {ops.map((op) => (
          <button
            key={op.action}
            data-action={op.action}
            type="button"
            className={`prep-op-tab${op.panel && activePanel === op.panel ? " active" : ""}`}
            title={op.key ? `${op.label} (${op.key})` : undefined}
          >
            {op.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TransformToolbar({ activePanel }) {
  return (
    <div className="prep-transform-toolbar">
      <OpGroup label="Column" groupClass="column" ops={COL_OPS} activePanel={activePanel} />
      <OpGroup label="Row" groupClass="row" ops={ROW_OPS} activePanel={activePanel} />
    </div>
  );
}

/* ── PrepPanel ───────────────────────────────────────────────────────── */

function ColOptions({ cols }) {
  return cols.map((c) => (
    <option key={c.name} value={c.name}>
      {c.name}
    </option>
  ));
}

function PrepPanel({ dataPrep, columnConfig }) {
  const ap = dataPrep.activePanel;
  if (!ap) return null;

  const cols = columnConfig.columns || [];

  if (ap === "filter") {
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Column</span>
        <select data-field="filter-col">
          <ColOptions cols={cols} />
        </select>
        <span className="prep-panel-label">Op</span>
        <select data-field="filter-op">
          <option value="eq">=</option>
          <option value="neq">{"\u2260"}</option>
          <option value="gt">&gt;</option>
          <option value="lt">&lt;</option>
          <option value="gte">{"\u2265"}</option>
          <option value="lte">{"\u2264"}</option>
          <option value="contains">contains</option>
          <option value="not_contains">excludes</option>
          <option value="between">between</option>
          <option value="is_null">is null</option>
          <option value="is_not_null">not null</option>
        </select>
        <input type="text" data-field="filter-val" placeholder="value" />
        <input type="text" data-field="filter-val2" placeholder="max" style={{ display: "none" }} />
        <button data-action="prep-apply-filter" type="button" className="prep-panel-apply">
          Apply
        </button>
      </div>
    );
  }

  if (ap === "find") {
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Column</span>
        <select data-field="find-col">
          <option value="__all__">All columns</option>
          <ColOptions cols={cols} />
        </select>
        <span className="prep-panel-label">Find</span>
        <input type="text" data-field="find-search" placeholder="search" />
        <span className="prep-panel-label">Replace</span>
        <input type="text" data-field="find-replace" placeholder="replace with" />
        <label className="prep-panel-check">
          <input type="checkbox" data-field="find-regex" /> Regex
        </label>
        <button data-action="prep-apply-find" type="button" className="prep-panel-apply">
          Replace All
        </button>
      </div>
    );
  }

  if (ap === "dedup") {
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Key columns</span>
        {cols.map((c) => (
          <label key={c.name} className="prep-panel-check">
            <input type="checkbox" data-field="dedup-col" value={c.name} defaultChecked /> {c.name}
          </label>
        ))}
        <div className="prep-panel-sep" />
        <button data-action="prep-apply-dedup" type="button" className="prep-panel-apply">
          Remove Duplicates
        </button>
      </div>
    );
  }

  if (ap === "missing") {
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Column</span>
        <select data-field="missing-col">
          <ColOptions cols={cols} />
        </select>
        <span className="prep-panel-label">Strategy</span>
        <select data-field="missing-strategy">
          <option value="remove">Remove rows</option>
          <option value="fill_mean">Fill with mean</option>
          <option value="fill_median">Fill with median</option>
          <option value="fill_zero">Fill with zero</option>
          <option value="fill_custom">Fill with value</option>
          <option value="fill_down">Fill down</option>
          <option value="fill_up">Fill up</option>
        </select>
        <input
          type="text"
          data-field="missing-custom"
          placeholder="custom value"
          style={{ display: "none" }}
        />
        <button data-action="prep-apply-missing" type="button" className="prep-panel-apply">
          Apply
        </button>
      </div>
    );
  }

  /* Phase 2 panels */

  if (ap === "rename") {
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Column</span>
        <select data-field="rename-col">
          <ColOptions cols={cols} />
        </select>
        <span className="prep-panel-label">New name</span>
        <input type="text" data-field="rename-new" placeholder="new column name" />
        <button data-action="prep-apply-rename" type="button" className="prep-panel-apply">
          Rename
        </button>
      </div>
    );
  }

  if (ap === "change_type") {
    let previewHtml = null;
    if (dataPrep.arqueroTable && cols.length > 0) {
      const firstCol = cols[0].name;
      const firstTarget = cols[0].dtype === "numeric" ? "text" : "numeric";
      const pv = previewTypeConversion(dataPrep.arqueroTable, firstCol, firstTarget);
      previewHtml = (
        <span className="prep-preview-badge" data-field="type-preview">
          {pv.convertible}/{pv.total} convertible
        </span>
      );
    }
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Column</span>
        <select data-field="type-col">
          <ColOptions cols={cols} />
        </select>
        <span className="prep-panel-label">Convert to</span>
        <select data-field="type-target">
          <option value="numeric">Numeric</option>
          <option value="text">Text</option>
        </select>
        {previewHtml}
        <button data-action="prep-apply-change-type" type="button" className="prep-panel-apply">
          Convert
        </button>
      </div>
    );
  }

  if (ap === "calculated") {
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Name</span>
        <input
          type="text"
          data-field="calc-name"
          placeholder="new_column"
          style={{ width: "100px" }}
        />
        <span className="prep-panel-label">Expression</span>
        <input
          type="text"
          data-field="calc-expr"
          placeholder="[Thickness] * 25.4"
          style={{ minWidth: "200px" }}
        />
        <button data-action="prep-apply-calc" type="button" className="prep-panel-apply">
          Create
        </button>
        <span className="prep-hint">
          Columns: [Name] Functions: round, abs, log, sqrt, pow, min, max
        </span>
      </div>
    );
  }

  if (ap === "recode") {
    return (
      <div className="prep-panel" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="prep-panel-label">Column</span>
          <select data-field="recode-col">
            <ColOptions cols={cols} />
          </select>
          <label className="prep-panel-check">
            <input type="checkbox" data-field="recode-new-col" /> Save as new column
          </label>
          <input
            type="text"
            data-field="recode-new-name"
            placeholder="new column name"
            style={{ display: "none", width: "120px" }}
          />
          <button data-action="prep-apply-recode" type="button" className="prep-panel-apply">
            Recode
          </button>
        </div>
        <div className="prep-mapping-rows" data-field="recode-mappings">
          <div className="prep-mapping-row">
            <input type="text" data-field="recode-old" placeholder="old value" />
            <span className="prep-panel-label">{"\u2192"}</span>
            <input type="text" data-field="recode-new" placeholder="new value" />
          </div>
        </div>
        <button data-action="prep-recode-add-row" type="button" className="prep-mapping-add">
          + Add mapping
        </button>
      </div>
    );
  }

  if (ap === "bin") {
    const numericOpts = cols.filter((c) => c.dtype === "numeric");
    const binCols = numericOpts.length > 0 ? numericOpts : cols;
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Column</span>
        <select data-field="bin-col">
          <ColOptions cols={binCols} />
        </select>
        <span className="prep-panel-label">Bins</span>
        <input
          type="number"
          data-field="bin-count"
          defaultValue="5"
          min="2"
          max="100"
          style={{ width: "50px" }}
        />
        <label className="prep-panel-check">
          <input type="checkbox" data-field="bin-custom" /> Custom breaks
        </label>
        <input
          type="text"
          data-field="bin-breaks"
          placeholder="10, 20, 30"
          style={{ display: "none", minWidth: "120px" }}
        />
        <span className="prep-panel-label">Name</span>
        <input
          type="text"
          data-field="bin-name"
          placeholder="binned_col"
          style={{ width: "100px" }}
        />
        <button data-action="prep-apply-bin" type="button" className="prep-panel-apply">
          Bin
        </button>
      </div>
    );
  }

  if (ap === "split") {
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Column</span>
        <select data-field="split-col">
          <ColOptions cols={cols} />
        </select>
        <span className="prep-panel-label">Delimiter</span>
        <input
          type="text"
          data-field="split-delim"
          defaultValue=","
          style={{ width: "40px" }}
        />
        <span className="prep-panel-label">Parts</span>
        <input
          type="number"
          data-field="split-parts"
          defaultValue="2"
          min="2"
          max="10"
          style={{ width: "50px" }}
        />
        <button data-action="prep-apply-split" type="button" className="prep-panel-apply">
          Split
        </button>
      </div>
    );
  }

  if (ap === "concat") {
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Columns</span>
        {cols.map((c) => (
          <label key={c.name} className="prep-panel-check">
            <input type="checkbox" data-field="concat-col" value={c.name} /> {c.name}
          </label>
        ))}
        <div className="prep-panel-sep" />
        <span className="prep-panel-label">Separator</span>
        <input
          type="text"
          data-field="concat-sep"
          defaultValue=" "
          style={{ width: "40px" }}
        />
        <span className="prep-panel-label">Name</span>
        <input
          type="text"
          data-field="concat-name"
          placeholder="combined"
          style={{ width: "100px" }}
        />
        <button data-action="prep-apply-concat" type="button" className="prep-panel-apply">
          Concat
        </button>
      </div>
    );
  }

  /* Phase 3 panels */

  if (ap === "validate") {
    return (
      <div className="prep-panel">
        <span className="prep-panel-label">Column</span>
        <select data-field="validate-col">
          <ColOptions cols={cols} />
        </select>
        <span className="prep-panel-label">Rule</span>
        <select data-field="validate-type">
          <option value="range">Range (min&ndash;max)</option>
          <option value="allowed">Allowed values</option>
          <option value="regex">Regex pattern</option>
        </select>
        <input
          type="number"
          data-field="validate-min"
          placeholder="min"
          style={{ width: "60px" }}
        />
        <input
          type="number"
          data-field="validate-max"
          placeholder="max"
          style={{ width: "60px" }}
        />
        <input
          type="text"
          data-field="validate-values"
          placeholder="a, b, c"
          style={{ display: "none", minWidth: "120px" }}
        />
        <input
          type="text"
          data-field="validate-pattern"
          placeholder="^[A-Z]+"
          style={{ display: "none", minWidth: "120px" }}
        />
        <button data-action="prep-apply-validate" type="button" className="prep-panel-apply">
          Apply
        </button>
        <button
          data-action="prep-clear-validate"
          type="button"
          className="prep-tool-btn"
          title="Clear validation rule for selected column"
        >
          Clear
        </button>
      </div>
    );
  }

  return null;
}

/* ── TransformLedger ─────────────────────────────────────────────────── */

function TransformLedger({ transforms }) {
  if (transforms.length === 0) return null;

  return (
    <div className="prep-ledger">
      {transforms.map((tr, i) => {
        const label = TRANSFORM_LABELS[tr.type] || tr.type;
        const detail = transformSummary(tr);
        const isLast = i === transforms.length - 1;
        return (
          <div key={i} className={`ledger-step${isLast ? " ledger-step-last" : ""}`}>
            <span className="ledger-step-idx">{i + 1}</span>
            <span className="ledger-step-type">{label}</span>
            {detail && <span className="ledger-step-detail">{detail}</span>}
            {isLast && (
              <button
                className="ledger-undo"
                data-action="prep-undo"
                type="button"
                title="Undo last"
              >
                &times;
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── PrepTable ───────────────────────────────────────────────────────── */

function PrepCenter({ dataPrep, datasets, columnConfig }) {
  if (!dataPrep.selectedDatasetId) {
    return (
      <div className="prep-center">
        <div className="prep-table-wrap">
          <div className="prep-empty">Select a dataset to view its data.</div>
        </div>
      </div>
    );
  }
  if (dataPrep.loading) {
    return (
      <div className="prep-center">
        <div className="prep-table-wrap">
          <div className="prep-empty">Loading&hellip;</div>
        </div>
      </div>
    );
  }
  if (dataPrep.error) {
    return (
      <div className="prep-center">
        <div className="prep-table-wrap">
          <div className="prep-empty" style={{ color: "var(--red)" }}>
            {dataPrep.error}
          </div>
        </div>
      </div>
    );
  }

  const allCols = columnConfig.columns || [];
  const hidden = new Set(dataPrep.hiddenColumns || []);
  const cols = allCols.filter((c) => !hidden.has(c.name));
  const selectedCol = dataPrep.expandedProfileColumn;

  const table = dataPrep.arqueroTable;
  const totalRows = table ? table.numRows() : dataPrep.datasetPoints.length;

  let displayRows;
  if (table) {
    displayRows = getPage(table, 0, Math.min(totalRows, 500));
  } else {
    displayRows = dataPrep.datasetPoints.map((p) => p.raw_data || p.metadata || {});
  }

  // Profiles for column headers
  const cache = dataPrep.profileCache || {};
  if (table && allCols.length > 0) {
    for (const c of allCols) {
      if (!cache[c.name]) {
        try {
          cache[c.name] = profileColumn(table, c.name, c.dtype);
        } catch {
          /* skip */
        }
      }
    }
  }

  const validationMap = table ? validateAllColumns(table, allCols) : new Map();
  const excludedSet = new Set(dataPrep.excludedRows || []);
  const visibleRows = displayRows.slice(0, 500);
  const visibleIndices = visibleRows.map((_, idx) => idx);
  const selectedVisibleCount = visibleIndices.reduce(
    (sum, idx) => sum + (excludedSet.has(idx) ? 0 : 1),
    0,
  );
  const allVisibleSelected =
    visibleRows.length > 0 && selectedVisibleCount === visibleRows.length;
  const partiallySelected =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleRows.length;

  return (
    <div className="prep-center">
      <UtilityBar dataPrep={dataPrep} datasets={datasets} columnConfig={columnConfig} />
      <TransformToolbar activePanel={dataPrep.activePanel} />
      <PrepPanel dataPrep={dataPrep} columnConfig={columnConfig} />
      <TransformLedger transforms={dataPrep.transforms} />
      <div className="prep-table-area">
        <div className="prep-table-wrap" data-action="prep-table-scroll">
          <table className="prep-table">
            <thead>
              <tr>
                <th className="prep-row-select-head">
                  <button
                    className={`prep-master-checkbox${allVisibleSelected ? " is-selected" : ""}${partiallySelected ? " is-mixed" : ""}`}
                    data-action="prep-toggle-all-visible-rows"
                    type="button"
                    aria-pressed={allVisibleSelected ? "true" : "false"}
                    title={allVisibleSelected ? "Exclude visible rows" : "Keep visible rows"}
                  >
                    <span className="prep-row-checkbox" aria-hidden="true" />
                    <span className="prep-row-select-meta">
                      {selectedVisibleCount}/{visibleRows.length}
                    </span>
                  </button>
                </th>
                {cols.map((c) => {
                  const badge = c.role ? (
                    <span className="role-badge">{ROLE_LABELS[c.role] || c.role}</span>
                  ) : null;
                  const isSelected = c.name === selectedCol;
                  return (
                    <th
                      key={c.name}
                      className={`${cache[c.name] ? "th-with-profile" : ""}${isSelected ? " th-selected" : ""}`}
                      data-action="select-column"
                      data-column={c.name}
                    >
                      <div className="th-name-row">
                        {c.name}
                        {badge}
                      </div>
                      <ThProfile profile={cache[c.name]} dtype={c.dtype} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((raw, idx) => {
                const isExcluded = excludedSet.has(idx);
                return (
                  <tr
                    key={idx}
                    className={isExcluded ? "row-excluded" : ""}
                    data-row-idx={idx}
                  >
                    <td className="prep-row-select-cell">
                      <span className="prep-row-index mono" aria-hidden="true">
                        {idx + 1}
                      </span>
                      <button
                        className={`prep-row-toggle${!isExcluded ? " is-selected" : ""}`}
                        data-action="toggle-row-exclude"
                        data-row={idx}
                        type="button"
                        aria-pressed={!isExcluded ? "true" : "false"}
                        aria-label={
                          !isExcluded ? `Keep row ${idx + 1}` : `Exclude row ${idx + 1}`
                        }
                        title={!isExcluded ? "Keep row" : "Exclude row"}
                      >
                        <span className="prep-row-checkbox" aria-hidden="true" />
                      </button>
                    </td>
                    {cols.map((c) => {
                      const v = raw[c.name];
                      const invalid = validationMap.get(c.name)?.has(idx);
                      const isColSel = c.name === selectedCol;
                      return (
                        <td
                          key={c.name}
                          className={`mono${invalid ? " cell-invalid" : ""}${isColSel ? " col-selected" : ""}`}
                        >
                          {v != null ? v : "\u2014"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="prep-table-footer">
            {totalRows} rows &middot; {cols.length} columns
            {hidden.size > 0 && ` \u00b7 ${hidden.size} hidden`}
            {excludedSet.size > 0 && ` \u00b7 ${excludedSet.size} excluded`}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── PrepSidePanel ───────────────────────────────────────────────────── */

function PrepSidePanel({ dataPrep, datasets, columnConfig }) {
  const ds = datasets.find((d) => d.id === dataPrep.selectedDatasetId);
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

  const cols = columnConfig.columns || [];
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
      panel = <DetailedProfile col={c} profile={cache[c.name]} />;
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

/* ── Main component ──────────────────────────────────────────────────── */

export default function DataPrepView() {
  const dataPrep = useStore(spcStore, (s) => s.dataPrep);
  const columnConfig = useStore(spcStore, (s) => s.columnConfig);
  const datasets = useStore(spcStore, (s) => s.datasets);

  return (
    <section className="route-panel">
      <div className="route-header">
        <div>
          <h3>Data Prep</h3>
          <p className="muted">
            {datasets.length} dataset{datasets.length !== 1 ? "s" : ""} uploaded
          </p>
        </div>
      </div>
      <div className="dataprep-grid">
        <DatasetList datasets={datasets} dataPrep={dataPrep} />
        <PrepCenter dataPrep={dataPrep} datasets={datasets} columnConfig={columnConfig} />
        <PrepSidePanel dataPrep={dataPrep} datasets={datasets} columnConfig={columnConfig} />
      </div>
    </section>
  );
}

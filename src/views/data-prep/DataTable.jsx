import { useCallback } from "react";
import { spcStore } from "../../store/spc-store.js";
import { fmtMini, ROLE_LABELS } from "./data-prep-utils.js";
import {
  getPage,
  profileColumn,
  validateAllColumns,
} from "../../data/data-prep-engine.js";
import {
  toggleRowExclusion,
} from "../../core/state/data-prep.js";
import { setExpandedProfileColumn } from "../../core/state/columns.js";

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

export default function DataTable({ dataPrep, columns }) {
  const handleSelectColumn = useCallback((colName) => {
    spcStore.setState(setExpandedProfileColumn(spcStore.getState(), colName));
  }, []);

  const handleToggleRow = useCallback((rowIdx) => {
    spcStore.setState(toggleRowExclusion(spcStore.getState(), rowIdx));
  }, []);

  const handleToggleAllVisible = useCallback(() => {
    const state = spcStore.getState();
    const totalRows = state.dataPrep.arqueroTable ? state.dataPrep.arqueroTable.numRows() : state.dataPrep.datasetPoints.length;
    const visibleCount = Math.min(totalRows, 500);
    const current = new Set(state.dataPrep.excludedRows || []);
    const selectedVisibleCount = Array.from({ length: visibleCount }, (_, i) => i)
      .reduce((sum, i) => sum + (current.has(i) ? 0 : 1), 0);
    const shouldSelectAll = selectedVisibleCount !== visibleCount;
    for (let i = 0; i < visibleCount; i += 1) {
      if (shouldSelectAll) current.delete(i);
      else current.add(i);
    }
    spcStore.setState({ ...state, dataPrep: { ...state.dataPrep, excludedRows: [...current].sort((a, b) => a - b) } });
  }, []);

  if (!dataPrep.selectedDatasetId) {
    return (
      <div className="prep-table-wrap">
        <div className="prep-empty">Select a dataset to view its data.</div>
      </div>
    );
  }
  if (dataPrep.loading) {
    return (
      <div className="prep-table-wrap">
        <div className="prep-empty">Loading&hellip;</div>
      </div>
    );
  }
  if (dataPrep.error) {
    return (
      <div className="prep-table-wrap">
        <div className="prep-empty" style={{ color: "var(--red)" }}>
          {dataPrep.error}
        </div>
      </div>
    );
  }

  const allCols = columns || [];
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
      <div className="prep-table-area">
        <div className="prep-table-wrap">
          <table className="prep-table">
            <thead>
              <tr>
                <th className="prep-row-select-head">
                  <button
                    className={`prep-master-checkbox${allVisibleSelected ? " is-selected" : ""}${partiallySelected ? " is-mixed" : ""}`}
                    onClick={handleToggleAllVisible}
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
                      onClick={() => handleSelectColumn(c.name)}
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
                  >
                    <td className="prep-row-select-cell">
                      <span className="prep-row-index mono" aria-hidden="true">
                        {idx + 1}
                      </span>
                      <button
                        className={`prep-row-toggle${!isExcluded ? " is-selected" : ""}`}
                        onClick={() => handleToggleRow(idx)}
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
  );
}

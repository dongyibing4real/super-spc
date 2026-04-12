import React, { useCallback } from "react";
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
import type { DataPrepState, ChartPoint } from "../../types/state.js";
import type { ColumnTable } from "arquero";

interface ColumnInfo {
  name: string;
  ordinal: number;
  dtype: string;
  role: string | null;
}

interface ProfileData {
  histogram?: number[];
  min?: number;
  max?: number;
  median?: number;
  std?: number;
  count: number;
  missing: number;
  distinct?: number;
  minLength?: number;
  maxLength?: number;
  topValues?: { value: string; count: number }[];
}

interface ThProfileProps {
  profile: ProfileData | null;
  dtype: string;
}

function ThProfile({ profile, dtype }: ThProfileProps): React.JSX.Element | null {
  if (!profile) return null;

  let distribution: React.JSX.Element | null = null;
  let statsLine: React.JSX.Element | null = null;

  if (dtype === "numeric" && profile.histogram?.length) {
    distribution = (
      <div className="th-mini-hist-wrap">
        <div className="th-mini-hist">
          {profile.histogram.map((h: number, i: number) => (
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
  } else if (dtype !== "numeric" && profile.topValues?.length) {
    const maxCount: number = profile.topValues[0]?.count || 0;
    distribution = (
      <div className="th-mini-heatmap">
        {Array.from({ length: 10 }, (_: unknown, i: number) => {
          const count: number = profile.topValues![i]?.count || 0;
          const intensity: number = maxCount > 0 ? count / maxCount : 0;
          return (
            <span
              key={i}
              className={`th-heat-cell${count === 0 ? " is-empty" : ""}`}
              style={{ "--heat-alpha": (0.16 + intensity * 0.72).toFixed(3) } as React.CSSProperties}
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

  const completePct: string =
    profile.count > 0
      ? (((profile.count - profile.missing) / profile.count) * 100).toFixed(0)
      : "0";

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

interface DataTableProps {
  dataPrep: DataPrepState;
  columns: ColumnInfo[];
}

export default function DataTable({ dataPrep, columns }: DataTableProps): React.JSX.Element {
  const handleSelectColumn = useCallback((colName: string): void => {
    spcStore.setState(setExpandedProfileColumn(spcStore.getState(), colName));
  }, []);

  const handleToggleRow = useCallback((rowIdx: number): void => {
    spcStore.setState(toggleRowExclusion(spcStore.getState(), rowIdx));
  }, []);

  const handleToggleAllVisible = useCallback((): void => {
    const state = spcStore.getState();
    const dp = state.dataPrep as DataPrepState;
    const totalRows: number = dp.arqueroTable ? (dp.arqueroTable as { numRows(): number }).numRows() : dp.datasetPoints.length;
    const visibleCount: number = Math.min(totalRows, 500);
    const current = new Set<number>(dp.excludedRows || []);
    const selectedVisibleCount: number = Array.from({ length: visibleCount }, (_: unknown, i: number) => i)
      .reduce((sum: number, i: number) => sum + (current.has(i) ? 0 : 1), 0);
    const shouldSelectAll: boolean = selectedVisibleCount !== visibleCount;
    for (let i = 0; i < visibleCount; i += 1) {
      if (shouldSelectAll) current.delete(i);
      else current.add(i);
    }
    spcStore.setState({ ...state, dataPrep: { ...dp, excludedRows: [...current].sort((a: number, b: number) => a - b) } });
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

  const allCols: ColumnInfo[] = columns || [];
  const hidden = new Set<string>(dataPrep.hiddenColumns || []);
  const cols: ColumnInfo[] = allCols.filter((c: ColumnInfo) => !hidden.has(c.name));
  const selectedCol: string | null = dataPrep.expandedProfileColumn;

  const table = dataPrep.arqueroTable as ColumnTable | null;
  const totalRows: number = table ? table.numRows() : dataPrep.datasetPoints.length;

  let displayRows: Record<string, unknown>[];
  if (table) {
    displayRows = getPage(table, 0, Math.min(totalRows, 500)) as Record<string, unknown>[];
  } else {
    displayRows = dataPrep.datasetPoints.map((p: ChartPoint) => ((p as unknown as Record<string, unknown>).raw_data || (p as unknown as Record<string, unknown>).metadata || {}) as Record<string, unknown>);
  }

  // Profiles for column headers
  const cache: Record<string, ProfileData> = (dataPrep.profileCache || {}) as Record<string, ProfileData>;
  if (table && allCols.length > 0) {
    for (const c of allCols) {
      if (!cache[c.name]) {
        try {
          cache[c.name] = profileColumn(table, c.name, c.dtype) as ProfileData;
        } catch {
          /* skip */
        }
      }
    }
  }

  const validationMap: Map<string, Set<number>> = table ? validateAllColumns(table, allCols) as Map<string, Set<number>> : new Map();
  const excludedSet = new Set<number>(dataPrep.excludedRows || []);
  const visibleRows: Record<string, unknown>[] = displayRows.slice(0, 500);
  const visibleIndices: number[] = visibleRows.map((_: Record<string, unknown>, idx: number) => idx);
  const selectedVisibleCount: number = visibleIndices.reduce(
    (sum: number, idx: number) => sum + (excludedSet.has(idx) ? 0 : 1),
    0,
  );
  const allVisibleSelected: boolean =
    visibleRows.length > 0 && selectedVisibleCount === visibleRows.length;
  const partiallySelected: boolean =
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
                {cols.map((c: ColumnInfo) => {
                  const badge: React.JSX.Element | null = c.role ? (
                    <span className="role-badge">{(ROLE_LABELS as Record<string, string>)[c.role] || c.role}</span>
                  ) : null;
                  const isSelected: boolean = c.name === selectedCol;
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
                      <ThProfile profile={cache[c.name] || null} dtype={c.dtype} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((raw: Record<string, unknown>, idx: number) => {
                const isExcluded: boolean = excludedSet.has(idx);
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
                    {cols.map((c: ColumnInfo) => {
                      const v: unknown = raw[c.name];
                      const invalid: boolean = !!(validationMap.get(c.name)?.has(idx));
                      const isColSel: boolean = c.name === selectedCol;
                      return (
                        <td
                          key={c.name}
                          className={`mono${invalid ? " cell-invalid" : ""}${isColSel ? " col-selected" : ""}`}
                        >
                          {v != null ? String(v) : "\u2014"}
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

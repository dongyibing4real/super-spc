import React, { useCallback } from "react";
import { spcStore } from "../../store/spc-store.js";
import { formatDate } from "../../helpers.js";
import { createTable } from "../../data/data-prep-engine.js";
import {
  selectPrepDataset,
  setPrepError,
  deletePrepDataset,
  loadPrepPoints,
  setPrepParsedData,
} from "../../core/state/data-prep.js";
import { setColumns } from "../../core/state/columns.js";
import { navigate, setLoadingState, setError, setDatasets } from "../../core/state/ui.js";
import {
  createDataset,
  fetchDatasets,
  fetchRows,
  fetchColumns,
  deleteDataset,
} from "../../data/api.js";
import { parseCSV } from "../../data/csv-engine.js";
import { loadDatasetById } from "../../store/actions.js";
import type { DataPrepState, SPCState, ChartPoint } from "../../types/state.js";
import type { ColumnOut } from "../../types/api.js";

interface DatasetItem {
  id: string;
  name: string;
  point_count?: number;
  created_at?: string;
  metadata?: Record<string, unknown>;
}

interface DatasetManagerProps {
  datasets: DatasetItem[];
  dataPrep: DataPrepState;
}

export default function DatasetManager({ datasets, dataPrep }: DatasetManagerProps): React.JSX.Element {
  const handleSelectDataset = useCallback(async (dsId: string): Promise<void> => {
    const state: SPCState = spcStore.getState();
    spcStore.setState(selectPrepDataset(state, dsId));
    try {
      const [pts, cols] = await Promise.all([
        fetchRows(dsId) as unknown as Promise<ChartPoint[]>,
        fetchColumns(dsId).catch(() => [] as ColumnOut[]) as Promise<ColumnOut[]>,
      ]);
      let next: SPCState = setColumns(spcStore.getState(), cols);
      next = loadPrepPoints(next, pts);
      const rawRows = (pts as unknown as Array<{ raw_data?: Record<string, string> }>).map((p) => p.raw_data || {} as Record<string, string>);
      const arqueroTable = createTable(rawRows, cols);
      next = setPrepParsedData(next, { rawRows, arqueroTable, columns: cols });
      next = loadPrepPoints(next, pts);
      spcStore.setState(next);
    } catch (err: unknown) {
      spcStore.setState(setPrepError(spcStore.getState(), (err as Error).message));
    }
  }, []);

  const handleDeleteDataset = useCallback(async (dsId: string): Promise<void> => {
    const state: SPCState = spcStore.getState();
    if (state.dataPrep.confirmingDeleteId === dsId) {
      const next: SPCState = { ...state, dataPrep: { ...state.dataPrep, confirmingDeleteId: null } };
      try {
        await deleteDataset(dsId);
        const dsList = await fetchDatasets() as Array<{ id: string; name: string }>;
        spcStore.setState(deletePrepDataset(setDatasets(next, dsList), dsId));
      } catch (err: unknown) {
        spcStore.setState(setPrepError(next, (err as Error).message));
      }
    } else {
      spcStore.setState({ ...state, dataPrep: { ...state.dataPrep, confirmingDeleteId: dsId } });
    }
  }, []);

  const handleCancelDelete = useCallback((): void => {
    const state: SPCState = spcStore.getState();
    spcStore.setState({ ...state, dataPrep: { ...state.dataPrep, confirmingDeleteId: null } });
  }, []);

  const handleLoadToChart = useCallback(async (): Promise<void> => {
    const state: SPCState = spcStore.getState();
    if (state.dataPrep.selectedDatasetId) {
      await loadDatasetById(state.dataPrep.selectedDatasetId);
      const excludedSet = new Set<number>(state.dataPrep.excludedRows || []);
      const next: SPCState = spcStore.getState();
      if (excludedSet.size > 0 && next.points.length > 0) {
        const updated: SPCState = {
          ...next,
          points: next.points.map((p: ChartPoint, i: number) => (excludedSet.has(i) ? { ...p, excluded: true } : p)),
        };
        spcStore.setState(navigate(updated, "workspace"));
      } else {
        spcStore.setState(navigate(next, "workspace"));
      }
    }
  }, []);

  const handleUploadCSV = useCallback(async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file: File | undefined = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    spcStore.setState(setLoadingState(spcStore.getState(), true));
    try {
      const parsed = await parseCSV(file) as { rows: Record<string, string>[]; columns: ColumnOut[] };
      const arqueroTable = createTable(parsed.rows, parsed.columns);
      const name: string = file.name.replace(/\.csv$/i, "");
      const newDs = await createDataset({ name, columns: parsed.columns, rows: parsed.rows }) as { id: string };
      const dsList = await fetchDatasets() as Array<{ id: string; name: string }>;
      spcStore.setState(setDatasets(spcStore.getState(), dsList));
      spcStore.setState(setPrepParsedData(spcStore.getState(), {
        rawRows: parsed.rows,
        arqueroTable,
        columns: parsed.columns,
      }));
      await loadDatasetById(newDs.id);
    } catch (err: unknown) {
      spcStore.setState(setError(spcStore.getState(), (err as Error).message));
    }
  }, []);

  return (
    <div className="panel-card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <h4>Datasets</h4>
      <div className="ds-list">
        {datasets.length === 0 ? (
          <p className="muted" style={{ fontSize: "11px" }}>
            No datasets uploaded yet.
          </p>
        ) : (
          datasets.map((ds: DatasetItem) => {
            const active: boolean = ds.id === dataPrep.selectedDatasetId;
            const confirming: boolean = dataPrep.confirmingDeleteId === ds.id;
            const meta: Record<string, unknown> = ds.metadata || {};
            return (
              <div
                key={ds.id}
                className={`ds-card${active ? " active" : ""}`}
                onClick={() => handleSelectDataset(ds.id)}
              >
                <div className="ds-card-name">{ds.name}</div>
                <div className="ds-card-meta">
                  {ds.point_count} pts &middot; {formatDate(ds.created_at ?? null)}
                </div>
                {meta.value_column ? (
                  <div className="ds-card-meta">col: {String(meta.value_column)}</div>
                ) : null}
                {active && (
                  <div className="ds-card-actions" onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
                    <button onClick={handleLoadToChart} type="button">
                      Load to Chart
                    </button>
                    {confirming ? (
                      <>
                        <span className="ds-confirm-msg">Delete?</span>
                        <button
                          className="danger"
                          onClick={() => handleDeleteDataset(ds.id)}
                          type="button"
                        >
                          Yes
                        </button>
                        <button onClick={handleCancelDelete} type="button">
                          No
                        </button>
                      </>
                    ) : (
                      <button
                        className="danger"
                        onClick={() => handleDeleteDataset(ds.id)}
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
        <input type="file" accept=".csv" onChange={handleUploadCSV} hidden />
      </label>
    </div>
  );
}

import { useCallback } from "react";
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

export default function DatasetList({ datasets, dataPrep }) {
  const handleSelectDataset = useCallback(async (dsId) => {
    const state = spcStore.getState();
    spcStore.setState(selectPrepDataset(state, dsId));
    try {
      const [pts, cols] = await Promise.all([
        fetchRows(dsId),
        fetchColumns(dsId).catch(() => []),
      ]);
      let next = setColumns(spcStore.getState(), cols);
      next = loadPrepPoints(next, pts);
      const rawRows = pts.map((p) => p.raw_data || {});
      const arqueroTable = createTable(rawRows, cols);
      next = setPrepParsedData(next, { rawRows, arqueroTable, columns: cols });
      next = loadPrepPoints(next, pts);
      spcStore.setState(next);
    } catch (err) {
      spcStore.setState(setPrepError(spcStore.getState(), err.message));
    }
  }, []);

  const handleDeleteDataset = useCallback(async (dsId) => {
    const state = spcStore.getState();
    if (state.dataPrep.confirmingDeleteId === dsId) {
      const next = { ...state, dataPrep: { ...state.dataPrep, confirmingDeleteId: null } };
      try {
        await deleteDataset(dsId);
        const dsList = await fetchDatasets();
        spcStore.setState(deletePrepDataset(setDatasets(next, dsList), dsId));
      } catch (err) {
        spcStore.setState(setPrepError(next, err.message));
      }
    } else {
      spcStore.setState({ ...state, dataPrep: { ...state.dataPrep, confirmingDeleteId: dsId } });
    }
  }, []);

  const handleCancelDelete = useCallback(() => {
    const state = spcStore.getState();
    spcStore.setState({ ...state, dataPrep: { ...state.dataPrep, confirmingDeleteId: null } });
  }, []);

  const handleLoadToChart = useCallback(async () => {
    const state = spcStore.getState();
    if (state.dataPrep.selectedDatasetId) {
      await loadDatasetById(state.dataPrep.selectedDatasetId);
      const excludedSet = new Set(state.dataPrep.excludedRows || []);
      let next = spcStore.getState();
      if (excludedSet.size > 0 && next.points.length > 0) {
        next = {
          ...next,
          points: next.points.map((p, i) => (excludedSet.has(i) ? { ...p, excluded: true } : p)),
        };
      }
      spcStore.setState(navigate(next, "workspace"));
    }
  }, []);

  const handleUploadCSV = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    spcStore.setState(setLoadingState(spcStore.getState(), true));
    try {
      const parsed = await parseCSV(file);
      const arqueroTable = createTable(parsed.rows, parsed.columns);
      const name = file.name.replace(/\.csv$/i, "");
      const newDs = await createDataset({ name, columns: parsed.columns, rows: parsed.rows });
      const dsList = await fetchDatasets();
      spcStore.setState(setDatasets(spcStore.getState(), dsList));
      spcStore.setState(setPrepParsedData(spcStore.getState(), {
        rawRows: parsed.rows,
        arqueroTable,
        columns: parsed.columns,
      }));
      await loadDatasetById(newDs.id);
    } catch (err) {
      spcStore.setState(setError(spcStore.getState(), err.message));
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
          datasets.map((ds) => {
            const active = ds.id === dataPrep.selectedDatasetId;
            const confirming = dataPrep.confirmingDeleteId === ds.id;
            const meta = ds.metadata || {};
            return (
              <div
                key={ds.id}
                className={`ds-card${active ? " active" : ""}`}
                onClick={() => handleSelectDataset(ds.id)}
              >
                <div className="ds-card-name">{ds.name}</div>
                <div className="ds-card-meta">
                  {ds.point_count} pts &middot; {formatDate(ds.created_at)}
                </div>
                {meta.value_column && (
                  <div className="ds-card-meta">col: {meta.value_column}</div>
                )}
                {active && (
                  <div className="ds-card-actions" onClick={(e) => e.stopPropagation()}>
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

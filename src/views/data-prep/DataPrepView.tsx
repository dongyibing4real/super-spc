import React from "react";
import { useStore } from "zustand";
import { spcStore } from "../../store/spc-store.js";
import DatasetManager from "./DatasetManager.jsx";
import DataTable from "./DataTable.jsx";
import DatasetMetadata from "./DatasetMetadata.jsx";
import TransformPanel from "./TransformPanel.jsx";
import type { SPCState, DataPrepState } from "../../types/state.js";

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

export default function DataPrepView(): React.JSX.Element {
  const dataPrep = useStore(spcStore, (s: SPCState) => s.dataPrep);
  const columns = useStore(spcStore, (s: SPCState) => s.columnConfig.columns) as ColumnInfo[];
  const datasets = useStore(spcStore, (s: SPCState) => s.datasets) as DatasetItem[];

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
        <DatasetManager datasets={datasets} dataPrep={dataPrep} />
        <div className="prep-center">
          <TransformPanel dataPrep={dataPrep} columns={columns} datasets={datasets} />
          <DataTable dataPrep={dataPrep} columns={columns} />
        </div>
        <DatasetMetadata dataPrep={dataPrep} columns={columns} />
      </div>
    </section>
  );
}

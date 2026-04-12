import { useStore } from "zustand";
import { spcStore } from "../../store/spc-store.js";
import DatasetManager from "./DatasetManager.jsx";
import DataTable from "./DataTable.jsx";
import DatasetMetadata from "./DatasetMetadata.jsx";
import TransformPanel from "./TransformPanel.jsx";

export default function DataPrepView() {
  const dataPrep = useStore(spcStore, (s) => s.dataPrep);
  const columns = useStore(spcStore, (s) => s.columnConfig.columns);
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

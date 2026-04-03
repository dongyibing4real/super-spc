import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import { clearNotice } from "../core/state.js";
import { toneClass } from "../helpers.js";

export default function Notice() {
  const notice = useStore(spcStore, (s) => s.ui.notice);

  if (!notice) return null;

  return (
    <div className={`notice ${toneClass(notice.tone)}`}>
      <div>
        <strong>{notice.title}</strong>{" "}
        <span className="muted">{notice.body}</span>
      </div>
      <button
        className="ghost-action"
        type="button"
        onClick={() => spcStore.setState(clearNotice(spcStore.getState()))}
      >
        {"\u00d7"}
      </button>
    </div>
  );
}

export function LoadingState() {
  return (
    <section className="loading-state">
      <div className="loading-spinner" />
      <p>Loading dataset...</p>
    </section>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <section className="error-state">
      <h3>Something went wrong</h3>
      <p>{error}</p>
      <button className="primary-action" type="button" onClick={onRetry}>
        Retry
      </button>
    </section>
  );
}

export function EmptyState() {
  return (
    <section className="empty-state">
      <h3>No datasets yet</h3>
      <p>Upload a CSV file to get started with your first control chart.</p>
      <label className="primary-action upload-btn" type="button">
        Upload CSV
        <input type="file" accept=".csv" data-action="upload-csv" hidden />
      </label>
    </section>
  );
}

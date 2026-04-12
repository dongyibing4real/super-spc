import React from "react";
import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";
import { clearNotice } from "../core/state/ui.js";
import { toneClass } from "../helpers.js";
import type { SPCState } from "../types/state.js";

interface NoticeData {
  title: string;
  body: string;
  tone?: string;
}

export default function Notice(): React.JSX.Element | null {
  const notice = useStore(spcStore, (s: SPCState) => s.ui.notice) as NoticeData | null;

  if (!notice) return null;

  return (
    <div className={`notice ${toneClass(notice.tone ?? "")}`}>
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

export function LoadingState(): React.JSX.Element {
  return (
    <section className="loading-state">
      <div className="loading-spinner" />
      <p>Loading dataset...</p>
    </section>
  );
}

interface ErrorStateProps {
  error: string;
  onRetry?: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps): React.JSX.Element {
  return (
    <section className="error-state">
      <h3>Something went wrong</h3>
      <p>{error}</p>
      <button className="primary-action" type="button" data-action="retry-load">
        Retry
      </button>
    </section>
  );
}

export function EmptyState(): React.JSX.Element {
  return (
    <section className="empty-state">
      <h3>No datasets yet</h3>
      <p>Upload a CSV file to get started with your first control chart.</p>
      <label className="primary-action upload-btn">
        Upload CSV
        <input type="file" accept=".csv" data-action="upload-csv" hidden />
      </label>
    </section>
  );
}

import { toneClass } from "../helpers.js";

export function renderNotice(state) {
  if (!state.ui.notice) return "";
  return `
    <div class="notice ${toneClass(state.ui.notice.tone)}">
      <div><strong>${state.ui.notice.title}</strong> <span class="muted">${state.ui.notice.body}</span></div>
      <button class="ghost-action" data-action="clear-notice" type="button">\u00d7</button>
    </div>
  `;
}

export function renderLoadingState() {
  return `
    <section class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading dataset...</p>
    </section>
  `;
}

export function renderErrorState(state) {
  return `
    <section class="error-state">
      <h3>Something went wrong</h3>
      <p>${state.error}</p>
      <button class="primary-action" data-action="retry-load" type="button">Retry</button>
    </section>
  `;
}

export function renderEmptyState() {
  return `
    <section class="empty-state">
      <h3>No datasets yet</h3>
      <p>Upload a CSV file to get started with your first control chart.</p>
      <label class="primary-action upload-btn" type="button">
        Upload CSV
        <input type="file" accept=".csv" data-action="upload-csv" hidden />
      </label>
    </section>
  `;
}

// Thin fetch wrappers for the FastAPI backend.
// The Vite dev server proxies /api → http://127.0.0.1:8000,
// so every URL here is relative.

async function request(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) message = body.detail;
    } catch { /* ignore parse errors */ }
    throw new Error(message);
  }
  if (res.status === 204) return;
  return res.json();
}

/** GET /api/datasets → [{id, name, created_at, point_count, metadata}] */
export function fetchDatasets() {
  return request("/api/datasets");
}

/** GET /api/datasets/:id/points → [{id, value, subgroup, sequence_index, metadata}] */
export function fetchPoints(datasetId) {
  return request(`/api/datasets/${datasetId}/points`);
}

/**
 * POST /api/datasets/:id/analyze
 * @param {number|string} datasetId
 * @param {{sigma_method?: string, k_sigma?: number, usl?: number, lsl?: number}} params
 * @returns {Promise<{id, dataset_id, sigma, limits, zones, capability, created_at}>}
 */
export function runAnalysis(datasetId, params) {
  return request(`/api/datasets/${datasetId}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

/**
 * POST /api/datasets/upload (multipart form, field "file")
 * @param {File} file
 * @returns {Promise<{id, name, created_at, point_count, metadata}>}
 */
export function uploadCsv(file) {
  const form = new FormData();
  form.append("file", file);
  return request("/api/datasets/upload", {
    method: "POST",
    body: form,
  });
}

/** DELETE /api/datasets/:id → void */
export function deleteDataset(datasetId) {
  return request(`/api/datasets/${datasetId}`, { method: "DELETE" });
}

/** GET /api/datasets/:id → {id, name, created_at, columns, point_count, metadata} */
export function fetchDatasetDetail(datasetId) {
  return request(`/api/datasets/${datasetId}`);
}

/** GET /api/datasets/:id/columns → [{name, ordinal, dtype, role}] */
export function fetchColumns(datasetId) {
  return request(`/api/datasets/${datasetId}/columns`);
}

/**
 * PUT /api/datasets/:id/columns — update column roles
 * @param {string} datasetId
 * @param {Array<{name: string, role: string|null}>} columns
 * @returns {Promise<Array<{name, ordinal, dtype, role}>>}
 */
export function updateColumnRoles(datasetId, columns) {
  return request(`/api/datasets/${datasetId}/columns`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ columns }),
  });
}

/** GET /api/datasets/:id/raw → [{...originalColumns, _sequence_index, _value, _subgroup}] */
export function fetchRawData(datasetId) {
  return request(`/api/datasets/${datasetId}/raw`);
}

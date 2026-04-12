// Thin fetch wrappers for the FastAPI backend.
// The Vite dev server proxies /api → http://127.0.0.1:8000,
// so every URL here is relative.

import type {
  AnalysisRequest,
  AnalysisResult,
  ColumnOut,
  ColumnRoleUpdate,
  CreateDatasetRequest,
  DataRowOut,
  DatasetDetail,
  DatasetSummary,
  ForecastOut,
} from "../types/api.ts";

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) message = body.detail;
    } catch { /* ignore parse errors */ }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function fetchDatasets(): Promise<DatasetSummary[]> {
  return request<DatasetSummary[]>("/api/datasets");
}

export function fetchRows(datasetId: string | number): Promise<DataRowOut[]> {
  return request<DataRowOut[]>(`/api/datasets/${datasetId}/rows`);
}

export function runAnalysis(datasetId: string | number, params: AnalysisRequest): Promise<AnalysisResult> {
  return request<AnalysisResult>(`/api/datasets/${datasetId}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export function createDataset(payload: CreateDatasetRequest): Promise<DatasetDetail> {
  return request<DatasetDetail>("/api/datasets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteDataset(datasetId: string | number): Promise<void> {
  return request<void>(`/api/datasets/${datasetId}`, { method: "DELETE" });
}

export function fetchDatasetDetail(datasetId: string | number): Promise<DatasetDetail> {
  return request<DatasetDetail>(`/api/datasets/${datasetId}`);
}

export function fetchColumns(datasetId: string | number): Promise<ColumnOut[]> {
  return request<ColumnOut[]>(`/api/datasets/${datasetId}/columns`);
}

export function updateColumnRoles(datasetId: string | number, columns: ColumnRoleUpdate[]): Promise<ColumnOut[]> {
  return request<ColumnOut[]>(`/api/datasets/${datasetId}/columns`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ columns }),
  });
}

export function fetchRawData(datasetId: string | number): Promise<Record<string, unknown>[]> {
  return request<Record<string, unknown>[]>(`/api/datasets/${datasetId}/raw`);
}

export function runForecast(
  datasetId: string | number,
  params: { horizon?: number; confidence_level?: number; value_column?: string; time_budget?: number },
): Promise<ForecastOut> {
  return request<ForecastOut>(`/api/datasets/${datasetId}/forecast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export function predictForecast(
  datasetId: string | number,
  params: { horizon?: number; confidence_level?: number },
): Promise<ForecastOut> {
  return request<ForecastOut>(`/api/datasets/${datasetId}/forecast/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

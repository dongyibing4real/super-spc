import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchDatasets,
  fetchPoints,
  runAnalysis,
  uploadCsv,
  deleteDataset,
} from "../src/data/api.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Response-like object for the fetch mock. */
function fakeResponse(body, { status = 200, ok = true } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

/** Install a one-shot fetch mock that records the call and returns `response`. */
function mockFetch(response) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return response;
  };
  return calls;
}

/** Install a fetch mock that rejects with the given error. */
function mockFetchReject(error) {
  globalThis.fetch = async () => { throw error; };
}

// Restore real fetch (if any) after all tests.
const originalFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = originalFetch; });

// ---------------------------------------------------------------------------
// fetchDatasets
// ---------------------------------------------------------------------------

test("fetchDatasets calls GET /api/datasets and returns parsed JSON", async () => {
  const data = [{ id: 1, name: "test", created_at: "2026-01-01", point_count: 10, metadata: {} }];
  const calls = mockFetch(fakeResponse(data));

  const result = await fetchDatasets();
  assert.deepEqual(result, data);
  assert.equal(calls[0].url, "/api/datasets");
  assert.deepEqual(calls[0].opts, {});
});

// ---------------------------------------------------------------------------
// fetchPoints
// ---------------------------------------------------------------------------

test("fetchPoints calls GET /api/datasets/:id/points", async () => {
  const points = [{ id: 1, value: 3.5, subgroup: 1, sequence_index: 0, metadata: {} }];
  const calls = mockFetch(fakeResponse(points));

  const result = await fetchPoints(42);
  assert.deepEqual(result, points);
  assert.equal(calls[0].url, "/api/datasets/42/points");
});

// ---------------------------------------------------------------------------
// runAnalysis
// ---------------------------------------------------------------------------

test("runAnalysis sends POST with JSON body to /api/datasets/:id/analyze", async () => {
  const analysis = { id: 1, dataset_id: 5, sigma: 1.2, limits: {}, zones: [], capability: {}, created_at: "2026-01-01" };
  const calls = mockFetch(fakeResponse(analysis));

  const params = { sigma_method: "mr", k_sigma: 3 };
  const result = await runAnalysis(5, params);

  assert.deepEqual(result, analysis);
  assert.equal(calls[0].url, "/api/datasets/5/analyze");
  assert.equal(calls[0].opts.method, "POST");
  assert.equal(calls[0].opts.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].opts.body), params);
});

// ---------------------------------------------------------------------------
// uploadCsv
// ---------------------------------------------------------------------------

test("uploadCsv sends POST with FormData to /api/datasets/upload", async () => {
  const uploaded = { id: 7, name: "data.csv", created_at: "2026-01-01", point_count: 50, metadata: {} };
  const calls = mockFetch(fakeResponse(uploaded));

  // Minimal File-like object (node:test doesn't have File/FormData by default,
  // but Node 18+ exposes them on globalThis).
  const file = new Blob(["a,b\n1,2"], { type: "text/csv" });
  const result = await uploadCsv(file);

  assert.deepEqual(result, uploaded);
  assert.equal(calls[0].url, "/api/datasets/upload");
  assert.equal(calls[0].opts.method, "POST");
  // Body should be FormData instance
  assert.ok(calls[0].opts.body instanceof FormData);
});

// ---------------------------------------------------------------------------
// deleteDataset
// ---------------------------------------------------------------------------

test("deleteDataset sends DELETE and returns undefined for 204", async () => {
  const calls = mockFetch(fakeResponse(null, { status: 204 }));

  const result = await deleteDataset(99);
  assert.equal(result, undefined);
  assert.equal(calls[0].url, "/api/datasets/99");
  assert.equal(calls[0].opts.method, "DELETE");
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

test("non-ok response throws with API detail message", async () => {
  mockFetch(fakeResponse({ detail: "Dataset not found" }, { status: 404, ok: false }));

  await assert.rejects(
    () => fetchDatasets(),
    { message: "Dataset not found" },
  );
});

test("non-ok response without parseable detail throws generic message", async () => {
  const badResponse = {
    ok: false,
    status: 500,
    json: async () => { throw new SyntaxError("bad json"); },
  };
  mockFetch(badResponse);

  await assert.rejects(
    () => fetchDatasets(),
    { message: "Request failed (500)" },
  );
});

// ---------------------------------------------------------------------------
// Network error
// ---------------------------------------------------------------------------

test("network error propagates from fetch", async () => {
  const err = new TypeError("Failed to fetch");
  mockFetchReject(err);

  await assert.rejects(
    () => fetchPoints(1),
    (thrown) => {
      assert.equal(thrown, err);
      return true;
    },
  );
});

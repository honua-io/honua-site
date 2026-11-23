import assert from "node:assert/strict";
import test from "node:test";

import { fetchWithRetry, isTransientStatus } from "./fetch-retry.mjs";

const noDelay = async () => {};

test("transient statuses are 429 and 5xx only", () => {
  assert.deepEqual([200, 301, 404, 410, 429, 500, 503].map(isTransientStatus), [false, false, false, false, true, true, true]);
});

test("retries a 503 with back-off, then returns the good answer", async () => {
  const delays = [];
  let calls = 0;
  const response = await fetchWithRetry("https://example.test/", {}, {
    fetcher: async () => ({ status: ++calls < 3 ? 503 : 200 }),
    delay: async (ms) => { delays.push(ms); },
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [2000, 4000]);
});

test("returns the last transient response once attempts run out", async () => {
  let calls = 0;
  const response = await fetchWithRetry("https://example.test/", {}, { fetcher: async () => { calls++; return { status: 429 }; }, delay: noDelay });
  assert.equal(response.status, 429);
  assert.equal(calls, 3);
});

test("a 404 answers on the first attempt", async () => {
  let calls = 0;
  const response = await fetchWithRetry("https://example.test/", {}, { fetcher: async () => { calls++; return { status: 404 }; }, delay: noDelay });
  assert.equal(response.status, 404);
  assert.equal(calls, 1);
});

test("a refused redirect is not retried", async () => {
  let calls = 0;
  await assert.rejects(() => fetchWithRetry("https://example.test/", { redirect: "error" }, {
    fetcher: async () => { calls++; throw new TypeError("fetch failed", { cause: new Error("unexpected redirect") }); },
    delay: noDelay,
  }), /fetch failed/);
  assert.equal(calls, 1);
});

test("a network error is retried, then thrown", async () => {
  let calls = 0;
  await assert.rejects(() => fetchWithRetry("https://example.test/", {}, {
    fetcher: async () => { calls++; throw new TypeError("fetch failed", { cause: new Error("ECONNRESET") }); },
    delay: noDelay,
  }), /fetch failed/);
  assert.equal(calls, 3);
});

test("each attempt gets its own timeout signal and keeps the caller's options", async () => {
  const seen = [];
  await fetchWithRetry("https://example.test/", { method: "HEAD", redirect: "error" }, {
    timeoutMs: 15000,
    fetcher: async (_url, options) => { seen.push(options); return { status: seen.length === 1 ? 502 : 200 }; },
    delay: noDelay,
  });
  assert.equal(seen.length, 2);
  assert.notEqual(seen[0].signal, seen[1].signal);
  for (const options of seen) {
    assert.equal(options.method, "HEAD");
    assert.equal(options.redirect, "error");
    assert(options.signal instanceof AbortSignal);
  }
});

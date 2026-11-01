#!/usr/bin/env node
// Capture the receipts the per-capability evidence pages show inline:
//   1. the pinned honua-server capability matrix (the commit named in
//      data/capabilities.v1.json `source`): routes implemented, CITE suite
//      results, interop client-lane freshness, GeoServices parity detail,
//      benchmark names, and the matrix's evidence-freshness anchor;
//   2. a dated response excerpt from every live row in
//      data/demo-endpoints.v1.json, probed against https://demo.honua.io.
//
// Output: data/evidence-receipts.v1.json (committed). gen-capability-catalog.mjs
// joins it into evidence-*.html; CI never runs this script (it needs the
// network), so refresh it by hand and commit the result with the regenerated
// pages. Nothing here is invented: every number is copied from the matrix or
// observed on the wire, and every excerpt carries the capture date.
//
// Usage: node scripts/capture-evidence-receipts.mjs [--offline]
//   --offline  rebuild the matrix join only, keeping the committed captures

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_PATH = path.join(REPO_ROOT, "data", "capabilities.v1.json");
const ENDPOINTS_PATH = path.join(REPO_ROOT, "data", "demo-endpoints.v1.json");
const OUT_PATH = path.join(REPO_ROOT, "data", "evidence-receipts.v1.json");
const EXCERPT_CHARS = 900;

const offline = process.argv.includes("--offline");

function pinnedMatrixUrl(policy) {
  const match = String(policy.source ?? "").match(/https:\/\/raw\.githubusercontent\.com\/honua-io\/honua-server\/([0-9a-f]{40})\/docs\/gis\/data\/capability-matrix\.v1\.json/);
  if (!match) throw new Error("data/capabilities.v1.json source does not name a pinned capability-matrix commit");
  return { url: match[0], commit: match[1] };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

function joinMatrix(matrix, policy) {
  const byKey = new Map(matrix.capabilities.map((cap) => [cap.key, cap]));
  const capabilities = {};
  for (const cap of policy.capabilities) {
    const row = byKey.get(cap.key);
    if (!row) continue;
    capabilities[cap.key] = {
      routes: { implemented: row.maturity?.implemented ?? 0, total: row.entryCount ?? 0 },
      cite: (row.cite ?? []).map((c) => ({ suite: c.suite, profile: c.profile ?? null, passed: c.passed, total: c.total })),
      interop: (row.interop ?? []).map((lane) => ({
        clientLane: lane.clientLane,
        protocol: lane.protocol,
        state: lane.freshness?.state ?? "unknown",
        runDate: lane.freshness?.runDate ? lane.freshness.runDate.slice(0, 10) : null,
      })),
      parity: (row.parity ?? []).map((p) => ({ serviceId: p.serviceId, displayName: p.displayName ?? p.serviceId, parity: p.parity })),
      benchmarks: row.geobench ?? [],
      noSurface: row.noSurface ?? null,
    };
  }
  return capabilities;
}

function pathAt(value, dotted) {
  return dotted.split(".").reduce((acc, part) => (acc && typeof acc === "object" ? acc[part] : undefined), value);
}

function excerptFor(kind, text) {
  if (kind === "json" || kind === "post-json") {
    try {
      const pretty = JSON.stringify(JSON.parse(text), null, 2);
      return pretty.length > EXCERPT_CHARS ? `${pretty.slice(0, EXCERPT_CHARS).replace(/\s+$/, "")}\n…` : pretty;
    } catch {
      return text.slice(0, EXCERPT_CHARS);
    }
  }
  if (kind === "xml") {
    const flat = text.replace(/\r/g, "");
    return flat.length > EXCERPT_CHARS ? `${flat.slice(0, EXCERPT_CHARS).replace(/\s+$/, "")}\n…` : flat;
  }
  return null;
}

function expectationMet(kind, probe, text, bytes) {
  const expect = probe?.expect ?? {};
  if (kind === "json" || kind === "post-json") {
    let parsed;
    try { parsed = JSON.parse(text); } catch { return false; }
    if (expect.arrayAt) return Array.isArray(pathAt(parsed, expect.arrayAt));
    if (expect.numberAt) return typeof pathAt(parsed, expect.numberAt) === "number";
    return true;
  }
  if (kind === "xml") return expect.contains ? text.includes(expect.contains) : true;
  if (kind === "range") return expect.magic ? text.startsWith(expect.magic) : bytes > 0;
  return bytes > 0;
}

async function probe(baseUrl, row, timeoutMs) {
  const kind = row.probe?.kind ?? "none";
  const url = `${baseUrl}${row.example}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const capturedAt = new Date().toISOString().slice(0, 16) + "Z";
  try {
    const init = { signal: controller.signal, redirect: "follow" };
    if (kind === "post-json") {
      init.method = "POST";
      init.headers = { "content-type": "application/json", accept: "application/json" };
      init.body = JSON.stringify(row.probe.body ?? {});
    } else if (kind === "range") {
      init.headers = { range: "bytes=0-127" };
    } else if (kind === "mcp") {
      init.method = "POST";
      init.headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
      init.body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "honua-site-capture", version: "1" } } });
    } else if (kind === "grpc-web" || kind === "none") {
      return { capturedAt, method: kind === "grpc-web" ? "POST" : "GET", status: null, ok: false, contentType: null, bytes: 0, excerpt: null, note: row.probe?.reason ?? "Not captured over plain HTTP." };
    }
    const response = await fetch(url, init);
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim() || null;
    const buffer = Buffer.from(await response.arrayBuffer());
    const textual = /json|xml|text|javascript/.test(contentType ?? "") || kind === "json" || kind === "xml" || kind === "post-json";
    const text = textual ? buffer.toString("utf8") : "";
    const bytes = buffer.length;
    const ok = response.ok && expectationMet(kind, row.probe, kind === "range" ? buffer.toString("latin1") : text, bytes);
    return {
      capturedAt,
      method: init.method ?? "GET",
      status: response.status,
      ok,
      contentType,
      bytes,
      excerpt: ok ? excerptFor(kind, text) : null,
      note: ok ? null : `HTTP ${response.status}${contentType ? ` ${contentType}` : ""}`,
    };
  } catch (err) {
    return { capturedAt, method: "GET", status: null, ok: false, contentType: null, bytes: 0, excerpt: null, note: err.name === "AbortError" ? `No answer within ${timeoutMs} ms` : String(err.message) };
  } finally {
    clearTimeout(timer);
  }
}

async function captureAll(endpoints) {
  const rows = endpoints.endpoints.filter((row) => row.expectation === "live");
  const results = {};
  const concurrency = endpoints.probeConcurrency ?? 6;
  let next = 0;
  async function worker() {
    while (next < rows.length) {
      const row = rows[next++];
      results[row.id] = await probe(endpoints.baseUrl, row, endpoints.probeTimeoutMs ?? 8000);
      const r = results[row.id];
      console.log(`${r.ok ? "ok  " : "miss"} ${row.id} ${r.status ?? "-"} ${r.contentType ?? ""} ${r.bytes}B${r.note ? ` (${r.note})` : ""}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return Object.fromEntries(Object.entries(results).sort(([a], [b]) => a.localeCompare(b)));
}

async function main() {
  const policy = JSON.parse(await readFile(POLICY_PATH, "utf8"));
  const endpoints = JSON.parse(await readFile(ENDPOINTS_PATH, "utf8"));
  const pinned = pinnedMatrixUrl(policy);
  const matrix = await fetchJson(pinned.url);
  let previous = null;
  try { previous = JSON.parse(await readFile(OUT_PATH, "utf8")); } catch {}
  const captures = offline ? previous?.captures ?? {} : await captureAll(endpoints);
  const doc = {
    format: "honua.site.evidence-receipts.v1",
    schemaVersion: "1.0.0",
    $comment: "Receipts joined into evidence-*.html by scripts/gen-capability-catalog.mjs. Regenerate with scripts/capture-evidence-receipts.mjs; every value is copied from the pinned capability matrix or observed against the demo at capturedAt.",
    matrix: {
      url: `https://github.com/honua-io/honua-server/blob/${pinned.commit}/docs/gis/data/capability-matrix.v1.json`,
      commit: pinned.commit,
      evidenceFreshness: matrix.evidenceFreshness ?? null,
      parityMatrix: `https://github.com/honua-io/honua-server/blob/${pinned.commit}/docs/gis/data/geoservices-rest-parity.json`,
      citeStatus: `https://github.com/honua-io/honua-server/blob/${pinned.commit}/docs/cite-status.md`,
    },
    demo: { baseUrl: endpoints.baseUrl, capturedAt: offline ? previous?.demo?.capturedAt ?? null : new Date().toISOString().slice(0, 16) + "Z" },
    capabilities: joinMatrix(matrix, policy),
    captures,
  };
  await writeFile(OUT_PATH, JSON.stringify(doc, null, 2) + "\n", "utf8");
  const live = Object.values(captures).filter((c) => c.ok).length;
  console.log(`Wrote data/evidence-receipts.v1.json: ${Object.keys(doc.capabilities).length} capabilities joined, ${live}/${Object.keys(captures).length} live captures ok.`);
}

main().catch((err) => {
  console.error(`capture-evidence-receipts: ${err.message}`);
  process.exit(1);
});

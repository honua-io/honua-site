// Behavioural test for the geoprocessing demo's execution-response handling
// (assets/demos/geoprocessing/app.js). Loads the page script in a VM with a minimal
// DOM stub (boot is deferred, so no network) and drives handleExecResponse directly.
//
// The Redis-off assertions mirror what the honua-release cloud harness checks on the
// rendered page (honua-release e2e/drivers/demos/gp-topology.mjs, judgeRedisOffGeoprocessing):
// the pill carries "503", pill+summary mention the job store, the output carries the
// verbatim problem document, and nothing claims a completed job.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const CAPABILITY_UNAVAILABLE = "https://honua.io/problems/capability-unavailable";
const source = readFileSync(new URL("../assets/demos/geoprocessing/app.js", import.meta.url), "utf8");

function loadDemo() {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, { id, innerHTML: "", textContent: "", style: {}, dataset: {} });
    return nodes.get(id);
  };
  const window = {};
  const document = { readyState: "loading", addEventListener() {}, getElementById: node };
  vm.runInNewContext(source, { window, document, console });
  const textOf = (html) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&");
  return {
    handle: window.HonuaGeoprocessingDemo.handleExecResponse,
    page: () => ({
      pill: textOf(node("gp-exec-pill").innerHTML),
      summary: textOf(node("gp-result-summary").innerHTML),
      out: node("gp-exec-out").textContent,
    }),
  };
}

const proc = { id: "generalization.simplify-layer" };
const payload = { inputs: { layerId: 1, tolerance: 0.001 } };

test("typed 503 capability-unavailable refusal: headline says execution refused, not accepted", () => {
  const demo = loadDemo();
  const body = {
    type: CAPABILITY_UNAVAILABLE,
    title: "Capability unavailable",
    status: 503,
    detail: "Durable geoprocessing jobs and workflows require a Redis-backed job store.",
    capability: "jobs.runner",
    missingDependency: "redis",
  };
  demo.handle(proc, payload, { ok: false, status: 503, body });
  const page = demo.page();

  assert.match(page.summary, /^Plan validated · execution refused: job store unavailable\./);
  assert.doesNotMatch(page.summary, /accepted live/i);
  assert.match(page.summary, /503 capability-unavailable/);
  assert.match(page.summary, /missing dependency: redis/);
  assert.match(page.summary, /Redis-backed job store\./);

  // Harness contract (gp-topology.mjs): keep the pill byte-for-byte.
  assert.equal(page.pill, "plan accepted · 503 job store");
  assert.match(page.pill, /\b503\b/);
  assert.match(page.pill + " " + page.summary, /job store|durable/i);
  const shownField = (name) => new RegExp(`"${name}":\\s*"([^"]*)"`).exec(page.out)?.[1];
  assert.equal(shownField("type"), CAPABILITY_UNAVAILABLE);
  assert.equal(shownField("missingDependency"), "redis");
  assert.doesNotMatch(page.out, /successful\. Results:/);
  assert.doesNotMatch(page.pill, /·\s*done/);
  assert.match(page.out, /Execution refused/);
  assert.doesNotMatch(page.out, /accepted plan/);
});

test("untyped 503 job-store response is still reported as a refusal", () => {
  const demo = loadDemo();
  demo.handle(proc, payload, { ok: false, status: 503, body: { title: "Durable job store unavailable" } });
  const page = demo.page();
  assert.match(page.summary, /^Plan validated · execution refused: job store unavailable\./);
  assert.match(page.summary, /\(HTTP 503\)/);
  assert.doesNotMatch(page.summary, /capability-unavailable|missing dependency/);
});

test("successful synchronous run keeps the result wording", () => {
  const demo = loadDemo();
  const body = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} }] };
  demo.handle(proc, payload, { ok: true, status: 200, body });
  const page = demo.page();
  assert.equal(page.pill, "200 · result");
  assert.match(page.summary, /^Result: GeoJSON FeatureCollection · 1 feature\(s\) rendered on the map\./);
  assert.doesNotMatch(page.summary, /refused/);
});

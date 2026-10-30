// Behavioural test for the geoprocessing demo's execution-response handling
// (assets/demos/geoprocessing/app.js). Loads the page script in a VM with a minimal
// DOM stub (boot is deferred, so no network) and drives handleExecResponse directly.
//
// The demo.honua.io serverless cell refuses managed execution either way: without Redis with
// missingDependency "redis" (the demo today), and with Redis wired (tried 2026-10-24) with
// "long-lived-host" (no long-lived host drains the job queue). The Redis-off assertions mirror what the honua-release cloud harness checks on the
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
  // Text the harness reads from the rendered markup (test-only; never used as a sanitizer).
  const textOf = (html) => html.split(/<[^>]*>/).join("").split("&amp;").join("&");
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

  // Harness contract (gp-topology.mjs): "503" in the pill, job store in pill or headline.
  assert.equal(page.pill, "execution refused · 503 job store");
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

test("serverless long-lived-host refusal (demo.honua.io with Redis wired, 2026-10-24): says Redis is present, no long-lived host", () => {
  const demo = loadDemo();
  const fixture = JSON.parse(
    readFileSync(new URL("../assets/demos/geoprocessing/fixtures/recorded-buffer-2026-10-24.json", import.meta.url), "utf8"),
  );
  const body = fixture.ogcProcessesRedisWired.response.body;
  demo.handle(proc, payload, { ok: false, status: 503, body });
  const page = demo.page();

  assert.match(page.summary, /^Plan validated · execution refused: no long-lived host to run the job\./);
  assert.match(page.summary, /503 capability-unavailable/);
  assert.match(page.summary, /missing dependency: long-lived-host/);
  assert.match(page.summary, /serverless \(Lambda\) cell: Redis and the job store are present/);
  assert.match(page.summary, /long-lived host \(Docker or ECS\) runs it, or a native process on the GDAL worker/);
  assert.doesNotMatch(page.summary, /Redis-backed job store|does not run one/);
  // Harness rule: pill + headline (first sentence) must not claim acceptance; the quoted server detail is not judged.
  const headline = page.summary.split(/(?<=\.)\s/)[0];
  assert.doesNotMatch(page.pill + " " + headline, /(?<!\b(?:not|never)\s+)\baccepted\b/i);

  // Harness contract (gp-topology.mjs): "503" in the pill, job store in pill or headline.
  assert.equal(page.pill, "execution refused · 503 job store present, no long-lived host");
  assert.match(page.pill, /\b503\b/);
  assert.match(page.pill + " " + page.summary, /job store|durable/i);
  const shownField = (name) => new RegExp(`"${name}":\\s*"([^"]*)"`).exec(page.out)?.[1];
  assert.equal(shownField("type"), CAPABILITY_UNAVAILABLE);
  assert.equal(shownField("missingDependency"), "long-lived-host");
  assert.match(page.out, /Execution refused: this serverless cell has no long-lived host/);
  assert.doesNotMatch(page.out, /no Redis-backed job store/);
});

test("current demo recording (no Redis) renders the harness's job-store refusal", () => {
  const demo = loadDemo();
  const fixture = JSON.parse(
    readFileSync(new URL("../assets/demos/geoprocessing/fixtures/recorded-buffer-2026-10-24.json", import.meta.url), "utf8"),
  );
  demo.handle(proc, payload, { ok: false, status: 503, body: fixture.ogcProcesses.response.body });
  const page = demo.page();
  assert.equal(page.pill, "execution refused · 503 job store");
  assert.match(page.summary, /^Plan validated · execution refused: job store unavailable\./);
  assert.match(page.summary, /missing dependency: redis/);
  assert.match(page.summary, /a serverless cell still refuses managed processes with Redis wired/);
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

// The no-key state draws a RECORDED execution. The fixture must stay a verbatim, key-redacted record of
// a real demo.honua.io exchange, and the page must be able to turn its GeometryServer output into GeoJSON.
test("recorded execution fixture is redacted, dated, and renders as a polygon", () => {
  const fixture = JSON.parse(
    readFileSync(new URL("../assets/demos/geoprocessing/fixtures/recorded-buffer-2026-10-24.json", import.meta.url), "utf8"),
  );
  assert.equal(fixture.recordedAt, "2026-10-24");
  assert.equal(fixture.server, "https://demo.honua.io");
  assert.match(fixture.ogcProcesses.request.headers["X-API-Key"], /^<redacted/);
  assert.equal(fixture.ogcProcesses.response.status, 503);
  assert.equal(fixture.ogcProcesses.response.body.type, CAPABILITY_UNAVAILABLE);
  // Current demo (no Redis) and the same request while Redis was wired: both refused, both verbatim.
  assert.equal(fixture.ogcProcesses.recordedAt, "2026-10-24T22:37:42Z");
  assert.equal(fixture.ogcProcesses.response.body.missingDependency, "redis");
  assert.equal(fixture.ogcProcesses.response.body.capability, "jobs.runner");
  const wired = fixture.ogcProcessesRedisWired;
  assert.equal(wired.recordedAt, "2026-10-24T22:10:44Z");
  assert.equal(wired.response.status, 503);
  assert.equal(wired.response.body.type, CAPABILITY_UNAVAILABLE);
  assert.equal(wired.response.body.missingDependency, "long-lived-host");
  assert.deepEqual(wired.request, fixture.ogcProcesses.request);
  assert.doesNotMatch(JSON.stringify(fixture), /X-API-Key":\s*"(?!<redacted)/);
  assert.equal(fixture.geometryServer.response.status, 200);

  const window = {};
  const document = { readyState: "loading", addEventListener() {}, getElementById: () => ({ style: {}, dataset: {} }) };
  vm.runInNewContext(source, { window, document, console });
  const fc = window.HonuaGeoprocessingDemo.esriPolygonsToGeoJson(fixture.geometryServer.response.body);
  assert.equal(fc.features.length, 1);
  assert.equal(fc.features[0].geometry.type, "Polygon");
  assert.ok(fc.features[0].geometry.coordinates[0].length > 8);
});

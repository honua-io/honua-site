import assert from "node:assert/strict";
import test from "node:test";
import { loadJson, sanitizeDiagnostic, validateEvidence, validateMatrix } from "./flagship-quality-lib.mjs";

const config = loadJson("config/flagship-quality.v1.json");
const manifest = loadJson(config.catalog);

test("matrix covers the canonical catalog exactly", () => {
  assert.deepEqual(validateMatrix(config, manifest), []);
});

test("catalog drift cannot silently omit a flagship", () => {
  const changed = structuredClone(manifest);
  changed.journeys.push({ id: "new-flagship", href: "new.html", execution: {} });
  assert.match(validateMatrix(config, changed).join("\n"), /exactly match canonical journeys/);
});

test("diagnostics redact secret-like content and stay bounded", () => {
  const diagnostic = sanitizeDiagnostic("page-error", `Authorization: Bearer dangerous ${"x".repeat(1000)}`);
  assert.equal(diagnostic.message, "[redacted sensitive diagnostic]");
  assert.ok(diagnostic.message.length <= 500);
});

test("evidence rejects omissions, duplicates, and secret-like data", () => {
  const runs = manifest.journeys.flatMap(({ id, href }) => ["desktop", "mobile"].map((viewport) => ({
    journeyId: id, route: href, viewport, finalUrl: `https://honua.io/${href}`, startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", outcome: "passed", runtimeState: null,
    measurements: { navigationMs: 1, readinessMs: 1, transferredBytes: 1, renderedAssets: 1, documentWidth: 390, viewportWidth: 390 }, diagnostics: [],
  })));
  const evidence = { version: 1, kind: "honua-flagship-quality-evidence", siteCommit: "a".repeat(40), sdkArtifact: { package: "@honua/sdk-js", version: "test", runtimeCommits: ["abcdef0"] }, mode: "deployed", baseUrl: "https://honua.io/", startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", outcome: "passed", runs };
  assert.deepEqual(validateEvidence(evidence, manifest, "a".repeat(40)), []);
  assert.match(validateEvidence({ ...evidence, runs: runs.slice(1) }, manifest).join("\n"), /missing run/);
  assert.match(validateEvidence({ ...evidence, runs: [...runs, runs[0]] }, manifest).join("\n"), /duplicate run/);
  const hostile = structuredClone(evidence);
  hostile.runs[0].diagnostics.push({ code: "oops", message: "token=secret" });
  assert.match(validateEvidence(hostile, manifest).join("\n"), /secret-like/);
});

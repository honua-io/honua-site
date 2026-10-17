import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const encoded = (value) => JSON.stringify(value, null, 2) + "\n";

async function command(executable, args, cwd, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env: { ...process.env, ...env } });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function harness(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "honua-commercial-"));
  await mkdir(path.join(root, "scripts"));
  await mkdir(path.join(root, "data"));
  await copyFile(path.join(repo, "scripts/sync-capabilities-data.mjs"), path.join(root, "scripts/sync-capabilities-data.mjs"));
  const matrix = { schemaVersion: "test", generatedAt: "2026-09-04", capabilities: [
    { key: "scene.catalog", displayName: "Scene", category: "Scene", edition: "community", noSurface: "No published route", entryCount: 0, maturity: { implemented: 0 }, provingTestCount: 4 },
    { key: "serve.example", displayName: "Example", category: "Serve", edition: "community", entryCount: 1, maturity: { implemented: 1 }, provingTestCount: 3 },
  ] };
  const overlay = { capabilities: { "scene.catalog": { edition: "community", summary: "Reviewed description", lifecycle: "experimental", lifecycleNote: "Evaluation only" } } };
  const overlayPath = path.join(root, "data/commercial-boundaries.json");
  const outputPath = path.join(root, "data/capabilities.v1.json");
  await writeFile(overlayPath, encoded(overlay));
  await writeFile(path.join(root, "data/capability-links.json"), encoded({ links: {} }));
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(request.url === "/matrix" ? matrix : { capabilities: matrix.capabilities.map(({ key }) => ({ key, description: "Upstream description" })) }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const run = (...args) => command(process.execPath, ["scripts/sync-capabilities-data.mjs", ...args], root, { CAPABILITY_MATRIX_URL: `${origin}/matrix`, CAPABILITY_KEYS_URL: `${origin}/keys` });
  return { root, matrix, overlay, overlayPath, outputPath, run, async saveOverlay() { await writeFile(overlayPath, encoded(overlay)); } };
}

test("real sync CLI keeps proof status and evidence separate from commercial lifecycle", async (t) => {
  const h = await harness(t);
  assert.equal((await h.run()).code, 0);
  const document = JSON.parse(await readFile(h.outputPath, "utf8"));
  const scene = document.capabilities.find((row) => row.key === "scene.catalog");
  assert.equal(scene.status, "proof-pending");
  assert.equal(scene.statusNote, "No published route");
  assert.equal(scene.lifecycle, "experimental");
  assert.equal(scene.evidence.tests, 4);
  assert.equal(document.capabilities[1].status, "source-backed");
  assert.equal((await h.run("--check")).code, 0);
});

test("unknown commercial keys fail before overwriting the catalog", async (t) => {
  const h = await harness(t); await h.run();
  const before = await readFile(h.outputPath, "utf8");
  h.overlay.capabilities["renamed.missing"] = { edition: "enterprise" }; await h.saveOverlay();
  const result = await h.run();
  assert.notEqual(result.code, 0); assert.match(result.stderr, /unknown capability: renamed.missing/);
  assert.equal(await readFile(h.outputPath, "utf8"), before);
});

for (const field of ["status", "statusNote", "evidence", "links"]) {
  test(`commercial overlay cannot replace evidence field ${field}`, async (t) => {
    const h = await harness(t);
    h.overlay.capabilities["scene.catalog"][field] = "source-backed"; await h.saveOverlay();
    const result = await h.run();
    assert.notEqual(result.code, 0); assert.match(result.stderr, /invalid commercial boundary field/);
  });
}

for (const field of ["edition", "summary", "lifecycle", "lifecycleNote"]) {
  test(`local overlay-only ${field} drift fails check without a refresh`, async (t) => {
    const h = await harness(t); await h.run();
    h.overlay.capabilities["scene.catalog"][field] = ({ edition: "enterprise", summary: "Changed description", lifecycle: "preview", lifecycleNote: "Changed note" })[field]; await h.saveOverlay();
    const before = await readFile(h.outputPath, "utf8");
    const result = await h.run("--check");
    assert.notEqual(result.code, 0); assert.match(result.stderr, /projection is stale/);
    assert.equal(await readFile(h.outputPath, "utf8"), before);
  });
}

for (const [field, value] of [["lifecycle", "ga"], ["edition", "gold"]]) {
  test(`commercial overlay rejects unsupported ${field}`, async (t) => {
    const h = await harness(t);
    h.overlay.capabilities["scene.catalog"][field] = value; await h.saveOverlay();
    const result = await h.run();
    assert.notEqual(result.code, 0); assert.match(result.stderr, /invalid commercial/);
  });
}

test("matching overlay digest does not hide incorrect projected commercial fields", async (t) => {
  const h = await harness(t); await h.run();
  const document = JSON.parse(await readFile(h.outputPath, "utf8"));
  document.capabilities[0].edition = "enterprise";
  await writeFile(h.outputPath, encoded(document));
  const result = await h.run("--check");
  assert.notEqual(result.code, 0); assert.match(result.stderr, /projection differs for scene.catalog/);
});

test("deleted boundary cannot leave a stale lifecycle even with updated digest metadata", async (t) => {
  const h = await harness(t); await h.run();
  const document = JSON.parse(await readFile(h.outputPath, "utf8"));
  delete h.overlay.capabilities["scene.catalog"]; await h.saveOverlay();
  document.commercialBoundariesSha256 = createHash("sha256").update(await readFile(h.overlayPath)).digest("hex");
  await writeFile(h.outputPath, encoded(document));
  const result = await h.run("--check");
  assert.notEqual(result.code, 0); assert.match(result.stderr, /lifecycle projection differs/);
  assert.equal((await h.run()).code, 0);
  assert.equal(JSON.parse(await readFile(h.outputPath, "utf8")).capabilities[0].lifecycle, undefined);
});

test("upstream evidence motion stays informational and check does not rewrite the snapshot", async (t) => {
  const h = await harness(t); await h.run();
  const before = await readFile(h.outputPath, "utf8");
  h.matrix.generatedAt = "2026-10-17"; h.matrix.capabilities[1].provingTestCount += 10;
  const result = await h.run("--check");
  assert.equal(result.code, 0); assert.match(result.stdout, /notice:/);
  assert.equal(await readFile(h.outputPath, "utf8"), before);
});

async function leadFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "honua-trial-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of ["scripts/validate-lead-capture.sh", "index.html", "cloud.html", "privacy.html", "thanks.html", "pricing.html", "_headers", "assets/analytics.js", "docs/lead-capture-handoff.md", ".github/workflows/pages.yml"]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await copyFile(path.join(repo, file), path.join(root, file));
  }
  return root;
}

test("Preview enquiry contract passes and rejects stale event, disclosure and procurement text", async (t) => {
  const root = await leadFixture(t);
  const run = () => command("bash", ["scripts/validate-lead-capture.sh"], root);
  assert.equal((await run()).code, 0);
  for (const [file, before, after] of [
    ["cloud.html", "preview_trial_enquiry_submit", "cloud_waitlist_submit"],
    ["docs/lead-capture-handoff.md", "preview_trial_enquiry_submit", "cloud_waitlist_submit"],
    ["privacy.html", "Preview trial enquiry", "Cloud early-access"],
    ["thanks.html", "Preview trial enquiry", "Honua Cloud early-access list"],
    ["pricing.html", "Preview trial enquiries", "Honua Cloud managed service"],
  ]) {
    const target = path.join(root, file), original = await readFile(target, "utf8");
    assert.ok(original.includes(before)); await writeFile(target, original.replace(before, after));
    const result = await run(); assert.notEqual(result.code, 0, `stale ${file} must fail`);
    await writeFile(target, original);
  }
});

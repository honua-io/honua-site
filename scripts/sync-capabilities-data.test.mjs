import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const retired = "ai.workflow-generation";

// Deliberately authored vocabulary/evidence fixtures. The retired key is
// absent from the authority even when the downstream matrix still has it.
function fixture() {
  const cap = { key: "ai.spec-apply", displayName: "Spec Apply", category: "AI", edition: "Pro", entryCount: 1, maturity: { implemented: 1 }, provingTestCount: 2 };
  return {
    keys: { capabilities: [{ key: cap.key, description: "Apply a structured plan." }] },
    matrix: { schemaVersion: "1.1.0", generatedAt: "2026-09-05", capabilities: [cap] },
    site: { capabilities: [{ key: cap.key, summary: "Apply with ai.spec-apply." }] },
    links: { "ai.spec-apply": { docs: "docs.html" } },
  };
}

function run(t, input, args = ["--check"]) {
  const root = mkdtempSync(path.join(tmpdir(), "site-capability-sync-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "scripts"));
  mkdirSync(path.join(root, "data"));
  cpSync(path.join(ROOT, "scripts/sync-capabilities-data.mjs"), path.join(root, "scripts/sync-capabilities-data.mjs"));
  const file = path.join(root, "data/capabilities.v1.json");
  const original = JSON.stringify(input.site);
  writeFileSync(file, original);
  writeFileSync(path.join(root, "data/capability-links.json"), JSON.stringify({ links: input.links }));
  const asUrl = (value) => `data:application/json,${encodeURIComponent(JSON.stringify(value))}`;
  const result = spawnSync(process.execPath, [path.join(root, "scripts/sync-capabilities-data.mjs"), ...args], {
    encoding: "utf8",
    env: { ...process.env, CAPABILITY_KEYS_URL: asUrl(input.keys), CAPABILITY_MATRIX_URL: asUrl(input.matrix) },
  });
  assert.equal(result.error, undefined);
  if (args.includes("--check") || result.status !== 0) assert.equal(readFileSync(file, "utf8"), original, "checking/rejecting must not modify published data");
  return { ...result, data: JSON.parse(readFileSync(file, "utf8")) };
}

test("canonical keys pass despite unrelated content drift and prose documentation links", (t) => {
  const input = fixture();
  input.site.capabilities[0].statusNote = { reason: "See backup-and-restore.md and https://docs.example.com/guide for ai.spec-apply." };
  const result = run(t, input);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /notice:/);
});

test("rejects a retired site key even when it remains in the evidence matrix", (t) => {
  const input = fixture();
  input.matrix.capabilities.push({ ...input.matrix.capabilities[0], key: retired });
  input.site.capabilities.push({ key: retired });
  const result = run(t, input);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /capability-matrix.v1.json: unknown capability key ai.workflow-generation/);
  assert.match(result.stderr, /data\/capabilities.v1.json: unknown capability key ai.workflow-generation/);
});

test("rejects a retired site key when both upstream artifacts removed it", (t) => {
  const input = fixture();
  input.site.capabilities.push({ key: retired });
  const result = run(t, input);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /data\/capabilities.v1.json: unknown capability key ai.workflow-generation/);
});

test("rejects a retired curated link key", (t) => {
  const input = fixture();
  input.links[retired] = { demo: "demo-safe-agent.html" };
  const result = run(t, input);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /data\/capability-links.json: unknown capability key ai.workflow-generation/);
});

for (const field of ["summary", "reason"]) {
  test(`rejects a dangling ${field} after the retired entry is removed`, (t) => {
    const input = fixture();
    if (field === "summary") input.site.capabilities[0].summary = `Includes ${retired}.`;
    else input.site.capabilities[0].statusNote = { reason: `See ${retired} for gated routes.` };
    const result = run(t, input);
    assert.equal(result.status, 2);
    assert.match(result.stderr, new RegExp(`${field} references unknown capability key ai.workflow-generation`));
  });
}

test("rejects an unjoined canonical site key", (t) => {
  const input = fixture();
  input.matrix.capabilities = [];
  const result = run(t, input);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /absent from the upstream matrix: ai.spec-apply/);
});

test("sync refuses a stale matrix before writing", (t) => {
  const input = fixture();
  input.matrix.capabilities.push({ ...input.matrix.capabilities[0], key: retired });
  const result = run(t, input, []);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /capability-matrix.v1.json: unknown capability key ai.workflow-generation/);
});

test("sync refuses an upstream dangling description before writing", (t) => {
  const input = fixture();
  input.keys.capabilities[0].description = `Includes ${retired}.`;
  const result = run(t, input, []);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /description references unknown capability key ai.workflow-generation/);
});

test("sync derives keys, edition, summary and evidence from the authored fixture", (t) => {
  const result = run(t, fixture(), []);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.data.capabilities, [{
    key: "ai.spec-apply", displayName: "Spec Apply", category: "AI", edition: "pro",
    status: "source-backed", statusNote: null, summary: "Apply a structured plan.",
    evidence: { tests: 2, citeSuites: [], interopClients: [], benchmarks: [] }, gaps: [],
    links: { docs: "docs.html", evidence: "evidence-ai-spec-apply.html" },
  }]);
});

test("retired inbound evidence URL ships a notice without a catalog or pricing claim", () => {
  const page = readFileSync(path.join(ROOT, "evidence-ai-workflow-generation.html"), "utf8");
  assert.match(page, /<h1>AI Workflow and Content Generation is retired<\/h1>/);
  assert.match(page, /honua_create_map_package/);
  assert.match(page, /honua_create_app_package/);
  assert.match(page, /no server-side model inference/);
  assert.match(page, /href="capabilities.html#cat-ai"/);
  assert.doesNotMatch(page, /cap-edition-chip|assertions<\/td>|data-cap-key=/);
  for (const file of ["data/capabilities.v1.json", "data/capability-links.json", "capabilities.html"]) {
    assert.ok(!readFileSync(path.join(ROOT, file), "utf8").includes(retired), `${file} must not publish the retired key`);
  }
  execFileSync(process.execPath, ["scripts/gen-capability-catalog.mjs", "--check"], { cwd: ROOT });
});

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(path.join(repoRoot, "data/capabilities.v1.json"), "utf8"));
const links = JSON.parse(await readFile(path.join(repoRoot, "data/capability-links.json"), "utf8")).links;

test("retired workflow-generation key and prose do not survive in public capability data", () => {
  assert.equal(catalog.capabilities.some((capability) => capability.key === "ai.workflow-generation"), false);
  assert.equal(Object.hasOwn(links, "ai.workflow-generation"), false);
  assert.doesNotMatch(JSON.stringify(catalog), /ai\.workflow-generation/u);
});

test("generated evidence labels proving tests and CITE receipts by their real source", async () => {
  for (const capability of catalog.capabilities) {
    const slug = capability.key.replaceAll(".", "-");
    const page = await readFile(path.join(repoRoot, `evidence-${slug}.html`), "utf8");
    assert.equal(
      page.includes("Proving tests (xUnit)"),
      capability.evidence.tests > 0,
      `${capability.key} proving-test label drifted`,
    );
    assert.equal(
      page.includes("CITE / conformance suite"),
      capability.evidence.citeSuites.length > 0,
      `${capability.key} CITE label drifted`,
    );
  }
});

test("3D evidence remains source-truthful while the hosted scene demo is deferred", async () => {
  const keys = [
    "serve.i3s-scene",
    "serve.3d-tiles-scene",
    "scene.catalog",
    "scene.bim-ingest",
    "scene.pointcloud-ingest",
    "raster.terrain-rgb",
  ];
  for (const key of keys) {
    const page = await readFile(path.join(repoRoot, `evidence-${key.replaceAll(".", "-")}.html`), "utf8");
    assert.match(page, /Proving tests \(xUnit\)/u);
    assert.doesNotMatch(page, /CITE \/ conformance suite/u);
  }
  assert.equal(
    links["serve.i3s-scene"]?.demo,
    undefined,
    "the MapLibre 2.5D preview must not be labeled as a live I3S scene",
  );
});

test("retired workflow evidence page is removed instead of serving a false receipt", async () => {
  await assert.rejects(
    access(path.join(repoRoot, "evidence-ai-workflow-generation.html")),
    (error) => error?.code === "ENOENT",
  );
});

// Expected editions and attributed counts transcribed from the independently
// authored server protocol truth table at eb70bab24fc102fee41b1bf2091d17b4e548f443.
// This verifies documentation projection, not server execution correctness.
test("scene pages match the reviewed server truth table and release boundaries", async () => {
  const expected = [
    ["serve.i3s-scene", "enterprise", 26],
    ["serve.3d-tiles-scene", "community", 60],
    ["scene.catalog", "community", 4],
    ["scene.bim-ingest", "enterprise", 6],
    ["scene.pointcloud-ingest", "enterprise", 10],
    ["serve.elevation", "community", 29],
    ["raster.terrain-rgb", "community", 14],
  ];
  for (const [key, edition, count] of expected) {
    const cap = catalog.capabilities.find((entry) => entry.key === key);
    assert.equal(cap.edition, edition, key);
    assert.equal(cap.evidence.tests, count, key);
    const page = await readFile(path.join(repoRoot, cap.links.evidence), "utf8");
    assert.match(page, new RegExp(`${count} attributed tests`));
    assert.match(page, /not a passing execution receipt or exact-candidate certification/);
    assert.match(page, /blob\/eb70bab24fc102fee41b1bf2091d17b4e548f443\//);
    if (key !== "serve.elevation") assert.match(page, /Experimental in 2026.1/);
    if (key.startsWith("scene.") || key.includes("scene")) {
      assert.equal(cap.links.demo, undefined, key);
      assert.match(page, /excluded from GA compatibility and SLA/);
    }
  }
  const i3s = catalog.capabilities.find((cap) => cap.key === "serve.i3s-scene");
  assert.match(i3s.scopeNote, /production does not advertise renderable geometry/);
  assert.match(i3s.summary, /HTTP 402/);
  const tiles = catalog.capabilities.find((cap) => cap.key === "serve.3d-tiles-scene");
  assert.match(tiles.summary, /\/scenes\/\{sceneId\}\/tileset.json/);
  assert.doesNotMatch(tiles.summary, /SceneServer/);
  const points = catalog.capabilities.find((cap) => cap.key === "scene.pointcloud-ingest");
  assert.match(points.scopeNote, /without one, these requests return HTTP 400/);
  const demo = await readFile(path.join(repoRoot, "demo-maui-3d.html"), "utf8");
  assert.match(demo, /2.5D/);
  assert.match(demo, /MapLibre/);
});

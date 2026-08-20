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

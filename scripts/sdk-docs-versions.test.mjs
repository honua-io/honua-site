import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateSnapshot } from "./sdk-docs-versions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "sdk-docs-versions.v1.json"), "utf8"));

test("accepts the committed canonical SDK documentation snapshot", () => {
  assert.equal(validateSnapshot(structuredClone(snapshot)).manifest.latestRelease, "0.1.0-beta.0");
});

test("rejects a stale or independently changed latest release", () => {
  const stale = structuredClone(snapshot);
  stale.manifest.latestRelease = "9.9.9";
  assert.throws(() => validateSnapshot(stale), /latestRelease|manifestSha256/);
});

test("rejects missing development provenance and noncanonical release fallbacks", () => {
  const noRevision = structuredClone(snapshot);
  noRevision.manifest.development.sourceRevision = "trunk";
  assert.throws(() => validateSnapshot(noRevision), /exact Git SHA/);

  const unsafe = structuredClone(snapshot);
  unsafe.manifest.versions[0].docs.sourceBase = "https://attacker.example/release";
  assert.throws(() => validateSnapshot(unsafe), /sourceBase/);

  const executableLabel = structuredClone(snapshot);
  executableLabel.manifest.latestRelease = '<img src=x onerror="alert(1)">';
  assert.throws(() => validateSnapshot(executableLabel), /semantic version/);
});

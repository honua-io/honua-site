import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { boundedResponseText, validateSnapshot } from "./sdk-docs-versions.mjs";

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

  const hostileHostedUrl = structuredClone(snapshot);
  hostileHostedUrl.manifest.development.docs.guides = 'https://honua-io.github.io/" onmouseover="alert(1)';
  assert.throws(() => validateSnapshot(hostileHostedUrl), /canonical SDK documentation destination/);
});

test("rejects truncated or semantically inconsistent release manifests", () => {
  const cases = [
    ["truncated history", (value) => value.manifest.versions.splice(1), /complete 20-release/],
    ["hostile label", (value) => (value.manifest.development.label = "<img onerror=alert(1)>"), /development label/],
    ["baseline drift", (value) => (value.manifest.development.packageBaseline = "0.0.1"), /packageBaseline/],
    ["invalid status", (value) => (value.manifest.versions[1].status = "latest-stable"), /status is invalid/],
    ["wrong channel", (value) => (value.manifest.versions[0].channel = "stable"), /channel disagrees/],
    ["executable npm URL", (value) => (value.manifest.versions[0].npmUrl = "javascript:alert(1)"), /npmUrl/],
    [
      "unrelated release path",
      (value) =>
        (value.manifest.versions[0].releaseUrl =
          "https://github.com/honua-io/honua-sdk-js/issues/js-sdk-v0.1.0-beta.0"),
      /canonical tag/,
    ],
  ];
  for (const [name, mutate, expected] of cases) {
    const value = structuredClone(snapshot);
    mutate(value);
    assert.throws(() => validateSnapshot(value), expected, name);
  }
});

test("rejects oversized remote content before or during stream materialization", async () => {
  await assert.rejects(
    boundedResponseText(
      new Response("{}", { headers: { "content-length": "2000001" } }),
      "fixture",
    ),
    /exceeds 2000000 bytes/,
  );
  await assert.rejects(
    boundedResponseText(new Response(new Uint8Array(2_000_001)), "fixture"),
    /exceeds 2000000 bytes/,
  );
});

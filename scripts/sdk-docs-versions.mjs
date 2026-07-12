#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_PATH = path.join(ROOT, "data", "sdk-docs-versions.v1.json");
const SOURCE_URL = "https://honua-io.github.io/honua-sdk-js/versions.json";
const SDK_REPOSITORY = "https://github.com/honua-io/honua-sdk-js";
const TEMPLATE_FILES = ["sample-hello-webmap.html", "samples.html", "docs.html"];
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function fail(message) {
  throw new Error(`SDK documentation versions: ${message}`);
}

function object(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function string(value, label) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    fail(`${label} must be a non-empty trimmed string`);
  }
  return value;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function validateManifest(value) {
  const manifest = object(value, "manifest");
  if (manifest.format !== "honua.sdk.docs-versions.v1" || manifest.schemaVersion !== 1) {
    fail("manifest format is unsupported");
  }
  if (manifest.package !== "@honua/sdk-js") fail("manifest package is not @honua/sdk-js");
  const development = object(manifest.development, "manifest.development");
  if (development.sourceRef !== "trunk") fail("development sourceRef must be trunk");
  if (!/^[0-9a-f]{40}$/.test(development.sourceRevision ?? "")) {
    fail("development sourceRevision must be an exact Git SHA");
  }
  const developmentDocs = object(development.docs, "manifest.development.docs");
  if (developmentDocs.kind !== "hosted-development") fail("development docs kind is unsupported");
  const expectedDocs = {
    guides: "https://honua-io.github.io/honua-sdk-js/guides/",
    api: "https://honua-io.github.io/honua-sdk-js/api/",
  };
  for (const field of ["guides", "api"]) {
    if (string(developmentDocs[field], `manifest.development.docs.${field}`) !== expectedDocs[field]) {
      fail(`development ${field} URL is not the canonical SDK documentation destination`);
    }
  }
  const latestRelease = string(manifest.latestRelease, "manifest.latestRelease");
  if (!SEMVER.test(latestRelease)) fail("manifest.latestRelease must be an exact semantic version");
  if (!Array.isArray(manifest.versions) || manifest.versions.length === 0) fail("manifest.versions must not be empty");
  const versions = new Set();
  for (const [index, raw] of manifest.versions.entries()) {
    const release = object(raw, `manifest.versions[${index}]`);
    const version = string(release.version, `manifest.versions[${index}].version`);
    if (!SEMVER.test(version)) fail(`release ${version} is not an exact semantic version`);
    if (versions.has(version)) fail(`duplicate release ${version}`);
    versions.add(version);
    const docs = object(release.docs, `manifest.versions[${index}].docs`);
    if (docs.kind !== "source-fallback") fail(`release ${version} must use a source fallback`);
    if (release.tag !== `js-sdk-v${version}` && release.tag !== `js-sdk-vv${version}`) {
      fail(`release ${version} tag does not identify the version`);
    }
    const sourceBase = string(docs.sourceBase, `release ${version} sourceBase`);
    if (sourceBase !== `${SDK_REPOSITORY}/blob/${release.tag}`) fail(`release ${version} sourceBase is not canonical`);
    const releaseUrl = new URL(string(release.releaseUrl, `release ${version} releaseUrl`));
    if (
      releaseUrl.protocol !== "https:" ||
      releaseUrl.hostname !== "github.com" ||
      releaseUrl.username ||
      releaseUrl.password ||
      releaseUrl.port ||
      releaseUrl.search ||
      releaseUrl.hash ||
      !releaseUrl.pathname.startsWith("/honua-io/honua-sdk-js/")
    ) {
      fail(`release ${version} URL is not canonical HTTPS GitHub evidence`);
    }
  }
  if (!versions.has(latestRelease) || manifest.versions[0]?.version !== latestRelease) {
    fail("latestRelease is not the first release entry");
  }
  const supportedPrior = object(manifest.supportPolicy?.supportedPrior, "manifest.supportPolicy.supportedPrior");
  if (!new Set(["not-applicable", "not-yet-designated", "supported"]).has(supportedPrior.status)) {
    fail("supported-prior state is unsupported");
  }
  return manifest;
}

export function validateSnapshot(value) {
  const snapshot = object(value, "snapshot");
  if (snapshot.format !== "honua.site.sdk-docs-snapshot.v1" || snapshot.schemaVersion !== 1) {
    fail("snapshot format is unsupported");
  }
  if (snapshot.sourceUrl !== SOURCE_URL) fail(`sourceUrl must be ${SOURCE_URL}`);
  string(snapshot.refreshedAt, "snapshot.refreshedAt");
  if (Number.isNaN(Date.parse(snapshot.refreshedAt))) fail("snapshot.refreshedAt must be an ISO timestamp");
  const manifest = validateManifest(snapshot.manifest);
  const digest = sha256(`${JSON.stringify(manifest)}\n`);
  if (snapshot.manifestSha256 !== digest) fail(`manifestSha256 mismatch: expected ${digest}`);
  return { snapshot, manifest };
}

function loadSnapshot() {
  return validateSnapshot(JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8")));
}

function validateSitePins(manifest) {
  const availability = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "sdk-availability.v1.json"), "utf8"));
  const sdk = availability.sdks?.find((entry) => entry.productArea === "sdk-js");
  if (sdk?.publishedVersion !== manifest.latestRelease) {
    fail(`sdk-availability publishedVersion ${sdk?.publishedVersion ?? "<missing>"} disagrees with ${manifest.latestRelease}`);
  }
  if (sdk.installCommand !== `npm install @honua/sdk-js@${manifest.latestRelease}`) {
    fail("sdk-availability installCommand disagrees with latestRelease");
  }
  for (const file of TEMPLATE_FILES) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const token of ["{{HONUA_SDK_CHANNEL_LABEL}}", "{{HONUA_SDK_LATEST_RELEASE}}", "{{HONUA_SDK_DOCS_URL}}"] ) {
      if (!source.includes(token)) fail(`${file} is missing ${token}`);
    }
  }
}

function replacements(manifest) {
  const release = manifest.versions[0];
  return new Map([
    ["{{HONUA_SDK_CHANNEL_LABEL}}", `trunk development @ ${manifest.development.sourceRevision.slice(0, 12)}`],
    ["{{HONUA_SDK_LATEST_RELEASE}}", manifest.latestRelease],
    ["{{HONUA_SDK_DOCS_URL}}", manifest.development.docs.guides],
    ["{{HONUA_SDK_RELEASE_DOCS_URL}}", `${release.docs.sourceBase}/README.md`],
  ]);
}

function project(dist, manifest) {
  const values = replacements(manifest);
  for (const file of TEMPLATE_FILES) {
    const target = path.join(dist, file);
    let html = fs.readFileSync(target, "utf8");
    for (const [token, value] of values) html = html.replaceAll(token, value);
    if (html.includes("{{HONUA_SDK_")) fail(`${file} contains an unresolved SDK version token`);
    for (const value of values.values()) {
      if (!html.includes(value)) fail(`${file} omits projected SDK version evidence ${value}`);
    }
    fs.writeFileSync(target, html);
  }
}

async function refresh() {
  const response = await fetch(SOURCE_URL, { headers: { accept: "application/json" } });
  if (!response.ok) fail(`refresh failed with HTTP ${response.status}`);
  if (response.url !== SOURCE_URL) fail(`refresh redirected to unexpected source ${response.url}`);
  const text = await response.text();
  if (text.length > 2_000_000) fail("refresh response exceeds two million code units");
  const manifest = validateManifest(JSON.parse(text));
  const snapshot = {
    format: "honua.site.sdk-docs-snapshot.v1",
    schemaVersion: 1,
    sourceUrl: SOURCE_URL,
    manifestSha256: sha256(`${JSON.stringify(manifest)}\n`),
    refreshedAt: new Date().toISOString(),
    manifest,
  };
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  process.stdout.write(`refreshed ${path.relative(ROOT, SNAPSHOT_PATH)} at ${manifest.development.sourceRevision}\n`);
}

async function main() {
  const [mode = "--check", argument] = process.argv.slice(2);
  if (mode === "--refresh") {
    await refresh();
  } else if (mode === "--check") {
    const { manifest } = loadSnapshot();
    validateSitePins(manifest);
    process.stdout.write(
      `SDK docs snapshot: development ${manifest.development.sourceRevision.slice(0, 12)}, latest ${manifest.latestRelease}\n`,
    );
  } else if (mode === "--project" && argument) {
    const { manifest } = loadSnapshot();
    validateSitePins(manifest);
    project(path.resolve(argument), manifest);
  } else {
    fail("usage: sdk-docs-versions.mjs --check | --refresh | --project <dist>");
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();

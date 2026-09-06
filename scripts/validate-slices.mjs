#!/usr/bin/env node
// Validates the capability-slice manifests (slices/*.json) against
// schemas/slice.v1.schema.json and against the data they reference.
//
// Offline checks (always run; CI):
//   - every manifest validates against the committed JSON Schema;
//   - the slug equals the filename stem;
//   - every capabilityKeys[] entry resolves in data/capabilities.v1.json;
//   - sample.id resolves in the samples portfolio (see SAMPLE SOURCES below);
//   - a surface with state absent|partial carries an issue URL;
//   - every related[] slug has its own slices/<slug>.json, and no self-links;
//   - variant: reference may omit `sample`; variant: map may not;
//   - evidencePage points at an existing root evidence-*.html page.
//
// Live checks (default on; --offline to skip): every distinct issue URL is
// fetched from the unauthenticated GitHub REST API and must return 200 with
// state "open" — a closed or deleted issue behind an honest-gap sentence is a
// stale page. Responses are cached under the OS temp dir for CACHE_TTL_MS so a
// local edit loop does not spend the anonymous rate budget.
//
// SAMPLE SOURCES. honua-samples#40 (the stable embed contract) is not built,
// so there is no pinned per-sample route to resolve against yet. Until it
// lands, ids resolve against assets/samples/manifest.json (recipes +
// journeys) — the catalog that carries a `title`, `blurb` and `href`, which is
// exactly what the generator needs to render the hero panel.
//
// Deliberately NOT assets/samples/sdk-publication.v1.json. That file is the
// build contract, keyed by the SDK's own sample name and joined back to the
// portfolio through `contractRef`; it has no presentational fields. Accepting
// its ids here let a manifest validate that the generator would then render
// with no hero panel and no error. A contract id now fails with the portfolio
// id to use instead (see contractIdAliases). Repoint at the #40 contract when
// it exists.
//
// Usage: node scripts/validate-slices.mjs [--offline]

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertSupported, validate } from "./json-schema-mini.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = join(tmpdir(), "honua-site-issue-cache");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** The docs directory the authored playbook concepts own; never a slice slug. */
const RESERVED_SLUG = "playbooks";
const SURFACE_PATHS = [
  ["setup", "console"],
  ["setup", "cli"],
  ["setup", "adminApi"],
  ["use", "js"],
  ["use", "python"],
  ["use", "dotnet"],
  ["use", "mobile"],
  ["ask", "mcp"],
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Every sample id this site can resolve today. */
export function knownSampleIds(root = ROOT) {
  const ids = new Set();
  const manifestPath = join(root, "assets", "samples", "manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = readJson(manifestPath);
    for (const entry of [...(manifest.recipes ?? []), ...(manifest.journeys ?? [])]) {
      if (typeof entry?.id === "string") ids.add(entry.id);
    }
  }
  return ids;
}

/**
 * The `sdk-publication.v1.json` contract id for each sample, mapped back to the
 * portfolio id that renders it.
 *
 * The two catalogs are not two spellings of one list. `manifest.json` is the
 * presentational one — it is the only place a sample has a `title`, `blurb` and
 * `href`, which is everything the hero panel needs; `sdk-publication.v1.json`
 * is the build contract, keyed by the SDK's own sample name and joined back
 * through `contractRef`. Accepting a contract id as a `sample.id` therefore
 * validated a manifest the generator could not render a hero for, and it would
 * have done so silently. So validation now takes the renderable catalog only,
 * and this map exists to say which id to use instead rather than just no.
 */
export function contractIdAliases(root = ROOT) {
  const aliases = new Map();
  const publicationPath = join(root, "assets", "samples", "sdk-publication.v1.json");
  const manifestPath = join(root, "assets", "samples", "manifest.json");
  if (!existsSync(publicationPath) || !existsSync(manifestPath)) return aliases;

  const contractIds = new Set(
    (readJson(publicationPath).samples ?? []).map((sample) => sample?.id).filter((id) => typeof id === "string")
  );
  const portfolioIds = knownSampleIds(root);
  const manifest = readJson(manifestPath);
  for (const entry of [...(manifest.recipes ?? []), ...(manifest.journeys ?? [])]) {
    if (typeof entry?.id !== "string" || typeof entry?.contractRef !== "string") continue;
    const referenced = entry.contractRef.replace(/^sdk:/, "");
    // Only ids that really come from the publication file and are not portfolio
    // ids in their own right — `contractRef` also carries `site:` refs whose
    // target is the portfolio entry itself.
    if (!contractIds.has(referenced) || portfolioIds.has(referenced)) continue;
    aliases.set(referenced, entry.id);
  }
  return aliases;
}

/** Every capability key published in data/capabilities.v1.json. */
export function knownCapabilityKeys(root = ROOT) {
  const catalog = readJson(join(root, "data", "capabilities.v1.json"));
  return new Set((catalog.capabilities ?? []).map((capability) => capability.key));
}

function surfaceEntries(manifest) {
  return SURFACE_PATHS.flatMap(([panel, name]) => {
    const surface = manifest?.[panel]?.[name];
    return surface && typeof surface === "object" ? [[`${panel}.${name}`, surface]] : [];
  });
}

/**
 * Structural + referential validation of one parsed manifest.
 * Returns an array of failure strings; network checks are not performed here.
 */
export function checkManifest(manifest, context) {
  const { slug, schema, capabilityKeys, sampleIds, sampleAliases, slugs, evidencePageExists } = context;
  const label = `slices/${slug}.json`;
  const failures = validate(schema, manifest, label);

  if (manifest?.slug !== undefined && manifest.slug !== slug) {
    failures.push(`${label}: slug "${manifest.slug}" does not match the filename`);
  }
  if (slug === RESERVED_SLUG) {
    failures.push(
      `${label}: "${RESERVED_SLUG}" is reserved for the authored playbook concepts in docs/${RESERVED_SLUG}/ — pick another slug`
    );
  }
  for (const key of manifest?.capabilityKeys ?? []) {
    if (!capabilityKeys.has(key)) failures.push(`${label}: unknown capability key "${key}"`);
  }
  if (manifest?.sample?.id !== undefined && !sampleIds.has(manifest.sample.id)) {
    const alias = sampleAliases?.get(manifest.sample.id);
    failures.push(
      alias
        ? `${label}: sample id "${manifest.sample.id}" is an sdk-publication contract id, which carries no title or href to render — use "${alias}"`
        : `${label}: unknown sample id "${manifest.sample.id}"`
    );
  }
  for (const [name, surface] of surfaceEntries(manifest)) {
    if ((surface.state === "absent" || surface.state === "partial") && !surface.issue) {
      failures.push(`${label}: ${name} is ${surface.state} but names no issue to track`);
    }
    if (surface.state === "available" && surface.issue) {
      failures.push(`${label}: ${name} is available and must not carry a gap issue`);
    }
  }
  for (const related of manifest?.related ?? []) {
    if (related === slug) failures.push(`${label}: related[] links to itself`);
    else if (!slugs.has(related)) failures.push(`${label}: unknown related slice "${related}"`);
  }
  const evidencePage = manifest?.underneath?.evidencePage;
  if (evidencePage !== undefined && !evidencePageExists(evidencePage)) {
    failures.push(`${label}: evidencePage ${evidencePage} does not exist at the site root`);
  }
  return failures;
}

/** Every distinct issue URL a set of manifests points at. */
export function issueUrls(manifests) {
  const urls = new Set();
  for (const manifest of manifests) {
    for (const [, surface] of surfaceEntries(manifest)) {
      if (typeof surface.issue === "string") urls.add(surface.issue);
    }
  }
  return [...urls].sort();
}

function cachePath(url) {
  return join(CACHE_DIR, `${url.replace(/[^a-z0-9]+/gi, "-")}.json`);
}

function readCache(url) {
  const path = cachePath(url);
  try {
    if (Date.now() - statSync(path).mtimeMs > CACHE_TTL_MS) return null;
    return readJson(path);
  } catch {
    return null;
  }
}

function writeCache(url, value) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath(url), JSON.stringify(value));
  } catch {
    // A cache miss is never a validation failure.
  }
}

/** Fetch one issue's state through the unauthenticated GitHub REST API. */
export async function fetchIssueState(url, { fetchImpl = fetch, cache = true } = {}) {
  if (cache) {
    const cached = readCache(url);
    if (cached) return cached;
  }
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)$/);
  if (!match) return { url, ok: false, reason: "not a GitHub issue URL" };
  const [, owner, repo, number] = match;
  const headers = { accept: "application/vnd.github+json", "user-agent": "honua-site-slice-validator/1.0" };
  const response = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/issues/${number}`, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (response.status !== 200) {
    const result = { url, ok: false, reason: `GitHub REST returned ${response.status}` };
    if (response.status === 404 && cache) writeCache(url, result);
    return result;
  }
  const issue = await response.json();
  const result = issue.state === "open"
    ? { url, ok: true, state: "open" }
    : { url, ok: false, reason: `issue is ${issue.state}` };
  if (cache) writeCache(url, result);
  return result;
}

async function main() {
  const offline = process.argv.includes("--offline");
  const schema = readJson(join(ROOT, "schemas", "slice.v1.schema.json"));
  assertSupported(schema);

  const sliceDir = join(ROOT, "slices");
  const files = existsSync(sliceDir)
    ? readdirSync(sliceDir).filter((name) => name.endsWith(".json")).sort()
    : [];
  const slugs = new Set(files.map((name) => basename(name, ".json")));
  const capabilityKeys = knownCapabilityKeys();
  const sampleIds = knownSampleIds();
  const sampleAliases = contractIdAliases();
  const evidencePageExists = (page) => existsSync(join(ROOT, page));

  const failures = [];
  const manifests = [];
  for (const file of files) {
    const slug = basename(file, ".json");
    let manifest;
    try {
      manifest = readJson(join(sliceDir, file));
    } catch (error) {
      failures.push(`slices/${file}: does not parse (${error.message})`);
      continue;
    }
    manifests.push(manifest);
    failures.push(...checkManifest(manifest, { slug, schema, capabilityKeys, sampleIds, sampleAliases, slugs, evidencePageExists }));
  }

  const urls = issueUrls(manifests);
  if (!offline) {
    for (const url of urls) {
      try {
        const result = await fetchIssueState(url);
        if (!result.ok) failures.push(`gap issue ${url}: ${result.reason}`);
      } catch (error) {
        failures.push(`gap issue ${url}: ${error.message}`);
      }
    }
  }

  if (failures.length) {
    console.error("Slice manifest validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(
    `Slice manifests OK: ${files.length} slice(s), ${capabilityKeys.size} capability keys, ` +
      `${sampleIds.size} sample ids, ${urls.length} gap issue(s)` +
      `${offline ? " (offline; issue liveness not checked)" : " verified open"}.`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

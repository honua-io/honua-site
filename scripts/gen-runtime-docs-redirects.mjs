#!/usr/bin/env node
// Redirect pages for the documentation URLs honua-server hands out at runtime.
//
// The server's typed refusals, SCIM discovery document and Prometheus alerts
// carry absolute links under https://honua.io/docs/<path>/ (honua-server
// scripts/ci/code-referenced-anchors.v1.json). An operator follows one of those
// at the moment something is already broken. The pages are rendered on GitBook,
// and this site's /docs/ held only the capability-slice bundle, so every one of
// them answered 404.
//
// Pages cannot issue a 3xx, so each path gets a page with a meta refresh and a
// rel=canonical, plus /assets/docs-redirect.js to carry the fragment. Moving off
// GitBook later changes the targets in data/runtime-docs-redirects.v1.json, not
// the URLs compiled into the product.
//
// Usage:
//   node scripts/gen-runtime-docs-redirects.mjs --out dist/docs   write the pages
//   node scripts/gen-runtime-docs-redirects.mjs --verify-remote   fail if the
//       server registers a path not covered here, or a target or anchor is gone

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = join(ROOT, "data", "runtime-docs-redirects.v1.json");
const DOCS_PREFIX = "https://honua.io/docs/";
const PATH_SHAPE = /^(?:[a-z0-9][a-z0-9-]*\/)+$/;
const ANCHOR_SHAPE = /^[a-z0-9][a-z0-9-]*$/;

function fail(message) {
  throw new Error(`Runtime docs redirects: ${message}`);
}

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function loadRedirects(path = DATA_PATH) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (data.format !== "honua.site.runtime-docs-redirects.v1" || data.schemaVersion !== 1) {
    fail("data format is unsupported");
  }
  if (!Array.isArray(data.redirects) || data.redirects.length === 0) fail("redirects must be a non-empty array");
  const seen = new Set();
  for (const entry of data.redirects) {
    if (typeof entry.path !== "string" || !PATH_SHAPE.test(entry.path)) {
      fail(`path ${JSON.stringify(entry.path)} must be lowercase segments ending in a slash`);
    }
    if (seen.has(entry.path)) fail(`path ${entry.path} is listed twice`);
    seen.add(entry.path);
    let target;
    try {
      target = new URL(entry.target);
    } catch {
      fail(`${entry.path}: target is not a URL`);
    }
    if (target.protocol !== "https:" || target.hash || target.search) {
      fail(`${entry.path}: target must be https with no query or fragment`);
    }
    if (target.hostname === "honua.io") fail(`${entry.path}: target must not point back at honua.io`);
    if (!Array.isArray(entry.anchors) || entry.anchors.some((anchor) => !ANCHOR_SHAPE.test(anchor))) {
      fail(`${entry.path}: anchors must be an array of heading ids`);
    }
  }
  return data;
}

export function renderRedirectPage(target) {
  const url = escapeHtml(target);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Honua documentation</title>
<link rel="canonical" href="${url}">
<meta name="robots" content="noindex">
<script src="/assets/docs-redirect.js"></script>
<meta http-equiv="refresh" content="0; url=${url}">
</head>
<body>
<p>This page has moved to <a href="${url}">${url}</a>.</p>
</body>
</html>
`;
}

/** Writes one page per path under outDir. Never replaces a page someone else built. */
export function writeRedirects(outDir, data = loadRedirects()) {
  const written = [];
  for (const { path, target } of data.redirects) {
    const file = join(outDir, path, "index.html");
    if (existsSync(file)) fail(`${path} already exists in ${outDir}; a slice or playbook owns it`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, renderRedirectPage(target));
    written.push(file);
  }
  return written;
}

/** Server-registered paths (and fragments) that data does not cover. */
export function uncoveredReferences(registry, data) {
  const byPath = new Map(data.redirects.map((entry) => [entry.path, new Set(entry.anchors)]));
  const missing = [];
  for (const { url } of registry.references ?? []) {
    if (!url.startsWith(DOCS_PREFIX)) {
      missing.push(`${url}: not under ${DOCS_PREFIX}`);
      continue;
    }
    const [path, anchor] = url.slice(DOCS_PREFIX.length).split("#");
    const anchors = byPath.get(path);
    if (!anchors) missing.push(`${url}: no redirect for ${path}`);
    else if (anchor && !anchors.has(anchor)) missing.push(`${url}: anchor ${anchor} not listed for ${path}`);
  }
  return missing;
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) fail(`${url} returned ${response.status}`);
  return response.text();
}

async function verifyRemote(data) {
  const problems = uncoveredReferences(JSON.parse(await fetchText(data.serverRegistry)), data);
  for (const { path, target, anchors } of data.redirects) {
    let html;
    try {
      html = await fetchText(target);
    } catch (error) {
      problems.push(`${path}: ${error.message}`);
      continue;
    }
    for (const anchor of anchors) {
      if (!html.includes(`id="${anchor}"`)) problems.push(`${path}: ${target} has no heading #${anchor}`);
    }
  }
  if (problems.length) fail(`remote verification failed:\n- ${problems.join("\n- ")}`);
  console.log(`Runtime docs redirects OK: ${data.redirects.length} path(s) cover the server registry and resolve.`);
}

async function main(argv) {
  const data = loadRedirects();
  const out = argv.indexOf("--out");
  if (out !== -1) {
    if (!argv[out + 1]) fail("--out needs a directory");
    const written = writeRedirects(resolve(argv[out + 1]), data);
    console.log(`Wrote ${written.length} runtime docs redirect page(s).`);
  }
  if (argv.includes("--verify-remote")) await verifyRemote(data);
  if (out === -1 && !argv.includes("--verify-remote")) console.log(`Runtime docs redirects OK: ${data.redirects.length} path(s).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

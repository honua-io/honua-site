#!/usr/bin/env node
// Validates the curated capability demo/sample links (data/capability-links.json).
//
// Offline checks (always run; CI):
//   - every linked key exists in data/capabilities.v1.json;
//   - every local demo/sample href is an existing, non-empty root *.html page;
//   - every external href is https and on an expected host;
//   - no demo href is the example of an endpoint that data/demo-endpoints.v1.json
//     records as a gap (off on the demo), so "See it live" never opens a 404.
//
// Live checks (--live; on demand, not in CI — external availability must not
// gate unrelated PRs): every external demo/sample URL must respond 200.
//
// Usage: node scripts/validate-capability-links.mjs [--live]

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = process.argv.includes("--live");
const ALLOWED_HOSTS = new Set(["demo.honua.io", "samples.honua.io", "github.com"]);

const links = JSON.parse(readFileSync(join(ROOT, "data", "capability-links.json"), "utf8")).links ?? {};
const catalog = JSON.parse(readFileSync(join(ROOT, "data", "capabilities.v1.json"), "utf8"));
const knownKeys = new Set((catalog.capabilities ?? []).map((cap) => cap.key));

const demoEndpoints = JSON.parse(readFileSync(join(ROOT, "data", "demo-endpoints.v1.json"), "utf8"));
const demoHost = new URL(demoEndpoints.baseUrl).hostname;
// Path and query identify a demo endpoint (a live and a gap row can share a path); only a trailing slash is ignored.
const demoRequest = (pathOrUrl) => {
  const { pathname, search } = new URL(pathOrUrl, demoEndpoints.baseUrl);
  return `${pathname.replace(/\/+$/, "")}${search}`;
};
const gapExamples = new Map(
  (demoEndpoints.endpoints ?? [])
    .filter((row) => row.gap && row.example?.startsWith("/"))
    .map((row) => [demoRequest(row.example), row.id])
);

function gapEndpointFor(href) {
  return new URL(href).hostname === demoHost ? gapExamples.get(demoRequest(href)) : undefined;
}

const failures = [];
const external = [];

for (const [key, entry] of Object.entries(links)) {
  if (!knownKeys.has(key)) failures.push(`unknown capability key: ${key}`);
  for (const kind of ["demo", "sample", "docs"]) {
    const href = entry[kind];
    if (href === undefined) continue;
    if (typeof href !== "string" || href.length === 0) {
      failures.push(`${key}.${kind} is not a non-empty string`);
      continue;
    }
    if (/^https:\/\//.test(href)) {
      const host = new URL(href).hostname;
      if (!ALLOWED_HOSTS.has(host)) failures.push(`${key}.${kind} points at unexpected host ${host}`);
      external.push({ key, kind, href });
      continue;
    }
    if (/^http:\/\//.test(href)) {
      failures.push(`${key}.${kind} must be https: ${href}`);
      continue;
    }
    const page = href.split("#")[0];
    if (!page.endsWith(".html") || page.includes("/")) {
      failures.push(`${key}.${kind} local href must be a root *.html page: ${href}`);
      continue;
    }
    const path = join(ROOT, page);
    if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0) {
      failures.push(`${key}.${kind} local page missing or empty: ${page}`);
    }
  }
}

for (const { key, kind, href } of external) {
  const gapId = gapEndpointFor(href);
  if (gapId) failures.push(`${key}.${kind} links demo endpoint ${gapId}, which demo-endpoints.v1.json records as off on the demo: ${href}`);
}

if (LIVE) {
  const results = await Promise.all(
    external.map(async ({ key, kind, href }) => {
      try {
        const response = await fetch(href, { redirect: "follow", signal: AbortSignal.timeout(30000) });
        return response.status === 200 ? null : `${key}.${kind} returned HTTP ${response.status}: ${href}`;
      } catch (error) {
        return `${key}.${kind} failed (${error.name === "TimeoutError" ? "timeout" : error.message}): ${href}`;
      }
    })
  );
  failures.push(...results.filter(Boolean));
}

if (failures.length) {
  console.error("Capability link validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(
  `Capability links OK: ${Object.keys(links).length} keys, ${external.length} external URLs${LIVE ? " (live-verified 200)" : " (offline checks only; use --live to hit them)"}.`
);

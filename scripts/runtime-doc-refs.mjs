#!/usr/bin/env node
// Check the docs URLs honua-server hands out at runtime against this bundle
// (honua-site#214).
//
// A typed refusal's `remediationRef`, the SCIM `documentationUri` and the
// shipped Prometheus `runbook_url` annotations all point at
// https://honua.io/docs/<path>/#<fragment>. A client or an operator follows
// them from a response, so nothing on this site links to them and nothing here
// would notice one going dark. `data/runtime-doc-refs.v1.json` lists them, and
// this script holds each entry to its `status`:
//
//   authored  the page is in the bundle, and the fragment, if any, is exactly
//             one element id on the rendered page;
//   pending   the page is not in the bundle yet. Claiming otherwise is caught
//             in both directions, so the file cannot say a target is live
//             before a page exists or stay `pending` after one lands.
//
// Usage:
//   node scripts/runtime-doc-refs.mjs                  check against the bundle
//   node scripts/runtime-doc-refs.mjs --verify-remote  also compare the URL set
//                                                      with honua-server trunk

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildBundle } from "./gen-slice-pages.mjs";
import { DOCS_BASE_URL } from "./slice-concept.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REFS_PATH = join(ROOT, "data", "runtime-doc-refs.v1.json");
const STATUSES = ["authored", "pending"];

export function readRuntimeRefs(path = REFS_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const countIds = (html, id) => html.split(`id="${id}"`).length - 1;

/** Problems with `refs` against a built bundle (path -> bytes). Empty when clean. */
export function checkRuntimeRefs(refs, files) {
  const problems = [];
  const seen = new Set();
  for (const ref of refs.references ?? []) {
    const label = ref.url;
    if (seen.has(ref.url)) problems.push(`${label}: listed twice`);
    seen.add(ref.url);
    if (!STATUSES.includes(ref.status)) {
      problems.push(`${label}: status must be one of ${STATUSES.join(", ")}, got ${JSON.stringify(ref.status)}`);
      continue;
    }
    let url;
    try {
      url = new URL(ref.url);
    } catch {
      problems.push(`${label}: not an absolute URL`);
      continue;
    }
    const base = `${DOCS_BASE_URL}/`;
    const page = `${url.origin}${url.pathname}`;
    if (!page.startsWith(base) || !url.pathname.endsWith("/")) {
      problems.push(`${label}: must sit under ${base} and end its path with a slash`);
      continue;
    }
    const path = page.slice(base.length, -1);
    const html = files.get(`${path}/index.html`);
    if (ref.status === "pending") {
      if (html !== undefined) problems.push(`${label}: marked pending, but docs/${path}/ is in the bundle — mark it authored`);
      continue;
    }
    if (html === undefined) {
      problems.push(`${label}: marked authored, but the bundle has no docs/${path}/index.html`);
      continue;
    }
    const fragment = decodeURIComponent(url.hash.slice(1));
    if (!fragment) continue;
    const count = countIds(html, fragment);
    if (count !== 1) problems.push(`${label}: #${fragment} is ${count} element ids on the page, expected exactly 1`);
  }
  return problems;
}

/** URLs in one set and not the other, between this file and the server manifest. */
export function compareWithServer(refs, serverManifest) {
  const ours = new Set((refs.references ?? []).map((ref) => ref.url));
  const theirs = new Set((serverManifest.references ?? []).map((ref) => ref.url));
  return {
    missing: [...theirs].filter((url) => !ours.has(url)).sort(),
    extra: [...ours].filter((url) => !theirs.has(url)).sort(),
  };
}

async function main(argv) {
  const refs = readRuntimeRefs();
  const problems = checkRuntimeRefs(refs, buildBundle());
  if (argv.includes("--verify-remote")) {
    const response = await fetch(refs.serverManifest);
    if (!response.ok) throw new Error(`${refs.serverManifest}: HTTP ${response.status}`);
    const { missing, extra } = compareWithServer(refs, await response.json());
    for (const url of missing) problems.push(`${url}: emitted by honua-server trunk but not listed here`);
    for (const url of extra) problems.push(`${url}: listed here but no longer emitted by honua-server trunk`);
  }
  if (problems.length) {
    console.error("Runtime docs references do not match the bundle:");
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }
  const authored = refs.references.filter((ref) => ref.status === "authored").length;
  const pending = refs.references.length - authored;
  console.log(`Runtime docs references OK: ${authored} of ${refs.references.length} authored and resolving${pending ? `, ${pending} pending` : ""}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));

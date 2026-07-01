#!/usr/bin/env node
/*
 * site-demo-smoke.mjs — static smoke for the SDK samples gallery (epic
 * honua-sdk-js#288) and the Planning & Permitting flagship (#289).
 *
 * Zero dependencies (Node stdlib only); no network. It validates the manifest
 * schema, per-group "live" coverage (content parity), gallery wiring, the
 * flagship's cross-linking, and that every live sample page's local assets
 * resolve — so a broken sample or a dangling manifest href fails CI before
 * deploy. Run from anywhere: `node scripts/site-demo-smoke.mjs`.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fails = [];
const oks = [];
const ok = (m) => oks.push(m);
const fail = (m) => fails.push(m);

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}
function fileExists(rel) {
  const p = join(ROOT, rel);
  return existsSync(p) && statSync(p).isFile();
}
function nonEmpty(rel) {
  return fileExists(rel) && statSync(join(ROOT, rel)).size > 0;
}

/* ── 1. manifest parses + schema ──────────────────────────────────── */
let manifest = null;
try {
  manifest = JSON.parse(read("assets/samples/manifest.json"));
  ok("manifest.json parses");
} catch (e) {
  fail(`manifest.json does not parse: ${e.message}`);
}

if (manifest) {
  const groups = Array.isArray(manifest.groups) ? manifest.groups : [];
  const samples = Array.isArray(manifest.samples) ? manifest.samples : [];
  if (!groups.length) fail("manifest has no groups");
  if (!samples.length) fail("manifest has no samples");

  const groupIds = new Set();
  for (const g of groups) {
    if (!g.id || !g.title) fail(`group missing id/title: ${JSON.stringify(g)}`);
    if (groupIds.has(g.id)) fail(`duplicate group id: ${g.id}`);
    groupIds.add(g.id);
  }

  const sampleIds = new Set();
  const liveByGroup = Object.create(null);
  const STATES = new Set(["live", "planned"]);

  for (const s of samples) {
    const tag = s.id || JSON.stringify(s);
    if (!s.id) fail(`sample missing id: ${JSON.stringify(s)}`);
    else if (sampleIds.has(s.id)) fail(`duplicate sample id: ${s.id}`);
    else sampleIds.add(s.id);
    if (!s.title) fail(`sample ${tag} missing title`);
    if (!("blurb" in s)) fail(`sample ${tag} missing blurb`);
    if (!STATES.has(s.state)) fail(`sample ${tag} has invalid state: ${s.state}`);
    if (!groupIds.has(s.group)) fail(`sample ${tag} references unknown group: ${s.group}`);
    if (!Array.isArray(s.capabilities) || !s.capabilities.length) fail(`sample ${tag} missing capabilities[]`);
    if (!Array.isArray(s.tags) || !s.tags.length) fail(`sample ${tag} missing tags[]`);

    if (s.state === "live") {
      if (!s.href || typeof s.href !== "string") {
        fail(`live sample ${tag} has no href`);
      } else if (/^https?:/.test(s.href)) {
        ok(`live sample ${tag} -> external ${s.href} (skipped existence)`);
        (liveByGroup[s.group] ||= []).push(s.id);
      } else {
        if (!s.href.endsWith(".html")) fail(`live sample ${tag} href is not a root .html page: ${s.href}`);
        if (s.href.includes("/")) fail(`live sample ${tag} href is not at repo root (build-dist ships maxdepth 1): ${s.href}`);
        if (!nonEmpty(s.href)) fail(`live sample ${tag} href missing/empty: ${s.href}`);
        else {
          ok(`live sample ${tag} -> ${s.href}`);
          (liveByGroup[s.group] ||= []).push(s.id);
        }
      }
    } else if (s.href != null) {
      fail(`planned sample ${tag} should have null href, got: ${s.href}`);
    }
  }

  /* ── 2. per-group live coverage (content parity) ────────────────── */
  for (const g of groups) {
    if ((liveByGroup[g.id] || []).length === 0) fail(`group "${g.id}" has no live sample (>=1 per group required)`);
    else ok(`group "${g.id}" live coverage: ${liveByGroup[g.id].length}`);
  }

  /* ── 3. flagship #289 ───────────────────────────────────────────── */
  const flagships = samples.filter((s) => s.featured);
  if (!flagships.length) fail("no featured flagship sample in manifest");
  for (const f of flagships) {
    if (f.state !== "live") fail(`flagship ${f.id} is not live`);
    if (!f.href || !nonEmpty(f.href)) fail(`flagship ${f.id} page missing: ${f.href}`);
    else ok(`flagship ${f.id} live -> ${f.href}`);
  }
  const planning = samples.find((s) => s.id === "planning-permitting");
  if (!planning) fail("planning-permitting (#289) absent from manifest");
  else if (!planning.featured) fail("planning-permitting (#289) is not marked featured");
  else ok("planning-permitting (#289) present + featured in samples gallery");

  /* ── 4. gallery wiring (samples.html + gallery.js) ──────────────── */
  if (!nonEmpty("samples.html")) {
    fail("samples.html missing");
  } else {
    const html = read("samples.html");
    for (const id of ["sg-groups", "sg-nav", "sg-filter", "sg-live-count", "sg-planned-count", "sg-group-count"]) {
      if (!html.includes(`id="${id}"`)) fail(`samples.html missing mount #${id}`);
    }
    if (!html.includes("assets/samples/gallery.js")) fail("samples.html does not load gallery.js");
    else ok("samples.html wired (mounts + gallery.js)");
  }
  if (!nonEmpty("assets/samples/gallery.js")) fail("gallery.js missing");
  else if (!read("assets/samples/gallery.js").includes("assets/samples/manifest.json")) fail("gallery.js does not fetch the manifest");
  else ok("gallery.js fetches the manifest");

  /* ── 5. /demos is consolidated into /samples: it must redirect there ── */
  if (!nonEmpty("demos.html")) {
    fail("demos.html missing");
  } else {
    const demos = read("demos.html");
    const redirects =
      demos.includes('http-equiv="refresh"') && demos.includes("samples.html");
    if (!redirects) fail("demos.html does not redirect to samples.html");
    else ok("demos.html redirects to the samples gallery");
    if (planning && planning.href && !demos.includes(planning.href)) {
      fail(`demos.html redirect does not surface the flagship (${planning.href})`);
    }
  }

  /* ── 6. every live sample page's local assets resolve ───────────── */
  const localPages = samples.filter((s) => s.state === "live" && s.href && !/^https?:/.test(s.href));
  for (const s of localPages) {
    let page = "";
    try { page = read(s.href); } catch { continue; }
    const refs = [...page.matchAll(/(?:src|href)="(assets\/[^"#?]+)"/g)].map((m) => m[1]);
    const missing = [...new Set(refs)].filter((r) => !fileExists(r));
    if (missing.length) fail(`${s.href} references missing assets: ${missing.join(", ")}`);
    else ok(`${s.href} assets resolve (${new Set(refs).size})`);
  }
}

/* ── report ───────────────────────────────────────────────────────── */
console.log(`site-demo-smoke: ${oks.length} checks passed`);
for (const m of oks) console.log(`  ok   ${m}`);
if (fails.length) {
  console.error(`\nsite-demo-smoke: ${fails.length} FAILURE(S)`);
  for (const m of fails) console.error(`  FAIL ${m}`);
  process.exit(1);
}
console.log("site-demo-smoke: OK");

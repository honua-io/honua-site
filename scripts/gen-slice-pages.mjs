#!/usr/bin/env node
// Generate the capability-slice docs bundle from slices/*.json (honua-site#217).
//
// D0.7 (epic #213, adopted 2026-08-27) inverted this generator's framing, and
// the inversion is visible in the order of operations below rather than only in
// the prose: for every manifest the generator
//
//   1. builds the Open Knowledge Format concept file — the canonical artifact,
//      with `type: slice` frontmatter, the page's own URL in `resource`, the
//      finder facets in `tags`, and `related[]` / `capabilityKeys[]` written as
//      relative markdown links so the page directory is a traversable bundle;
//   2. writes it to <out>/<slug>/index.md;
//   3. reads those bytes back off disk and renders the HTML page from them.
//
// Step 3 is what makes the acceptance criterion true by construction: the page
// is a projection of the concept, because nothing else is in scope when it is
// rendered. Regenerating the HTML from the concept alone — which is exactly
// what `--from-concept` does — reproduces the same bytes.
//
// Authored concepts join the same bundle on the same terms. The playbooks under
// `docs/playbooks/<slug>/index.md` (`type: playbook`, WS4 of the OKF
// knowledge-graph program) are hand-written, so step 1 is skipped for them and
// their bytes are carried through as-is — but step 3 is not, so a playbook page
// is a projection of its concept exactly as a slice page is, and the bundle
// root lists them from their own frontmatter, which is what puts the authored
// half behind the same `--check` drift gate.
//
// Determinism. Same inputs, same bytes: manifests are read in sorted order, the
// concept `timestamp` is pinned rather than read off the clock (see
// slice-concept.mjs), and nothing depends on the working directory. `--check`
// is the CI mode and fails if the committed bundle is not what the inputs
// produce.
//
// Usage:
//   node scripts/gen-slice-pages.mjs                 rewrite docs/ in place
//   node scripts/gen-slice-pages.mjs --check         fail if docs/ is stale (CI)
//   node scripts/gen-slice-pages.mjs --out dist/docs render into a build tree
//   node scripts/gen-slice-pages.mjs --from-concept <file>   print the page for
//                                                    one concept, from it alone

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildIndexConcept, buildSliceConcept, conceptSummary } from "./slice-concept.mjs";
import { renderConceptPage } from "./slice-template.mjs";
import { parseFrontmatter } from "./validate-slice-concepts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** displayName + summary per capability key, for panel 2's prose. */
export function capabilityIndex(root = ROOT) {
  const path = join(root, "data", "capabilities.v1.json");
  const index = new Map();
  if (!existsSync(path)) return index;
  for (const capability of readJson(path).capabilities ?? []) {
    index.set(capability.key, { displayName: capability.displayName, summary: capability.summary });
  }
  return index;
}

/** title + blurb + href per sample id, for the hero panel. */
export function sampleIndex(root = ROOT) {
  const path = join(root, "assets", "samples", "manifest.json");
  const index = new Map();
  if (!existsSync(path)) return index;
  const manifest = readJson(path);
  for (const entry of [...(manifest.recipes ?? []), ...(manifest.journeys ?? [])]) {
    if (entry?.id) index.set(entry.id, { title: entry.title, blurb: entry.blurb, href: entry.href });
  }
  return index;
}

/**
 * The authored playbook concepts, in slug order.
 *
 * Playbooks are the one hand-written part of the bundle (WS4): golden-path
 * procedures under `docs/playbooks/<slug>/index.md`, `type: playbook`. The
 * generator does not write their prose — it reads them, carries their bytes
 * into whatever tree it is rendering (so `--out dist/docs` ships them), renders
 * each one's HTML projection through the same template as everything else, and
 * lists them from the bundle root.
 *
 * That last part is the gate: the root index is generated from these files'
 * frontmatter, so adding, renaming or retitling a playbook without rerunning
 * the generator fails `--check` — the same drift gate the slices get, applied
 * to the join rather than to the prose.
 */
export function readPlaybooks(root = ROOT) {
  const dir = join(root, "docs", "playbooks");
  if (!existsSync(dir)) return [];
  const playbooks = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const path = join(dir, entry.name, "index.md");
    if (!existsSync(path)) continue;
    const markdown = readFileSync(path, "utf8");
    const parsed = parseFrontmatter(markdown);
    if (!parsed || parsed.unterminated || parsed.fields.type !== "playbook") {
      throw new Error(`${relative(root, path)} is not an OKF concept with \`type: playbook\``);
    }
    const { title, description } = parsed.fields;
    if (typeof title !== "string" || !title.trim() || typeof description !== "string" || !description.trim()) {
      throw new Error(`${relative(root, path)} needs a \`title\` and a \`description\` — the bundle index is built from them`);
    }
    playbooks.push({ slug: entry.name, title, description, markdown });
  }
  return playbooks;
}

/** Every manifest, in slug order. */
export function readManifests(root = ROOT) {
  const dir = join(root, "slices");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => readJson(join(dir, name)));
}

/**
 * Build the whole bundle in memory: a map of relative path -> bytes.
 * Writing, checking and testing all consume this one function, so there is no
 * second code path that could produce a different page.
 */
export function buildBundle({ root = ROOT, outDir, manifests = readManifests(root), playbooks = readPlaybooks(root) } = {}) {
  const capabilities = capabilityIndex(root);
  const samples = sampleIndex(root);
  // The bundle sits one level under the site root, so `../../evidence-*.html`
  // from a slice concept lands there. In a dist build that root is dist/.
  const siteRoot = outDir ? dirname(outDir) : root;

  const files = new Map();
  const entries = [];

  for (const manifest of manifests) {
    // A map-shaped slice whose sample does not resolve would render with no
    // hero panel and no complaint. The validator now takes only the catalog
    // that carries a title and href, so reaching this is a generator-input bug
    // rather than an authoring mistake — either way it stops the build instead
    // of shipping a slice with its first panel missing.
    if (manifest.variant === "map" && manifest.sample?.id && !samples.has(manifest.sample.id)) {
      throw new Error(
        `slices/${manifest.slug}.json: sample "${manifest.sample.id}" resolves in no renderable catalog, so "See it run" would be omitted silently`
      );
    }
    const concept = buildSliceConcept(manifest, { capabilities, samples, siteRoot });
    files.set(`${manifest.slug}/index.md`, concept);
    // Rendered from the concept bytes, not from the manifest: the page is a
    // projection, and this is the only place a page is produced.
    files.set(`${manifest.slug}/index.html`, renderConceptPage(concept));
    entries.push({ slug: manifest.slug, title: manifest.title, description: conceptSummary(manifest) });
  }

  for (const playbook of playbooks) {
    // Carried, not built: the concept is the authored file, byte for byte, and
    // the page is rendered from those same bytes like every other page here.
    files.set(`playbooks/${playbook.slug}/index.md`, playbook.markdown);
    files.set(`playbooks/${playbook.slug}/index.html`, renderConceptPage(playbook.markdown));
  }

  const index = buildIndexConcept(entries, { playbooks });
  files.set("index.md", index);
  files.set("index.html", renderConceptPage(index));
  return files;
}

/**
 * Page directories under `outDir` that this generator produced, as paths
 * relative to it. Used to spot a page left behind by a deleted manifest or a
 * deleted playbook, without ever walking into anything the generator did not
 * write — `docs/` also holds hand-written design notes.
 *
 * A slice directory is recognised by its `type: slice` concept; a playbook
 * directory by the projection sitting in it with its authored concept gone,
 * which is exactly the orphan case (while the concept is there the playbook is
 * still live and is rebuilt, not removed).
 */
function generatedPageDirs(outDir) {
  if (!existsSync(outDir)) return [];
  const dirs = [];
  for (const entry of readdirSync(outDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const concept = join(outDir, entry.name, "index.md");
    if (!existsSync(concept)) continue;
    const parsed = parseFrontmatter(readFileSync(concept, "utf8"));
    if (parsed && !parsed.unterminated && parsed.fields.type === "slice") dirs.push(entry.name);
  }
  const playbooksDir = join(outDir, "playbooks");
  if (existsSync(playbooksDir)) {
    for (const entry of readdirSync(playbooksDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const dir = join(playbooksDir, entry.name);
      if (existsSync(join(dir, "index.html")) && !existsSync(join(dir, "index.md"))) dirs.push(`playbooks/${entry.name}`);
    }
  }
  return dirs;
}

function write(outDir, files) {
  for (const [name, contents] of files) {
    const path = join(outDir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
}

function main(argv) {
  const check = argv.includes("--check");
  const fromConcept = argv.indexOf("--from-concept");
  if (fromConcept !== -1) {
    const path = argv[fromConcept + 1];
    if (!path) throw new Error("--from-concept needs a concept file path");
    process.stdout.write(renderConceptPage(readFileSync(resolve(path), "utf8")));
    return;
  }

  const outIndex = argv.indexOf("--out");
  const outDir = outIndex === -1 ? join(ROOT, "docs") : resolve(argv[outIndex + 1]);
  const files = buildBundle({ outDir });
  const expected = new Set([...files.keys()].filter((name) => name.endsWith("/index.md")).map((name) => name.slice(0, -"/index.md".length)));
  const stale = generatedPageDirs(outDir).filter((name) => !expected.has(name));

  if (check) {
    const drift = [];
    for (const [name, contents] of files) {
      const path = join(outDir, name);
      if (!existsSync(path)) drift.push(`${relative(ROOT, path)} is missing`);
      else if (readFileSync(path, "utf8") !== contents) drift.push(`${relative(ROOT, path)} is out of date`);
    }
    for (const name of stale) {
      const source = name.startsWith("playbooks/") ? `${name}/index.md` : `slices/${name}.json`;
      drift.push(`${relative(ROOT, join(outDir, name))} has no ${source}`);
    }
    if (drift.length) {
      console.error("Slice bundle is stale — run `node scripts/gen-slice-pages.mjs`:");
      for (const entry of drift) console.error(`- ${entry}`);
      process.exit(1);
    }
    console.log(`Slice bundle OK: ${files.size} generated file(s) match slices/*.json.`);
    return;
  }

  for (const name of stale) rmSync(join(outDir, name), { recursive: true, force: true });
  write(outDir, files);
  console.log(
    `Generated ${files.size} file(s) into ${relative(ROOT, outDir) || outDir}` +
      `${stale.length ? `, removed ${stale.length} stale page directory/ies` : ""}.`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));

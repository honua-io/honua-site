#!/usr/bin/env node
// Validates the emitted Open Knowledge Format concept bundle: the markdown
// twins are the canonical concept files and the HTML pages are their
// projection (epic #213, decision D0.7 — OKF v0.1,
// https://github.com/GoogleCloudPlatform/knowledge-catalog).
//
// Two checks:
//
//   1. Frontmatter validity. `type` is required and must come from the
//      documented set; `title`, `description`, `resource`, `tags` and
//      `timestamp` are optional but must be well formed when present.
//
//   2. Relative-link and #anchor resolution across the bundle, because in OKF
//      the file path is the concept's identity and a relative markdown link is
//      a graph edge — a dangling edge is a broken graph, not a broken word.
//
// The link/anchor half is a direct port of `tools/check_links.py` from
// honua-io/geospatial-mcp (its own `docs.yml` CI check), translated into this
// repo's Node-stdlib validator idiom. The algorithm is unchanged except for one
// deliberate divergence, noted in the table and argued at `proseLines()`: the
// original tracks fenced code when collecting anchors but not when collecting
// links, so it reads a `[a](missing.md)` inside a fenced example as a graph
// edge. Here both halves read the document through the same fence-aware scan.
//
//   check_links.py                    this file
//   ------------------------------    ----------------------------------------
//   LINK_RE  \]\(([^)]+)\)            LINK_RE, same pattern, global flag
//   ATX_HEADING_RE                    ATX_HEADING_RE, same pattern, per line
//   FENCE_RE ^\s*(```+|~~~+)          FENCE_RE, same pattern
//   HTML_TAG_RE <[^>]+>               stripHtmlTags(), the same substitution
//                                       written as an explicit scan (see there)
//   SLUG_STRIP_RE (2 Unicode          SLUG_STRIP_RE, identical code points
//     punctuation blocks + ASCII)       (U+2000-U+206F, U+2E00-U+2E7F, ASCII)
//   SKIP_PREFIXES                     SKIP_PREFIXES, same tuple
//   slugify()                         slugify() — strip tags, trim, lowercase,
//                                       strip punctuation, \s -> "-"
//   heading_anchors() fence walk      proseLines() — the same walk, lifted out
//                                       so the link half can share it (the one
//                                       divergence: the original does not)
//   heading_anchors()                 headingAnchors() — ATX headings outside
//                                       fenced code, GitHub's -1/-2 duplicate
//                                       suffixes, empty slugs skipped
//   main() link loop                  checkLinks() — drop link titles, skip
//                                       external schemes, split #fragment and
//                                       ?query, resolve against the linking
//                                       file's directory, then match the
//                                       lowercased fragment against the target
//                                       .md file's anchors (same-file anchors
//                                       resolve against the linking file)
//
// Usage: node scripts/validate-slice-concepts.mjs [root ...]   # default: dist/docs
//        node scripts/validate-slice-concepts.mjs --links-only slices docs
//          (the link/anchor half only, for markdown that is not a concept file)

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- OKF frontmatter ---------------------------------------------------------

/**
 * The documented concept types.
 *
 * `slice` and `index` are what the generator (#217) emits from `slices/*.json`;
 * `playbook` is the first *authored* type to join the bundle (WS4 of the OKF
 * knowledge-graph program) — a golden-path procedure whose body is the command
 * sequence, kept under `docs/playbooks/<slug>/index.md` and passed through the
 * generator so it ships in `dist/docs` and is validated like everything else.
 * The rest stay reserved for the finer-grained generated concepts, and are
 * accepted in the vocabulary now so it does not have to change when they land.
 *
 * A reserved type is rejected rather than waved through: an unemitted `type` in
 * a committed file means either a typo or a concept nothing generates, and both
 * are worth failing on. Activating a type is therefore a deliberate edit here.
 */
export const CONCEPT_TYPES = ["slice", "index", "capability", "tool", "error", "playbook"];
const LIVE_CONCEPT_TYPES = ["slice", "index", "playbook"];
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Whether a timestamp's date part names a day that exists.
 *
 * `Date.parse()` is not enough on its own: for the date-only ISO form it rolls
 * an out-of-range day forward instead of returning NaN, so `2026-02-30` parses
 * as 2 March and `2026-04-31` as 1 May. A concept would then carry a date that
 * silently means a different day than the one written, which is worse than a
 * rejected one — anything ordering or ageing the bundle would inherit the shift.
 */
export function isRealCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12) return false;
  // Day 0 of the next month is the last day of this one, leap years included.
  return day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Read one scalar out of frontmatter, decoding the quoting it was written with.
 *
 * Stripping the quotes is not enough. The generator serialises strings with
 * `JSON.stringify`, which is a valid YAML double-quoted scalar, so a title like
 * `Query "roads"` is emitted as `"Query \"roads\""`. A parser that only removed
 * the outer quotes handed back `Query \"roads\"`, and since the template prefers
 * the parsed frontmatter over the body, the backslashes reached the rendered
 * page. Decode the escapes here — in the reader both the generator and a
 * hand-authored concept go through — rather than picking a serialisation that
 * happens to have no escapes in it today.
 */
export function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Not one double-quoted scalar (`"a" and "b"`); keep the old literal read.
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    // YAML single quotes escape only the quote itself, by doubling it.
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  return trimmed;
}

/**
 * Minimal YAML-frontmatter reader: `key: value`, inline `[a, b]` sequences and
 * block `- item` sequences. Returns null when the file carries no frontmatter.
 */
export function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end === -1) return { unterminated: true, fields: {} };

  const fields = {};
  let currentKey = null;
  for (const line of lines.slice(1, end)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && currentKey) {
      if (!Array.isArray(fields[currentKey])) fields[currentKey] = [];
      fields[currentKey].push(unquote(listItem[1]));
      continue;
    }
    const pair = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!pair) {
      fields.__malformed = (fields.__malformed ?? []).concat(line.trim());
      continue;
    }
    const [, key, rawValue] = pair;
    currentKey = key;
    const value = rawValue.trim();
    if (value === "") fields[key] = [];
    else if (/^\[.*\]$/s.test(value)) {
      fields[key] = value
        .slice(1, -1)
        .split(",")
        .map(unquote)
        .filter((item) => item !== "");
    } else fields[key] = unquote(value);
  }
  return { unterminated: false, fields, body: lines.slice(end + 1).join("\n") };
}

/** Returns the frontmatter problems in one concept file. */
export function checkFrontmatter(text) {
  const problems = [];
  const parsed = parseFrontmatter(text);
  if (parsed === null) return ["missing OKF frontmatter (the file must open with a --- fence)"];
  if (parsed.unterminated) return ["OKF frontmatter is never closed by a --- fence"];

  const { fields } = parsed;
  for (const line of fields.__malformed ?? []) problems.push(`frontmatter line is not "key: value": ${line}`);

  const type = fields.type;
  if (type === undefined) problems.push("frontmatter has no `type` (required by OKF)");
  else if (typeof type !== "string" || type === "") problems.push("`type` must be a non-empty string");
  else if (!CONCEPT_TYPES.includes(type)) {
    problems.push(`unknown \`type\` "${type}" — expected one of ${CONCEPT_TYPES.join(", ")}`);
  } else if (!LIVE_CONCEPT_TYPES.includes(type)) {
    problems.push(`\`type\` "${type}" is reserved and not emitted yet`);
  }

  for (const key of ["title", "description"]) {
    if (fields[key] === undefined) continue;
    if (typeof fields[key] !== "string" || fields[key].trim() === "") problems.push(`\`${key}\` must be a non-empty string`);
    else if (/[\r\n]/.test(fields[key])) problems.push(`\`${key}\` must be a single line`);
  }
  if (fields.resource !== undefined) {
    const value = fields.resource;
    let url = null;
    if (typeof value === "string") {
      try {
        url = new URL(value);
      } catch {
        url = null;
      }
    }
    if (!url || !["http:", "https:"].includes(url.protocol)) {
      problems.push("`resource` must be an absolute http(s) URL");
    }
  }
  if (fields.tags !== undefined) {
    if (!Array.isArray(fields.tags) || fields.tags.length === 0) problems.push("`tags` must be a non-empty list");
    else {
      for (const tag of fields.tags) {
        if (typeof tag !== "string" || tag.trim() === "") problems.push("`tags` entries must be non-empty strings");
      }
    }
  }
  if (fields.timestamp !== undefined) {
    const value = fields.timestamp;
    if (typeof value !== "string" || !TIMESTAMP_RE.test(value) || Number.isNaN(Date.parse(value)) || !isRealCalendarDate(value)) {
      problems.push(`\`timestamp\` must be an ISO-8601 date or date-time, got ${JSON.stringify(value)}`);
    }
  }
  return problems;
}

// --- Relative links and anchors (port of geospatial-mcp tools/check_links.py) -

const LINK_RE = /\]\(([^)]+)\)/g;
const ATX_HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE_RE = /^\s*(```+|~~~+)/;
/**
 * check_links.py strips markup from a heading with `HTML_TAG_RE.sub("", text)`
 * over `<[^>]+>`. Written here as an explicit left-to-right scan instead of the
 * equivalent regex replace: this is a slug helper, not an HTML sanitizer, and
 * the regex form reads to a scanner as an attempt at one. The two agree on
 * every input, including unclosed `<`, bare `<>` and nested `<a<b>` — asserted
 * against the pattern in validate-slice-concepts.test.mjs.
 */
export function stripHtmlTags(text) {
  let out = "";
  let index = 0;
  while (index < text.length) {
    if (text[index] === "<") {
      const close = text.indexOf(">", index + 1);
      if (close > index + 1) {
        index = close + 1;
        continue;
      }
    }
    out += text[index];
    index += 1;
  }
  return out;
}
// Punctuation github-slugger strips outright: the two Unicode general/
// supplemental punctuation blocks plus an explicit ASCII set. Space, hyphen,
// underscore and alphanumerics are preserved; whitespace becomes hyphens
// separately. Code points copied from check_links.py's SLUG_STRIP_RE.
const SLUG_STRIP_RE = /[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,.\/:;<=>?@[\]^`{|}~]/g;
const SKIP_PREFIXES = ["http://", "https://", "mailto:", "honua://", "tel:", "data:"];

/** Replicate GitHub's heading-anchor slug algorithm. */
export function slugify(text) {
  return stripHtmlTags(text)
    .trim()
    .toLowerCase()
    .replace(SLUG_STRIP_RE, "")
    .replace(/\s/g, "-");
}

/**
 * The lines of a markdown document that are prose, not fenced code.
 *
 * check_links.py tracks fences when it collects heading anchors and does not
 * when it collects links — it runs `LINK_RE.findall(text)` over the whole file.
 * This is the one place the port diverges from the original on purpose: a
 * fenced block is an example, and an example that shows `[a](missing.md)` is
 * not an edge in the graph. Scanning it as one makes the gate reject a document
 * for saying what a broken link looks like, and leaves the two halves of this
 * file disagreeing about whether a fence is content. So both halves read the
 * document through here.
 *
 * Line-at-a-time also means a link's target may no longer span a newline. Real
 * markdown destinations cannot contain one, so nothing valid is lost.
 */
export function* proseLines(markdown) {
  let inFence = false;
  let fenceMarker = null;

  for (const line of markdown.split(/\r?\n/)) {
    const fence = line.match(FENCE_RE);
    if (fence) {
      const marker = fence[1][0];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = null;
      }
      continue;
    }
    if (inFence) continue;
    yield line;
  }
}

/** The set of anchor slugs for all ATX headings in a markdown document. */
export function headingAnchors(markdown) {
  const anchors = new Set();
  const seen = new Map();

  for (const line of proseLines(markdown)) {
    const heading = line.match(ATX_HEADING_RE);
    if (!heading) continue;
    const base = slugify(heading[2]);
    if (base === "") continue;
    const n = seen.get(base) ?? 0;
    anchors.add(n === 0 ? base : `${base}-${n}`);
    seen.set(base, n + 1);
  }
  return anchors;
}

/** Every markdown link in a document that is a real edge — fences excluded. */
export function* linksOutsideFences(markdown) {
  for (const line of proseLines(markdown)) yield* line.matchAll(LINK_RE);
}

function* walkMarkdown(root) {
  if (statSync(root).isFile()) {
    yield root;
    return;
  }
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".git") continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* walkMarkdown(path);
    else if (entry.isFile() && entry.name.endsWith(".md")) yield path;
  }
}

/**
 * Check every relative markdown link (and #anchor) under `roots`.
 * Returns { broken: string[], checked: number, files: string[] }.
 */
export function checkLinks(roots, { base = ROOT } = {}) {
  const anchorCache = new Map();
  const broken = [];
  const files = [];
  let checked = 0;

  const anchorsFor = (path) => {
    if (!anchorCache.has(path)) {
      let markdown = "";
      try {
        markdown = readFileSync(path, "utf8");
      } catch {
        markdown = "";
      }
      anchorCache.set(path, headingAnchors(markdown));
    }
    return anchorCache.get(path);
  };

  for (const root of roots) {
    for (const file of walkMarkdown(root)) {
      files.push(file);
      const baseDir = dirname(file);
      const text = readFileSync(file, "utf8");
      for (const match of linksOutsideFences(text)) {
        let target = match[1].trim();
        // Drop an optional link title:  [t](path "title")
        if (!target.startsWith("#") && target.includes(" ")) target = target.split(" ")[0];
        if (!target || SKIP_PREFIXES.some((prefix) => target.startsWith(prefix))) continue;

        const hash = target.indexOf("#");
        const pathPart = (hash === -1 ? target : target.slice(0, hash)).split("?")[0];
        const fragment = hash === -1 ? "" : target.slice(hash + 1);

        let resolved;
        if (pathPart === "") {
          resolved = file; // same-file anchor
        } else {
          resolved = normalize(join(baseDir, pathPart));
          if (!existsSync(resolved)) {
            broken.push(`${relative(base, file)} -> ${target} (file not found)`);
            continue;
          }
        }

        checked += 1;
        if (fragment && resolved.endsWith(".md") && !anchorsFor(resolved).has(fragment.toLowerCase())) {
          broken.push(
            `${relative(base, file)} -> ${target} (anchor '#${fragment}' is not a heading in ${relative(base, resolved)})`
          );
        }
      }
    }
  }
  return { broken: [...new Set(broken)].sort(), checked, files };
}

// --- CLI ---------------------------------------------------------------------

function main(argv) {
  // --links-only runs just the check_links.py half, for markdown that is not
  // an OKF concept (this repo's own docs/ and slices/ prose).
  const linksOnly = argv.includes("--links-only");
  const args = argv.filter((argument) => argument !== "--links-only");
  const roots = (args.length ? args : [join(ROOT, "dist", "docs")]).map((path) => resolve(path));
  const present = roots.filter((root) => existsSync(root));
  if (present.length === 0) {
    // The concept bundle only exists once the generator (#217) has run.
    console.log(`No concept bundle at ${roots.map((root) => relative(ROOT, root) || root).join(", ")} — nothing to check.`);
    return;
  }

  const failures = [];
  const { broken, checked, files } = checkLinks(present);
  if (!linksOnly) {
    for (const file of files) {
      for (const problem of checkFrontmatter(readFileSync(file, "utf8"))) {
        failures.push(`${relative(ROOT, file)}: ${problem}`);
      }
    }
  }
  failures.push(...broken.map((entry) => `broken link: ${entry}`));

  if (failures.length) {
    console.error("Concept bundle validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(
    `Concept bundle OK: ${files.length} markdown file(s)` +
      `${linksOnly ? "" : ", frontmatter valid"}, ` +
      `${checked} relative link(s) and #anchor fragment(s) resolve.`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));

#!/usr/bin/env node
// Voice banlist gate over the rendered slice pages (dist/docs/**/*.html).
//
// The slice pages are the surface where process vocabulary is most tempting
// and least welcome: the design brief's rule is "the map proves it, the code
// delivers it, and process never renders". The banlist is that rule expressed
// as a build gate — the gallery's list (docs/design/samples-gallery-design-
// brief.md) plus this surface's additions (docs/design/slice-docs-design-
// brief.md), plus the site-wide forbidden claims already enforced on the
// marketing pages by validate-site-claims.mjs.
//
// Only prose is scanned. Markup is stripped first (so a `class="evidence-row"`
// hook or an `href="evidence-*.html"` fine-print link is not a voice failure),
// and <script>, <style>, <pre> and <code> contents are excluded (an API symbol
// or a JSON key is not voice — the same reason check_links skips fenced code).
//
// Usage: node scripts/validate-slice-voice.mjs [dir ...]   # default: dist/docs

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { forbiddenClaims } from "./forbidden-claims.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Words that must never appear in rendered slice prose. */
export const bannedTerms = [
  [/\badmitted\b/i, "gallery banlist"],
  [/\bgovern(?:ed|ance)\b/i, "gallery banlist"],
  [/\bqualifications?\b/i, "gallery banlist"],
  [/\bassertions?\b/i, "gallery banlist"],
  [/\bevidence\b/i, "gallery banlist"],
  [/\bsemantics?\b/i, "gallery banlist"],
  [/\bcanonical\b/i, "gallery banlist"],
  [/\breceipts?\b/i, "gallery banlist"],
  [/\bfixtures?\b/i, "gallery banlist"],
  [/\bmaintained\b/i, "gallery banlist"],
  [/\bcoverage\b/i, "slice banlist"],
  [/\bmaturit(?:y|ies)\b/i, "slice banlist"],
  [/\btiers?\b/i, "slice banlist"],
  [/\broadmaps?\b/i, "slice banlist"],
  [/\blifecycle\s+states?\b/i, "slice banlist"],
];

/** Strip markup, code and script so only rendered prose is scanned. */
export function renderedProse(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ");
}

/** Returns the banlist/claim violations in one rendered page. */
export function scanHtml(html) {
  const prose = renderedProse(html);
  const violations = [];
  for (const [pattern, list] of bannedTerms) {
    const hit = prose.match(pattern);
    if (hit) violations.push(`banned word "${hit[0]}" (${list})`);
  }
  for (const [pattern, description] of forbiddenClaims) {
    if (pattern.test(html)) violations.push(description);
  }
  return violations;
}

function* walkHtml(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkHtml(path);
    else if (entry.isFile() && entry.name.endsWith(".html")) yield path;
  }
}

function main(argv) {
  const roots = (argv.length ? argv : [join(ROOT, "dist", "docs")]).map((path) => resolve(path));
  const failures = [];
  let scanned = 0;

  for (const root of roots) {
    if (!existsSync(root)) {
      // The docs page directory only exists once the generator (#217) has run
      // against a build that emits it (#214). Nothing to gate is not a failure.
      console.log(`No rendered docs at ${relative(ROOT, root) || root} — nothing to gate.`);
      continue;
    }
    const files = statSync(root).isDirectory() ? [...walkHtml(root)] : [root];
    for (const file of files) {
      scanned += 1;
      for (const violation of scanHtml(readFileSync(file, "utf8"))) {
        failures.push(`${relative(ROOT, file)}: ${violation}`);
      }
    }
  }

  if (failures.length) {
    console.error("Slice voice validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(`Slice voice OK: ${scanned} rendered page(s) clean against ${bannedTerms.length} banned terms.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));

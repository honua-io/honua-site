#!/usr/bin/env node
/*
 * Guards the demo pages' CSP bootstrap.
 *
 * honua.io is served by GitHub Pages, which cannot set response headers, so each demo page's own
 * <meta http-equiv="Content-Security-Policy"> is the ONLY policy it has. That policy is emitted by
 * an INLINE bootstrap (assets/demos/csp-bootstrap.js, copied verbatim into each page) rather than
 * hardcoded, because a <meta> CSP cannot be relaxed once the parser reads it and the opt-in backend
 * override has to be able to widen it. Inline, not external, because an external script can fail to
 * load and a public page must never end up with no policy at all.
 *
 * That design only holds while the copies stay identical and the moving parts stay in the right
 * order, so this asserts, for every page that carries the bootstrap:
 *
 *   1. there is exactly one <noscript data-honua-csp> holding a real CSP <meta> (the scripting-off
 *      policy, and the canonical text the bootstrap re-emits);
 *   2. the page's inline bootstrap matches assets/demos/csp-bootstrap.js byte for byte;
 *   3. the inline bootstrap is INLINE (no src=) and classic (no defer/async/type=module) — anything
 *      else reintroduces the "policy depends on a fetch" failure mode;
 *   4. nothing that can issue a request — script, link, img, iframe — is parsed before it;
 *   5. the external assets/demos/backend-override.js, which is NOT load-bearing, comes after it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CANONICAL_PATH = "assets/demos/csp-bootstrap.js";
const OVERRIDE_PATH = "assets/demos/backend-override.js";
const canonical = readFileSync(join(ROOT, CANONICAL_PATH), "utf8").trim();

const failures = [];
const checked = [];

function dedent(block) {
  const lines = block.replace(/^\n/, "").replace(/\s+$/, "").split("\n");
  const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^[ ]*/)[0].length);
  const strip = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(strip)).join("\n").trim();
}

for (const filename of readdirSync(ROOT).filter((name) => name.endsWith(".html")).sort()) {
  const html = readFileSync(join(ROOT, filename), "utf8");
  const noscript = [...html.matchAll(/<noscript\b[^>]*\bdata-honua-csp\b[^>]*>([\s\S]*?)<\/noscript>/gi)];
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => match[2].includes("data-honua-csp"));

  if (noscript.length === 0 && inline.length === 0) continue; // not a demo page: nothing to guard
  checked.push(filename);

  if (noscript.length !== 1) {
    failures.push(`${filename}: expected exactly one <noscript data-honua-csp>, found ${noscript.length}`);
    continue;
  }
  if (!/<meta[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*\bcontent\s*=\s*"[^"]+"/i.test(noscript[0][1])) {
    failures.push(`${filename}: <noscript data-honua-csp> does not hold a CSP <meta> with a content attribute`);
  }
  if (inline.length !== 1) {
    failures.push(`${filename}: expected exactly one inline CSP bootstrap, found ${inline.length}`);
    continue;
  }

  const [attrs, body] = [inline[0][1], inline[0][2]];
  if (/\b(defer|async)\b/i.test(attrs) || /type\s*=\s*["']module["']/i.test(attrs)) {
    failures.push(`${filename}: the CSP bootstrap must be a classic, parser-blocking script (no defer/async/module)`);
  }
  if (dedent(body) !== canonical) {
    failures.push(`${filename}: inline CSP bootstrap has drifted from ${CANONICAL_PATH}`);
  }

  // Ordering: nothing that can fetch may be parsed before the policy is installed.
  const bootstrapAt = inline[0].index;
  const head = html.slice(0, bootstrapAt);
  const early = [...head.matchAll(/<(script|link|img|iframe)\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => !/^<link\b[^>]*\brel\s*=\s*["'](?:canonical|icon|manifest|alternate)["']/i.test(tag));
  if (early.length > 0) {
    failures.push(`${filename}: ${early.length} fetching element(s) parsed before the CSP bootstrap, first: ${early[0].slice(0, 80)}`);
  }

  const overrideAt = html.indexOf(OVERRIDE_PATH);
  if (overrideAt !== -1 && overrideAt < bootstrapAt) {
    failures.push(`${filename}: ${OVERRIDE_PATH} is loaded before the inline CSP bootstrap`);
  }
}

if (checked.length === 0) failures.push("no demo page carries the CSP bootstrap — the guard is not guarding anything");

if (failures.length > 0) {
  console.error("demo backend-override validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`validate-demo-backend-override: ${checked.length} demo pages carry an identical inline CSP bootstrap (${checked.join(", ")})`);

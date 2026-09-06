import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { bannedTerms, renderedProse, scanHtml } from "./validate-slice-voice.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = path.join(ROOT, "scripts", "test", "html");
const read = (name) => fs.readFileSync(path.join(HTML, name), "utf8");

test("the banlist carries both the gallery list and this surface's additions", () => {
  const source = bannedTerms.map(([pattern]) => pattern.source).join(" ");
  for (const word of ["admitted", "govern", "qualification", "assertion", "evidence", "semantic", "canonical", "receipt", "fixture", "maintained"]) {
    assert.ok(source.includes(word), `gallery banlist is missing ${word}`);
  }
  for (const word of ["coverage", "maturit", "tier", "roadmap", "lifecycle"]) {
    assert.ok(source.includes(word), `slice banlist is missing ${word}`);
  }
});

test("a clean rendered page passes", () => {
  assert.deepEqual(scanHtml(read("clean.html")), []);
});

test("a banned word in rendered prose fails", () => {
  const violations = scanHtml(read("banned-word.html"));
  assert.deepEqual(violations, [
    'banned word "coverage" (slice banlist)',
    'banned word "maturity" (slice banlist)',
    'banned word "tier" (slice banlist)',
    'banned word "roadmap" (slice banlist)',
  ]);
});

test("each banned term fails on its own", () => {
  for (const [pattern] of bannedTerms) {
    const word = pattern.source.replaceAll("\\b", "").replaceAll("\\s+", " ").replace(/\(\?:([^)|]+)[^)]*\)\??/g, "$1");
    assert.ok(scanHtml(`<p>${word}</p>`).length > 0, `"${word}" should be banned`);
  }
});

test("markup, code and script are not voice", () => {
  assert.deepEqual(scanHtml('<a class="evidence-link" href="evidence-ops-health.html">Verified</a>'), []);
  assert.deepEqual(scanHtml("<pre><code>const receiptFixture = 1;</code></pre>"), []);
  assert.deepEqual(scanHtml("<!-- maturity note for the generator -->"), []);
  assert.ok(renderedProse("<p>Hello <b>world</b></p>").includes("Hello"));
});

test("the site-wide forbidden claims apply to slice pages too", () => {
  const violations = scanHtml('<p>Pro and QGIS connect unchanged.</p>');
  assert.ok(violations.some((violation) => /connect unchanged/.test(violation)), violations.join("\n"));
});

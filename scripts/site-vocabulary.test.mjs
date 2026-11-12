import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Retired names for site copy: the literal rules of the shared policy (honua-server
// scripts/ci/retired-terms.v1.json, glossary docs/concepts/domain/README.md) plus the
// vendor type names the glossary retires. Code, pre and script blocks are not copy,
// so published SDK symbols and protocol literals inside them are not scanned.
export const retiredTerms = [
  { id: "serving-target", pattern: /\bserving targets?\b/i, use: "Layer" },
  { id: "content-item", pattern: /\bcontent items?\b/i, use: "the actual kind (Map, App, ...)" },
  { id: "hosted-layer", pattern: /\bhosted layers?\b/i, use: "Layer" },
  { id: "hosted-map", pattern: /\bHostedMap\b/, use: "Map" },
  { id: "map-envelope", pattern: /\bMapPackage\b|\bmap packages?\b/i, use: "Map" },
  { id: "app-envelope", pattern: /\bAppPackage\b|\bapp packages?\b/i, use: "App" },
  { id: "api-key", pattern: /\bHonuaApiToken\b/, use: "API key" },
  { id: "portal-item", pattern: /\bportal items?\b/i, use: "Service, Layer, Map or App" },
  { id: "workspace-grouping", pattern: /\bworkspace grouping\b/i, use: "Folder" },
  { id: "vendor-type-name", pattern: /\besri-feature-(?:service|layer)\b/i, use: "Service or Layer" },
  { id: "graph-type", pattern: /\bMetadataV2Resource\b|\bMetadataV2Publication\b/, use: "Dataset or Layer" },
];

// Exact, reviewed exceptions: { file, id, reason }. Keep this list empty unless a
// foreign format or protocol must be named in copy.
export const allowedUses = [];

const COPY_ATTRIBUTES = /\s(?:alt|aria-label|title|placeholder|content)="([^"]*)"/gi;

export function visibleCopy(html) {
  const withoutCode = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  const attributes = [...withoutCode.matchAll(COPY_ATTRIBUTES)].map((match) => match[1]);
  const text = withoutCode.replace(/<[^>]*>/g, " ");
  return [text, ...attributes].join(" ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ");
}

export function retiredTermFindings(file, html) {
  const copy = visibleCopy(html);
  return retiredTerms
    .filter(({ id, pattern }) => pattern.test(copy) && !allowedUses.some((use) => use.file === file && use.id === id))
    .map(({ id, pattern, use }) => `${file}: "${copy.match(pattern)[0]}" (${id}); use ${use}`);
}

function shippedPages() {
  const rootPages = readdirSync(ROOT).filter((name) => name.endsWith(".html"));
  const docsPages = readdirSync(join(ROOT, "docs"), { recursive: true })
    .filter((name) => name.endsWith("index.html"))
    .map((name) => join("docs", name));
  return [...rootPages, ...docsPages].sort();
}

test("shipped site copy uses no retired Honua vocabulary", () => {
  const findings = shippedPages().flatMap((file) =>
    retiredTermFindings(relative(ROOT, join(ROOT, file)), readFileSync(join(ROOT, file), "utf8")),
  );
  assert.deepEqual(findings, []);
});

test("the guard reads prose, attributes and navigation but not code", () => {
  const page = `<header><nav><a href="x.html">Portal items</a></nav></header>
    <img alt="An esri-feature-layer preview"><p>Pass a <code>map package</code> to the controller.</p>
    <script>const t = "app package";</script>`;
  assert.deepEqual(
    retiredTermFindings("page.html", page).map((finding) => finding.split("(")[1].split(")")[0]),
    ["portal-item", "vendor-type-name"],
  );
});

test("an allowed use names an exact file and rule", () => {
  for (const use of allowedUses) {
    assert.ok(retiredTerms.some(({ id }) => id === use.id), `unknown rule ${use.id}`);
    assert.ok(use.file && !use.file.includes("*") && use.reason, `incomplete exception for ${use.file}`);
  }
});

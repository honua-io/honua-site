#!/usr/bin/env node
// Regenerate the capability catalog table on capabilities.html, and the
// per-capability L2 evidence pages (evidence-<key-with-dashes>.html), from
// data/capabilities.v1.json.
//
// data/capabilities.v1.json is synced from the capability matrix published by
// honua-server. Listed capabilities are treated as implemented by default;
// only real exceptions or not-yet-implemented routes are called out.
//
// Usage:  node scripts/gen-capability-catalog.mjs [--check]
//   (no args)  rewrite the generated region + evidence-*.html pages in place
//   --check    exit non-zero if any generated output is out of date (CI)

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = join(repoRoot, "data", "capabilities.v1.json");
const catalogPath = join(repoRoot, "capabilities.html");

const START = "<!-- GENERATED:capability-catalog START -->";
const END = "<!-- GENERATED:capability-catalog END -->";

const EDITION_LABEL = { community: "Community", pro: "Pro", enterprise: "Enterprise" };
const EDITION_RANK = { community: 0, pro: 1, enterprise: 2 };

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slug(key) {
  return key.replace(/\./g, "-");
}

function evidenceFile(key) {
  return `evidence-${slug(key)}.html`;
}

function isExternal(href) {
  return /^https?:\/\//.test(href);
}

function linkAttrs(href) {
  return isExternal(href) ? ` target="_blank" rel="noopener noreferrer"` : "";
}

function linkLabel(href) {
  return isExternal(href) ? " ↗" : "";
}

function normalizeGap(gap) {
  const text = String(gap);
  if (text.includes("Esri parity: complete")) return null;
  if (text.includes("Esri parity: partial")) {
    const surface = text.split(" Esri parity:")[0];
    return `${surface} has documented long-tail exceptions; see the GeoServices operation matrix.`;
  }
  return text;
}

function renderedGaps(cap) {
  const gaps = cap.gaps.map(normalizeGap).filter(Boolean);
  if (cap.status === "partial" && gaps.length === 0) {
    gaps.push("Some offline-sync routes are not yet implemented; see the current workflow documentation.");
  }
  return gaps;
}

function renderGapsList(cap) {
  const gaps = renderedGaps(cap);
  if (!gaps.length) return "";
  const label = cap.status === "partial" ? "Not yet" : "Documented exceptions";
  return `<p class="cap-gaps"><strong>${label}:</strong> ${gaps.map(esc).join(" ")}</p>`;
}

function renderLinks(cap) {
  const links = [];
  if (cap.links.demo) links.push(`<a href="${esc(cap.links.demo)}"${linkAttrs(cap.links.demo)}>See it live${linkLabel(cap.links.demo)}</a>`);
  if (cap.links.sample) links.push(`<a href="${esc(cap.links.sample)}"${linkAttrs(cap.links.sample)}>Try the sample${linkLabel(cap.links.sample)}</a>`);
  if (cap.links.docs) links.push(`<a href="${esc(cap.links.docs)}"${linkAttrs(cap.links.docs)}>Docs${linkLabel(cap.links.docs)}</a>`);
  links.push(`<a href="${esc(evidenceFile(cap.key))}">Evidence →</a>`);
  return `<p class="cap-links">${links.join(" · ")}</p>`;
}

function renderCategory(policy, category, caps) {
  const rows = caps.map((cap) => {
    const id = `cap-${slug(cap.key)}`;
    return [
      `            <tr id="${id}" data-cap-key="${esc(cap.key)}" data-cap-edition="${esc(cap.edition)}">`,
      `              <td class="area">`,
      `                <label class="cap-check-label">`,
      `                  <input type="checkbox" class="cap-check" form="cap-intake-form" name="cap_keys" value="${esc(cap.key)}" />`,
      `                  <span><strong>${esc(cap.displayName)}</strong></span>`,
      `                </label>`,
      `              </td>`,
      `              <td><span class="cap-edition-chip ${esc(cap.edition)}">${esc(EDITION_LABEL[cap.edition] ?? cap.edition)}</span></td>`,
      `              <td><p class="cap-summary">${esc(cap.summary)}</p>${renderGapsList(cap)}</td>`,
      `              <td>${renderLinks(cap)}</td>`,
      `            </tr>`,
    ].join("\n");
  });

  const demoCount = caps.filter((cap) => cap.links.demo).length;
  const meta = [`${caps.length} ${caps.length === 1 ? "capability" : "capabilities"}`];
  if (demoCount) meta.push(`${demoCount} with a live demo`);
  return [
    `      <details class="cap-category" id="cat-${slug(category.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}">`,
    `        <summary><h3>${esc(category)}</h3><span class="cap-cat-meta">${esc(meta.join(" · "))}</span></summary>`,
    `        <div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable ${esc(category)} capability table">`,
    `          <table class="bed-data-table cap-table">`,
    `            <caption class="sr-only">${esc(category)} capabilities: edition, summary, exceptions, and links</caption>`,
    `            <thead>`,
    `              <tr><th scope="col">Capability</th><th scope="col">Edition</th><th scope="col">What it does</th><th scope="col">Links</th></tr>`,
    `            </thead>`,
    `            <tbody>`,
    rows.join("\n"),
    `            </tbody>`,
    `          </table>`,
    `        </div>`,
    `      </details>`,
  ].join("\n");
}

function groupByCategory(caps) {
  const order = [];
  const groups = new Map();
  for (const cap of caps) {
    if (!groups.has(cap.category)) {
      groups.set(cap.category, []);
      order.push(cap.category);
    }
    groups.get(cap.category).push(cap);
  }
  return order.map((category) => [category, groups.get(category)]);
}

function renderCatalog(policy) {
  const categories = groupByCategory(policy.capabilities);
  return [
    START,
    `      <!-- Generated by scripts/gen-capability-catalog.mjs from data/capabilities.v1.json`,
    `           schemaVersion=${policy.schemaVersion} generatedAt=${policy.generatedAt}. Do not edit by hand. -->`,
    `      <p class="prov">Generated from the current Honua Server capability matrix · ${esc(policy.generatedAt)} · <a href="data/capabilities.v1.json">machine-readable catalog</a>.</p>`,
    `      <p class="cap-cat-controls" id="cap-cat-controls" hidden><button class="btn btn-ghost" type="button" id="cap-expand-all">Expand all categories</button> <button class="btn btn-ghost" type="button" id="cap-collapse-all">Collapse all</button></p>`,
    ...categories.map(([category, caps]) => renderCategory(policy, category, caps)),
    `      ${END}`,
  ].join("\n");
}

function renderEvidencePage(policy, cap) {
  const id = slug(cap.key);
  const evidenceRows = [];
  if (cap.evidence.tests > 0) {
    evidenceRows.push(
      `<tr><td>CITE / conformance suite</td><td>${esc(cap.evidence.citeSuites.join(", ") || "—")}</td><td>${cap.evidence.tests}/${cap.evidence.tests} assertions</td><td>${esc(policy.generatedAt)}</td></tr>`
    );
  }
  if (cap.evidence.interopClients.length) {
    const clients = cap.evidence.interopClients.map((client) =>
      typeof client === "string" ? client : [client.clientLane, client.protocol].filter(Boolean).join(" · ")
    );
    evidenceRows.push(
      `<tr><td>Interop client lanes</td><td>${esc(clients.join(", "))}</td><td>Exercised in CI</td><td>${esc(policy.generatedAt)}</td></tr>`
    );
  }
  if (cap.evidence.benchmarks.length) {
    for (const bench of cap.evidence.benchmarks) {
      evidenceRows.push(`<tr><td>Benchmark</td><td>${esc(bench.name ?? "")}</td><td>${esc(bench.result ?? "")}</td><td>${esc(bench.date ?? "")}</td></tr>`);
    }
  }
  const evidenceSection = evidenceRows.length
    ? [
        `      <div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable evidence table">`,
        `        <table class="bed-data-table">`,
        `          <caption class="sr-only">Evidence by type for ${esc(cap.displayName)}</caption>`,
        `          <thead><tr><th scope="col">Evidence type</th><th scope="col">Detail</th><th scope="col">Result</th><th scope="col">Date</th></tr></thead>`,
        `          <tbody>${evidenceRows.join("")}</tbody>`,
        `        </table>`,
        `      </div>`,
      ].join("\n")
    : `      <p>Source, documentation, and runnable examples for this capability are linked below.</p>`;

  const gaps = renderedGaps(cap);
  const gapsSection = gaps.length
    ? `      <h2>${cap.status === "partial" ? "Not yet implemented" : "Documented exceptions"}</h2>\n      <ul class="cap-gaps">${gaps.map((gap) => `<li>${esc(gap)}</li>`).join("")}</ul>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Evidence: ${esc(cap.displayName)} | Honua</title>
    <meta name="description" content="${esc(`Documentation and evidence for ${cap.displayName}: scope, edition, test receipts, and known exceptions.`).slice(0, 160)}" />
    <meta name="robots" content="noindex,follow" />
    <meta property="og:title" content="Evidence: ${esc(cap.displayName)} | Honua" />
    <meta property="og:type" content="website" />
    <meta property="og:description" content="${esc(`Documentation and evidence for ${cap.displayName}: scope, edition, test receipts, and known exceptions.`).slice(0, 160)}" />
    <meta property="og:site_name" content="Honua" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' https://www.googletagmanager.com https://www.google-analytics.com; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https://www.google-analytics.com https://honua.io; form-action 'self' https://formsubmit.co; upgrade-insecure-requests" />
    <script defer src="assets/analytics.js"></script>
    <link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png" />
    <link rel="canonical" href="https://honua.io/${evidenceFile(cap.key)}" />
    <link rel="preload" href="assets/fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="assets/fonts/geist-mono-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="styles.css" />
    <style>
      .bed-prose .table-wrap { overflow-x: auto; margin: 14px 0 20px; }
      .bed-prose .table-wrap table { margin: 0; }
      .bed-prose .prov { font-family: "Geist Mono", monospace; font-size: 12px; color: var(--bed-text-dim); margin: -8px 0 22px; }
      .bed-prose .note { display: block; border-left: 3px solid var(--bed-amber); background: var(--bed-surface); padding: 12px 16px; margin: 14px 0; font-size: 13.5px; color: var(--bed-text-dim); border-radius: 0 6px 6px 0; }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="bed-nav">
      <a class="brand" href="index.html" aria-label="Honua home">
        <img src="assets/honua-logo.svg" alt="" aria-hidden="true" />
        <span class="wm">Honua</span>
      </a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-navigation" aria-label="Open navigation"><span></span><span></span><span></span></button>
      <nav id="primary-navigation" class="nav-groups" aria-label="Primary">
        <a href="cloud-native.html">Cloud</a>
        <a href="interoperability.html">Compatibility</a>
        <a href="operations.html">Operations</a>
        <a href="migration.html">Migration</a>
        <a href="ai-gis.html">AI</a>
        <a href="pricing.html">Pricing</a>
        <a href="docs.html" aria-current="page">Docs</a>
        <a href="architecture.html">Architecture</a>
        <a href="connect.html">Try it live</a>
        <a
          class="nav-cta"
          href="index.html#contact"
          data-analytics-event="cta_click"
          data-analytics-label="evidence_${id}_nav_contact"
          data-analytics-destination="index.html#contact"
        >Plan a pilot</a>
      </nav>
    </header>

    <main id="main-content" tabindex="-1" class="bed-prose">
      <span class="eyebrow">// documentation · evidence · ${esc(cap.category)}</span>
      <h1>${esc(cap.displayName)}</h1>
      <p class="lead"><a href="capabilities.html#cap-${id}">← Back to the capability catalog</a></p>
      <p><span class="cap-edition-chip ${esc(cap.edition)}">${esc(EDITION_LABEL[cap.edition] ?? cap.edition)}</span></p>
      <p>${esc(cap.summary)}</p>

      <h2>Evidence by type</h2>
      ${evidenceSection}

${gapsSection}

      <h2>Sources</h2>
      <p>Follow the source and documentation behind this catalog entry.</p>
      <ul class="cap-gaps">
        <li><a href="https://github.com/honua-io/honua-server" target="_blank" rel="noopener noreferrer">honua-server repository ↗</a> — implementation and test source.</li>
        <li><a href="https://github.com/honua-io/honua-server/blob/trunk/docs/gis/data/capability-matrix.v1.json" target="_blank" rel="noopener noreferrer">Published capability matrix ↗</a> — upstream catalog record.</li>
        <li><a href="data/capabilities.v1.json"><code>data/capabilities.v1.json</code></a> — the site snapshot, keyed <code>${esc(cap.key)}</code>.</li>
      </ul>
    </main>

    <footer id="contact" class="bed-footer">
      <div class="footer-row">
        <div class="left">
          <img src="assets/honua-logo.svg" alt="" aria-hidden="true" />
          <span class="mono">honua · /hoˈnu.a/ · earth</span>
        </div>
        <div class="links mono">
          <a href="https://github.com/honua-io" target="_blank" rel="noopener noreferrer">GITHUB</a>
          <a href="https://github.com/honua-io/honua-server/discussions" target="_blank" rel="noopener noreferrer">COMMUNITY</a>
          <a href="belief.html">BELIEF</a>
          <a href="docs.html">DOCS</a>
          <a href="claims.html">EVIDENCE</a>
          <a href="security.html">SECURITY</a>
          <a href="privacy.html">PRIVACY</a>
          <a href="terms.html">TERMS</a>
          <a href="mailto:info@honua.io">INFO@HONUA.IO</a>
        </div>
      </div>
      <div class="footer-legal mono">
        Esri®, ArcGIS®, ArcGIS Server®, ArcGIS Pro®, ArcGIS Runtime®, ArcGIS Online® and the ArcGIS JavaScript, .NET, Python, and Maps SDKs are trademarks of Environmental Systems Research Institute, Inc. Honua is not affiliated with, sponsored by, or endorsed by Esri. References to Esri products on this site are nominative — they describe the source systems Honua's GeoServices REST surface, importers, and SDK converters interoperate with.
      </div>
    </footer>
    <script defer src="assets/nav.js"></script>
  </body>
</html>
`;
}

const policy = JSON.parse(readFileSync(dataPath, "utf8"));
const check = process.argv.includes("--check");
const mismatches = [];

// 1. Catalog page generated region.
const page = readFileSync(catalogPath, "utf8");
const startIdx = page.indexOf(START);
const endIdx = page.indexOf(END);
if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
  console.error(`Could not find generated markers (${START} … ${END}) in ${catalogPath}`);
  process.exit(2);
}
const before = page.slice(0, startIdx);
const after = page.slice(endIdx + END.length);
const nextPage = before + renderCatalog(policy) + after;

if (check) {
  if (nextPage !== page) mismatches.push("capabilities.html catalog region is out of date");
} else {
  writeFileSync(catalogPath, nextPage);
}

// 2. Per-capability L2 evidence pages.
const expectedEvidenceFiles = new Set(policy.capabilities.map((cap) => evidenceFile(cap.key)));
for (const cap of policy.capabilities) {
  const outPath = join(repoRoot, evidenceFile(cap.key));
  const rendered = renderEvidencePage(policy, cap);
  if (check) {
    let existing = "";
    try {
      existing = readFileSync(outPath, "utf8");
    } catch {
      mismatches.push(`missing generated page ${evidenceFile(cap.key)}`);
      continue;
    }
    if (existing !== rendered) mismatches.push(`${evidenceFile(cap.key)} is out of date with data/capabilities.v1.json`);
  } else {
    writeFileSync(outPath, rendered);
  }
}

// 3. Stale evidence pages for capabilities no longer in the fixture.
const staleEvidenceFiles = readdirSync(repoRoot).filter(
  (name) => /^evidence-[a-z0-9-]+\.html$/.test(name) && !expectedEvidenceFiles.has(name)
);
for (const stale of staleEvidenceFiles) {
  mismatches.push(`${stale} is a stale generated evidence page — remove it or restore its capability entry`);
}

if (check) {
  if (mismatches.length) {
    console.error("Capability catalog generation is out of date:");
    for (const mismatch of mismatches) console.error(`- ${mismatch}`);
    console.error("Run: node scripts/gen-capability-catalog.mjs");
    process.exit(1);
  }
  console.log(`Capability catalog is up to date (${policy.capabilities.length} capabilities).`);
} else {
  console.log(`Regenerated capabilities.html and ${policy.capabilities.length} evidence-*.html pages.`);
}

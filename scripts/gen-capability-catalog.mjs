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

import { renderHub, renderDetailsPage, modernizeEvidence, publicName } from "./capability-hub-render.mjs";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { normalizeCapabilityMetadata } from "./capability-page-shell.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { withTrademarkNotice } from "./trademark-notice.mjs";

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
    gaps.push("Some operations are not yet implemented; see the capability documentation for details.");
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
      `                  <span><strong>${esc(publicName(cap))}</strong></span>`,
      `                </label>`,
      `              </td>`,
      `              <td><span class="cap-edition-chip ${esc(cap.edition)}">${esc(EDITION_LABEL[cap.edition] ?? cap.edition)}</span></td>`,
      `              <td><p class="cap-summary">${esc(cap.summary)}</p>${cap.scopeNote ? `<p class="note">${esc(cap.scopeNote)}</p>` : ""}${renderGapsList(cap)}</td>`,
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
    `            <caption class="sr-only">${esc(category)} capabilities: 2026.2 edition intent, summary, exceptions, and links</caption>`,
    `            <thead>`,
    `              <tr><th scope="col">Capability</th><th scope="col">2026.2 edition intent</th><th scope="col">What it does</th><th scope="col">Links</th></tr>`,
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

function renderDetailedCatalog(policy) {
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

// ---- Evidence pages ------------------------------------------------------
// Receipts captured by scripts/capture-evidence-receipts.mjs (optional; the
// page degrades to the matrix-only view when the file is absent).
let receipts = null;
try {
  receipts = JSON.parse(readFileSync(join(repoRoot, "data", "evidence-receipts.v1.json"), "utf8"));
} catch {}
let demoEndpoints = { baseUrl: "https://demo.honua.io", families: [], endpoints: [] };
try {
  demoEndpoints = JSON.parse(readFileSync(join(repoRoot, "data", "demo-endpoints.v1.json"), "utf8"));
} catch {}
// Family titles as the endpoint directory names them, minus vendor qualifiers.
const FAMILY_TITLE = new Map(demoEndpoints.families.map((f) => [f.id, String(f.title)]));

function clientLabel(name) {
  return demoEndpoints.clientLabels?.[name] ?? name;
}

function joinWords(items) {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function fmtBytes(n) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtStamp(iso) {
  const m = String(iso ?? "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]} UTC` : String(iso ?? "");
}

function shortCommit(sha) {
  return String(sha ?? "").slice(0, 7);
}

function endpointRowsFor(key) {
  return demoEndpoints.endpoints.filter((row) => (row.capabilityKeys ?? []).includes(key));
}

// Protocol family of a capability: the endpoint directory's family where a
// row exists, else the key prefix for GeoServices keys that have no demo row.
function familyOf(key) {
  const row = demoEndpoints.endpoints.find((r) => (r.capabilityKeys ?? []).includes(key));
  if (row?.family) return row.family;
  return key.startsWith("serve.geoservices") ? "geoservices" : null;
}

function familyStats(policy) {
  const stats = new Map();
  for (const cap of policy.capabilities) {
    const family = familyOf(cap.key);
    if (!family) continue;
    const entry = stats.get(family) ?? { keys: 0, tests: 0 };
    entry.keys += 1;
    entry.tests += cap.evidence.tests ?? 0;
    stats.set(family, entry);
  }
  return stats;
}

function fmtInt(n) {
  return Number(n ?? 0).toLocaleString("en-US");
}

function curlFor(row, url) {
  const kind = row.probe?.kind ?? "none";
  if (kind === "post-json") {
    return `curl -s -X POST -H 'content-type: application/json' -d '${JSON.stringify(row.probe.body ?? {})}' '${url}'`;
  }
  if (kind === "range") return `curl -s -r 0-127 '${url}' | head -c 16`;
  if (kind === "image" || kind === "mvt") return `curl -s -o response.bin -w '%{http_code} %{content_type} %{size_download}B' '${url}'`;
  if (kind === "mcp" || kind === "grpc-web" || kind === "none") return null;
  return `curl -s '${url}'`;
}

function renderLiveRow(row) {
  const base = receipts?.demo?.baseUrl ?? demoEndpoints.baseUrl;
  const url = `${base}${row.example}`;
  const capture = receipts?.captures?.[row.id] ?? null;
  const clients = joinWords((row.clients ?? []).map(clientLabel));
  const used = row.usedBy ? ` · <a href="${esc(row.usedBy.href)}"${linkAttrs(row.usedBy.href)}>${esc(row.usedBy.label)}${linkLabel(row.usedBy.href)}</a>` : "";
  const curl = curlFor(row, url);
  const parts = [`      <section class="ev-live" aria-label="${esc(row.title)} on the demo">`, `        <h3>${esc(row.title)}</h3>`];
  parts.push(`        <p class="ev-req"><code>${esc(capture?.method ?? "GET")} ${esc(url)}</code></p>`);
  if (capture?.ok) {
    if (capture.excerpt) parts.push(`        <pre class="ev-excerpt" tabindex="0" aria-label="Captured response excerpt">${esc(capture.excerpt)}</pre>`);
    parts.push(`        <p class="ev-meta">Captured ${esc(fmtStamp(capture.capturedAt))} · HTTP ${esc(capture.status)} · ${esc(capture.contentType ?? "no content type")} · ${esc(fmtBytes(capture.bytes))}${capture.excerpt ? "" : " · binary body, not shown"} · <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">open ↗</a></p>`);
  } else if (capture) {
    parts.push(`        <p class="ev-meta">Not captured on ${esc(fmtStamp(capture.capturedAt))}: ${esc(capture.note ?? "no response")}. <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Try it now ↗</a></p>`);
  } else {
    parts.push(`        <p class="ev-meta">No capture on file. <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Try it now ↗</a></p>`);
  }
  if (clients) parts.push(`        <p class="ev-clients">Used by ${esc(clients)}${used}</p>`);
  if (curl) parts.push(`        <p class="ev-run">Run it yourself: <code>${esc(curl)}</code></p>`);
  parts.push(`      </section>`);
  return parts.join("\n");
}

function renderGapRow(row) {
  const reason = row.gap?.reason ? esc(row.gap.reason) : "not published on the demo";
  const observed = row.gap?.observed ? ` Observed: <code>${esc(row.gap.observed)}</code>.` : "";
  return `      <p class="ev-gap"><strong>${esc(row.title)} is not live on the demo.</strong> ${reason}${observed}</p>`;
}

const STATUS_NOTE_HEADINGS = {
  "infra-owned": "Owned outside Honua Server",
  "config-flag": "Configured at startup, not called at request time",
  "sdk-only": "Exercised through the SDK, not an HTTP route",
  "cross-cutting-gate": "Enforced across every surface, not on one route",
  "cross-cutting-default": "A default applied across every surface",
  "ops-background-job": "Runs as a background job, not a request",
  "non-http-transport": "Served over a non-HTTP transport",
};

/**
 * Why a capability has no evidence, in its own words.
 *
 * `sync-capabilities-data.mjs` copies a `statusNote` from the server's
 * no-surface allowlist onto every capability that has no proving tests — the
 * recorded reason a surface does not exist, written per capability. Nothing
 * rendered it, so the page fell back to "Source, documentation, and runnable
 * examples for this capability are linked below", which reads as an
 * implemented feature whose links are elsewhere.
 *
 * That was the gap worth closing. `dr.failover` carries a note saying Honua
 * Server does not evaluate or trigger failover at all and that its dead
 * evaluator was removed rather than counted as evidence — and a reader saw an
 * Enterprise badge, a present-tense summary, and a link labelled
 * "implementation and test source" instead.
 */
function renderStatusNote(cap, hasEvidence = false) {
  const note = cap.statusNote;
  const reason = typeof note === "string" ? note : note?.reason;
  if (!reason) return "";
  const code = typeof note === "object" && note?.reasonCode ? note.reasonCode : "";
  // The heading has to match the reason, or it states something false. Most of
  // these capabilities DO have tests - what they lack is a request-time HTTP
  // route for the evidence pipeline to attribute them to. Saying "no test
  // evidence yet" on a config-flag capability is the same class of error this
  // whole change exists to fix.
  // A capability with an evidence table above the note does have test evidence,
  // so the generic fallback must not claim otherwise.
  const heading = STATUS_NOTE_HEADINGS[code] ?? (hasEvidence ? "Status note" : "Why there is no test evidence yet");
  return `      <h2>${heading}</h2>
      <p class="cap-status-note">${esc(reason)}</p>`;
}

function renderEvidencePage(policy, cap) {
  const id = slug(cap.key);
  const join = receipts?.capabilities?.[cap.key] ?? null;
  const matrixUrl = cap.evidenceSource ?? receipts?.matrix?.url ?? "https://github.com/honua-io/honua-server/blob/trunk/docs/gis/data/capability-matrix.v1.json";
  const commit = receipts?.matrix?.commit ?? null;
  const evidenceDate = receipts?.matrix?.evidenceFreshness?.anchor ? String(receipts.matrix.evidenceFreshness.anchor).slice(0, 10) : policy.generatedAt;
  const demoDate = receipts?.demo?.capturedAt ? String(receipts.demo.capturedAt).slice(0, 10) : null;
  const vocab = policy.statusVocabulary?.[cap.status] ?? null;
  const rows = endpointRowsFor(cap.key);
  const liveRows = rows.filter((row) => row.expectation === "live");
  const gapRows = rows.filter((row) => row.expectation !== "live");
  const familyId = familyOf(cap.key);
  const family = familyId ? FAMILY_TITLE.get(familyId) ?? cap.category : cap.category;
  const fam = familyId ? FAMILIES.get(familyId) : null;
  const totalAttributed = policy.capabilities.reduce((sum, c) => sum + (c.evidence.tests ?? 0), 0);

  // Datasheet.
  const sheet = [];
  sheet.push(`<dt>Family</dt><dd>${esc(family)}${fam && fam.keys > 1 ? ` · ${fam.keys} capabilities · ${fmtInt(fam.tests)} attributed tests across the family` : ""}</dd>`);
  sheet.push(`<dt>Edition (2026.2 intent)</dt><dd><span class="cap-edition-chip ${esc(cap.edition)}">${esc(EDITION_LABEL[cap.edition] ?? cap.edition)}</span></dd>`);
  sheet.push(`<dt>Status</dt><dd>${esc(vocab?.label ?? cap.status)}</dd>`);
  if (join && join.routes.total > 0) sheet.push(`<dt>Routes</dt><dd>${join.routes.implemented} of ${join.routes.total} implemented</dd>`);
  sheet.push(`<dt>Tests on this key</dt><dd>${cap.evidence.tests > 0 ? `${cap.evidence.tests} attributed tests` : "No tests attributed to this key yet"} · <code>${esc(cap.key)}</code>${commit ? ` · matrix at <a href="${esc(matrixUrl)}" target="_blank" rel="noopener noreferrer">${esc(shortCommit(commit))}</a>` : ""}</dd>`);
  sheet.push(`<dt>Evidence as of</dt><dd>${esc(evidenceDate)}${demoDate && liveRows.length ? ` · demo captured ${esc(demoDate)}` : ""}</dd>`);

  // Receipts table. Labels are the ones the catalog test pins to real sources.
  const receiptRows = [];
  if (cap.evidence.tests > 0) {
    receiptRows.push(`<tr><td>Proving tests (xUnit)</td><td>honua-server capability matrix, key <code>${esc(cap.key)}</code>${commit ? ` at <a href="${esc(matrixUrl)}" target="_blank" rel="noopener noreferrer">${esc(shortCommit(commit))}</a>` : ""}</td><td>${cap.evidence.tests} attributed tests</td><td>${esc(evidenceDate)}</td></tr>`);
  }
  if (join?.cite?.length) {
    for (const c of join.cite) {
      receiptRows.push(`<tr><td>CITE / conformance suite</td><td>${esc(c.suite)}${c.profile ? ` · ${esc(c.profile)} profile` : ""}</td><td>${esc(c.passed)} of ${esc(c.total)} passed</td><td>${esc(evidenceDate)}</td></tr>`);
    }
  } else if (cap.evidence.citeSuites.length > 0) {
    receiptRows.push(`<tr><td>CITE / conformance suite</td><td>${esc(cap.evidence.citeSuites.join(", "))}</td><td>Published suite receipt</td><td>${esc(evidenceDate)}</td></tr>`);
  }
  const interop = join?.interop?.length ? join.interop : cap.evidence.interopClients.map((c) => (typeof c === "string" ? { clientLane: c, protocol: "", state: "unknown", runDate: null } : { clientLane: c.clientLane, protocol: c.protocol, state: c.freshness?.state ?? "unknown", runDate: c.freshness?.runDate ? String(c.freshness.runDate).slice(0, 10) : null }));
  for (const lane of interop) {
    const age = cap.evidence.interopClients.find((c) => typeof c === "object" && c.clientLane === lane.clientLane && (c.protocol ?? "") === (lane.protocol ?? ""))?.freshness?.ageDays ?? lane.ageDays ?? null;
    const state = lane.state === "fresh" ? "Fresh run" : lane.state === "stale" ? `Run on file, past the 14-day freshness window${age == null ? "" : ` · ${age} days old`}` : "No dated run on file";
    receiptRows.push(`<tr><td>Interop client lane</td><td>${esc([lane.clientLane, lane.protocol].filter(Boolean).join(" · "))}</td><td>${esc(state)}</td><td>${esc(lane.runDate ?? "—")}</td></tr>`);
  }
  for (const bench of join?.benchmarks ?? cap.evidence.benchmarks) {
    const name = typeof bench === "string" ? bench : bench.name ?? "";
    const result = typeof bench === "string" ? `Scenario in the dated GeoServer comparison · <a href="proof-benchmarks.html">benchmark page</a>` : esc(bench.result ?? "");
    receiptRows.push(`<tr><td>Benchmark</td><td>${esc(name)}</td><td>${result}</td><td>${typeof bench === "string" ? "see page" : esc(bench.date ?? "")}</td></tr>`);
  }
  const receiptsSection = receiptRows.length
    ? [
        `      <div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable receipts table">`,
        `        <table class="bed-data-table ev-table">`,
        `          <caption class="sr-only">Receipts for ${esc(publicName(cap))}</caption>`,
        `          <thead><tr><th scope="col">Receipt</th><th scope="col">Source</th><th scope="col">Result</th><th scope="col">Date</th></tr></thead>`,
        `          <tbody>${receiptRows.join("")}</tbody>`,
        `        </table>`,
        `      </div>`,
      ].join("\n")
    : `      <p>No receipt is published for this key yet: no attributed test count, conformance run, client-lane run or benchmark. The source links below are the only proof on offer.</p>`;

  // The server's own reason for a key without a request-time surface replaces
  // the generic fallback, under a heading that matches the reason; with
  // receipts on the page it follows them as a status note.
  const statusNote = renderStatusNote(cap, receiptRows.length > 0);
  const receiptsBlock = receiptRows.length
    ? `      <h2>Receipts</h2>\n${receiptsSection}${statusNote ? `\n${statusNote}` : ""}`
    : statusNote || `      <h2>Receipts</h2>\n${receiptsSection}`;

  // Live section.
  let liveSection;
  if (liveRows.length || gapRows.length) {
    liveSection = [...liveRows.map(renderLiveRow), ...gapRows.map(renderGapRow)].join("\n");
  } else {
    liveSection = `      <p>No public endpoint on the demo exercises this capability yet. The receipts below are the proof on offer; <a href="endpoints.html">the endpoint directory</a> lists what the demo does serve.</p>`;
  }

  // Exceptions in plain words.
  const exceptions = [];
  // The matrix's no-surface record is an object ({ reasonCode, reason, … }); the
  // sync copies the same record onto cap.statusNote, which renderStatusNote shows
  // under its own heading, so only a reason the note does not already carry is listed here.
  const noSurfaceReason = typeof join?.noSurface === "string" ? join.noSurface : join?.noSurface?.reason;
  const statusNoteReason = typeof cap.statusNote === "string" ? cap.statusNote : cap.statusNote?.reason;
  if (noSurfaceReason && noSurfaceReason !== statusNoteReason) exceptions.push(esc(noSurfaceReason));
  for (const p of join?.parity ?? []) {
    if (p.parity && p.parity !== "full") {
      exceptions.push(`${esc(p.displayName)}: ${esc(p.parity)} parity with the incumbent's REST behaviour; the operation-level differences are listed in the <a href="${esc(receipts?.matrix?.parityMatrix ?? matrixUrl)}" target="_blank" rel="noopener noreferrer">GeoServices parity matrix ↗</a>.`);
    }
  }
  if (!join) for (const gap of renderedGaps(cap)) exceptions.push(esc(gap));
  if (cap.status === "partial" && exceptions.length === 0) exceptions.push("Some operations are not yet implemented; see the capability documentation for details.");
  const exceptionsSection = exceptions.length
    ? `      <h2>${cap.status === "partial" ? "Not yet implemented" : "Exceptions"}</h2>\n      <ul class="cap-gaps">${exceptions.map((x) => `<li>${x}</li>`).join("")}</ul>`
    : "";

  const sources = [
    `<li><a href="https://github.com/honua-io/honua-server" target="_blank" rel="noopener noreferrer">honua-server repository ↗</a> — implementation and test source.</li>`,
    `<li><a href="${esc(matrixUrl)}" target="_blank" rel="noopener noreferrer">Published capability matrix ↗</a> — the upstream record${commit ? ` at ${esc(shortCommit(commit))}` : ""}; counts and runs on this page are copied from it.</li>`,
  ];
  if (join?.cite?.length && receipts?.matrix?.citeStatus) sources.push(`<li><a href="${esc(receipts.matrix.citeStatus)}" target="_blank" rel="noopener noreferrer">CITE status ↗</a> — the conformance suite receipts.</li>`);
  if (cap.scopeNote) sources.push(`<li><a href="${esc(cap.links.docs)}"${linkAttrs(cap.links.docs)}>Pinned 3D protocol scope and truth table ↗</a>.</li>`);
  if (cap.links.demo) sources.push(`<li><a href="${esc(cap.links.demo)}"${linkAttrs(cap.links.demo)}>See it live${linkLabel(cap.links.demo)}</a> — a demo that exercises this capability.</li>`);
  if (cap.links.sample) sources.push(`<li><a href="${esc(cap.links.sample)}"${linkAttrs(cap.links.sample)}>Try the sample${linkLabel(cap.links.sample)}</a>.</li>`);
  if (cap.links.docs && cap.links.docs !== "docs.html" && !cap.scopeNote) sources.push(`<li><a href="${esc(cap.links.docs)}"${linkAttrs(cap.links.docs)}>Documentation${linkLabel(cap.links.docs)}</a>.</li>`);
  sources.push(`<li><a href="data/capabilities.v1.json"><code>data/capabilities.v1.json</code></a> — the site snapshot, keyed <code>${esc(cap.key)}</code>${receipts ? `; receipts in <a href="data/evidence-receipts.v1.json"><code>data/evidence-receipts.v1.json</code></a>` : ""}.</li>`);

  const main = `
      <p class="ev-back"><a href="capability-details.html#cap-${id}">← Capability catalog</a></p>
      <h1>${esc(publicName(cap))}</h1>
      <p class="h-lede ev-lede">${esc(cap.summary)}</p>
      ${cap.scopeNote ? `<p class="note">${esc(cap.scopeNote)}</p><p>Counts below are attributed source tests, not a passing execution receipt or exact-candidate certification.</p>` : ""}
      <div class="h-sheet ev-sheet"><dl>${sheet.join("")}</dl></div>
      ${vocab ? `<p class="ev-meaning"><strong>Evidence status: ${esc(vocab.label)}.</strong> ${esc(vocab.meaning)} Test counts are per capability key, so this page counts only tests attributed to <code>${esc(cap.key)}</code>${fam && fam.keys > 1 ? `; the ${esc(family)} family carries ${fmtInt(fam.tests)} across its ${fam.keys} keys` : ""}, and the matrix attributes ${fmtInt(totalAttributed)} in all.</p>` : ""}

      <h2>Live on the demo</h2>
${liveSection}

${receiptsBlock}

${exceptionsSection}

      <h2>Sources</h2>
      <ul class="cap-gaps ev-sources">
        ${sources.join("\n        ")}
      </ul>
`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Evidence: ${esc(publicName(cap))} | Honua</title>
  </head>
  <body>
    <main id="main-content" tabindex="-1" class="bed-prose">${main}</main>
  </body>
</html>
`;
}

const policy = JSON.parse(readFileSync(dataPath, "utf8"));
const FAMILIES = familyStats(policy);
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
const nextPage = normalizeCapabilityMetadata(before + renderHub(policy) + after);

if (check) {
  if (nextPage !== page) mismatches.push("capabilities.html catalog region is out of date");
} else {
  writeFileSync(catalogPath, nextPage);
}

// Detailed, shareable reference stays one level below the grouped overview.
const detailsPath = join(repoRoot, "capability-details.html");
const detailsPage = renderDetailsPage(policy, renderDetailedCatalog(policy));
if (check) {
  let existing = ""; try { existing = readFileSync(detailsPath, "utf8"); } catch {}
  if (existing !== detailsPage) mismatches.push("capability-details.html is out of date");
} else { writeFileSync(detailsPath, detailsPage); }

const installPath = join(repoRoot, "install-with-agent.html");
const installPage = readFileSync(installPath, "utf8");
const normalizedInstall = normalizeCapabilityMetadata(installPage);
if (check) {
  if (installPage !== normalizedInstall) mismatches.push("install-with-agent.html metadata is out of date");
} else if (installPage !== normalizedInstall) writeFileSync(installPath, normalizedInstall);

// 2. Per-capability L2 evidence pages.
const expectedEvidenceFiles = new Set(policy.capabilities.map((cap) => evidenceFile(cap.key)));
// Authored retirement notices retain old inbound URLs without restoring a
// removed capability or its commercial/evidence claim (site #244).
const retirementNotices = ["evidence-ai-workflow-generation.html"];
for (const notice of retirementNotices) {
  if (expectedEvidenceFiles.has(notice)) mismatches.push(`${notice} must remain retired`);
  try {
    readFileSync(join(repoRoot, notice), "utf8");
  } catch {
    mismatches.push(`missing retirement notice ${notice}`);
  }
}
for (const cap of policy.capabilities) {
  const outPath = join(repoRoot, evidenceFile(cap.key));
  const rendered = withTrademarkNotice(modernizeEvidence(renderEvidencePage(policy, cap), policy, cap).replace(/^[ \t]+$/gm, ""));
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
  (name) => /^evidence-[a-z0-9-]+\.html$/.test(name) && !expectedEvidenceFiles.has(name) && !retirementNotices.includes(name)
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

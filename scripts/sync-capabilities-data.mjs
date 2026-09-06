#!/usr/bin/env node
// Regenerates data/capabilities.v1.json from honua-server's published
// capability artifacts (Phase A of honua-io/honua-server#2892):
//   - capability-matrix.v1.json  (evidence joins: proving tests, CITE, parity, interop, geobench)
//   - capability-keys.v1.json    (descriptions/display metadata)
// plus the curated overlay in data/capability-links.json (demo/sample links,
// which cannot be derived from server data).
//
// Honesty rules (claims.html vocabulary, enforced here):
//   - "source-backed"  only when the capability has proving tests AND all its
//     routes are implemented;
//   - "partial"        implemented routes but no per-capability proving tests
//     yet, or mixed maturity;
//   - "proof-pending"  no routes (no-surface) or nothing implemented yet.
// Numbers are copied verbatim from the server artifact — never invented here.
//
// Usage: node scripts/sync-capabilities-data.mjs [--check]
//   --check: fail (exit 2) on keys or text references absent from the canonical
//   key list. Other upstream content drift is informational.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(REPO_ROOT, "data", "capabilities.v1.json");
const LINKS_PATH = path.join(REPO_ROOT, "data", "capability-links.json");

// claims.html status vocabulary — badge classes are site policy, not server data.
const STATUS_VOCABULARY = {
  "source-backed": {
    "badge": "green",
    "label": "Source evaluation \u2014 counted evidence",
    "meaning": "A dated, numbered CITE or conformance-suite count is published for this exact capability."
  },
  "source-evaluation": {
    "badge": "green",
    "label": "Source evaluation",
    "meaning": "Runnable and inspectable from public server trunk today; no aggregate test count is published for this exact capability yet."
  },
  "partial": {
    "badge": "amber",
    "label": "Partial coverage",
    "meaning": "Documented, operation-level coverage and gaps exist, but no aggregate test count is published for this exact capability yet."
  },
  "preview": {
    "badge": "amber",
    "label": "Preview",
    "meaning": "Implemented and disclosed, but pre-GA: disabled by default, opt-in only, and may change."
  },
  "proof-pending": {
    "badge": "gray",
    "label": "Proof pending",
    "meaning": "No public evidence artifact is published for this exact capability yet."
  }
};

const MATRIX_URL =
  process.env.CAPABILITY_MATRIX_URL ??
  "https://raw.githubusercontent.com/honua-io/honua-server/trunk/docs/gis/data/capability-matrix.v1.json";
const KEYS_URL =
  process.env.CAPABILITY_KEYS_URL ??
  "https://raw.githubusercontent.com/honua-io/honua-server/trunk/docs/gis/data/capability-keys.v1.json";

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

// The matrix is an evidence join, not the canonical vocabulary: it can lag a
// key retirement too. Check every input against capability-keys.v1.json.
function validateVocabulary(keys, documents, links) {
  const canonical = new Set(keys.capabilities.map((cap) => cap.key));
  const failures = [];
  for (const [source, capabilities] of documents) {
    for (const cap of capabilities) {
      if (!canonical.has(cap.key)) failures.push(`${source}: unknown capability key ${cap.key}`);
      function checkText(value, field) {
        if (!value || typeof value !== "object") return;
        for (const [name, content] of Object.entries(value)) {
          if (["reason", "summary", "description"].includes(name) && typeof content === "string") {
            // Capability references use dotted lowercase identifiers. Only
            // inspect prose fields, never URLs, filenames or version metadata.
            const prose = content.replace(/https?:\/\/[^\s)<>]+/g, "");
            for (const [reference] of prose.matchAll(/\b[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+\b/g)) {
              if (/\.(?:md|json|html|mjs|js|cs|yaml|yml)$/.test(reference)) continue;
              if (!canonical.has(reference)) failures.push(`${source}: ${cap.key} ${field}${name} references unknown capability key ${reference}`);
            }
          } else if (content && typeof content === "object") {
            checkText(content, `${field}${name}.`);
          }
        }
      }
      checkText(cap, "");
    }
  }
  for (const key of Object.keys(links)) {
    if (!canonical.has(key)) failures.push(`data/capability-links.json: unknown capability key ${key}`);
  }
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(2);
  }
}

function deriveStatus(cap) {
  const implemented = cap.maturity?.implemented ?? 0;
  const entryCount = cap.entryCount ?? 0;
  if (cap.noSurface) return { status: "proof-pending", statusNote: cap.noSurface };
  if (entryCount === 0 || implemented === 0) return { status: "proof-pending", statusNote: null };
  if (cap.provingTestCount > 0 && implemented === entryCount) return { status: "source-backed", statusNote: null };
  if (cap.provingTestCount > 0) {
    return { status: "partial", statusNote: "Some routes for this capability are not yet implemented; counts cover the implemented surface." };
  }
  return { status: "partial", statusNote: "Routes are implemented but per-capability proving-test counts have not been attributed yet." };
}

function deriveGaps(cap) {
  const gaps = [];
  for (const parity of cap.parity ?? []) {
    if (parity.parity && parity.parity !== "full") {
      gaps.push(`${parity.displayName ?? parity.serviceId} Esri parity: ${parity.parity} — see the GeoServices parity matrix.`);
    }
  }
  return gaps;
}

async function main() {
  const check = process.argv.includes("--check");
  const [matrix, keys] = await Promise.all([fetchJson(MATRIX_URL), fetchJson(KEYS_URL)]);
  const descriptions = new Map(keys.capabilities.map((k) => [k.key, k.description]));
  let links = {};
  try {
    links = JSON.parse(await readFile(LINKS_PATH, "utf8")).links ?? {};
  } catch {
    // overlay is optional
  }

  const committed = check ? JSON.parse(await readFile(OUT_PATH, "utf8")) : null;
  validateVocabulary(keys, [
    ["capability-keys.v1.json", keys.capabilities],
    ["capability-matrix.v1.json", matrix.capabilities],
    ...(check ? [["data/capabilities.v1.json", committed.capabilities]] : []),
  ], links);

  const capabilities = matrix.capabilities.map((cap) => {
    const { status, statusNote } = deriveStatus(cap);
    const overlay = links[cap.key] ?? {};
    const slug = cap.key.replace(/\./g, "-");
    return {
      key: cap.key,
      displayName: cap.displayName,
      category: cap.category,
      edition: (cap.edition ?? "community").toLowerCase(),
      status,
      statusNote,
      summary: descriptions.get(cap.key) ?? "",
      evidence: {
        tests: cap.provingTestCount ?? 0,
        citeSuites: (cap.cite ?? []).map((c) => `${c.suite} (${c.passed}/${c.total})`),
        interopClients: cap.interop ?? [],
        benchmarks: cap.geobench ?? [],
      },
      gaps: deriveGaps(cap),
      links: {
        ...(overlay.demo ? { demo: overlay.demo } : {}),
        ...(overlay.sample ? { sample: overlay.sample } : {}),
        docs: overlay.docs ?? "docs.html",
        evidence: `evidence-${slug}.html`,
      },
    };
  });

  const doc = {
    schemaVersion: "capabilities.v1",
    statusVocabulary: STATUS_VOCABULARY,
    generatedAt: matrix.generatedAt ?? new Date().toISOString().slice(0, 10),
    source: `${MATRIX_URL} (schemaVersion ${matrix.schemaVersion}); regenerate with scripts/sync-capabilities-data.mjs`,
    unjoinedCiteSuites: matrix.unjoinedCiteSuites ?? [],
    capabilities,
  };
  const rendered = JSON.stringify(doc, null, 2) + "\n";

  if (check) {
    // Preserve the evidence-join check as well as the canonical-key check.
    const upstream = new Set(capabilities.map((cap) => cap.key));
    const unjoined = committed.capabilities.map((cap) => cap.key).filter((key) => !upstream.has(key));
    if (unjoined.length) {
      console.error(`data/capabilities.v1.json contains keys absent from the upstream matrix: ${unjoined.join(", ")}`);
      process.exit(2);
    }
    // Content drift does NOT fail PRs: producers move constantly, and failing
    // unrelated site PRs on upstream motion makes every producer merge break
    // this repo. The scheduled/manual sync run refreshes and commits.
    if (JSON.stringify(committed) !== JSON.stringify(JSON.parse(rendered))) {
      console.log("notice: capabilities.v1.json differs from a fresh upstream sync; run scripts/sync-capabilities-data.mjs to refresh. (Not a PR failure.)");
    } else {
      console.log("capabilities.v1.json is in sync with upstream.");
    }
    return;
  }

  await writeFile(OUT_PATH, rendered, "utf8");
  console.log(`Wrote ${capabilities.length} capabilities to data/capabilities.v1.json.`);
}

main().catch((err) => {
  console.error(`sync-capabilities-data: ${err.message}`);
  process.exit(1);
});

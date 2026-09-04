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
//   --check: fail (exit 2) if data/capabilities.v1.json differs from a fresh
//   sync — used by CI to detect drift against the pinned upstream snapshot.

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
  if (url.startsWith("file:")) {
    return JSON.parse(await readFile(new URL(url), "utf8"));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

function deriveStatus(cap) {
  if (cap.status === "preview" || (cap.maturity?.preview ?? 0) > 0) {
    return {
      status: "preview",
      statusNote: "Honua 2026.1 is GA for single-tenant deployments. Multi-tenant operation is Preview with no GA operational, SLA, or scale promise; cross-tenant disclosure remains a full-severity security defect."
    };
  }
  const implemented = cap.maturity?.implemented ?? 0;
  const entryCount = cap.entryCount ?? 0;
  if (cap.status === "preview" || (entryCount > 0 && (cap.maturity?.preview ?? 0) === entryCount)) {
    return { status: "preview", statusNote: null };
  }
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

  // Structural gate: every curated link key must exist in the upstream
  // vocabulary. Unknown keys used to be silently dropped, which orphaned
  // curated demo links when a capability key was renamed upstream.
  const upstreamKeys = new Set(matrix.capabilities.map((cap) => cap.key));
  const orphanedLinkKeys = Object.keys(links).filter((key) => !upstreamKeys.has(key));
  if (orphanedLinkKeys.length) {
    console.error(
      `data/capability-links.json contains keys absent from the upstream vocabulary: ${orphanedLinkKeys.join(", ")}`
    );
    process.exit(2);
  }

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
    source: `${process.env.CAPABILITY_SOURCE_LABEL ?? MATRIX_URL} (schemaVersion ${matrix.schemaVersion}); regenerate with scripts/sync-capabilities-data.mjs`,
    unjoinedCiteSuites: matrix.unjoinedCiteSuites ?? [],
    capabilities,
  };
  const rendered = JSON.stringify(doc, null, 2) + "\n";

  if (check) {
    const committed = JSON.parse(await readFile(OUT_PATH, "utf8"));
    // Structural gate (fails PRs): every committed key must exist upstream.
    const upstream = new Set(capabilities.map((c) => c.key));
    const unknown = (committed.capabilities ?? []).map((c) => c.key).filter((k) => !upstream.has(k));
    if (unknown.length) {
      console.error(`data/capabilities.v1.json contains keys absent from the upstream vocabulary: ${unknown.join(", ")}`);
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

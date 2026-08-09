#!/usr/bin/env node
/*
 * Deterministic admission contract for public sample routes that have not yet
 * moved into the SDK-owned sample projection. These records are explicit site
 * exceptions: they never promote a local preview into an SDK-owned artifact or
 * turn the absence of producer live evidence into a fixture success claim.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = "assets/samples/site-exceptions.v1.json";
const SDK_PUBLICATION = "assets/samples/sdk-publication.v1.json";
const MANIFEST = "assets/samples/manifest.json";
const AUDIT = "assets/samples/audit.json";
const SITE_COMMIT = "96f42fa6f30ec9d01e7f29d895ec42b1d446dd3c";
const LEGACY_SDK_COMMIT = "43fe4fab7dc6e1ffed232677302d4143fd5bdff7";
const CURRENT_SDK_COMMIT = "ec58b44045b8979a4fc2ed0d5368505505505b4c";
const ADMISSION_OBSERVED_AT = "2026-08-01T18:22:03.402Z";
const API_REFERENCE = "https://honua-io.github.io/honua-sdk-js/api/";
const GUIDE_INDEX = "https://honua-io.github.io/honua-sdk-js/guides/";
const REQUIRED_CONNECT_SOURCES = [
  "'self'",
  "https://demo.honua.io",
  "https://www.google-analytics.com",
  "https://region1.google-analytics.com",
];
const APPROVED_CONNECT_SOURCES = new Set(REQUIRED_CONNECT_SOURCES);
const CANONICAL_TEXT_EXTENSIONS = new Set([
  ".css",
  ".geojson",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".svg",
  ".ts",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const legacySdk = {
  package: "@honua/sdk-js",
  version: "0.0.14-alpha.0",
  gitCommit: LEGACY_SDK_COMMIT,
  role: "embedded preview bundle",
};
const noSdk = {
  package: "@honua/sdk-js",
  version: null,
  gitCommit: null,
  role: "not embedded; protocol compatibility route",
};

const noLiveEnvelope = (fallback) => ({
  lane: "live",
  status: "unavailable",
  observedAt: null,
  reason: "No producer-owned live evidence envelope is retained for this site-owned exception; runtime state is reported by the page and is not converted into a fixture claim.",
  degradation: fallback
    ? `The route may use its visibly labeled ${fallback} fallback.`
    : "The route reports the unavailable live capability without substituting evidence.",
});

const specs = [
  {
    id: "two-protocols",
    route: "demo-two-protocols.html",
    sourceRoot: "assets/demos/two-protocols",
    supportStatus: "supported-preview",
    protocols: ["GeoServices", "OGC API Features", "OData"],
    renderers: ["MapLibre"],
    sdk: legacySdk,
    data: {
      mode: "demo-live",
      authMode: "anonymous",
      provenance: "The page probes the configured Honua demo endpoints and records the selected protocol; no live response payload is retained by this publication.",
      attribution: "Endpoint-advertised attribution is preserved by the route; unavailable attribution remains explicit.",
      freshness: "Live state is determined at runtime. This publication has no retained live observation.",
    },
    evidence: noLiveEnvelope("fixture"),
    expectedDegradation: "Each protocol lane is labeled independently and an unavailable lane cannot become an empty success.",
    requiredSymbols: ["HonuaClient", "createDataset", "PROTOCOL_DEFAULT_CAPABILITIES", "envelope"],
  },
  {
    id: "imagery-terrain",
    route: "demo-imagery-terrain.html",
    sourceRoot: "assets/demos/imagery-terrain",
    supportStatus: "supported-preview",
    protocols: ["STAC", "COG", "ImageServer", "PMTiles"],
    renderers: ["MapLibre"],
    sdk: legacySdk,
    data: {
      mode: "demo-live",
      authMode: "anonymous",
      provenance: "Versioned local STAC fixtures and configured demo imagery, terrain, and catalog lanes are presented separately.",
      attribution: "Dataset attribution is carried in the retained STAC/configuration records and rendered by the map.",
      freshness: "Fixture records are versioned; current live availability is evaluated only in the browser.",
    },
    evidence: noLiveEnvelope("degraded"),
    expectedDegradation: "Raster, terrain, and catalog failures are isolated and visibly labeled.",
    requiredSymbols: ["HonuaClient"],
  },
  {
    id: "codemod",
    route: "sample-codemod.html",
    sourceRoot: "assets/demos/samples/codemod",
    supportStatus: "supported-preview",
    protocols: ["GeoServices", "OGC API Features"],
    renderers: ["MapLibre", "Esri compatibility"],
    sdk: legacySdk,
    data: {
      mode: "demo-live",
      authMode: "anonymous",
      provenance: "Site-owned before/after migration fixture plus an optional deployed endpoint.",
      attribution: "The migration fixture is site-owned; endpoint attribution is shown when advertised.",
      freshness: "The source transformation is deterministic; endpoint status is runtime-only.",
    },
    evidence: noLiveEnvelope("degraded"),
    expectedDegradation: "Endpoint failure remains an error state and never fabricates migrated results.",
    requiredSymbols: ["defineHonuaWebComponents"],
  },
  {
    id: "hello-webmap",
    route: "sample-hello-webmap.html",
    sourceRoot: "assets/demos/samples/hello-webmap",
    supportStatus: "preview",
    protocols: ["MapPackage", "GeoServices"],
    renderers: ["MapLibre", "Honua web components"],
    sdk: legacySdk,
    data: {
      mode: "demo-live",
      authMode: "anonymous",
      provenance: "A site-owned MapPackage preview references configured demo sources.",
      attribution: "MapPackage and endpoint attribution are rendered when available.",
      freshness: "Package bytes are integrity-recorded; live source freshness is runtime-only.",
    },
    evidence: noLiveEnvelope("degraded"),
    expectedDegradation: "Unavailable map sources remain visible as a degraded package load.",
    requiredSymbols: ["createHonuaWebComponentController", "defineHonuaWebComponents"],
  },
  {
    id: "service-explorer",
    route: "sample-service-explorer.html",
    sourceRoot: "assets/demos/samples/service-explorer",
    supportStatus: "preview",
    protocols: ["GeoServices", "OGC API", "OData"],
    renderers: ["Honua web components"],
    sdk: legacySdk,
    data: {
      mode: "demo-live",
      authMode: "anonymous",
      provenance: "Metadata is read from the configured demo service; no response payload is retained here.",
      attribution: "Service-advertised attribution is displayed when present.",
      freshness: "Catalog health and metadata are evaluated at runtime.",
    },
    evidence: noLiveEnvelope(),
    expectedDegradation: "Discovery failures are shown as unavailable rather than an empty catalog.",
    requiredSymbols: ["defineHonuaWebComponents"],
  },
  {
    id: "wms-overlay",
    route: "sample-raster-overlay.html",
    sourceRoot: "assets/demos/samples/raster-overlay",
    supportStatus: "preview",
    protocols: ["WMS", "WMTS"],
    renderers: ["MapLibre", "Honua web components"],
    sdk: legacySdk,
    data: {
      mode: "demo-live",
      authMode: "anonymous",
      provenance: "The overlay configuration points at the deployed demo service; no raster payload is retained.",
      attribution: "Raster source attribution is preserved in the layer configuration and map control.",
      freshness: "Overlay availability is runtime-only; static route assets are integrity-recorded.",
    },
    evidence: noLiveEnvelope("degraded"),
    expectedDegradation: "An unavailable raster lane is labeled without hiding the base map state.",
    requiredSymbols: ["defineHonuaWebComponents"],
  },
  {
    id: "maui-3d",
    route: "demo-maui-3d.html",
    sourceRoot: "assets/demos/maui-3d",
    supportStatus: "preview",
    protocols: ["PMTiles", "GeoServices"],
    renderers: ["MapLibre 2.5D"],
    sdk: legacySdk,
    data: {
      mode: "demo-live",
      authMode: "anonymous",
      provenance: "A deterministic Kahului building fixture can be compared with configured terrain and live feature sources.",
      attribution: "Overture Maps Foundation and OpenStreetMap attribution is retained in the route configuration.",
      freshness: "Fixture provenance is versioned; terrain and endpoint availability are runtime-only.",
    },
    evidence: noLiveEnvelope("degraded"),
    expectedDegradation: "The page keeps fixture/live state and terrain availability explicit.",
    requiredSymbols: ["createDataset", "envelope"],
  },
  {
    id: "expr-builder",
    route: "sample-expr-builder.html",
    sourceRoot: "assets/demos/samples/expr-builder",
    supportStatus: "preview",
    protocols: ["CQL2", "GeoServices"],
    renderers: ["MapLibre", "Honua web components"],
    sdk: legacySdk,
    data: {
      mode: "demo-live",
      authMode: "anonymous",
      provenance: "A site-owned expression fixture is translated for the configured demo source.",
      attribution: "Fixture and endpoint provenance remain visible beside results.",
      freshness: "Expression inputs are deterministic; live results are not retained.",
    },
    evidence: noLiveEnvelope(),
    expectedDegradation: "Unsupported expressions and endpoint errors remain structured failures.",
    requiredSymbols: ["defineHonuaWebComponents"],
  },
  {
    id: "controls-kit",
    route: "demo-sdk-controls.html",
    sourceRoot: "assets/demos/sdk-controls",
    supportStatus: "preview",
    protocols: ["GeoServices", "PMTiles"],
    renderers: ["MapLibre", "Honua web components"],
    sdk: legacySdk,
    data: {
      mode: "demo-live",
      authMode: "anonymous",
      provenance: "The component gallery uses retained fixtures plus configured demo layers.",
      attribution: "Layer attribution is propagated through the map and component controls.",
      freshness: "Component assets are integrity-recorded; live layer health is runtime-only.",
    },
    evidence: noLiveEnvelope("degraded"),
    expectedDegradation: "Individual component/source failures remain visible without blocking the reference gallery.",
    requiredSymbols: ["defineHonuaWebComponents"],
  },
  {
    id: "control-legend",
    route: "sample-control-legend.html",
    sourceRoot: "assets/demos/samples/control-legend",
    supportStatus: "preview",
    protocols: ["GeoServices"],
    renderers: ["MapLibre", "Honua web components"],
    sdk: legacySdk,
    data: {
      mode: "demo-live",
      authMode: "anonymous",
      provenance: "A site-owned legend recipe binds to configured demo layers.",
      attribution: "Layer attribution remains visible in the map control.",
      freshness: "Recipe assets are integrity-recorded; live layer status is runtime-only.",
    },
    evidence: noLiveEnvelope("degraded"),
    expectedDegradation: "Missing layer metadata is surfaced by the recipe.",
    requiredSymbols: ["defineHonuaWebComponents"],
  },
  {
    id: "control-search",
    route: "sample-control-search.html",
    sourceRoot: "assets/demos/samples/control-search",
    supportStatus: "preview",
    protocols: ["GeoServices"],
    renderers: ["MapLibre", "Honua web components"],
    sdk: legacySdk,
    data: {
      mode: "demo-live",
      authMode: "anonymous",
      provenance: "A site-owned search recipe queries configured demo feature attributes.",
      attribution: "Source attribution is preserved with mapped search results.",
      freshness: "Recipe assets are integrity-recorded; result freshness is runtime-only.",
    },
    evidence: noLiveEnvelope("degraded"),
    expectedDegradation: "Unavailable search sources remain a labeled degraded state.",
    requiredSymbols: ["defineHonuaWebComponents"],
  },
  {
    id: "editing",
    route: "demo-editing.html",
    sourceRoot: "assets/demos/editing",
    supportStatus: "preview",
    protocols: ["OData", "GeoServices"],
    renderers: ["MapLibre"],
    sdk: legacySdk,
    data: {
      mode: "demo-live",
      authMode: "anonymous resettable profile",
      provenance: "Resettable inspection fixtures and configured demo edit endpoints remain distinct.",
      attribution: "Synthetic inspection fixture provenance is retained with the route configuration.",
      freshness: "Fixture timestamps are retained; authoritative edit freshness is runtime-only.",
    },
    evidence: noLiveEnvelope("fixture"),
    expectedDegradation: "Unavailable or stale live state disables authoritative mutation and keeps fixture edits labeled.",
    requiredSymbols: ["HonuaClient"],
  },
  {
    id: "geocoding",
    route: "sample-geocoding.html",
    sourceRoot: "assets/demos/samples/geocoding",
    supportStatus: "preview",
    protocols: ["GeoServices GeocodeServer"],
    renderers: ["MapLibre", "Honua web components"],
    sdk: legacySdk,
    data: {
      mode: "demo-live",
      authMode: "anonymous",
      provenance: "Configured demo geocoder results are distinct from the labeled local fallback.",
      attribution: "Provider attribution is shown when present; fixture fallback is identified separately.",
      freshness: "Live suggestions are runtime-only; fallback data is deterministic.",
    },
    evidence: noLiveEnvelope("fixture"),
    expectedDegradation: "Unavailable live geocoding uses a visibly labeled deterministic fallback.",
    requiredSymbols: ["defineHonuaWebComponents"],
  },
  {
    id: "gp-runner",
    route: "demo-geoprocessing.html",
    sourceRoot: "assets/demos/geoprocessing",
    supportStatus: "preview",
    protocols: ["OGC API Processes"],
    renderers: ["MapLibre"],
    sdk: noSdk,
    data: {
      mode: "demo-live",
      authMode: "anonymous",
      provenance: "The site-owned protocol runner submits to the configured demo process endpoint; no live job payload is retained.",
      attribution: "Process input/output provenance is shown by the runner.",
      freshness: "Job state is runtime-only; the route and fixture assets are integrity-recorded.",
    },
    evidence: noLiveEnvelope("fixture"),
    expectedDegradation: "Unavailable process execution remains labeled and cannot be confused with fixture output.",
    requiredSymbols: [],
  },
  {
    id: "esri-leaflet",
    route: "demo-esri-leaflet.html",
    sourceRoot: "assets/demos/esri-leaflet",
    supportStatus: "preview",
    protocols: ["GeoServices"],
    renderers: ["Leaflet", "Esri Leaflet"],
    sdk: noSdk,
    data: {
      mode: "demo-live",
      authMode: "anonymous",
      provenance: "Vendored Leaflet/Esri Leaflet clients read the configured Honua compatibility endpoint.",
      attribution: "Leaflet and source attribution remain visible through the foreign client stack.",
      freshness: "Client assets are versioned and integrity-recorded; endpoint health is runtime-only.",
    },
    evidence: noLiveEnvelope("degraded"),
    expectedDegradation: "Endpoint failures remain visible in the compatibility station.",
    requiredSymbols: [],
  },
  {
    id: "standalone-public-map",
    route: "https://github.com/honua-io/honua-sdk-js/tree/ec58b44045b8979a4fc2ed0d5368505505505b4c/examples/standalone-quickstart",
    sourceRoot: null,
    sourceRepository: "honua-io/honua-sdk-js",
    sourceCommit: CURRENT_SDK_COMMIT,
    sourcePath: "examples/standalone-quickstart",
    supportStatus: "source-only",
    protocols: ["GeoServices"],
    renderers: ["MapLibre"],
    sdk: {
      package: "@honua/sdk-js",
      version: "0.1.2-beta.0",
      gitCommit: CURRENT_SDK_COMMIT,
      role: "commit-pinned source reference; not deployed by honua-site",
    },
    data: {
      mode: "public-live",
      authMode: "anonymous",
      provenance: "Commit-pinned SDK source for a configured public FeatureServer; the site does not publish its runtime artifact.",
      attribution: "The public source is responsible for advertised attribution.",
      freshness: "No live observation is retained by the site; inspect the SDK source and run its own evidence lane.",
    },
    evidence: noLiveEnvelope("fixture"),
    expectedDegradation: "The source reference makes no claim about current endpoint availability.",
    requiredSymbols: [],
  },
];

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function sha(path) {
  const sourceBytes = readFileSync(join(ROOT, path));
  // GitHub Pages is built from an LF checkout. Normalize text assets so the
  // deployment integrity record is identical when generated on Windows.
  const bytes = CANONICAL_TEXT_EXTENSIONS.has(extname(path).toLowerCase())
    ? Buffer.from(sourceBytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8")
    : sourceBytes;
  const digest = createHash("sha256").update(bytes).digest();
  return {
    path,
    bytes: bytes.byteLength,
    sha256: digest.toString("hex"),
    integrity: `sha256-${digest.toString("base64")}`,
  };
}

function filesBelow(root) {
  if (!root) return [];
  const found = [];
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) found.push(relative(ROOT, child).split(sep).join("/"));
    }
  }
  visit(join(ROOT, root));
  return found.sort();
}

function directLocalAssets(html) {
  return [...html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/gi)]
    .map((match) => match[1].replace(/^\//, ""))
    .filter((path) => !/^(?:https?:|mailto:|tel:)/.test(path))
    .filter((path) => !path.endsWith(".html"))
    .filter((path) => existsSync(join(ROOT, path)) && statSync(join(ROOT, path)).isFile());
}

function metaCspDirectives(html) {
  const meta = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => /\bhttp-equiv\s*=\s*["']Content-Security-Policy["']/i.test(tag));
  const content = meta?.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? meta?.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
  if (!content) throw new Error("Route is missing a Content-Security-Policy meta tag");
  return new Map(
    content
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...values]) => [name, values]),
  );
}

function sourceLink(repository, commit, path, kind = "tree") {
  return `https://github.com/${repository}/${kind}/${commit}/${path}`;
}

function buildSample(spec) {
  const repository = spec.sourceRepository ?? "honua-io/honua-site";
  const commit = spec.sourceCommit ?? SITE_COMMIT;
  const path = spec.sourcePath ?? spec.sourceRoot;
  const source = {
    repository,
    gitCommit: commit,
    path,
    url: sourceLink(repository, commit, path),
  };
  const links = {
    source: source.url,
    guide: GUIDE_INDEX,
    apiReference: API_REFERENCE,
    proof: "proof-compatibility.html",
    evidence: OUTPUT,
  };

  if (/^https:\/\//.test(spec.route)) {
    return {
      id: spec.id,
      kind: "source-reference",
      reason: "This visible recipe is an exact-commit SDK source reference, not a site-deployed artifact.",
      route: spec.route,
      supportStatus: spec.supportStatus,
      source,
      sdk: spec.sdk,
      protocols: spec.protocols,
      renderers: spec.renderers,
      data: spec.data,
      evidence: [spec.evidence],
      expectedDegradation: spec.expectedDegradation,
      routeShell: null,
      files: [],
      csp: null,
      links,
    };
  }

  const html = readFileSync(join(ROOT, spec.route), "utf8");
  const csp = metaCspDirectives(html);
  const connectSources = csp.get("connect-src") ?? [];
  for (const origin of connectSources) {
    if (!APPROVED_CONNECT_SOURCES.has(origin)) throw new Error(`${spec.route} grants an unapproved connect-src: ${origin}`);
  }
  if (JSON.stringify(connectSources) !== JSON.stringify(REQUIRED_CONNECT_SOURCES)) {
    throw new Error(`${spec.route} does not retain the reviewed site-exception connect-src contract`);
  }
  const filePaths = [...new Set([...filesBelow(spec.sourceRoot), ...directLocalAssets(html)])]
    .filter((file) => file !== spec.route)
    .sort();
  const searchable = [html, ...filePaths.map((file) => readFileSync(join(ROOT, file), "utf8"))].join("\n");
  if (!/(?:attribution|©|fixture|demo data)/i.test(searchable)) {
    throw new Error(`${spec.id} has no retained attribution/provenance marker`);
  }
  const entrySource = readFileSync(
    join(ROOT, spec.requiredSymbols.includes("defineHonuaWebComponents") ? "assets/vendor/honua-webcomponents-entry.ts" : "assets/vendor/honua-sdk-entry.ts"),
    "utf8",
  );
  for (const symbol of spec.requiredSymbols) {
    if (!entrySource.includes(symbol)) throw new Error(`${spec.id} references unsupported legacy SDK symbol ${symbol}`);
  }

  return {
    id: spec.id,
    kind: "site-owned-exception",
    reason: "This route remains site-owned until an SDK-projected replacement is admitted; its metadata and content digests are explicit and deployment-gated.",
    route: spec.route,
    supportStatus: spec.supportStatus,
    source,
    sdk: spec.sdk,
    protocols: spec.protocols,
    renderers: spec.renderers,
    data: spec.data,
    evidence: [spec.evidence],
    expectedDegradation: spec.expectedDegradation,
    requiredSymbols: spec.requiredSymbols,
    routeShell: sha(spec.route),
    files: filePaths.map(sha),
    csp: { connectSources },
    links,
  };
}

function buildPublication() {
  return {
    format: "honua.site.sample-exceptions.v1",
    schemaVersion: 1,
    producer: {
      repository: "honua-io/honua-site",
      baselineGitCommit: SITE_COMMIT,
      admissionObservedAt: ADMISSION_OBSERVED_AT,
    },
    admissionEvidence: {
      status: "validated",
      kind: "deterministic-static-admission",
      observedAt: ADMISSION_OBSERVED_AT,
      reason: "Route, local asset, source-link, SDK-symbol, CSP-origin, attribution-marker, and integrity checks completed without live network access.",
    },
    samples: specs.map(buildSample),
  };
}

function validateLink(href, label) {
  if (typeof href !== "string" || href.length === 0) throw new Error(`${label} is missing`);
  if (href === OUTPUT) return;
  if (/^https:\/\//.test(href)) return;
  if (!existsSync(join(ROOT, href))) throw new Error(`${label} points to missing local file ${href}`);
}

function validatePublication(publication) {
  if (publication.format !== "honua.site.sample-exceptions.v1" || publication.schemaVersion !== 1) {
    throw new Error("Site exception publication schema is incompatible");
  }
  const ids = new Set();
  for (const sample of publication.samples) {
    if (ids.has(sample.id)) throw new Error(`Duplicate site exception ${sample.id}`);
    ids.add(sample.id);
    if (!sample.supportStatus || !sample.source?.url || !sample.data?.mode || !sample.data?.provenance) {
      throw new Error(`${sample.id} is missing required support/source/data metadata`);
    }
    if (!sample.data.attribution || !sample.data.freshness || !sample.expectedDegradation) {
      throw new Error(`${sample.id} is missing attribution/freshness/degradation metadata`);
    }
    if (!Array.isArray(sample.evidence) || sample.evidence.length === 0 || !sample.evidence[0].reason) {
      throw new Error(`${sample.id} is missing truthful retained evidence state`);
    }
    for (const [name, href] of Object.entries(sample.links)) validateLink(href, `${sample.id} ${name} link`);
    if (!sample.source.url.includes(sample.source.gitCommit)) throw new Error(`${sample.id} source link is not commit-pinned`);
    if (sample.routeShell) {
      if (sha(sample.routeShell.path).sha256 !== sample.routeShell.sha256) throw new Error(`${sample.id} route digest drift`);
      for (const file of sample.files) {
        if (sha(file.path).sha256 !== file.sha256) throw new Error(`${sample.id} asset digest drift: ${file.path}`);
      }
    }
  }
}

function validateCatalogBindings(publication) {
  const manifest = readJson(MANIFEST);
  const audit = readJson(AUDIT);
  const sdkPublication = readJson(SDK_PUBLICATION);
  if (manifest.projection?.siteExceptions !== OUTPUT) throw new Error("Gallery manifest does not bind the site exception publication");
  if (manifest.projection?.evidenceStaleAfterHours !== 168) throw new Error("Gallery manifest must use the reviewed seven-day evidence freshness window");
  const sdkIds = new Set(sdkPublication.samples.map((sample) => sample.id));
  const exceptionIds = new Set(publication.samples.map((sample) => sample.id));
  const mappedLegacy = new Set();
  const entries = [...manifest.journeys, ...manifest.recipes];
  for (const item of entries) {
    const [kind, id, extra] = String(item.contractRef ?? "").split(":");
    if (extra || !id || !["sdk", "site"].includes(kind)) throw new Error(`${item.id} has invalid contractRef`);
    if (kind === "sdk" && !sdkIds.has(id)) throw new Error(`${item.id} references missing SDK sample ${id}`);
    if (kind === "site" && !exceptionIds.has(id)) throw new Error(`${item.id} references missing site exception ${id}`);
    const record = kind === "sdk"
      ? sdkPublication.samples.find((sample) => sample.id === id)
      : publication.samples.find((sample) => sample.id === id);
    const acceptedRoutes = new Set([record.route, ...(record.aliases ?? [])]);
    if (!acceptedRoutes.has(item.href)) throw new Error(`${item.id} route ${item.href} does not match ${item.contractRef}`);
    if (item.legacyId) mappedLegacy.add(item.legacyId);
    if (manifest.recipes.includes(item) && item.id !== "standalone-public-map") mappedLegacy.add(item.id);
  }
  const audited = new Set(audit.entries.filter((entry) => entry.inventory === "honua-site").map((entry) => entry.id));
  if (audited.size !== 21 || mappedLegacy.size !== 21) throw new Error("Catalog must map all 21 legacy site samples exactly");
  for (const id of audited) if (!mappedLegacy.has(id)) throw new Error(`Audited site sample is not contract-bound: ${id}`);
  for (const id of mappedLegacy) if (!audited.has(id)) throw new Error(`Contract mapping is absent from the site audit: ${id}`);
}

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

if (process.argv.includes("--write")) {
  const publication = buildPublication();
  validatePublication(publication);
  writeFileSync(join(ROOT, OUTPUT), stable(publication));
  console.log(`site-sample-exceptions: wrote ${publication.samples.length} explicit exceptions`);
} else {
  const expected = buildPublication();
  validatePublication(expected);
  const committed = readJson(OUTPUT);
  if (stable(committed) !== stable(expected)) {
    throw new Error(`${OUTPUT} is stale; run node scripts/site-sample-exceptions.mjs --write`);
  }
  validatePublication(committed);
  validateCatalogBindings(committed);
  console.log(`site-sample-exceptions: verified ${committed.samples.length} explicit exceptions and 21 legacy mappings`);
}

#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The SDK release the committed sample artifacts were built and published
// under (assets/sdk-samples/<version>/<commit>/ path prefix and projection
// pin). This is deliberately NOT read from data/sdk-docs-versions.v1.json:
// the sample builds are immutable per-commit publications, and tying their
// expected paths to the floating latestRelease invalidated them every time
// the npm release moved without the samples changing. Bump this only when
// republishing the sample artifacts from a newer SDK release.
//
// 0.1.2-beta.0 republish (honua-io/honua-site#157): the upstream sample
// contract moved from schemaVersion 1 to schemaVersion 2 between 0.1.0-beta.0
// and this release (honua.sdk.sample-catalog.v2 / honua.site.sdk-sample-
// projection.v2). All five flagships are now built from one commit (the
// js-sdk-v0.1.2-beta.0 release tag) instead of four separate per-sample
// commits, since the upstream pipeline no longer pins per-sample commits.
const SDK_VERSION = "0.1.2-beta.0";
const SDK_COMMIT = "ec58b44045b8979a4fc2ed0d5368505505505b4c";
// The pinned contract/honua-site-samples.v2.json and contract/sample-catalog
// .v2.json are copied verbatim from the js-sdk-v0.1.2-beta.0 tag; their own
// embedded `catalog.version` is "0.1.1-beta.0", one patch behind SDK_VERSION.
// This is a discovered upstream gap, not a site-side mistake: at this exact
// tag `npm run samples:generate` (sample-contract.mjs write) and even
// `samples:verify` (check, without the PR-only HONUA_DERIVED_ARTIFACTS_RELAX
// escape hatch) both fail with "gate receipt source digest mismatch" on a
// pristine checkout, so the derived projection could not be strictly
// resealed at 0.1.2-beta.0 to pick up the version bump. Tracked separately so
// the two facts (bundle commit vs. projection's self-reported version) stay
// distinguishable instead of silently overwriting one with the other.
const PROJECTION_SDK_VERSION = "0.1.1-beta.0";
const RELEASE = `assets/sdk-samples/${SDK_VERSION}/${SDK_COMMIT.slice(0, 7)}`;
const PROJECTION = `${RELEASE}/contract/honua-site-samples.v2.json`;
const CATALOG = `${RELEASE}/contract/sample-catalog.v2.json`;
const BROWSER_MANIFEST = `${RELEASE}/browser/honua-sdk.browser-artifacts.v1.json`;
const OUTPUT = "assets/samples/sdk-publication.v1.json";
const SCHEMAS = {
  projection: `${RELEASE}/contract/schemas/site-projection.schema.json`,
  catalog: `${RELEASE}/contract/schemas/sample-catalog.schema.json`,
  browserArtifacts: `${RELEASE}/contract/schemas/browser-artifacts.schema.json`,
  evidence: `${RELEASE}/contract/schemas/sample-evidence.schema.json`,
};

const samples = [
  {
    id: "maplibre-quickstart",
    gitCommit: SDK_COMMIT,
    route: "demo.html",
    aliases: [],
    artifactRoot: `${RELEASE}/maplibre-quickstart`,
    entries: ["static-fixture.js", "assets/index-20itrBbU.js", "assets/index-Bv7JT98z.css"],
    evidence: [`${RELEASE}/evidence/maplibre-quickstart/live.v1.json`],
  },
  {
    id: "realtime-incident-dashboard",
    gitCommit: SDK_COMMIT,
    route: "demo-public-safety.html",
    aliases: [],
    artifactRoot: `${RELEASE}/realtime-incident-dashboard`,
    entries: ["assets/index-BbVEb41S.js", "assets/index-CJqoWXfk.css"],
    evidence: [`${RELEASE}/evidence/realtime-incident-dashboard/live-skipped.v1.json`],
  },
  {
    id: "spatial-analytics-workbench",
    gitCommit: SDK_COMMIT,
    route: "demo-analyst-workbench.html",
    aliases: ["sample-spatial-analytics.html"],
    artifactRoot: `${RELEASE}/spatial-analytics-workbench`,
    entries: ["assets/index-CLC4YKSQ.js", "assets/index-CwdXk1zH.css"],
    evidence: [
      `${RELEASE}/evidence/spatial-analytics-workbench/fixture.v1.json`,
      `${RELEASE}/evidence/spatial-analytics-workbench/live-skipped.v1.json`,
    ],
  },
  {
    id: "overture-geoparquet",
    gitCommit: SDK_COMMIT,
    route: "demo-overture.html",
    aliases: [],
    artifactRoot: `${RELEASE}/overture-geoparquet`,
    entries: ["assets/index-HwJp4g-E.js", "assets/index-EGFWC7hw.css"],
    evidence: [
      `${RELEASE}/evidence/overture-geoparquet/fixture.v1.json`,
      `${RELEASE}/evidence/overture-geoparquet/live-failed.v1.json`,
    ],
  },
  {
    id: "ai-spatial-app-builder",
    gitCommit: SDK_COMMIT,
    route: "demo-safe-agent.html",
    aliases: [],
    artifactRoot: `${RELEASE}/ai-spatial-app-builder`,
    entries: ["assets/index-BMuv0ZKk.js", "assets/index-BqzVyl2p.css"],
    evidence: [
      `${RELEASE}/evidence/ai-spatial-app-builder/fixture.v1.json`,
      `${RELEASE}/evidence/ai-spatial-app-builder/live-skipped.v1.json`,
    ],
  },
];

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function sha(path) {
  const bytes = readFileSync(join(ROOT, path));
  const digest = createHash("sha256").update(bytes).digest();
  return {
    bytes: bytes.byteLength,
    sha256: digest.toString("hex"),
    integrity: `sha256-${digest.toString("base64")}`,
  };
}

function filesBelow(root) {
  const absoluteRoot = join(ROOT, root);
  const found = [];
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) found.push(relative(ROOT, child).split(sep).join("/"));
    }
  }
  visit(absoluteRoot);
  return found.sort();
}

function artifact(path) {
  return { path, ...sha(path) };
}

function sampleArtifact(sampleId, path) {
  let origin = "sdk-vite-build";
  if (sampleId === "maplibre-quickstart" && path.endsWith("/static-fixture.js")) origin = "site-static-fixture-adapter";
  // At 0.1.0-beta.0 these were static files committed in the SDK repo. As of
  // 0.1.2-beta.0 the SDK serves the "default" run of its first-map scenario
  // handler (samples/scenarios/handlers/first-map.mjs) dynamically instead of
  // shipping static JSON; the site captured these bytes by requesting that
  // handler's fixture endpoints directly (see git history for this file).
  if (sampleId === "maplibre-quickstart" && path.includes("/fixtures/")) origin = "sdk-fixture-harness-capture";
  if (sampleId === "overture-geoparquet" && path.endsWith("/overture-places.parquet")) {
    origin = "sdk-committed-fixture";
  }
  if (sampleId === "overture-geoparquet" && path.includes("/duckdb/extensions/")) {
    origin = "sdk-vendored-extension";
  } else if (sampleId === "overture-geoparquet" && path.includes("/duckdb/")) {
    origin = "sdk-self-hosted-runtime";
  }
  return { ...artifact(path), origin };
}

// Accepts either a raw v2 site-projection `samples[]` entry or a v2 catalog
// `samples[]` entry: both share the same field names for everything this
// site consumes (supportTier, source.{path,docsPath}/sourcePath+docsPath,
// data, evidence, expectedDegradation), so one extraction covers both,
// unlike the v1 contract where the projection and catalog samples diverged
// enough to need two separate code paths.
function publicCatalogSample(sample) {
  if (!sample) throw new Error("SDK catalog is missing a published sample");
  return {
    id: sample.id,
    title: sample.title,
    summary: sample.summary,
    supportStatus: sample.supportTier,
    source: {
      repository: "honua-io/honua-sdk-js",
      path: sample.source?.path ?? sample.sourcePath,
      docsPath: sample.source?.docsPath ?? sample.docsPath,
    },
    sdk: { package: "@honua/sdk-js", version: PROJECTION_SDK_VERSION },
    capabilities: sample.capabilities,
    protocols: sample.protocols,
    renderers: sample.renderers,
    data: {
      mode: sample.data.mode,
      authMode: sample.data.authMode,
      provenance: sample.data.provenance,
      attribution: sample.data.attribution,
      freshness: sample.data.freshness,
    },
    lanes: {
      fixture: {
        status: sample.evidence.fixture.status,
        ...(sample.evidence.fixture.evidencePath ? { evidencePath: sample.evidence.fixture.evidencePath } : {}),
      },
      live: {
        status: sample.evidence.live.status,
        ...(sample.evidence.live.evidencePath ? { evidencePath: sample.evidence.live.evidencePath } : {}),
      },
    },
    expectedDegradation: sample.expectedDegradation,
  };
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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

function resolveReference(rootSchema, reference) {
  if (!reference.startsWith("#/")) throw new Error(`Unsupported external schema reference: ${reference}`);
  return reference
    .slice(2)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((value, part) => value?.[part], rootSchema);
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function matchesType(value, expected) {
  if (expected === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (expected === "array") return Array.isArray(value);
  if (expected === "integer") return Number.isInteger(value);
  if (expected === "number") return typeof value === "number" && Number.isFinite(value);
  if (expected === "null") return value === null;
  return typeof value === expected;
}

function schemaErrors(value, schema, rootSchema, path = "$") {
  if (schema.$ref) {
    const resolved = resolveReference(rootSchema, schema.$ref);
    if (!resolved) return [`${path}: unresolved schema reference ${schema.$ref}`];
    return schemaErrors(value, resolved, rootSchema, path);
  }
  const errors = [];
  if (schema.oneOf) {
    const matches = schema.oneOf.map((candidate) => schemaErrors(value, candidate, rootSchema, path)).filter((errors) => errors.length === 0);
    if (matches.length !== 1) errors.push(`${path}: expected exactly one oneOf branch, matched ${matches.length}`);
  }

  const expectedTypes = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (expectedTypes.length > 0 && !expectedTypes.some((expected) => matchesType(value, expected))) {
    return [`${path}: expected ${expectedTypes.join(" or ")}, received ${valueType(value)}`];
  }
  if (schema.const !== undefined && !equal(value, schema.const)) errors.push(`${path}: value does not match const`);
  if (schema.enum && !schema.enum.some((candidate) => equal(value, candidate))) errors.push(`${path}: value is not in enum`);

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: shorter than minLength`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match ${schema.pattern}`);
    if (
      schema.format === "date-time" &&
      (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
        !Number.isFinite(Date.parse(value)))
    ) {
      errors.push(`${path}: is not an RFC 3339 date-time`);
    } else if (schema.format === "uri") {
      // Added for the v2 catalog/projection schemas (honua-site#157), which
      // added a `format: "uri"` field (externalReplacements[].url) that the
      // v1 contract never used.
      try {
        new URL(value);
      } catch {
        errors.push(`${path}: is not a URI`);
      }
    } else if (schema.format && schema.format !== "date-time") {
      errors.push(`${path}: unsupported schema format ${schema.format}`);
    }
  }
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${path}: smaller than minimum ${schema.minimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: fewer than minItems`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      errors.push(`${path}: array items are not unique`);
    }
    if (schema.items) value.forEach((item, index) => errors.push(...schemaErrors(item, schema.items, rootSchema, `${path}[${index}]`)));
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties ?? {};
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) errors.push(`${path}: missing required property ${required}`);
    }
    for (const [name, child] of Object.entries(value)) {
      if (properties[name]) errors.push(...schemaErrors(child, properties[name], rootSchema, `${path}.${name}`));
      else if (schema.additionalProperties === false) errors.push(`${path}: unexpected property ${name}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        errors.push(...schemaErrors(child, schema.additionalProperties, rootSchema, `${path}.${name}`));
      }
    }
  }
  return errors;
}

function validateSchema(value, schemaPath, label) {
  const schema = readJson(schemaPath);
  const errors = schemaErrors(value, schema, schema);
  if (errors.length > 0) throw new Error(`${label} violates ${schemaPath}:\n${errors.slice(0, 20).join("\n")}`);
}

function buildPublication() {
  const projection = readJson(PROJECTION);
  const catalog = readJson(CATALOG);
  validateSchema(projection, SCHEMAS.projection, "SDK site projection");
  validateSchema(catalog, SCHEMAS.catalog, "SDK sample catalog");
  if (projection.format !== "honua.site.sdk-sample-projection.v2" || projection.schemaVersion !== 2) {
    throw new Error("SDK site projection format is not supported");
  }
  if (projection.catalog.package !== "@honua/sdk-js" || projection.catalog.version !== PROJECTION_SDK_VERSION) {
    throw new Error("SDK site projection package/version does not match the pinned release");
  }

  const projectionById = new Map(projection.samples.map((sample) => [sample.id, sample]));
  const catalogById = new Map(catalog.samples.map((sample) => [sample.id, sample]));
  return {
    format: "honua.site.sdk-sample-publication.v1",
    schemaVersion: 1,
    producer: {
      repository: "honua-io/honua-sdk-js",
      package: "@honua/sdk-js",
      version: SDK_VERSION,
      gitCommit: SDK_COMMIT,
      browserArtifactGitCommit: SDK_COMMIT,
      sourcePullRequests: [412, 414, 415, 416, 417, 442, 631, 642, 686, 709],
    },
    contract: {
      projection: artifact(PROJECTION),
      catalog: artifact(CATALOG),
      browserArtifacts: artifact(BROWSER_MANIFEST),
      schemas: Object.values(SCHEMAS).sort().map(artifact),
    },
    samples: samples.map((sample) => {
      // Every flagship is present directly in the v2 site projection now (the
      // v1 contract needed a catalog fallback for overture-geoparquet and
      // ai-spatial-app-builder because the v1 projection excluded them); the
      // catalogById fallback is kept only as a defensive fallback should a
      // future flagship be dropped from the projection again.
      const projected = publicCatalogSample(projectionById.get(sample.id) ?? catalogById.get(sample.id));
      if (!projected) throw new Error(`SDK projection is missing ${sample.id}`);
      const route = projection.routes.find((candidate) => candidate.route === sample.route && candidate.sampleId === sample.id);
      if (!route && !["overture-geoparquet", "ai-spatial-app-builder"].includes(sample.id)) {
        throw new Error(`SDK projection does not bind ${sample.route} to ${sample.id}`);
      }
      return {
        id: sample.id,
        producer: { gitCommit: sample.gitCommit },
        route: sample.route,
        aliases: sample.aliases,
        supportStatus: projected.supportStatus,
        source: projected.source,
        sdk: projected.sdk,
        capabilities: projected.capabilities,
        protocols: projected.protocols,
        renderers: projected.renderers,
        data: projected.data,
        lanes: projected.lanes,
        expectedDegradation: projected.expectedDegradation,
        routeShell: artifact(sample.route),
        files: filesBelow(sample.artifactRoot).map((path) => sampleArtifact(sample.id, path)),
        evidence: sample.evidence.map((path) => {
          const value = readJson(path);
          validateSchema(value, SCHEMAS.evidence, `Evidence ${path}`);
          if (value.format !== "honua.sdk.sample-evidence.v1" || value.sampleId !== sample.id) {
            throw new Error(`Evidence ${path} is not for ${sample.id}`);
          }
          const projectedLane = projected.lanes?.[value.lane];
          const statusMatches =
            projectedLane?.status === value.status ||
            (value.status === "skipped" && projectedLane?.status === "credential-unavailable") ||
            // overture-geoparquet#157: the upstream catalog/projection records
            // this lane as "planned" (not yet executed against real AWS data),
            // a roadmap marker outside the sample-evidence.schema.json status
            // enum. The site attempted the live workflow anyway against real
            // Overture data and is publishing the honest outcome (a genuine
            // upstream bug: DuckDB's spatial extension is not loaded before
            // the query calls st_intersects — see evidence reason). "planned"
            // is satisfied by an honestly-labeled attempt, not fabricated
            // success.
            (projectedLane?.status === "planned" && ["skipped", "failed"].includes(value.status));
          if (!projectedLane || !statusMatches) {
            throw new Error(`Evidence ${path} does not match the projected ${value.lane} lane status`);
          }
          if (projectedLane.evidencePath) {
            const filename = path.split("/").at(-1);
            // The 0.1.0-beta.0 contract only ever produced evidencePaths
            // shaped examples/<id>/evidence/<file>.json. At 0.1.2-beta.0 the
            // maplibre-quickstart golden-journey evidence instead lives under
            // samples/evidence/<id>/<file>.json; accept either canonical
            // upstream producer path shape.
            const acceptedProducerPaths = [
              `examples/${sample.id}/evidence/${filename}`,
              `samples/evidence/${sample.id}/${filename}`,
            ];
            if (!acceptedProducerPaths.includes(projectedLane.evidencePath)) {
              throw new Error(`Evidence ${path} does not consume projected artifact ${projectedLane.evidencePath}`);
            }
          }
          return {
            path,
            lane: value.lane,
            status: value.status,
            reason: value.reason,
            observedAt: value.observedAt,
            degradation: value.degradation,
            ...sha(path),
          };
        }),
      };
    }),
  };
}

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function validateBrowserContract() {
  const manifest = readJson(BROWSER_MANIFEST);
  validateSchema(manifest, SCHEMAS.browserArtifacts, "SDK browser artifact manifest");
  if (manifest.format !== "honua.sdk.browser-artifacts.v1" || manifest.schemaVersion !== 1) {
    throw new Error("SDK browser artifact manifest format is not supported");
  }
  if (manifest.package.version !== SDK_VERSION || manifest.package.gitCommit !== SDK_COMMIT) {
    throw new Error("SDK browser artifact manifest is not bound to the pinned producer");
  }
  for (const expected of manifest.files) {
    const local = `${RELEASE}/browser/${expected.path.split("/").at(-1)}`;
    const actual = sha(local);
    if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256 || actual.integrity !== expected.integrity) {
      throw new Error(`SDK browser artifact digest mismatch: ${local}`);
    }
  }
}

function validateRoutes(publication) {
  for (const sample of publication.samples) {
    const html = readFileSync(join(ROOT, sample.route), "utf8");
    const evidenceStates = new Set(sample.evidence.map((evidence) => `${evidence.lane}:${evidence.status}`));
    for (const entry of samples.find((candidate) => candidate.id === sample.id).entries) {
      const file = sample.files.find((candidate) => candidate.path.endsWith(entry));
      if (!file) throw new Error(`${sample.id} publication is missing entry ${entry}`);
      if (!html.includes(`/${file.path}`) || !html.includes(`integrity="${file.integrity}"`)) {
        throw new Error(`${sample.route} does not integrity-bind ${file.path}`);
      }
    }
    for (const alias of sample.aliases) {
      const aliasHtml = readFileSync(join(ROOT, alias), "utf8");
      if (!aliasHtml.includes(sample.route)) throw new Error(`${alias} does not preserve the canonical ${sample.route} route`);
    }
    if (sample.id === "maplibre-quickstart" && !evidenceStates.has("live:executed")) {
      throw new Error("maplibre-quickstart requires producer-owned executed live evidence");
    }
    if (sample.id === "realtime-incident-dashboard" && !evidenceStates.has("live:skipped")) {
      throw new Error("realtime-incident-dashboard requires a truthful live skip");
    }
    if (sample.id === "overture-geoparquet") {
      const required = [
        "/overture-places.parquet",
        "/duckdb/duckdb-browser-eh.worker.js",
        "/duckdb/duckdb-eh.wasm",
        "/duckdb/extensions/v1.4.3/wasm_eh/parquet.duckdb_extension.wasm",
      ];
      for (const suffix of required) {
        if (!sample.files.some((file) => file.path.endsWith(suffix))) {
          throw new Error(`overture-geoparquet publication is missing ${suffix}`);
        }
      }
      // 0.1.2-beta.0 (#157): upstream's own catalog/projection demoted this
      // lane from live:executed (0.1.0-beta.0) to live:planned -- the sample's
      // live AOI query genuinely fails against real Overture AWS data at this
      // release (DuckDB "spatial" extension not loaded before st_intersects).
      // The site ran the live workflow against real AWS data anyway and is
      // publishing the honest live:failed result rather than claiming
      // live:executed or silently dropping live evidence.
      if (!evidenceStates.has("fixture:executed") || !evidenceStates.has("live:failed")) {
        throw new Error("overture-geoparquet requires executed fixture evidence and an honestly-labeled live attempt");
      }
      const awsOrigin = "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com";
      const connectSources = metaCspDirectives(html).get("connect-src");
      if (!equal(connectSources, ["'self'", awsOrigin])) {
        throw new Error("demo-overture.html must scope connect-src to the approved Overture origin");
      }
    }
    if (sample.id === "ai-spatial-app-builder") {
      if (!evidenceStates.has("fixture:executed") || !evidenceStates.has("live:skipped")) {
        throw new Error("ai-spatial-app-builder requires executed fixture evidence and an honest live skip");
      }
      const connectSources = metaCspDirectives(html).get("connect-src");
      if (!equal(connectSources, ["'self'"])) {
        throw new Error("demo-safe-agent.html must not grant browser access to model or live-data hosts");
      }
    }
  }
}

function validateScope(publication) {
  const actual = publication.samples.map((sample) => sample.id).sort();
  const expected = [
    "maplibre-quickstart",
    "overture-geoparquet",
    "realtime-incident-dashboard",
    "spatial-analytics-workbench",
    "ai-spatial-app-builder",
  ].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Publication contains an unapproved flagship");
}

function check() {
  validateBrowserContract();
  const expected = buildPublication();
  const committed = readJson(OUTPUT);
  if (stable(committed) !== stable(expected)) {
    throw new Error(`${OUTPUT} is stale; run node scripts/sdk-sample-publication.mjs --write`);
  }
  validateRoutes(committed);
  validateScope(committed);
  console.log(`sdk-sample-publication: verified ${committed.samples.length} commit-pinned SDK flagships`);
}

if (process.argv.includes("--write")) {
  validateBrowserContract();
  const publication = buildPublication();
  validateRoutes(publication);
  validateScope(publication);
  writeFileSync(join(ROOT, OUTPUT), stable(publication));
  console.log(`sdk-sample-publication: wrote ${OUTPUT}`);
} else {
  check();
}

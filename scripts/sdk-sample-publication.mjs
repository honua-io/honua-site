#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SDK_VERSION = "0.1.0-beta.0";
const SDK_COMMIT = "892873e8b6cd336fc67cec2a033c41f9e26b6473";
const RELEASE = `assets/sdk-samples/${SDK_VERSION}/${SDK_COMMIT.slice(0, 7)}`;
const PROJECTION = `${RELEASE}/contract/honua-site-samples.v1.json`;
const BROWSER_MANIFEST = `${RELEASE}/browser/honua-sdk.browser-artifacts.v1.json`;
const OUTPUT = "assets/samples/sdk-publication.v1.json";

const samples = [
  {
    id: "maplibre-quickstart",
    route: "demo.html",
    aliases: [],
    artifactRoot: `${RELEASE}/maplibre-quickstart`,
    entries: ["static-fixture.js", "assets/index-C0qAhrVJ.js", "assets/index-ZjgRmG8k.css"],
    evidence: [],
  },
  {
    id: "realtime-incident-dashboard",
    route: "demo-public-safety.html",
    aliases: [],
    artifactRoot: `${RELEASE}/realtime-incident-dashboard`,
    entries: ["assets/index-Dy2gRDsr.js", "assets/index-CJqoWXfk.css"],
    evidence: [],
  },
  {
    id: "spatial-analytics-workbench",
    route: "demo-analyst-workbench.html",
    aliases: ["sample-spatial-analytics.html"],
    artifactRoot: `${RELEASE}/spatial-analytics-workbench`,
    entries: ["assets/index-D5K3DaMH.js", "assets/index-CwdXk1zH.css"],
    evidence: [
      `${RELEASE}/evidence/spatial-analytics-workbench/fixture.v1.json`,
      `${RELEASE}/evidence/spatial-analytics-workbench/live-skipped.v1.json`,
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
  if (sampleId === "maplibre-quickstart" && path.includes("/fixtures/")) origin = "sdk-committed-fixture";
  return { ...artifact(path), origin };
}

function buildPublication() {
  const projection = readJson(PROJECTION);
  if (projection.format !== "honua.site.sdk-sample-projection.v1" || projection.schemaVersion !== 1) {
    throw new Error("SDK site projection format is not supported");
  }
  if (projection.catalog.package !== "@honua/sdk-js" || projection.catalog.version !== SDK_VERSION) {
    throw new Error("SDK site projection package/version does not match the pinned release");
  }

  const projectionById = new Map(projection.samples.map((sample) => [sample.id, sample]));
  return {
    format: "honua.site.sdk-sample-publication.v1",
    schemaVersion: 1,
    producer: {
      repository: "honua-io/honua-sdk-js",
      package: "@honua/sdk-js",
      version: SDK_VERSION,
      gitCommit: SDK_COMMIT,
      sourcePullRequests: [412, 414, 415],
    },
    contract: {
      projection: artifact(PROJECTION),
      browserArtifacts: artifact(BROWSER_MANIFEST),
    },
    samples: samples.map((sample) => {
      const projected = projectionById.get(sample.id);
      if (!projected) throw new Error(`SDK projection is missing ${sample.id}`);
      const route = projection.routes.find((candidate) => candidate.route === sample.route && candidate.sampleId === sample.id);
      if (!route) throw new Error(`SDK projection does not bind ${sample.route} to ${sample.id}`);
      return {
        id: sample.id,
        route: sample.route,
        aliases: sample.aliases,
        supportStatus: projected.supportStatus,
        source: projected.source,
        sdk: projected.sdk,
        data: projected.data,
        lanes: projected.lanes,
        expectedDegradation: projected.expectedDegradation,
        routeShell: artifact(sample.route),
        files: filesBelow(sample.artifactRoot).map((path) => sampleArtifact(sample.id, path)),
        evidence: sample.evidence.map((path) => {
          const value = readJson(path);
          if (value.format !== "honua.sdk.sample-evidence.v1" || value.sampleId !== sample.id) {
            throw new Error(`Evidence ${path} is not for ${sample.id}`);
          }
          return { path, lane: value.lane, status: value.status, observedAt: value.observedAt, ...sha(path) };
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
  }
}

function validateScope(publication) {
  const actual = publication.samples.map((sample) => sample.id).sort();
  const expected = ["maplibre-quickstart", "realtime-incident-dashboard", "spatial-analytics-workbench"].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Publication contains an unapproved flagship");
  for (const forbidden of ["ai-spatial-app-builder", "overture-geoparquet"]) {
    if (publication.samples.some((sample) => sample.id === forbidden) || existsSync(join(ROOT, RELEASE, forbidden))) {
      throw new Error(`${forbidden} must remain unpublished`);
    }
  }
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

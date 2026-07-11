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
const SCHEMAS = {
  projection: `${RELEASE}/contract/schemas/site-projection.schema.json`,
  browserArtifacts: `${RELEASE}/contract/schemas/browser-artifacts.schema.json`,
  evidence: `${RELEASE}/contract/schemas/sample-evidence.schema.json`,
};

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

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  if (schema.oneOf) {
    const matches = schema.oneOf.map((candidate) => schemaErrors(value, candidate, rootSchema, path)).filter((errors) => errors.length === 0);
    return matches.length === 1 ? [] : [`${path}: expected exactly one oneOf branch, matched ${matches.length}`];
  }

  const errors = [];
  const expectedTypes = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (expectedTypes.length > 0 && !expectedTypes.some((expected) => matchesType(value, expected))) {
    return [`${path}: expected ${expectedTypes.join(" or ")}, received ${valueType(value)}`];
  }
  if (schema.const !== undefined && !equal(value, schema.const)) errors.push(`${path}: value does not match const`);
  if (schema.enum && !schema.enum.some((candidate) => equal(value, candidate))) errors.push(`${path}: value is not in enum`);

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: shorter than minLength`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match ${schema.pattern}`);
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
  validateSchema(projection, SCHEMAS.projection, "SDK site projection");
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
      schemas: Object.values(SCHEMAS).sort().map(artifact),
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
          validateSchema(value, SCHEMAS.evidence, `Evidence ${path}`);
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

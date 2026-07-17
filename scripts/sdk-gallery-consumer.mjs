#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE_MANIFEST_PATH = "data/sdk-gallery/source.v1.json";
export const HANDOFF_PATH = "samples/dist/honua-site-consumer-handoff.v1.json";
export const CONSUMER_FIXTURE_PATH = "samples/contract/v2/consumer-fixtures/honua-site-consumer.v3.json";

const MAX_MANIFEST_BYTES = 128 * 1024;
const REQUIRED_INPUTS = {
  siteProjection: "samples/dist/honua-site-samples.v2.json",
  capabilityMatrix: "samples/dist/capability-sample-matrix.v1.json",
  visualEvidence: "samples/dist/golden-journey-visual-evidence.v1.json",
};
const FILTER_FIELDS = {
  task: "tasks",
  capability: "capabilities",
  protocol: "protocols",
  renderer: "renderers",
  dataMode: "data.mode",
  authMode: "data.authMode",
  supportTier: "supportTier",
  lifecycleState: "lifecycle.state",
  qualificationState: "qualification.state",
};
function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function canonicalRelativePath(value, label) {
  invariant(typeof value === "string" && value.length > 0, `${label} must be a non-empty path`);
  invariant(!isAbsolute(value) && !value.includes("\\"), `${label} must be repository-relative`);
  invariant(posix.normalize(value) === value && value !== ".." && !value.startsWith("../"), `${label} is not canonical`);
  return value;
}

function resolveFileBelow(root, relativePath, label) {
  canonicalRelativePath(relativePath, label);
  const canonicalRoot = realpathSync(root);
  const candidate = join(canonicalRoot, ...relativePath.split("/"));
  invariant(existsSync(candidate), `${label} is missing: ${relativePath}`);
  let current = canonicalRoot;
  for (const segment of relativePath.split("/")) {
    current = join(current, segment);
    invariant(!lstatSync(current).isSymbolicLink(), `${label} must not traverse a symbolic link`);
  }
  invariant(realpathSync(candidate) === candidate, `${label} escapes its source root`);
  invariant(statSync(candidate).isFile(), `${label} must be a file`);
  return candidate;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readBoundedJson(root, relativePath, maxBytes, label) {
  const absolute = resolveFileBelow(root, relativePath, label);
  const metadata = statSync(absolute);
  invariant(metadata.size > 0 && metadata.size <= maxBytes, `${label} exceeds its byte budget`);
  const bytes = readFileSync(absolute);
  invariant(bytes.byteLength === metadata.size, `${label} changed while being read`);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  return { absolute, bytes, value };
}

function jsonBudget(value, limits, label) {
  let nodes = 0;
  let aggregateCharacters = 0;
  const visit = (entry, depth) => {
    nodes += 1;
    invariant(nodes <= limits.maxJsonNodes, `${label} exceeds its JSON node budget`);
    invariant(depth <= limits.maxJsonDepth, `${label} exceeds its JSON depth budget`);
    if (typeof entry === "string") {
      invariant(entry.length <= limits.maxStringCharacters, `${label} contains an oversized string`);
      aggregateCharacters += entry.length;
      invariant(
        aggregateCharacters <= limits.maxAggregateStringCharacters,
        `${label} exceeds its aggregate string budget`,
      );
    } else if (Array.isArray(entry)) {
      for (const item of entry) visit(item, depth + 1);
    } else if (entry && typeof entry === "object") {
      for (const [key, item] of Object.entries(entry)) {
        visit(key, depth + 1);
        visit(item, depth + 1);
      }
    }
  };
  visit(value, 0);
}

function strictDate(value, label) {
  invariant(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
      Number.isFinite(Date.parse(value)),
    `${label} must be an RFC 3339 date-time`,
  );
  return Date.parse(value);
}

function sortedUnique(values, label) {
  invariant(Array.isArray(values), `${label} must be an array`);
  for (let index = 0; index < values.length; index += 1) {
    invariant(typeof values[index] === "string" && values[index].length > 0, `${label} contains an invalid value`);
    if (index > 0) invariant(values[index - 1] < values[index], `${label} must be sorted and unique`);
  }
}

function getField(card, path) {
  return path.split(".").reduce((value, part) => value?.[part], card);
}

export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function filterSdkGalleryCards(cards, filters = {}) {
  const terms = normalizeSearchText(filters.text).split(" ").filter(Boolean);
  return cards.filter((card) => {
    if (terms.some((term) => !normalizeSearchText(card.searchText).includes(term))) return false;
    for (const [filterName, field] of Object.entries(FILTER_FIELDS)) {
      const expected = filters[filterName];
      if (expected === undefined || expected === null || expected === "") continue;
      const actual = getField(card, field);
      if (Array.isArray(actual) ? !actual.includes(expected) : actual !== expected) return false;
    }
    return true;
  });
}

function validateSourceManifest(siteRoot, sourceRecord) {
  const source = sourceRecord.value;
  invariant(source.format === "honua.site.sdk-gallery-source.v1" && source.schemaVersion === 1, "SDK gallery source manifest format drift");
  invariant(source.producer?.repository === "honua-io/honua-sdk-js", "SDK gallery source repository is not canonical");
  invariant(/^[0-9a-f]{40}$/.test(source.producer?.revision), "SDK gallery source revision must be a full Git commit");
  strictDate(source.producer.committedAt, "SDK gallery producer commit time");
  invariant(source.root === `data/sdk-gallery/${source.producer.revision.slice(0, 8)}`, "SDK gallery pinned root does not match its revision");
  invariant(Array.isArray(source.artifacts) && source.artifacts.length >= 10, "SDK gallery source manifest is incomplete");

  const artifactPaths = new Set();
  const artifacts = new Map();
  for (const artifact of source.artifacts) {
    canonicalRelativePath(artifact.path, "SDK gallery producer artifact path");
    invariant(!artifactPaths.has(artifact.path), `Duplicate SDK gallery producer artifact: ${artifact.path}`);
    artifactPaths.add(artifact.path);
    invariant(Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0, `${artifact.path} has an invalid byte count`);
    invariant(/^[0-9a-f]{64}$/.test(artifact.sha256), `${artifact.path} has an invalid SHA-256 digest`);
    const localPath = `${source.root}/${artifact.path}`;
    const record = readBoundedJson(siteRoot, localPath, 16 * 1024 * 1024, artifact.path);
    invariant(record.bytes.byteLength === artifact.bytes, `${artifact.path} byte binding drift`);
    invariant(sha256(record.bytes) === artifact.sha256, `${artifact.path} digest binding drift`);
    artifacts.set(artifact.path, record);
  }
  for (const required of [
    HANDOFF_PATH,
    CONSUMER_FIXTURE_PATH,
    ...Object.values(REQUIRED_INPUTS),
    "samples/contract/v2/schemas/site-consumer-handoff.schema.json",
    "samples/contract/v2/schemas/site-consumer-fixture.schema.json",
    "samples/contract/v2/schemas/site-projection.schema.json",
    "samples/contract/v2/schemas/capability-sample-matrix.schema.json",
    "samples/contract/v2/schemas/golden-journey-visual-evidence.schema.json",
  ]) {
    invariant(artifacts.has(required), `SDK gallery source manifest is missing ${required}`);
  }
  return { source, artifacts };
}

function validateContentBindings(handoff, fixture, artifacts) {
  invariant(fixture.format === "honua.site.sdk-sample-consumer-fixture.v3" && fixture.schemaVersion === 3, "SDK gallery consumer fixture must be v3");
  const handoffRecord = artifacts.get(HANDOFF_PATH);
  invariant(fixture.input?.path === HANDOFF_PATH, "SDK gallery fixture does not point at the pinned handoff");
  invariant(fixture.input.bytes === handoffRecord.bytes.byteLength, "SDK gallery fixture handoff byte binding drift");
  invariant(fixture.input.sha256 === sha256(handoffRecord.bytes), "SDK gallery fixture handoff digest binding drift");
  invariant(
    fixture.accepts?.handoffFormat === handoff.format && fixture.accepts.handoffSchemaVersion === handoff.schemaVersion,
    "SDK gallery fixture does not accept the pinned handoff",
  );

  for (const [name, producerPath] of Object.entries(REQUIRED_INPUTS)) {
    const reference = handoff.inputs?.[name];
    const record = artifacts.get(producerPath);
    invariant(reference?.path === producerPath, `SDK gallery ${name} path binding drift`);
    invariant(reference.bytes === record.bytes.byteLength, `SDK gallery ${name} byte binding drift`);
    invariant(reference.sha256 === sha256(record.bytes), `SDK gallery ${name} digest binding drift`);
    invariant(
      record.value?.format === reference.format && record.value?.schemaVersion === reference.schemaVersion,
      `SDK gallery ${name} format binding drift`,
    );
    invariant(artifacts.has(reference.schemaPath), `SDK gallery ${name} schema is not pinned`);
  }
  invariant(
    fixture.accepts.siteProjectionFormat === handoff.inputs.siteProjection.format &&
      fixture.accepts.capabilityMatrixFormat === handoff.inputs.capabilityMatrix.format &&
      fixture.accepts.visualEvidenceFormat === handoff.inputs.visualEvidence.format,
    "SDK gallery fixture authority input formats drifted",
  );
}

function validateFreshness(handoff, visualEvidence, nowMs) {
  invariant(Number.isFinite(nowMs), "SDK gallery validation clock is invalid");
  const expirations = [];
  for (const card of handoff.cards) {
    const live = card.evidence?.live;
    if (!live?.evidencePath) continue;
    invariant(["executed", "skipped"].includes(live.status), `${card.id}: evidence-backed live state is invalid`);
    const expiresAt = strictDate(live.expiresAt, `${card.id} live evidence expiry`);
    invariant(expiresAt > nowMs, `${card.id}: producer live evidence is stale`);
    expirations.push({ sampleId: card.id, expiresAt: live.expiresAt });
  }

  const maximumFutureSkewMs = visualEvidence.policy.freshness.maxFutureSkewSeconds * 1000;
  const maximumWindowMs = visualEvidence.policy.freshness.maxWindowSeconds * 1000;
  for (const entry of visualEvidence.qualifiedGoldenJourneys) {
    const windows = [
      entry,
      ...entry.semanticEvidence,
      entry.liveEvidence,
    ];
    for (const window of windows) {
      const observedAt = strictDate(window.observedAt, `${entry.sampleId} visual evidence observation`);
      const expiresAt = strictDate(window.expiresAt, `${entry.sampleId} visual evidence expiry`);
      invariant(
        observedAt <= nowMs + maximumFutureSkewMs &&
          expiresAt > nowMs &&
          expiresAt > observedAt &&
          expiresAt - observedAt <= maximumWindowMs,
        `${entry.sampleId}: producer visual evidence is stale or has an invalid window`,
      );
    }
    if (entry.journeyId === "incident-operations") {
      invariant(
        entry.liveEvidence.realtime?.observationWindowMs > 0,
        "Incident Operations qualified visual evidence must remain realtime",
      );
    }
  }
  return expirations.sort((left, right) => Date.parse(left.expiresAt) - Date.parse(right.expiresAt));
}

function validateHandoff(handoff, fixture, visualEvidence, nowMs) {
  invariant(
    handoff.format === "honua.site.sdk-sample-consumer-handoff.v1" && handoff.schemaVersion === 1,
    "SDK gallery handoff format drift",
  );
  invariant(handoff.ownership?.producer === "honua-io/honua-sdk-js#550", "SDK gallery producer ownership drift");
  invariant(handoff.ownership.consumer === "honua-io/honua-site", "SDK gallery consumer ownership drift");
  invariant(handoff.ownership.sourceImplementationDuplicated === false, "SDK source implementation must not be duplicated into the site");
  invariant(handoff.policy?.externalListings === "canonical-routes-only", "SDK gallery external route policy drift");
  jsonBudget(handoff, handoff.policy.limits, "SDK gallery handoff");

  const countPairs = [
    ["cards", handoff.cards],
    ["qualifiedJourneys", handoff.qualifiedJourneys],
    ["canonicalRoutes", handoff.canonicalRoutes],
    ["legacyRoutes", handoff.legacyRoutes],
    ["lifecycleNotices", handoff.lifecycleNotices],
    ["gaps", handoff.gaps],
  ];
  const fixtureCountNames = {
    cards: "cardCount",
    qualifiedJourneys: "qualifiedJourneyCount",
    canonicalRoutes: "canonicalRouteCount",
    legacyRoutes: "legacyRouteCount",
    gaps: "gapCount",
  };
  for (const [name, collection] of countPairs) {
    invariant(Array.isArray(collection) && handoff.counts[name] === collection.length, `SDK gallery ${name} count drift`);
    const fixtureName = fixtureCountNames[name];
    if (fixtureName) invariant(fixture.assertions[fixtureName] === collection.length, `SDK gallery fixture ${name} assertion drift`);
  }
  invariant(handoff.cards.length > 0, "SDK gallery handoff cannot be empty");
  invariant(fixture.assertions.sourceImplementationDuplicated === false, "Consumer fixture forbids copied sample implementation");
  invariant(fixture.assertions.allLegacyRoutesResolved === true, "Consumer fixture requires resolved legacy routes");
  invariant(fixture.assertions.externalListingsCanonicalOnly === true, "Consumer fixture requires canonical external listings");

  const cards = new Map();
  for (const card of handoff.cards) {
    invariant(typeof card.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(card.id), "SDK gallery card ID is invalid");
    invariant(!cards.has(card.id), `Duplicate SDK gallery card: ${card.id}`);
    cards.set(card.id, card);
    invariant(card.canonicalPath === `samples/${card.id}.html`, `${card.id}: canonical route drift`);
    invariant(card.source?.repository === "honua-io/honua-sdk-js", `${card.id}: source owner drift`);
    canonicalRelativePath(card.source.path, `${card.id} source path`);
    canonicalRelativePath(card.source.docsPath, `${card.id} docs path`);
    invariant(typeof card.title === "string" && typeof card.summary === "string", `${card.id}: presentation text is incomplete`);
    invariant(typeof card.searchText === "string" && card.searchText.length > 0, `${card.id}: search text is missing`);
    invariant(card.lifecycle?.state && card.qualification?.state && card.supportTier, `${card.id}: status labels are incomplete`);
  }

  for (const [name, values] of Object.entries(handoff.filters)) sortedUnique(values, `SDK gallery ${name} filters`);
  invariant(handoff.filters.tasks.length > 0 && handoff.filters.capabilities.length > 0 && handoff.filters.protocols.length > 0, "SDK gallery primary facets are empty");
  for (const card of cards.values()) {
    const joins = [
      [card.tasks, handoff.filters.tasks, "task"],
      [card.capabilities, handoff.filters.capabilities, "capability"],
      [card.protocols, handoff.filters.protocols, "protocol"],
      [card.renderers, handoff.filters.renderers, "renderer"],
      [[card.data.mode], handoff.filters.dataModes, "data mode"],
      [[card.data.authMode], handoff.filters.authModes, "auth mode"],
      [[card.supportTier], handoff.filters.supportTiers, "support tier"],
      [[card.lifecycle.state], handoff.filters.lifecycleStates, "lifecycle state"],
      [[card.qualification.state], handoff.filters.qualificationStates, "qualification state"],
    ];
    for (const [actual, allowed, label] of joins) {
      invariant(actual.every((value) => allowed.includes(value)), `${card.id}: unknown ${label} facet`);
    }
  }

  invariant(new Set(handoff.canonicalRoutes.map((route) => route.path)).size === handoff.canonicalRoutes.length, "Duplicate canonical SDK gallery route");
  for (const route of handoff.canonicalRoutes) {
    const card = cards.get(route.sampleId);
    invariant(card?.canonicalPath === route.path && route.externalListingEligible === true, `${route.path}: canonical route is not bound to its card`);
    invariant(
      route.presentation === (["retire", "replace"].includes(card.lifecycle.state) ? "lifecycle-status" : "sample-detail"),
      `${route.path}: canonical presentation drift`,
    );
  }
  invariant(new Set(handoff.legacyRoutes.map((route) => route.path)).size === handoff.legacyRoutes.length, "Duplicate legacy SDK gallery route");
  for (const route of handoff.legacyRoutes) {
    canonicalRelativePath(route.path, "SDK gallery legacy route");
    invariant(!route.path.includes("/"), `${route.path}: legacy route must remain at the static site root`);
    if (route.resolution === "canonical-sample") {
      invariant(
        route.httpStatus === 308 && route.presentation === "permanent-redirect" && cards.get(route.sampleId)?.canonicalPath === route.canonicalPath,
        `${route.path}: canonical legacy migration drift`,
      );
    } else {
      invariant(route.httpStatus === null && route.presentation === "status-page" && route.canonicalPath === null, `${route.path}: legacy status route drift`);
    }
  }

  const qualifiedCards = handoff.cards.filter((card) => card.qualification.state === "qualified");
  invariant(
    JSON.stringify(qualifiedCards.map((card) => card.id)) === JSON.stringify(handoff.qualifiedJourneys.map((entry) => entry.sampleId)),
    "SDK gallery qualified card set drift",
  );
  invariant(
    handoff.qualifiedJourneys.length === visualEvidence.qualifiedGoldenJourneys.length,
    "SDK gallery qualification and visual evidence sets disagree",
  );

  const incident = cards.get("realtime-incident-dashboard");
  invariant(incident, "SDK gallery is missing Realtime Incident Operations");
  invariant(
    incident.journey?.id === "incident-operations" &&
      incident.tasks.includes("realtime") &&
      incident.data.mode === "hybrid" &&
      [incident.evidence.live.mode, incident.evidence.live.targetMode].includes("demo-live") &&
      incident.expectedDegradation.toLowerCase().includes("replay"),
    "Realtime Incident Operations must remain live-first/realtime with explicit replay degradation",
  );
  invariant(fixture.assertions.incidentOperationsRealtimeRequired === true, "Consumer fixture must preserve realtime Incident Operations");

  for (const filterCase of fixture.filterCases) {
    const actual = filterSdkGalleryCards(handoff.cards, filterCase.filters).map((card) => card.id);
    invariant(JSON.stringify(actual) === JSON.stringify(filterCase.expectedSampleIds), `SDK gallery filter fixture failed: ${filterCase.id}`);
  }
  invariant(
    JSON.stringify(fixture.interaction) === JSON.stringify(handoff.policy.interaction),
    "SDK gallery interaction contract drift",
  );
  return validateFreshness(handoff, visualEvidence, nowMs);
}

export function loadAndValidateSdkGallery({ siteRoot = SITE_ROOT, now = new Date() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const sourceRecord = readBoundedJson(siteRoot, SOURCE_MANIFEST_PATH, MAX_MANIFEST_BYTES, "SDK gallery source manifest");
  const { source, artifacts } = validateSourceManifest(siteRoot, sourceRecord);
  const handoff = artifacts.get(HANDOFF_PATH).value;
  const fixture = artifacts.get(CONSUMER_FIXTURE_PATH).value;
  const visualEvidence = artifacts.get(REQUIRED_INPUTS.visualEvidence).value;
  validateContentBindings(handoff, fixture, artifacts);
  const expirations = validateHandoff(handoff, fixture, visualEvidence, nowMs);
  return { source, artifacts, handoff, fixture, visualEvidence, expirations };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function humanize(value) {
  return String(value ?? "")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusBadge(label, value) {
  return `<span class="sdk-status" data-status="${escapeHtml(value)}"><span>${escapeHtml(label)}</span> ${escapeHtml(humanize(value))}</span>`;
}

function evidenceSentence(evidence) {
  const parts = [humanize(evidence.mode), humanize(evidence.status)];
  if (evidence.targetMode) parts.push(`target ${humanize(evidence.targetMode)}`);
  if (evidence.expiresAt) parts.push(`evidence valid until ${evidence.expiresAt}`);
  return parts.join(" · ");
}

function sourceUrl(source, revision, docs = false) {
  const verb = docs ? "blob" : "tree";
  const path = docs ? source.docsPath : source.path;
  return `https://github.com/${source.repository}/${verb}/${revision}/${path}`;
}

function pageShell({ title, description, canonicalPath, assetPrefix, body, script = "", robots = "index,follow" }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} | Honua</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="${escapeHtml(robots)}" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: https://raw.githubusercontent.com; form-action 'self'" />
    <link rel="canonical" href="https://honua.io/${escapeHtml(canonicalPath)}" />
    <link rel="icon" type="image/png" sizes="32x32" href="${assetPrefix}assets/favicon-32.png" />
    <link rel="preload" href="${assetPrefix}assets/fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="${assetPrefix}assets/fonts/geist-mono-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="${assetPrefix}assets/sdk-gallery.css" />
    ${script}
  </head>
  <body class="sdk-gallery-body">
    <a class="sdk-skip-link" href="#main-content">Skip to content</a>
    ${body}
  </body>
</html>
`;
}

function galleryHeader(assetPrefix = "../") {
  return `<header class="sdk-gallery-header">
      <a class="sdk-brand" href="${assetPrefix}index.html"><img src="${assetPrefix}assets/honua-logo.svg" alt="" width="24" height="24" /> Honua</a>
      <nav aria-label="SDK sample navigation">
        <a href="${assetPrefix}samples/index.html" aria-current="page">Samples</a>
        <a href="${assetPrefix}docs.html">Docs</a>
        <a href="https://github.com/honua-io/honua-sdk-js">SDK source</a>
      </nav>
    </header>`;
}

function selectControl(id, name, label, values) {
  return `<div class="sdk-filter-field">
            <label for="${id}">${escapeHtml(label)}</label>
            <select id="${id}" name="${escapeHtml(name)}">
              <option value="">All ${escapeHtml(label.toLowerCase())}</option>
              ${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(humanize(value))}</option>`).join("\n              ")}
            </select>
          </div>`;
}

function cardHtml(card) {
  const journey = card.journey
    ? `<p class="sdk-card-journey"><strong>${escapeHtml(card.journey.title)}</strong> · ${escapeHtml(humanize(card.journey.status))}</p>`
    : `<p class="sdk-card-journey">Focused sample · not a golden journey</p>`;
  const attributes = {
    search: card.searchText,
    tasks: card.tasks.join("|"),
    capabilities: card.capabilities.join("|"),
    protocols: card.protocols.join("|"),
    renderers: card.renderers.join("|"),
    "data-mode": card.data.mode,
    "auth-mode": card.data.authMode,
    "support-tier": card.supportTier,
    "lifecycle-state": card.lifecycle.state,
    "qualification-state": card.qualification.state,
  };
  const data = Object.entries(attributes)
    .map(([name, value]) => `data-${name}="${escapeHtml(value)}"`)
    .join(" ");
  return `<article class="sdk-sample-card" ${data}>
          <div class="sdk-card-statuses">
            ${statusBadge("Qualification", card.qualification.state)}
            ${statusBadge("Support", card.supportTier)}
            ${statusBadge("Lifecycle", card.lifecycle.state)}
          </div>
          <h2><a href="${escapeHtml(card.id)}.html">${escapeHtml(card.title)}</a></h2>
          ${journey}
          <p>${escapeHtml(card.summary)}</p>
          <dl class="sdk-card-evidence">
            <div><dt>Fixture</dt><dd>${escapeHtml(evidenceSentence(card.evidence.fixture))}</dd></div>
            <div><dt>Live</dt><dd>${escapeHtml(evidenceSentence(card.evidence.live))}</dd></div>
          </dl>
          <p class="sdk-card-meta">${escapeHtml(humanize(card.data.mode))} data · ${escapeHtml(humanize(card.data.authMode))} auth · ${escapeHtml(card.renderers.map(humanize).join(", "))}</p>
          <a class="sdk-card-link" href="${escapeHtml(card.id)}.html" aria-label="Review evidence and status for ${escapeHtml(card.title)}">Review evidence and status</a>
        </article>`;
}

function galleryIndex(bundle) {
  const { handoff, source } = bundle;
  const interaction = handoff.policy.interaction;
  const body = `${galleryHeader()}
    <main id="main-content" class="sdk-gallery-main">
      <section class="sdk-gallery-hero" aria-labelledby="gallery-title">
        <p class="sdk-eyebrow">@honua/sdk-js ${escapeHtml(handoff.sdk.version)}</p>
        <h1 id="gallery-title">SDK samples, with the evidence boundary visible</h1>
        <p>Explore ${handoff.counts.cards} producer-owned samples by task, capability, protocol, renderer, data mode, authentication, support, lifecycle, and qualification. No sample is called qualified until the SDK supplies the complete matrix and desktop/mobile visual evidence.</p>
        <div class="sdk-admission-summary" role="note">
          <strong>${handoff.counts.qualifiedJourneys} qualified journeys</strong>
          <span>${handoff.counts.qualifiedMatrixCells.goldenJourneys} qualified matrix cells · ${handoff.counts.gaps} recorded gaps · producer revision <code>${source.producer.revision.slice(0, 12)}</code></span>
        </div>
      </section>

      <form id="sdk-gallery-filters" class="sdk-filter-panel" role="search" aria-label="Filter SDK samples">
        <div class="sdk-filter-primary">
          <div class="sdk-filter-field sdk-filter-search">
            <label for="task-search">Search tasks and samples</label>
            <input id="task-search" name="text" type="search" autocomplete="off" placeholder="Try realtime, migration, GeoParquet…" />
          </div>
          ${selectControl("capability-filter", "capability", "Capability", handoff.filters.capabilities)}
          ${selectControl("protocol-filter", "protocol", "Protocol", handoff.filters.protocols)}
        </div>
        <div class="sdk-filter-additional" aria-label="Additional sample filters">
          ${selectControl("task-filter", "task", "Task", handoff.filters.tasks)}
          ${selectControl("renderer-filter", "renderer", "Renderer", handoff.filters.renderers)}
          ${selectControl("data-mode-filter", "dataMode", "Data mode", handoff.filters.dataModes)}
          ${selectControl("auth-mode-filter", "authMode", "Auth mode", handoff.filters.authModes)}
          ${selectControl("support-tier-filter", "supportTier", "Support tier", handoff.filters.supportTiers)}
          ${selectControl("lifecycle-state-filter", "lifecycleState", "Lifecycle state", handoff.filters.lifecycleStates)}
          ${selectControl("qualification-state-filter", "qualificationState", "Qualification state", handoff.filters.qualificationStates)}
        </div>
        <button id="clear-filters" class="sdk-clear-filters" type="button">Clear filters</button>
      </form>

      <div id="sample-results-status" class="sdk-results-status" role="status" aria-live="${interaction.accessibility.resultsAriaLive}" aria-atomic="${String(interaction.accessibility.resultsAriaAtomic)}">${handoff.counts.cards} of ${handoff.counts.cards} samples shown</div>
      <p id="sdk-zero-results" class="sdk-zero-results" hidden>No samples match every selected filter. Clear filters or broaden the task search.</p>
      <section id="sample-cards" class="sdk-sample-grid" aria-label="SDK sample results">
        ${handoff.cards.map(cardHtml).join("\n        ")}
      </section>
      <output id="sdk-gallery-smoke" class="sdk-browser-smoke" data-state="idle" hidden>Browser smoke pending</output>
      <p class="sdk-route-tools"><a href="routes.html">Review canonical and legacy route mapping</a> · <a href="site-handoff.v1.json">Read the exact SDK handoff JSON</a></p>
    </main>
    <footer class="sdk-gallery-footer">Presentation is generated by honua.io from the content-bound SDK handoff. Executable source remains owned by <a href="https://github.com/honua-io/honua-sdk-js/tree/${source.producer.revision}/examples">honua-sdk-js</a>.</footer>`;
  return pageShell({
    title: "JavaScript SDK samples",
    description: "Filter Honua JavaScript SDK samples with support, lifecycle, qualification, and evidence state kept visible.",
    canonicalPath: "samples/index.html",
    assetPrefix: "../",
    body,
    script: '<script defer src="../assets/sdk-gallery.js"></script>',
  });
}

function replacementHtml(notice) {
  const replacement = notice?.replacement;
  if (!replacement) return "";
  if (replacement.kind === "external") {
    return `<p><strong>Replacement:</strong> <a href="${escapeHtml(replacement.url)}">${escapeHtml(replacement.title)}</a>.</p>`;
  }
  return `<p><strong>Replacement journey:</strong> <a href="../${escapeHtml(replacement.canonicalPath)}">${escapeHtml(replacement.title)}</a> (${escapeHtml(humanize(replacement.status))}).</p>`;
}

function detailPage(card, bundle) {
  const { handoff, source } = bundle;
  const notice = handoff.lifecycleNotices.find((candidate) => candidate.sampleId === card.id);
  const relatedGaps = handoff.gaps.filter((gap) => gap.candidateSampleIds?.includes(card.id));
  const realtime = card.id === "realtime-incident-dashboard"
    ? `<section class="sdk-detail-section sdk-realtime-contract">
        <h2>Realtime contract</h2>
        <p>This journey remains live-first. Its current producer evidence is <strong>${escapeHtml(evidenceSentence(card.evidence.live))}</strong>. When that capability is unavailable, the application must visibly enter read-only replay; it must not present replay as a current live dashboard.</p>
      </section>`
    : "";
  const visual = card.visualEvidence
    ? `<p>Producer-qualified desktop and mobile evidence is bound to this card. See the exact paths in <a href="site-handoff.v1.json">the handoff</a>.</p>`
    : `<p>No producer-qualified desktop/mobile visual evidence is attached. This page therefore does not promote the sample as qualified.</p>`;
  const body = `${galleryHeader()}
    <main id="main-content" class="sdk-detail-main">
      <p class="sdk-breadcrumb"><a href="index.html">SDK samples</a> / ${escapeHtml(card.id)}</p>
      <header class="sdk-detail-hero">
        <div class="sdk-card-statuses">
          ${statusBadge("Qualification", card.qualification.state)}
          ${statusBadge("Support", card.supportTier)}
          ${statusBadge("Lifecycle", card.lifecycle.state)}
        </div>
        <h1>${escapeHtml(card.title)}</h1>
        <p>${escapeHtml(card.summary)}</p>
      </header>

      <section class="sdk-detail-section">
        <h2>Current product status</h2>
        <p><strong>Lifecycle:</strong> ${escapeHtml(humanize(card.lifecycle.state))}. ${escapeHtml(card.lifecycle.reason)}</p>
        ${replacementHtml(notice)}
        <p><strong>Golden journey:</strong> ${card.journey ? `${escapeHtml(card.journey.title)} — ${escapeHtml(humanize(card.journey.status))}` : "Not assigned; this remains a focused sample."}</p>
      </section>

      ${realtime}

      <section class="sdk-detail-section">
        <h2>Evidence and degradation</h2>
        <dl class="sdk-detail-grid">
          <div><dt>Fixture lane</dt><dd>${escapeHtml(evidenceSentence(card.evidence.fixture))}</dd></div>
          <div><dt>Live lane</dt><dd>${escapeHtml(evidenceSentence(card.evidence.live))}</dd></div>
          <div><dt>Data</dt><dd>${escapeHtml(humanize(card.data.mode))} · ${escapeHtml(humanize(card.data.authMode))} auth</dd></div>
          <div><dt>Freshness contract</dt><dd>${escapeHtml(card.data.freshness)}</dd></div>
        </dl>
        <p><strong>Expected degradation:</strong> ${escapeHtml(card.expectedDegradation)}</p>
        ${visual}
      </section>

      <section class="sdk-detail-section">
        <h2>What it exercises</h2>
        <dl class="sdk-detail-grid">
          <div><dt>Tasks</dt><dd>${escapeHtml(card.tasks.map(humanize).join(", "))}</dd></div>
          <div><dt>Capabilities</dt><dd>${escapeHtml(card.capabilities.map(humanize).join(", "))}</dd></div>
          <div><dt>Protocols</dt><dd>${escapeHtml(card.protocols.map(humanize).join(", "))}</dd></div>
          <div><dt>Renderers</dt><dd>${escapeHtml(card.renderers.map(humanize).join(", "))}</dd></div>
        </dl>
      </section>

      <section class="sdk-detail-section">
        <h2>Canonical implementation</h2>
        <p>Executable source is not copied into honua.io. These links are pinned to the exact producer revision consumed by this page.</p>
        <div class="sdk-detail-actions">
          <a class="sdk-primary-action" href="${escapeHtml(sourceUrl(card.source, source.producer.revision))}">Open SDK source</a>
          <a href="${escapeHtml(sourceUrl(card.source, source.producer.revision, true))}">Read sample documentation</a>
        </div>
      </section>

      <section class="sdk-detail-section">
        <h2>Admission gaps</h2>
        <p>${relatedGaps.length} matrix gap${relatedGaps.length === 1 ? "" : "s"} currently name this sample as a candidate. Qualification remains ${escapeHtml(humanize(card.qualification.state))} until producer-owned gates close those gaps.</p>
      </section>
    </main>
    <footer class="sdk-gallery-footer"><a href="index.html">Return to all SDK samples</a> · producer revision <code>${source.producer.revision.slice(0, 12)}</code></footer>`;
  return pageShell({
    title: card.title,
    description: card.summary,
    canonicalPath: card.canonicalPath,
    assetPrefix: "../",
    body,
  });
}

function routesPage(bundle) {
  const { handoff, source } = bundle;
  const canonicalRows = handoff.canonicalRoutes.map((route) => `<tr><td><code>${escapeHtml(route.path)}</code></td><td>${escapeHtml(route.sampleId)}</td><td>${escapeHtml(humanize(route.presentation))}</td></tr>`).join("\n");
  const legacyRows = handoff.legacyRoutes.map((route) => `<tr><td><code>/${escapeHtml(route.path)}</code></td><td>${escapeHtml(humanize(route.resolution))}</td><td>${route.canonicalPath ? `<a href="../${escapeHtml(route.canonicalPath)}">${escapeHtml(route.canonicalPath)}</a>` : "Explicit status page"}</td></tr>`).join("\n");
  const body = `${galleryHeader()}
    <main id="main-content" class="sdk-detail-main">
      <p class="sdk-breadcrumb"><a href="index.html">SDK samples</a> / route migration</p>
      <header class="sdk-detail-hero"><h1>Canonical and legacy route map</h1><p>Generated from the exact SDK handoff at <code>${source.producer.revision.slice(0, 12)}</code>. Canonical paths are the only externally listed SDK sample routes.</p></header>
      <section class="sdk-detail-section"><h2>${handoff.canonicalRoutes.length} canonical routes</h2><div class="sdk-table-scroll" tabindex="0"><table><caption>Canonical SDK sample routes</caption><thead><tr><th scope="col">Route</th><th scope="col">Sample</th><th scope="col">Presentation</th></tr></thead><tbody>${canonicalRows}</tbody></table></div></section>
      <section class="sdk-detail-section"><h2>${handoff.legacyRoutes.length} legacy resolutions</h2><p>GitHub Pages cannot emit the producer's requested HTTP 308 directly. Canonical migrations use a canonical link plus immediate meta refresh; exceptions and non-public fixtures use explicit status pages.</p><div class="sdk-table-scroll" tabindex="0"><table><caption>Legacy SDK sample route resolutions</caption><thead><tr><th scope="col">Legacy route</th><th scope="col">Resolution</th><th scope="col">Destination</th></tr></thead><tbody>${legacyRows}</tbody></table></div></section>
    </main>`;
  return pageShell({
    title: "SDK sample route migration",
    description: "Canonical and legacy Honua SDK sample route mapping generated from the producer handoff.",
    canonicalPath: "samples/routes.html",
    assetPrefix: "../",
    body,
  });
}

function legacyPage(route) {
  if (route.resolution === "canonical-sample") {
    const target = route.canonicalPath;
    const body = `<main id="main-content" class="sdk-legacy-main">
      <p class="sdk-eyebrow">Permanent sample route migration</p>
      <h1>${escapeHtml(route.title)}</h1>
      <p>${escapeHtml(route.reason)}</p>
      <p><a class="sdk-primary-action" href="${escapeHtml(target)}">Continue to the canonical SDK sample page</a></p>
      <p class="sdk-static-limit">This static GitHub Pages deployment cannot send a literal HTTP 308. The document publishes a canonical URL and immediate refresh matching the producer's permanent-redirect intent.</p>
    </main>`;
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(route.title)} moved | Honua</title><meta name="robots" content="noindex,follow" /><link rel="canonical" href="https://honua.io/${escapeHtml(target)}" /><meta http-equiv="refresh" content="0; url=${escapeHtml(target)}" /><link rel="stylesheet" href="assets/sdk-gallery.css" /></head><body class="sdk-gallery-body">${body}</body></html>
`;
  }
  const body = `<main id="main-content" class="sdk-legacy-main">
    <p class="sdk-eyebrow">SDK sample route status</p>
    <h1>${escapeHtml(route.title)}</h1>
    <div class="sdk-card-statuses">${statusBadge("Support", route.supportTier)} ${statusBadge("Track", route.track)}</div>
    <p>${escapeHtml(route.reason)}</p>
    <p><a class="sdk-primary-action" href="samples/index.html">Browse public SDK samples</a></p>
  </main>`;
  return pageShell({
    title: `${route.title} status`,
    description: route.reason,
    canonicalPath: route.path,
    assetPrefix: "",
    body,
    robots: "noindex,follow",
  });
}

function writeGenerated(projectRoot, relativePath, content) {
  canonicalRelativePath(relativePath, "Generated SDK gallery path");
  const absolute = join(projectRoot, ...relativePath.split("/"));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

export function buildSdkGallery({ siteRoot = SITE_ROOT, projectRoot, now = new Date() }) {
  invariant(projectRoot, "SDK gallery build requires a target project root");
  const target = resolve(projectRoot);
  invariant(existsSync(target) && statSync(target).isDirectory(), "SDK gallery target project root does not exist");
  const bundle = loadAndValidateSdkGallery({ siteRoot, now });
  writeGenerated(target, "samples/index.html", galleryIndex(bundle));
  writeGenerated(target, "samples/routes.html", routesPage(bundle));
  for (const card of bundle.handoff.cards) writeGenerated(target, card.canonicalPath, detailPage(card, bundle));
  for (const route of bundle.handoff.legacyRoutes) writeGenerated(target, route.path, legacyPage(route));
  const handoffSource = bundle.artifacts.get(HANDOFF_PATH).absolute;
  const publishedHandoff = join(target, "samples", "site-handoff.v1.json");
  mkdirSync(dirname(publishedHandoff), { recursive: true });
  copyFileSync(handoffSource, publishedHandoff);
  invariant(sha256(readFileSync(publishedHandoff)) === sha256(bundle.artifacts.get(HANDOFF_PATH).bytes), "Published SDK handoff digest drift");
  return {
    bundle,
    projectRoot: target,
    generated: {
      cards: bundle.handoff.cards.length,
      canonicalRoutes: bundle.handoff.canonicalRoutes.length,
      legacyRoutes: bundle.handoff.legacyRoutes.length,
    },
  };
}

function parseCli(argv) {
  const options = { mode: "check", projectRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") options.mode = "check";
    else if (argument === "--build") options.mode = "build";
    else if (argument === "--project") options.projectRoot = argv[++index];
    else throw new Error(`Unknown SDK gallery consumer argument: ${argument}`);
  }
  return options;
}

function validationClock() {
  const configured = process.env.HONUA_SDK_GALLERY_NOW;
  if (!configured) return new Date();
  strictDate(configured, "HONUA_SDK_GALLERY_NOW");
  return new Date(configured);
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const now = validationClock();
  if (options.mode === "build") {
    invariant(options.projectRoot, "--build requires --project <directory>");
    const result = buildSdkGallery({ projectRoot: options.projectRoot, now });
    console.log(
      `sdk-gallery-consumer: generated ${result.generated.canonicalRoutes} canonical + ${result.generated.legacyRoutes} legacy routes from ${result.bundle.source.producer.revision.slice(0, 12)}`,
    );
    return;
  }
  const bundle = loadAndValidateSdkGallery({ now });
  const nextExpiry = bundle.expirations[0]?.expiresAt ?? "none";
  console.log(
    `sdk-gallery-consumer: OK — ${bundle.handoff.counts.cards} cards, ${bundle.handoff.counts.qualifiedJourneys} qualified, ${bundle.handoff.counts.gaps} gaps, next evidence expiry ${nextExpiry}`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`sdk-gallery-consumer: ${error.message}`);
    process.exitCode = 1;
  });
}

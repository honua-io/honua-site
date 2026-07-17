import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  HANDOFF_PATH,
  SITE_ROOT,
  buildSdkGallery,
  filterSdkGalleryCards,
  loadAndValidateSdkGallery,
  normalizeSearchText,
} from "./sdk-gallery-consumer.mjs";

const FRESH_CLOCK = "2026-07-17T18:00:00.000Z";

function sha(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("consumes the exact v3 fixture-bound SDK handoff without a site inventory fork", () => {
  const bundle = loadAndValidateSdkGallery({ now: FRESH_CLOCK });
  assert.equal(bundle.source.producer.revision, "aba7f32dd6135a66298a16aba773ac47bf77aafd");
  assert.equal(bundle.handoff.ownership.sourceImplementationDuplicated, false);
  assert.equal(bundle.handoff.counts.cards, 32);
  assert.equal(bundle.handoff.counts.qualifiedJourneys, 0);
  assert.equal(bundle.handoff.counts.canonicalRoutes, 32);
  assert.equal(bundle.handoff.counts.legacyRoutes, 20);
  assert.equal(bundle.handoff.counts.gaps, 422);

  const handoff = bundle.artifacts.get(HANDOFF_PATH);
  assert.equal(handoff.bytes.byteLength, bundle.fixture.input.bytes);
  assert.equal(sha(handoff.absolute), bundle.fixture.input.sha256);
  assert.deepEqual(bundle.fixture.interaction, bundle.handoff.policy.interaction);
});

test("implements producer text normalization and exact AND facets", () => {
  const { handoff, fixture } = loadAndValidateSdkGallery({ now: FRESH_CLOCK });
  assert.equal(normalizeSearchText("  Realtime\u00a0  INCIDENT  "), "realtime incident");
  for (const filterCase of fixture.filterCases) {
    assert.deepEqual(
      filterSdkGalleryCards(handoff.cards, filterCase.filters).map((card) => card.id),
      filterCase.expectedSampleIds,
      filterCase.id,
    );
  }
  assert.deepEqual(
    filterSdkGalleryCards(handoff.cards, {
      renderer: "maplibre",
      dataMode: "hybrid",
      supportTier: "supported",
      lifecycleState: "active",
      qualificationState: "planned",
      text: "realtime operations",
    }).map((card) => card.id),
    ["realtime-incident-dashboard"],
  );
});

test("fails closed when producer evidence has expired", () => {
  assert.throws(
    () => loadAndValidateSdkGallery({ now: "2026-08-13T00:00:00.000Z" }),
    /producer live evidence is stale/,
  );
});

test("fails closed when any pinned producer byte changes", () => {
  const target = mkdtempSync(join(tmpdir(), "honua-sdk-gallery-tamper-"));
  try {
    mkdirSync(join(target, "data"));
    cpSync(join(SITE_ROOT, "data", "sdk-gallery"), join(target, "data", "sdk-gallery"), { recursive: true });
    appendFileSync(
      join(target, "data", "sdk-gallery", "aba7f32d", HANDOFF_PATH),
      "\n",
      "utf8",
    );
    assert.throws(
      () => loadAndValidateSdkGallery({ siteRoot: target, now: FRESH_CLOCK }),
      /byte binding drift/,
    );
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("builds canonical cards, route map, exact manifest, and every legacy resolution", () => {
  const target = mkdtempSync(join(tmpdir(), "honua-sdk-gallery-"));
  try {
    const result = buildSdkGallery({ projectRoot: target, now: FRESH_CLOCK });
    const sampleFiles = readdirSync(join(target, "samples"));
    assert.equal(sampleFiles.filter((name) => name.endsWith(".html")).length, 34);
    assert.equal(result.generated.canonicalRoutes, 32);
    assert.equal(result.generated.legacyRoutes, 20);

    const index = readFileSync(join(target, "samples", "index.html"), "utf8");
    assert.match(index, /role="search" aria-label="Filter SDK samples"/);
    assert.match(index, /id="sample-results-status"[^>]+role="status"[^>]+aria-live="polite"[^>]+aria-atomic="true"/);
    assert.match(index, /id="task-search"/);
    assert.match(index, /id="capability-filter"/);
    assert.match(index, /id="protocol-filter"/);
    assert.match(index, /id="qualification-state-filter"/);
    assert.match(index, /0 qualified journeys/);
    assert.equal((index.match(/class="sdk-sample-card"/g) ?? []).length, 32);

    const incident = readFileSync(join(target, "samples", "realtime-incident-dashboard.html"), "utf8");
    assert.match(incident, /Realtime contract/);
    assert.match(incident, /Unavailable · Skipped · target Demo Live/);
    assert.match(incident, /must not present replay as a current live dashboard/);
    assert.match(incident, /data-status="planned"/);

    const legacy = readFileSync(join(target, "demo-public-safety.html"), "utf8");
    assert.match(legacy, /rel="canonical" href="https:\/\/honua\.io\/samples\/realtime-incident-dashboard\.html"/);
    assert.match(legacy, /http-equiv="refresh"/);
    assert.match(legacy, /name="robots" content="noindex,follow"/);
    assert.match(legacy, /cannot send a literal HTTP 308/);

    const exception = readFileSync(join(target, "demo-two-protocols.html"), "utf8");
    assert.match(exception, /SDK sample route status/);
    assert.match(exception, /name="robots" content="noindex,follow"/);
    assert.doesNotMatch(exception, /http-equiv="refresh"/);

    assert.equal(
      sha(join(target, "samples", "site-handoff.v1.json")),
      result.bundle.fixture.input.sha256,
    );
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("generator leaves source pages untouched and links exact producer source", () => {
  const target = mkdtempSync(join(tmpdir(), "honua-sdk-gallery-isolation-"));
  const sourcePage = join(SITE_ROOT, "demo-public-safety.html");
  const before = sha(sourcePage);
  try {
    buildSdkGallery({ projectRoot: target, now: FRESH_CLOCK });
    assert.equal(sha(sourcePage), before);
    const detail = readFileSync(join(target, "samples", "realtime-incident-dashboard.html"), "utf8");
    assert.match(
      detail,
      /https:\/\/github\.com\/honua-io\/honua-sdk-js\/tree\/aba7f32dd6135a66298a16aba773ac47bf77aafd\/examples\/realtime-incident-dashboard/,
    );
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

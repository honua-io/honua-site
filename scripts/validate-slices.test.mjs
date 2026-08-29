import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validate, assertSupported } from "./json-schema-mini.mjs";
import { checkManifest, fetchIssueState, issueUrls, knownCapabilityKeys, knownSampleIds } from "./validate-slices.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = path.join(ROOT, "scripts", "test", "slices");
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, "schemas", "slice.v1.schema.json"), "utf8"));

const context = {
  schema,
  capabilityKeys: knownCapabilityKeys(ROOT),
  sampleIds: knownSampleIds(ROOT),
  slugs: new Set(["fixture-slice", "geoprocessing", "valid-reference"]),
  evidencePageExists: (page) => fs.existsSync(path.join(ROOT, page)),
};

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"));
}

function check(name) {
  const manifest = fixture(name);
  return checkManifest(manifest, { ...context, slug: manifest.slug });
}

test("the published schema only uses keywords the mini validator enforces", () => {
  assertSupported(schema);
});

test("accepts the committed geoprocessing slice", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "slices", "geoprocessing.json"), "utf8"));
  assert.deepEqual(checkManifest(manifest, { ...context, slug: "geoprocessing" }), []);
});

test("accepts a map-shaped and a reference-shaped fixture", () => {
  assert.deepEqual(check("valid-map"), []);
  assert.deepEqual(check("valid-reference"), []);
});

test("a reference-shaped slice may omit its sample, a map-shaped one may not", () => {
  assert.equal(fixture("valid-reference").sample, undefined);
  const failures = check("map-without-sample");
  assert.ok(
    failures.some((failure) => /missing required property "sample"/.test(failure)),
    failures.join("\n")
  );
});

test("rejects a dangling capability key", () => {
  const failures = check("dangling-capability-key");
  assert.ok(
    failures.some((failure) => failure.includes('unknown capability key "process.no-such-key"')),
    failures.join("\n")
  );
});

test("rejects a dangling sample id", () => {
  const failures = check("dangling-sample-id");
  assert.ok(
    failures.some((failure) => failure.includes('unknown sample id "no-such-sample"')),
    failures.join("\n")
  );
});

test("rejects an absent or partial surface with no issue to track", () => {
  const failures = check("absent-without-issue");
  assert.ok(
    failures.some((failure) => failure.includes("use.python is absent but names no issue")),
    failures.join("\n")
  );
  // The schema catches it too, so the manifest cannot be published even if the
  // referential pass is skipped.
  assert.ok(validate(schema, fixture("absent-without-issue")).some((error) => /"issue"/.test(error)));

  const partial = fixture("valid-map");
  partial.use.python = { state: "partial" };
  assert.ok(
    checkManifest(partial, { ...context, slug: partial.slug }).some((failure) =>
      failure.includes("use.python is partial but names no issue")
    )
  );
});

test("rejects an unknown related slug and a self-link", () => {
  assert.ok(
    check("unknown-related").some((failure) => failure.includes('unknown related slice "no-such-slice"')),
    "unknown related slug"
  );
  const selfLink = fixture("valid-map");
  selfLink.related = [selfLink.slug];
  assert.ok(
    checkManifest(selfLink, { ...context, slug: selfLink.slug }).some((failure) => failure.includes("links to itself")),
    "self link"
  );
});

test("rejects a slug that disagrees with the filename, an unknown property, and a bad issue host", () => {
  const renamed = fixture("valid-map");
  renamed.slug = "somewhere-else";
  assert.ok(checkManifest(renamed, { ...context, slug: "valid-map" }).some((failure) => /does not match the filename/.test(failure)));

  const extra = fixture("valid-map");
  extra.tagline = "not part of the v1 shape";
  assert.ok(validate(schema, extra).some((error) => /unexpected property "tagline"/.test(error)));

  const offsite = fixture("valid-map");
  offsite.use.python.issue = "https://example.com/issues/1";
  assert.ok(validate(schema, offsite).some((error) => /does not match/.test(error)));

  const available = fixture("valid-map");
  available.use.js.issue = "https://github.com/honua-io/honua-site/issues/219";
  assert.ok(
    checkManifest(available, { ...context, slug: available.slug }).some((failure) =>
      /available and must not carry a gap issue/.test(failure)
    )
  );
  // And the published schema says the same thing on its own, because a consumer
  // that only has the $id never runs checkManifest().
  assert.ok(validate(schema, available).some((error) => /"not" schema/.test(error)));
});

test("the issue/state contract is symmetric in the schema, on every surface shape", () => {
  // One surface of each shape — console (route), cli (command), js (snippet),
  // mcp (tools) — since each has its own $def and could drift apart.
  for (const [path, payload] of [
    [["setup", "console"], { route: "/operate/x" }],
    [["setup", "cli"], { command: "honua x" }],
    [["use", "js"], { snippet: "await client.x();" }],
    [["ask", "mcp"], { tools: ["honua_x"] }],
  ]) {
    const manifest = fixture("valid-map");
    const [group, name] = path;
    manifest[group][name] = { state: "available", ...payload };
    assert.deepEqual(validate(schema, manifest), [], `${group}.${name} available with its payload is valid`);

    manifest[group][name].issue = "https://github.com/honua-io/honua-site/issues/219";
    assert.ok(
      validate(schema, manifest).some((error) => /"not" schema/.test(error)),
      `${group}.${name} available with an issue must be rejected by the schema alone`
    );
  }
});

test("rejects an evidencePage that is not a page at the site root", () => {
  const manifest = fixture("valid-map");
  manifest.underneath.evidencePage = "evidence-not-a-real-page.html";
  assert.ok(
    checkManifest(manifest, { ...context, slug: manifest.slug }).some((failure) => /does not exist at the site root/.test(failure))
  );
});

test("collects every distinct gap issue URL once", () => {
  const urls = issueUrls([fixture("valid-map"), fixture("valid-reference")]);
  assert.deepEqual(urls, ["https://github.com/honua-io/honua-site/issues/219"]);
});

test("a closed, missing, or unreachable gap issue is a failure", async () => {
  const url = "https://github.com/honua-io/honua-site/issues/1";
  const respond = (status, body) => async () => new Response(JSON.stringify(body), { status });

  assert.deepEqual(await fetchIssueState(url, { cache: false, fetchImpl: respond(200, { state: "open" }) }), {
    url,
    ok: true,
    state: "open",
  });
  const closed = await fetchIssueState(url, { cache: false, fetchImpl: respond(200, { state: "closed" }) });
  assert.equal(closed.ok, false);
  assert.match(closed.reason, /closed/);

  const missing = await fetchIssueState(url, { cache: false, fetchImpl: respond(404, {}) });
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /404/);
});

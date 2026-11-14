import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { forbiddenClaims } from "./forbidden-claims.mjs";
import { siblingClaimFailures } from "./sibling-claims.mjs";
import { scanHtml } from "./validate-slice-voice.mjs";

test("connection overclaims fail in shared and rendered-page gates", () => {
  for (const verb of ["connect", "connects", "connected"]) {
    for (const qualifier of ["unchanged", "unmodified"]) {
      const claim = `Clients ${verb.toUpperCase()}\n${qualifier.toUpperCase()}.`;
      assert.ok(forbiddenClaims.some(([pattern]) => pattern.test(claim)), claim);
      assert.ok(scanHtml(`<p>${claim}</p>`).length > 0, claim);
    }
  }
  assert.ok(scanHtml("<p>Works WITHOUT\nMODIFICATION.</p>").length > 0);
});

test("scoped connection wording and unrelated words still pass", () => {
  for (const claim of [
    "Connect through the documented compatibility surface.",
    "Unmodified projects require a compatibility assessment.",
    "Disconnected unchanged settings.",
    "Connect unchangedness.",
  ]) {
    assert.equal(forbiddenClaims.some(([pattern]) => pattern.test(claim)), false, claim);
  }
});

test("optional sibling sources enforce claims and identify each document", (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "honua-sibling-claims-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const site = join(workspace, "honua-site");
  mkdirSync(site);
  assert.deepEqual(siblingClaimFailures(site), []);

  const documents = [
    ["honua-server/README.md", "Clients connect unmodified."],
    ["honua-server/docs/reference/compatibility/geoservices-parity.md", "Clients connected unchanged."],
    ["honua-migrate/README.md", "Works without modification."],
  ];
  for (const [document, claim] of documents) {
    const file = join(workspace, document);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, claim);
  }
  const failures = siblingClaimFailures(site);
  assert.equal(failures.length, 3);
  for (const [document] of documents) {
    assert.ok(failures.some((failure) => failure.startsWith(`${document}:`)));
    writeFileSync(join(workspace, document), "Connect through the documented compatibility surface.");
  }
  assert.deepEqual(siblingClaimFailures(site), []);

  writeFileSync(join(workspace, "honua-server/README.md"), "We support every GIS standard.");
  assert.match(siblingClaimFailures(site)[0], /every GIS standard/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { forbiddenClaims } from "./forbidden-claims.mjs";

const modificationClaim = forbiddenClaims.find(([, description]) =>
  description.includes("connect unchanged")
)?.[0];

test("modification-free connection synonyms are forbidden", () => {
  assert.ok(modificationClaim);
  for (const claim of [
    "connect unchanged",
    "connects unmodified",
    "connected unmodified",
    "Connect   Unchanged",
    "works without modification",
  ]) {
    assert.match(claim, modificationClaim);
  }
});

test("scoped protocol compatibility wording remains allowed", () => {
  assert.doesNotMatch(
    "Protocol-level compatibility is operation-scoped and bounded by the published certified envelope.",
    modificationClaim
  );
});

test("the org claim surfaces are configured as external targets", () => {
  const config = JSON.parse(
    readFileSync(new URL("../data/forbidden-claim-targets.json", import.meta.url), "utf8")
  );
  assert.deepEqual(config.externalTargets, [
    "../honua-server/README.md",
    "../honua-server/docs/reference/compatibility/geoservices-parity.md",
    "../honua-migrate/README.md",
  ]);
});

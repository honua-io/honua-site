import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(readFileSync(join(repoRoot, "data", "capabilities.v1.json"), "utf8"));
const pageFor = (cap) => readFileSync(join(repoRoot, `evidence-${cap.key.replace(/\./g, "-")}.html`), "utf8");

test("non-CITE counts are labeled as capability tests without invented pass ratios", () => {
  const nonCite = policy.capabilities.filter((cap) => cap.evidence.tests > 0 && cap.evidence.citeSuites.length === 0);
  assert.ok(nonCite.length > 0);
  for (const cap of nonCite) {
    const page = pageFor(cap);
    assert.match(page, /<td>Capability test suite<\/td><td>Server test inventory<\/td>/);
    assert.match(page, new RegExp(`<td>${cap.evidence.tests} assertions counted<\\/td>`));
    assert.doesNotMatch(page, /<td>CITE \/ conformance suites?<\/td>/);
    assert.doesNotMatch(page, new RegExp(`${cap.evidence.tests}/${cap.evidence.tests} assertions`));
  }
});

test("interop rows retain each lane freshness state and observation date", () => {
  const clients = policy.capabilities.flatMap((cap) => cap.evidence.interopClients.map((client) => ({ cap, client })));
  assert.equal(clients.filter(({ client }) => client.freshness.state === "fresh").length, 0);
  assert.equal(clients.filter(({ client }) => client.freshness.state === "stale").length, 16);
  assert.equal(clients.filter(({ client }) => client.freshness.state === "unknown").length, 15);
  for (const { cap, client } of clients) {
    const page = pageFor(cap);
    const detail = [client.clientLane, client.protocol].filter(Boolean).join(" · ");
    assert.match(page, new RegExp(`<td>${detail}<\\/td>`));
    if (client.freshness.state === "stale") {
      assert.match(page, new RegExp(`Stale CI evidence · ${client.freshness.ageDays} days old<\\/td><td>${client.freshness.runDate.slice(0, 10)}`));
    } else {
      assert.match(page, /Never run \/ no retained CI evidence<\/td><td>—<\/td>/);
    }
  }
});

test("every proof-pending capability page surfaces its evidence status", () => {
  const pending = policy.capabilities.filter((cap) => cap.status === "proof-pending");
  assert.equal(pending.length, 35);
  for (const cap of pending) {
    assert.match(pageFor(cap), /<strong>Evidence status: Proof pending\.<\/strong> No public evidence artifact is published for this exact capability yet\./);
  }
});

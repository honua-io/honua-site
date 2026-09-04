import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(join(root, name), "utf8");

test("multi-tenancy remains a Preview/trial-only non-production claim", () => {
  const catalog = JSON.parse(read("data/capabilities.v1.json"));
  const capability = catalog.capabilities.find((item) => item.key === "admin.multi-tenancy");

  assert.ok(capability, "admin.multi-tenancy must be present in the public capability catalog");
  assert.equal(capability.status, "preview");
  assert.match(capability.summary, /Preview\/trial-only/i);
  assert.match(capability.summary, /non-production/i);
  assert.match(capability.summary, /do not use customer production data/i);
  assert.doesNotMatch(capability.summary, /generally available|production-ready/i);
});

test("tenant routes, pricing, demo, and deployment pages disclose the complete boundary", () => {
  const api = read("api-reference.html");
  const pricing = read("pricing.html");
  const demo = read("connect.html");
  const deployment = read("cloud.html");

  for (const [surface, html] of [["API", api], ["pricing", pricing], ["demo", demo]]) {
    assert.match(html, /Preview \/ trial only/i, `${surface} must label multi-tenancy Preview/trial only`);
    assert.match(html, /non-production/i, `${surface} must prohibit production use`);
    assert.match(html, /customer production data/i, `${surface} must prohibit customer production data`);
  }

  assert.match(pricing, /no GA, availability, performance, durability, SLO, or scale commitment/i);
  assert.match(deployment, /does not offer SaaS, hosting, or a managed service/i);
  assert.doesNotMatch(deployment, /waitlist|early-access|planned managed service/i);
});

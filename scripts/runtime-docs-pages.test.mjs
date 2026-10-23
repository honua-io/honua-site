import assert from "node:assert/strict";
import test from "node:test";

import { buildBundle } from "./gen-slice-pages.mjs";

/**
 * honua-server scripts/ci/code-referenced-anchors.v1.json. Each sentence is
 * taken from that anchor's section in the server source page. Success is the
 * built HTML, not an empty 200 or a refresh to somewhere else.
 */
const PAGES = [
  {
    path: "guides/deploy/docker-compose/index.html",
    sections: [
      {
        anchor: "redis-is-optional-postgis-is-not",
        sentence: "PostGIS owns the catalog, layer metadata and feature data and is required.",
      },
      {
        anchor: "redis-is-configured-but-not-entitled",
        sentence: "installing Redis does not grant paid features.",
      },
    ],
  },
  {
    path: "reference/compatibility/idp-conformance-matrix/index.html",
    sections: [],
    sentence: "SCIM provisioning is RFC 7643/7644-conformant and provider-agnostic",
  },
  {
    path: "guides/deploy/cloud-deployments/index.html",
    sections: [
      {
        anchor: "background-file-imports-run-on-aws-batch",
        sentence:
          "A Lambda instance is frozen as soon as it returns a response, so the API function never runs a background file import itself.",
      },
    ],
  },
  {
    path: "guides/deploy/troubleshooting/index.html",
    sections: [
      {
        anchor: "database-connections",
        sentence: "and pool state via ",
      },
      {
        anchor: "memory-and-performance",
        sentence: "configure Redis so replicas share caches",
      },
      {
        anchor: "quick-triage",
        sentence: "If either fails, start with the startup or database tables below.",
      },
      {
        anchor: "emergency-procedures",
        sentence: "fires or normal triage cannot restore readiness.",
      },
      {
        anchor: "imports",
        sentence: "Queued imports require Redis",
      },
      {
        anchor: "rate-limiting",
        sentence:
          "Rate limiting belongs at the edge (WAF, API gateway, ingress, or load balancer) for the default MVP posture.",
      },
    ],
  },
  {
    path: "guides/deploy/scaling-and-performance/index.html",
    sections: [
      {
        anchor: "caching-layers",
        sentence: "index expires with its latest tracked payload deadline.",
      },
      {
        anchor: "what-needs-redis-when-multi-node",
        sentence: "A read-replica database connection is not currently supported",
      },
      {
        anchor: "outbound-http-resilience",
        sentence: "get automatic retries with exponential backoff and per-service circuit breakers.",
      },
      {
        anchor: "redis-capacity-and-latency",
        sentence: "Size Redis from observed peak memory, not its empty-instance footprint.",
      },
    ],
  },
];

test("built runtime docs pages carry each inventory anchor and a sentence from that section", () => {
  const files = buildBundle();
  for (const page of PAGES) {
    const html = files.get(page.path);
    assert.equal(typeof html, "string", `${page.path} is missing from the docs build`);
    assert.doesNotMatch(html, /http-equiv="refresh"/, `${page.path} must serve the section, not redirect away`);
    assert.doesNotMatch(html, />This page has moved/, `${page.path} must not be an empty redirect`);
    for (const section of page.sections) {
      const anchorAt = html.indexOf(`id="${section.anchor}"`);
      assert.ok(anchorAt !== -1, `${page.path} missing #${section.anchor}`);
      const sentenceAt = html.indexOf(section.sentence, anchorAt);
      assert.ok(
        sentenceAt > anchorAt,
        `${page.path} #${section.anchor} does not contain the source sentence: ${section.sentence}`
      );
    }
    if (page.sentence) {
      assert.ok(html.includes(page.sentence), `${page.path} missing source sentence: ${page.sentence}`);
    }
  }
});

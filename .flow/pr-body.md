docs: publish every runtime-referenced docs page at the URLs honua-server emits (#214)
Refs #214 (all three batches in one PR; supersedes the closed #260 and the anchor-stale drafts #261/#262)

## Why

honua-server trunk (#5152, for server#3786) already prints `https://honua.io/docs/<path>/` URLs in typed refusals (`remediationRef`), the SCIM `documentationUri` and the Prometheus `runbook_url` annotations. All five pages they point to return 404 today. This PR authors all of them: 23 runtime values, 14 URLs, 5 pages.

| Page | Anchors | Emitted by |
|---|---|---|
| `/docs/reference/compatibility/idp-conformance-matrix/` | (page) | SCIM `ServiceProviderConfig.documentationUri` |
| `/docs/guides/deploy/docker-compose/` | `#redis-is-optional-postgis-is-not`, `#redis-is-configured-but-not-entitled` | `CapabilityUnavailableCodes.RedisRemediationRef`, `EntitlementRemediationRef` |
| `/docs/guides/deploy/cloud-deployments/` | `#background-file-imports-run-on-aws-batch` | `CapabilityUnavailableCodes.ServerlessManagedRemediationRef` (new since #260) |
| `/docs/guides/deploy/troubleshooting/` | `#quick-triage`, `#database-connections`, `#memory-and-performance`, `#imports`, `#rate-limiting`, `#emergency-procedures` | 13 Prometheus alerts |
| `/docs/guides/deploy/scaling-and-performance/` | `#caching-layers`, `#what-needs-redis-when-multi-node`, `#redis-capacity-and-latency`, `#outbound-http-resilience` | 6 Prometheus alerts |

## What changed

- **Authored namespaces `docs/guides/**` (`type: runbook`) and `docs/reference/**` (`type: reference`).** `gen-slice-pages.mjs` carries them at any depth, the same way it carries playbooks: the bytes go through unchanged, the HTML is rendered from them, and they sit behind the same `--check` gate. `runbook` was already reserved for this; `reference` is new.
- **The six review findings on #260 are fixed:**
  - the walk keeps going below a category `index.md`;
  - the stale scan covers the new namespaces (it removes files one at a time, so a live page under a stale parent is never deleted);
  - the bundle root has `Runbooks` and `Reference` sections;
  - SCIM checks use `curl -i --fail-with-body`;
  - AGENTS.md documents the new namespaces;
  - `guides` and `reference` are reserved as slice slugs in the generator, the validator and the schema.
- **`data/runtime-doc-refs.v1.json` + `scripts/runtime-doc-refs.mjs`.** This lists all 23 runtime values (14 URLs), copied from the server's `scripts/ci/code-referenced-anchors.v1.json`. An `authored` entry must resolve to a page and its fragment to exactly one element id. A `pending` entry must not resolve. `--verify-remote` compares the list with the server manifest on trunk. All 14 URLs are now `authored`.
- **Five pages, each a labelled projection of a pinned honua-server commit.** The SCIM, docker-compose and cloud-deployments pages project `393987c`. The troubleshooting and scaling pages project `1e55d67` (`docs/guides/deploy/troubleshooting.md`, `scaling-and-performance.md` and `examples/prometheus-alerts.yml`). Every section that runs a command or changes a deployment says "Unvalidated — verify against your deployment.", and a test enforces this. No threshold or command was invented: alert thresholds are quoted from the example rule file and called out as a starting point, and the server's remediation strings are quoted verbatim. The inert `HonuaRateLimitViolationsHigh` alert is labelled inert, as the server's runbook says.
- The anchors are the ones the server emits today, not the ones in #261/#262 (which had `#rate-limit-violations` for `#rate-limiting`, no `#emergency-procedures`, and `#redis-memory-and-latency` for `#redis-capacity-and-latency`).

## Verification

```bash
node scripts/gen-slice-pages.mjs --check
node scripts/runtime-doc-refs.mjs --verify-remote          # 14 of 14 authored and resolving
node --test scripts/*.test.mjs                             # 167/167
node --test edge/cloudfront-template.test.mjs
node scripts/validate-slices.mjs && node scripts/validate-slice-concepts.mjs --links-only slices docs
node scripts/validate-site-claims.mjs && node scripts/validate-internal-links.mjs
./scripts/build-dist.sh && node scripts/validate-slice-voice.mjs && node scripts/validate-slice-concepts.mjs
node scripts/sdk-docs-versions.mjs --verify-remote
```

The whole `pages.yml` validate job was run locally on Windows against this head (merged with trunk `7d733c0`), and every step passes, including the SDK claim gate (trunk now claims the published 0.2.6 pair, via #306).

No live check is claimed. All five pages return 404 until this deploys. The curl-200 check for all 14 URLs is posted on #214 after deployment.

## Follow-ups

- P3: run `runtime-doc-refs.mjs --verify-remote` in CI, next to `sdk-docs-versions.mjs --verify-remote`, so a new server URL cannot go unlisted.
- P3: the rest of the server's docker-compose guide (TLS edge, backup and restore, upgrade) and the troubleshooting tables for startup, licence, auth, tiles and Redis durability are not projected here.
- After merge: close drafts #261 and #262 as superseded.

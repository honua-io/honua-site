docs: publish the SCIM and Redis/serverless remediation targets at the runtime URLs (#214)
Refs #214 (batch 1 of 3; supersedes the closed #260)

## Why

honua-server trunk (#5152, for server#3786) already prints `https://honua.io/docs/<path>/` URLs in typed refusals (`remediationRef`), the SCIM `documentationUri` and Prometheus `runbook_url` annotations. All five pages they point to return 404 today. This is the first and smallest batch: the SCIM reference page and the three capability-remediation anchors.

| URL | Emitted by |
|---|---|
| `/docs/reference/compatibility/idp-conformance-matrix/` | SCIM `ServiceProviderConfig.documentationUri` |
| `/docs/guides/deploy/docker-compose/#redis-is-optional-postgis-is-not` | `CapabilityUnavailableCodes.RedisRemediationRef` |
| `/docs/guides/deploy/docker-compose/#redis-is-configured-but-not-entitled` | `CapabilityUnavailableCodes.EntitlementRemediationRef` |
| `/docs/guides/deploy/cloud-deployments/#background-file-imports-run-on-aws-batch` | `CapabilityUnavailableCodes.ServerlessManagedRemediationRef` (new since #260) |

## What changed

- **Authored namespaces `docs/guides/**` (`type: runbook`) and `docs/reference/**` (`type: reference`).** `gen-slice-pages.mjs` carries them at any depth, the same way it carries playbooks: the bytes go through unchanged, the HTML is rendered from them, and they sit behind the same `--check` gate. `runbook` was already reserved for this; `reference` is new. Both are now live.
- **The six review findings on #260 are fixed:**
  - the walk keeps going below a category `index.md`;
  - the stale scan covers the new namespaces (it removes files one at a time, so a live page under a stale parent is never deleted);
  - the bundle root has `Runbooks` and `Reference` sections;
  - SCIM checks use `curl -i --fail-with-body`;
  - AGENTS.md documents the new namespaces;
  - `guides` and `reference` are reserved as slice slugs in the generator, the validator and the schema.
- **`data/runtime-doc-refs.v1.json` + `scripts/runtime-doc-refs.mjs`.** This lists all 23 runtime values (14 URLs), copied from the server's `scripts/ci/code-referenced-anchors.v1.json`. An `authored` entry must resolve to a page and its fragment to exactly one element id. A `pending` entry must not resolve. `--verify-remote` compares the list with the server manifest on trunk. 4 URLs are authored here; the other 10 (the 19 Prometheus values) are pending for batches 2 and 3.
- **Three pages,** each a labelled projection of honua-server `393987c`: `docs/reference/compatibility/idp-conformance-matrix.md`, the Redis sections of `docs/guides/deploy/docker-compose.md`, the Lambda/Batch sections of `docs/guides/deploy/cloud-deployments.md`, and the remediation strings in `CapabilityUnavailableCodes.cs`. Every section that runs a command or changes a deployment says "Unvalidated — verify against your deployment.", and a test enforces this. No threshold or command was invented. The server's own remediation strings are quoted verbatim.

## Verification

```bash
node scripts/gen-slice-pages.mjs --check
node scripts/runtime-doc-refs.mjs --verify-remote
node --test scripts/*.test.mjs edge/cloudfront-template.test.mjs   # 175/175
node scripts/validate-slices.mjs && node scripts/validate-slice-concepts.mjs --links-only slices docs
./scripts/build-dist.sh && node scripts/validate-slice-voice.mjs && node scripts/validate-slice-concepts.mjs
node scripts/validate-internal-links.mjs
```

The full `pages.yml` validate sequence was run locally. Everything passes except `validate-site-claims.mjs`: npm published `@honua/sdk-js` and `@honua/sdk-esri-compat` 0.2.4 at 2026-10-19T16:40Z, and the site still says 0.2.3. That drift is on trunk too, is unrelated to this change, and is not fixed here (one issue, one PR). It will fail this PR's Pages job until a claims bump lands.

No live check is claimed. The four URLs above return 404 until this deploys. The curl-200 check is recorded on #214 after deployment.

## Follow-ups

- Batches 2 and 3: `/docs/guides/deploy/troubleshooting/` (13 values) and `/docs/guides/deploy/scaling-and-performance/` (6 values). The open drafts #261 and #262 are based on the closed #260 and no longer match the anchors the server emits. #261 lacks `#emergency-procedures` and has `#rate-limit-violations` where the server uses `#rate-limiting`. #262 has `#redis-memory-and-latency` where the server uses `#redis-capacity-and-latency`. Both use the retired `timestamp` field. Re-cut them on this branch, then flip their entries to `authored`.
- P3: run `runtime-doc-refs.mjs --verify-remote` in CI, next to `sdk-docs-versions.mjs --verify-remote`, so a new server URL cannot go unlisted.
- P3: the rest of the server's docker-compose guide (TLS edge, backup and restore, upgrade) is not projected here.

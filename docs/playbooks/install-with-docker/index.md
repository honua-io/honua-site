---
type: playbook
title: "Install Honua locally with Docker"
description: "Bring the stack up with Docker Compose, then read back what this particular install can and cannot do before asking it for anything."
resource: "https://honua.io/docs/playbooks/install-with-docker/"
tags: ["shape:playbook", "task:install-with-docker", "protocol:docker-compose", "capability:ops.health", "capability:discovery.capability-manifest", "capability:caching.redis", "surface:cli"]
timestamp: "2026-08-28"
---

# Install Honua locally with Docker

Bring the stack up with Docker Compose, then read back what this particular install can and cannot do before asking it for anything.

The same compose file produces two very different servers depending on one environment variable, and the difference is not visible from the outside. Step 4 is how you tell them apart, and step 5 is what the server says when you get it wrong.

## Before you start

Docker with Compose v2, and `git`. Nothing else: PostGIS, Redis and the server all come out of the compose file, and migrations run on first boot.

```bash
git clone https://github.com/honua-io/honua-server.git && cd honua-server
```

## Bring the stack up

Two shapes from one compose file. Pick one — it decides half of what follows.

### With Redis

```bash
docker compose up -d
docker compose ps
```

Starts `postgres`, `redis` and `honua`. HTTP/1 REST and gRPC-Web listen on `http://localhost:8080`, native h2c gRPC on `http://localhost:8081`. The compose file binds both to `127.0.0.1` by default, because the dev admin password in it is a public placeholder.

### Without Redis

```bash
docker compose -f docker-compose.yml -f docker-compose.no-redis.yml up -d
```

The override composes the same stack as PostGIS and the server only, with `ConnectionStrings__Redis` unset. Redis is optional; PostGIS is not — every catalog, service, layer, style and metadata record lives in PostGIS, and the server will not start without it.

## Wait for it to be ready

```bash
curl -sS http://localhost:8080/healthz/ready
```

`Ready` is the whole body, as `text/plain`. The liveness probe is `/healthz/live` and answers `Healthy` with `200`; an admin-authorized `/healthz/metrics` sits beside them. Those three are the only probes — there is no `/readyz` and no `/livez`, so do not guess at one. Any method other than `GET` on any of the three returns `405` with an `Allow: GET` header.

A no-Redis install reports `Ready` exactly like a full one. Readiness is not a statement about which features are composed.

## Read back what this install can do

```bash
curl -sS http://localhost:8080/api/v1/capabilities/manifest
```

Authentication is optional here; an anonymous caller gets the public view. It is computed per request and served `no-store`, so no stale claim survives a restart.

Two places in that document decide whether a job submission will be accepted. First, the `jobs.runner` entry:

```json
{ "id": "jobs.runner", "category": "jobs", "supported": true, "available": false,
  "reasonCode": "dependency-unavailable", "messageKey": "capabilities.jobs.runner.dependency-unavailable" }
```

`supported` says the build has the feature; `available` says this deployment can execute it now. `reasonCode` is omitted entirely when a capability is available, so its presence is the signal — do not read it as an empty string.

Second, `limits.job.durableJobRuntimeAvailable`. That flag is the AND of both halves of the job substrate: a durable job store **and** a runnable queue. A store without a queue would let a submission be persisted and then never drain, so a partial substrate reports `false` rather than `true`. Its siblings under `limits.job` are `configuredWorkloadCount`, `availableBackendCount`, `supportsCancellation` and `supportsProgressPolling`.

> `jobs.runner` is a capability-manifest id, and the manifest ids and the licensing capability keys are still two vocabularies — it resolves in neither `capability-keys.v1.json` nor this site's capability catalog, so it is named here as a string instead of linked as a concept. [Track the unification here](https://github.com/honua-io/honua-server/issues/3408).

## Expect a typed refusal, not a timeout

Where a capability is not available, the server refuses the request up front rather than accepting work it cannot finish. Every refusal is `503` with the problem type `https://honua.io/problems/capability-unavailable` and the title `Capability unavailable`, and carries `code`, `capability`, `missingDependency`, `missingEntitlement`, `remediation` and `remediationRef`. Branch on `code`; never on the message.

Three causes, two codes:

- **No Redis at all** — `"code": "dependency-unavailable"`, `"missingDependency": "redis"`, `"capability": "jobs.runner"`, and a `remediationRef` of `https://docs.honua.io/guides/deploy/docker-compose#redis-is-optional-postgis-is-not`.
- **Redis running, `caching.redis` not entitled** — `"code": "license-required"`, `"missingEntitlement": "caching.redis"`, and **no** `missingDependency`, because adding Redis is not the fix. Its `remediationRef` ends `#redis-is-configured-but-not-entitled`. This is the default for the repository quickstart: the root compose leaves `HONUA_DEV_GRANT_EDITION` empty, so the stack starts Redis and then runs as Community with durable jobs off.
- **A store with no queue** — `"code": "dependency-unavailable"` with `"missingDependency": "job-queue"`.

The same refusal is projected onto every job surface rather than being re-invented per protocol: RFC 7807 extension members on OGC API - Processes and the admin API, `error.details[]` entries on the GeoServices GPServer facade, `isError: true` with `code` and `retryable: false` on MCP, extra `ows:ExceptionText` lines on WPS 2.0, and `Unavailable` plus `honua-error-code` / `honua-capability` / `honua-remediation-ref` trailing metadata on gRPC. `capability` is omitted where no manifest id covers the refused surface — today that is the proposal and approval control plane.

## Turn durable jobs on

```bash
HONUA_DEV_GRANT_EDITION=Pro docker compose up -d
```

A development-only grant, honoured outside Production. The alternative is a licence that includes `caching.redis`; either way the server has to restart. Then re-read the manifest: `jobs.runner` should come back `"available": true` with no `reasonCode`, and `limits.job.durableJobRuntimeAvailable` should be `true`.

Going the other way is safe too. Redis holds only job, workflow, proposal and cache state, so dropping the no-Redis override and starting again adds durable jobs without touching anything PostGIS holds.

## Next

- [Run a bounded geoprocessing job](../run-a-bounded-gp-job/index.md) — the first thing that will refuse if you skipped step 5.
- [Publish a service from a datasource](../publish-a-service/index.md) — the read path, which works on either shape.
- [Run a geoprocessing job](../../geoprocessing/index.md) — the capability slice, with the SDK surfaces.
- Capability keys touched here: [ops.health](../../../evidence-ops-health.html), [discovery.capability-manifest](../../../evidence-discovery-capability-manifest.html), [caching.redis](../../../evidence-caching-redis.html).

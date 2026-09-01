---
type: guide
title: "Docker Compose: Redis capability remediation"
description: "Interpret and remediate the two Redis-related capability-unavailable outcomes without conflating a missing dependency with a missing entitlement."
resource: "https://honua.io/docs/guides/deploy/docker-compose/"
tags: ["shape:guide", "task:docker-compose", "capability:caching.redis", "audience:operator"]
timestamp: "2026-09-01"
---

# Docker Compose: Redis capability remediation

This page is the runtime remediation target for Redis-related capability refusals. Start with the response fields: `code`, `missingDependency`, and `missingEntitlement` distinguish two fixes that must not be merged.

## Redis is optional; PostGIS is not

PostGIS is required for the server to start and holds catalog, service/layer, style, and metadata state. Redis is optional for a single-node read path, but Redis-backed durable jobs, workflows, operation proposals, and related coordination features are not composed when the server has no Redis connection.

When a request is refused because Redis is absent, the runtime contract identifies `code: dependency-unavailable`, `missingDependency: redis`, and the affected durable-job capability where that surface has one. The request is refused up front rather than accepted into work that cannot drain.

### Remediate a missing Redis dependency — unvalidated; verify against your deployment

Provide a reachable Redis instance through the deployment's `ConnectionStrings__Redis` configuration, then restart the server by using your deployment's normal change process. The repository development stack can be brought up with Redis using:

```bash
HONUA_DEV_GRANT_EDITION=Pro docker compose up -d
```

That command is a repository development example, not a production instruction. Verify the rendered Compose configuration, the Redis health, secret handling, and the restart method in your deployment before using it.

## Redis is configured but not entitled

If Redis is configured but the active licence lacks the Pro `caching.redis` entitlement, configuring Redis again is not a fix. The runtime contract instead reports `code: license-required`, `missingEntitlement: caching.redis`, and no `missingDependency`.

### Remediate a missing entitlement — unvalidated; verify against your deployment

Install a licence that includes `caching.redis`, then restart the server through the approved deployment process. Outside Production, the source-supported development grant is `Licensing:DevGrantEdition=Pro` (or `HONUA_DEV_GRANT_EDITION=Pro` for the repository Compose files). Verify the active licence and environment classification before relying on that development-only setting.

## Confirm the outcome — unvalidated; verify against your deployment

After either correction, retrieve the capability manifest from the running server and check the actual response rather than assuming the process restart succeeded:

```bash
curl -sS "$HONUA_URL/api/v1/capabilities/manifest"
```

For the complete Redis-backed durable-job substrate, the source contract expects `jobs.runner` to be available with no `reasonCode`, and `limits.job.durableJobRuntimeAvailable` to be `true`. Confirm those fields and the request path you intend to use in your deployment.

If the manifest still reports a partial runtime, do not submit durable work. Correct the missing dependency or entitlement identified by the response first.

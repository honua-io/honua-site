---
type: runbook
title: "Docker Compose: when Redis is missing or not entitled"
description: "What the two Redis refusals mean on a Compose install, which one you have, and the fix for each, without treating a missing licence as a missing Redis."
resource: "https://honua.io/docs/guides/deploy/docker-compose/"
tags: ["shape:runbook", "task:docker-compose", "protocol:docker-compose", "capability:caching.redis", "capability:ops.health", "audience:operator"]
generated: "2026-10-19"
---

# Docker Compose: when Redis is missing or not entitled

What the two Redis refusals mean on a Compose install, which one you have, and the fix for each, without treating a missing licence as a missing Redis.

A typed refusal from the server links here through its `remediationRef`. Two different links land on this page, one per section below, and they need different fixes. This page projects the Redis sections of [`docs/guides/deploy/docker-compose.md`](https://github.com/honua-io/honua-server/blob/393987ccf2/docs/guides/deploy/docker-compose.md) and the remediation strings in `CapabilityUnavailableCodes.cs`, honua-server commit `393987c`. The rest of that guide (TLS edge, backup and restore, upgrade and rollback) is not on this site yet. Steps marked unvalidated were not run against a deployment for this page.

## Tell the two refusals apart

Read the refusal body before changing anything. Both carry the capability-unavailable problem type `https://honua.io/problems/capability-unavailable` and name the capability they block, usually `jobs.runner` or `operations.proposals`.

- `code: dependency-unavailable` with `missingDependency: redis`: the server has no Redis connection. Go to "Redis is optional; PostGIS is not".
- `code: license-required` with `missingEntitlement: caching.redis` and no `missingDependency`: Redis is configured but the licence does not include it. Go to "Redis is configured but not entitled".

The capability manifest at `GET /api/v1/capabilities/manifest` reports the same thing ahead of time: `operations.proposals` and `jobs.runner` show `available: false` with `reasonCode` `dependency-unavailable` or `license-required`. The [install playbook](../../../playbooks/install-with-docker/index.md) walks through reading it on a fresh install.

## Redis is optional; PostGIS is not

PostGIS holds the catalog, layer metadata and feature data, and the server needs it. Redis is optional for serving: without it a host still serves every protocol, and the admin API and Console still connect sources, import, publish layers, configure services, style and render.

Redis is required for the control plane's proposals, approvals and durable work. Without it the server refuses these with `dependency-unavailable` naming `redis`:

- operation proposals and approvals (`/api/v1/admin/proposals`, `honua_propose_*`), including any operation whose policy decision is "require approval";
- typed operations invoked through MCP (the `honua_admin_*` tools);
- durable geoprocessing jobs and workflows (`jobs.runner`);
- Studio drafts.

Two operations still run without Redis when the policy allows the caller: publishing a service (`service.publish`) and applying a style preset (`style.apply-preset`). They return a handle with `durable: false` that cannot be polled afterwards. If their policy decision is "require approval", they are refused like the rest, because approval needs a stored proposal.

"Required" means configured, entitled and connected. It does not mean a particular persistence policy. The server reads the Redis policy at startup and reports it in the manifest as `limits.job.redisDurability.status` (`attested`, `unverified` or `not-durable`); that status never turns `jobs.runner` off. A stock `redis:7` reports `not-durable`, and a Redis restart can then lose recent proposals and job state.

### Add Redis

Unvalidated — verify against your deployment. The server's own remediation for this refusal reads:

```text
Set ConnectionStrings__Redis to a reachable Redis instance and restart the server. With the repository compose files, drop the '-f docker-compose.no-redis.yml' override and run 'HONUA_DEV_GRANT_EDITION=Pro docker compose up -d' again (or install a licence that includes 'caching.redis'); PostGIS-backed metadata state is preserved.
```

On the quickstart's single-file `compose.yaml`, Redis is four entries: `ConnectionStrings__Redis` on the server, the `honua.depends_on.redis` entry, the `redis` service and the `redis` volume. Restore whichever were removed, keep one server instance until Redis is back, and restart through your normal change process. `HONUA_DEV_GRANT_EDITION=Pro` is a development grant, not a Production licence; adding Redis without the entitlement turns this refusal into the one in the next section.

## Redis is configured but not entitled

Installing Redis does not grant the features that use it. Durable jobs, workflows, queued imports, proposals and shared coordination need both a Redis connection and the `caching.redis` licence entitlement. Configuring Redis again changes nothing here: it is already there.

### Install the entitlement

Unvalidated — verify against your deployment. The server's own remediation for this refusal reads:

```text
Redis is configured but the Pro 'caching.redis' entitlement is not active, so the durable job substrate was not composed. Install a licence that includes 'caching.redis'; outside Production you can instead set Licensing:DevGrantEdition=Pro (HONUA_DEV_GRANT_EDITION=Pro for the repository compose files). Restart the server after either change.
```

Do not add the development grant to a Production deployment. If a Redis volume already holds job or workflow state, keep it.

## Confirm the fix

Unvalidated — verify against your deployment. After the restart, read the manifest from the running server instead of assuming the restart took, and read it as the caller who will submit the work. An anonymous caller gets the public view, in which `jobs.runner` reports `reasonCode: insufficient-policy` whatever the Redis state. The [install playbook's manifest check](../../../playbooks/install-with-docker/index.md#read-back-what-this-install-can-do) does this with the JavaScript SDK.

`reasonCode` is omitted when a capability is available, so look for `jobs.runner` and `operations.proposals` with `available: true` and no `reasonCode`, and for `limits.job.durableJobRuntimeAvailable: true`. If a reason code is still there, it names what is still missing; fix that before submitting durable work.

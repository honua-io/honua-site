---
type: guide
title: "Deploy with Docker Compose"
description: "Take a single-node Compose install to production: a TLS edge, backups you have restored from, and a rollback path."
resource: "https://honua.io/docs/guides/deploy/docker-compose/"
tags: ["shape:guide", "task:docker-compose", "audience:operator"]
generated: "2026-10-23"
---

# Deploy with Docker Compose

This is the **single-node** path: one host you administer, running Compose. It covers what the quickstart leaves out — terminating TLS in front of it, taking backups you have actually restored from, and upgrading without losing the database.

**Deploying to a cloud account instead?** That path is [honua-iac](https://github.com/honua-io/honua-iac) — public Terraform modules for ECS/Fargate, Lambda, Azure Container Apps, Azure Functions, EKS and AKS. See [Deploy on AWS and Azure](../cloud-deployments/index.md) to pick a pattern, then [the operator deployment guide](https://github.com/honua-io/honua-iac/blob/trunk/docs/operator-deployment.md) to stand it up. Nothing below applies to those; they do not use Compose.

**Start from the [quickstart](https://github.com/honua-io/honua-server/blob/trunk/docs/get-started/quickstart.md).** It gives you the `compose.yaml`, the `.env` and a published layer in about ten minutes, on any machine that runs Docker; everything here assumes that project directory and adds to it. For a locked-down single-host install with startup and recovery checks scripted, see [Linux](https://github.com/honua-io/honua-server/blob/trunk/docs/get-started/linux-packages.md) or [Windows](https://github.com/honua-io/honua-server/blob/trunk/docs/get-started/windows-packages.md).

Commands are `bash`, with a collapsed PowerShell equivalent wherever the two differ. `dc` is shorthand throughout:

```bash
Install="$PWD"                      # the quickstart project directory
dc() { docker compose --env-file .env -f compose.yaml "$@"; }
```

Compose 2.23.1 or later is required. Nothing here needs a repository checkout, a compiler, or a registry credential.

## Redis is optional; PostGIS is not

PostGIS owns the catalog, layer metadata and feature data and is required.

Without Redis, a host still serves every protocol, and the admin REST API and Console still connect sources, import, publish layers, configure services, style and render. It cannot persist the following:

- typed operations invoked through MCP (the `honua_admin_*` tools), whose durable operation record is also Redis-backed in Production;
- durable geoprocessing jobs and workflows (`jobs.runner`);
- Studio drafts.

A server without Redis still serves, configures, styles and renders, so two operations execute directly without Redis: publishing a service (`service.publish`) and applying a style preset to a published layer (`style.apply-preset`).

When `Operations:Policy` allows the caller (an `admin` or `scoped-admin-key` role, such as an `admin:write` API key), `honua_publish_service`, `honua_apply_style_preset` and `POST /api/v1/operations/{service.publish|style.apply-preset}/submit` make the change and return the usual handle: `operationId`, `operationInstanceId`, `correlationId`, `auditId`, `status`, `policyOutcome` and `authorizationOutcome`. The audit log records the acceptance and the completion.

`honua_render_map` and the OGC styles endpoints are reads and do not use the operation runtime. A caller the policy denies gets a `Denied` handle.

The capability manifest (`GET /api/v1/capabilities/manifest`) tells it in advance which ones will refuse: `operations.proposals` and `jobs.runner` report `available: false` with `reasonCode: "dependency-unavailable"` (or `"license-required"` when Redis is configured but not entitled).

**What "required" means: present and working, not a proven durability policy.**

The control plane and durable jobs need Redis to be configured, entitled and connected. They do not need a particular persistence policy (owner ruling, 2026-10-10). At startup the server still reads the Redis policy (`appendonly`, `appendfsync`, `maxmemory-policy`) and publishes the result in the capability manifest as `limits.job.redisDurability.status`. The value is `attested`, `unverified` (the policy could not be read, as on managed Redis that blocks `CONFIG`) or `not-durable` (the policy was read and is not durable). The result never disables `operations.proposals` or `jobs.runner`.

A Redis started with `--appendonly yes --appendfsync everysec --maxmemory-policy noeviction` keeps proposals and job state across restarts and reports `attested`. A stock `redis:7` image also works. The manifest then reports `not-durable`, and a Redis restart can lose recent proposals and job state. If you would rather the server refuse to start unless the policy is `attested`, set `Jobs__RequireDurableStore=true` (see [Redis durability](https://github.com/honua-io/honua-server/blob/trunk/docs/guides/deploy/troubleshooting.md#redis-durability)).

### Redis is configured but not entitled

Redis is included with persistent storage, but installing Redis does not grant paid features. Durable jobs, workflows, queued imports, proposals and shared coordination need both Redis configuration and the applicable `caching.redis` licence entitlement. Do not add a development edition grant to a Production deployment.

To omit Redis, remove `ConnectionStrings__Redis`, the `honua.depends_on.redis` entry, the `redis` service and the `redis` volume declaration from `compose.yaml`. Keep a single server instance. Restore those four entries and provide the appropriate licence before enabling durable operations. A persisted Redis volume must be retained if it already contains job or workflow state.

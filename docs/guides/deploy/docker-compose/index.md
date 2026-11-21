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

## Durable administration requires the system database

PostGIS owns the catalog, layer metadata and feature data and is required. Its system database (`ConnectionStrings__DefaultConnection`) also holds the approval control plane and durable jobs: operation proposals and approvals, operation records, geoprocessing jobs and their queue, imports, workflow runs and schedules, and tile and export jobs. There is no separate cache or queue service to run, back up or upgrade.

A host whose primary data source is DuckDB or MySQL has no system database and, in any environment other than Development or Test, refuses to start, because the service and layer catalog is stored only in the PostgreSQL/PostGIS system database.

A Development or Test host started without a system database still serves every protocol, and the admin REST API and Console still connect sources, publish layers, configure services, style and render. It refuses the following with a typed `dependency-unavailable` refusal naming `system-database`:

- operation proposals and approvals (`/api/v1/admin/proposals`, `honua_propose_*`), including any operation whose policy decision is "require approval";
- typed operations invoked through MCP (the `honua_admin_*` tools);
- durable geoprocessing jobs and workflows (`jobs.runner`);
- Studio drafts.

Two operations still execute directly on such a host: publishing a service (`service.publish`) and applying a style preset to a published layer (`style.apply-preset`). Their handle carries `durable: false` and cannot be polled afterwards.

The approval tools are still advertised on such a host, so an agent sees the same catalog everywhere. The capability manifest (`GET /api/v1/capabilities/manifest`) tells it in advance which ones will refuse: `operations.proposals` and `jobs.runner` report `available: false` with `reasonCode: "dependency-unavailable"`.

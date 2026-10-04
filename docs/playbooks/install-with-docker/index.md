---
type: playbook
title: "Install Honua locally with Docker"
description: "Bring the stack up with Docker Compose, then read back what this particular install can and cannot do before asking it for anything."
resource: "https://honua.io/docs/playbooks/install-with-docker/"
tags: ["shape:playbook", "task:install-with-docker", "protocol:docker-compose", "capability:ops.health", "capability:discovery.capability-manifest", "capability:caching.redis", "surface:cli"]
generated: "2026-08-28"
---

# Install Honua locally with Docker

Bring the stack up with Docker Compose, then read back what this particular install can and cannot do before asking it for anything.

The same compose file produces two very different servers depending on whether Redis is composed, and the difference is not visible from the outside. Reading the capability manifest is how you tell them apart, and the typed refusal is what the server says when you get it wrong.

## Before you start

Docker with Compose v2, `git`, Python 3 (the repository's credential script and the readiness check), and Node.js 20 or later with `npm` (the capability check). PostGIS, Redis and the server all come out of the compose file, and migrations run on first boot. The stack publishes ports 8080 and 8081 (the server), 5432 (PostgreSQL) and 6379 (Redis) on `127.0.0.1`; if one is taken, set `HONUA_HTTP_PORT`, `HONUA_GRPC_PORT`, `POSTGRES_PORT` or `REDIS_PORT` before starting.

```bash
git clone https://github.com/honua-io/honua-server.git && cd honua-server
```

Name the server image you are installing. Without it, Compose builds `honua-server:local` from this checkout, which is not the release. For 2026.1 the image is the `image` value under `components.honua-server` in the release's [platform lock](https://github.com/honua-io/honua-release/blob/trunk/platform-manifest.yaml). Then create this install's credentials:

```bash
export HONUA_SERVER_IMAGE=<RELEASE_SERVER_IMAGE>
python3 scripts/docker/quickstart.py --init-only
```

`--init-only` writes per-install PostgreSQL and object-store passwords to a private `.env` beside the compose file and starts nothing. Compose refuses to start without them, and a rerun never rotates them, so keep `.env` with your volumes.

2026.1 ships with licensing disabled: no licence file, no edition grant, every catalog entitlement active. The server's own default is still licensing enabled, so tell the container. Save this beside `docker-compose.yml` as `compose.licensing-disabled.yml`:

<!-- doc-run: file=compose.licensing-disabled.yml -->
```yaml
services:
  honua:
    environment:
      Licensing__Mode: Disabled
```

## Bring the stack up

Two shapes from one compose file. Pick one — it decides half of what follows.

### With Redis

```bash
docker compose -f docker-compose.yml -f compose.licensing-disabled.yml up -d --wait
docker compose ps
```

Starts `postgres`, `redis` and `honua`, and returns once every container reports healthy. HTTP/1 REST and gRPC-Web listen on `http://localhost:8080`, native h2c gRPC on `http://localhost:8081`. The compose file binds both to `127.0.0.1` by default, because the dev admin password in it is a public placeholder.

### Without Redis

```bash
docker compose -f docker-compose.yml -f docker-compose.no-redis.yml -f compose.licensing-disabled.yml up -d
```

Keep the no-Redis override ahead of `compose.licensing-disabled.yml`: when a later file also sets the server's `environment`, Compose keeps `ConnectionStrings__Redis` instead of removing it. `--wait` is left off because the override drops the server's dependency on the one-shot `storage-init` container, and Compose then reports that container's normal exit as a failure ([honua-server#5419](https://github.com/honua-io/honua-server/issues/5419)). The readiness check below does the waiting instead.

The override composes the same stack as PostGIS and the server only, with `ConnectionStrings__Redis` unset. Redis is optional; PostGIS is not — every catalog, service, layer, style and metadata record lives in PostGIS, and the server will not start without it.

## Wait for it to be ready

With Redis, `--wait` returns when each container's own health check passes; the server's is its liveness probe. Readiness is a separate probe, and the Python SDK reads it, retrying while the server starts. Install it in a virtual environment (`.venv` is ignored by the checkout):

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install honua-sdk==0.1.12
```

```python
import time
from honua_sdk import HonuaClient, HonuaError

client = HonuaClient("http://localhost:8080")
deadline = time.monotonic() + 180
while True:
    try:
        print(client.readiness())
        break
    except HonuaError:
        if time.monotonic() > deadline:
            raise
        time.sleep(2)
```

It prints:

```text
{'raw': 'Ready'}
```

`Ready` is the whole body, as `text/plain`, which the SDK hands back under `raw`. The liveness probe is `/healthz/live` and answers `Healthy` with `200`; an admin-authorized `/healthz/metrics` sits beside them. Those three are the only probes — there is no `/readyz` and no `/livez`, so do not guess at one. Any method other than `GET` on any of the three returns `405` with an `Allow: GET` header.

A no-Redis install reports `Ready` exactly like a full one. Readiness is not a statement about which features are composed.

## Read back what this install can do

The JavaScript SDK reads the capability manifest. Install it into the checkout without touching any manifest (`node_modules` is ignored):

```bash
npm install --no-save @honua/sdk-js@0.1.12
```

Save this as `manifest.mjs`:

<!-- doc-run: file=manifest.mjs -->
```js
import { HonuaClient } from '@honua/sdk-js';
import { createHonuaControlPlane } from '@honua/sdk-js/control-plane';

const client = new HonuaClient({ baseUrl: 'http://localhost:8080', apiKey: 'quickstart-admin-password' });
const controlPlane = createHonuaControlPlane({ client });
const result = await controlPlane.getCapabilityManifest();
if (!result.supported) throw new Error('this server does not serve the capability manifest');
const manifest = result.value;
console.log(JSON.stringify(manifest.capabilities.find((capability) => capability.id === 'jobs.runner')));
console.log('durableJobRuntimeAvailable:', manifest.limits.job.durableJobRuntimeAvailable);
```

```bash
node manifest.mjs
```

The manifest is `GET /api/v1/capabilities/manifest`. `quickstart-admin-password` is the root compose file's development admin password (`HONUA_ADMIN_PASSWORD` overrides it). Authentication is optional, but an anonymous caller gets the public view, in which `jobs.runner` answers `"reasonCode": "insufficient-policy"` because an anonymous caller may not run jobs. Read it as the caller who will submit them. It is computed per request and served `no-store`, so no stale claim survives a restart.

Two places in that document decide whether a job submission will be accepted. First, the `jobs.runner` entry:

```json
{ "id": "jobs.runner", "category": "jobs", "supported": true, "available": false,
  "reasonCode": "dependency-unavailable", "messageKey": "capabilities.jobs.runner.dependency-unavailable" }
```

`supported` says the build has the feature; `available` says this deployment can execute it now. `reasonCode` is omitted entirely when a capability is available, so its presence is the signal — do not read it as an empty string.

Second, `limits.job.durableJobRuntimeAvailable`, the second line `manifest.mjs` prints. That flag is the AND of both halves of the job substrate: a durable job store **and** a runnable queue. A store without a queue would let a submission be persisted and then never drain, so a partial substrate reports `false` rather than `true`. Its siblings under `limits.job` are `configuredWorkloadCount`, `availableBackendCount`, `supportsCancellation` and `supportsProgressPolling`.

> `jobs.runner` is a capability-manifest id, and the manifest ids and the licensing capability keys are still two vocabularies — it resolves in neither `capability-keys.v1.json` nor this site's capability catalog, so it is named here as a string instead of linked as a concept. [Track the unification here](https://github.com/honua-io/honua-server/issues/3408).

## Expect a typed refusal, not a timeout

Where a capability is not available, the server refuses the request up front rather than accepting work it cannot finish. Every refusal is `503` with the problem type `https://honua.io/problems/capability-unavailable` and the title `Capability unavailable`, and carries `code`, `capability`, `missingDependency`, `missingEntitlement`, `remediation` and `remediationRef`. Branch on `code`; never on the message.

Two causes, one code:

- **No Redis at all** — `"code": "dependency-unavailable"`, `"missingDependency": "redis"`, `"capability": "jobs.runner"`, and a `remediationRef` of `https://docs.honua.io/guides/deploy/docker-compose#redis-is-optional-postgis-is-not`.
- **A store with no queue** — `"code": "dependency-unavailable"` with `"missingDependency": "job-queue"`.

With licensing disabled no entitlement is missing, so the `license-required` refusal does not occur on a 2026.1 install.

The same refusal is projected onto every job surface rather than being re-invented per protocol: RFC 7807 extension members on OGC API - Processes and the admin API, `error.details[]` entries on the GeoServices GPServer facade, `isError: true` with `code` and `retryable: false` on MCP, extra `ows:ExceptionText` lines on WPS 2.0, and `Unavailable` plus `honua-error-code` / `honua-capability` / `honua-remediation-ref` trailing metadata on gRPC. `capability` is omitted where no manifest id covers the refused surface — today that is the proposal and approval control plane.

## Turn durable jobs on

With licensing disabled, durable jobs need Redis and nothing else; there is no edition grant to set. If you started without Redis, drop the no-Redis override, start again and re-read the manifest:

```bash
docker compose -f docker-compose.yml -f compose.licensing-disabled.yml up -d --wait
node manifest.mjs
```

`jobs.runner` should come back `"available": true` with no `reasonCode`, and `limits.job.durableJobRuntimeAvailable` should be `true`.

This is safe in either direction. Redis holds only job, workflow, proposal and cache state, so adding or dropping it never touches anything PostGIS holds.

## Next

- [Run a bounded geoprocessing job](../run-a-bounded-gp-job/index.md) — the first thing that will refuse if you skipped step 5.
- [Publish a service from a datasource](../publish-a-service/index.md) — the read path, which works on either shape.
- [Run a geoprocessing job](../../geoprocessing/index.md) — the capability slice, with the SDK surfaces.
- Capability keys touched here: [ops.health](../../../evidence-ops-health.html), [discovery.capability-manifest](../../../evidence-discovery-capability-manifest.html), [caching.redis](../../../evidence-caching-redis.html).

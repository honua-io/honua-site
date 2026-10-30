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

The same server image produces two very different servers depending on whether Redis is composed, and the difference is not visible from the outside. Reading the capability manifest is how you tell them apart, and the typed refusal is what the server says when you get it wrong.

## Before you start

Docker with Compose v2, Python 3.11 or later (`honua-sdk` 0.1.19 for the readiness check), and Node.js 22.12.0 or later with `npm` (`@honua/sdk-js` 0.2.10 for the capability check). Those two versions are the client packages the 2026.1 release manifest pins; newer registry versions are not part of the release. PostGIS, Redis and the server all come out of the compose file below. Migrations run when the server first starts. On an existing database the server holds contract migrations, the ones that drop or rename schema objects, until an operator explicitly approves them, and a server image that includes the schema-reader check refuses to start on a schema with migrations it does not recognize, so qualify the image you would roll back to. See [Upgrade and roll back](https://github.com/honua-io/honua-server/blob/trunk/docs/guides/deploy/upgrade-and-rollback.md). Nothing is cloned, and the file does not build `honua-server:local`. The file publishes port 8080 on the host. PostgreSQL and Redis stay on the compose network. If 8080 is taken, stop the other listener before starting.

2026.1 runs with licensing disabled: no licence file, no edition grant, every catalog entitlement active. The server's own default is still licensing enabled, so the compose file sets `Licensing__Mode` to `Disabled`. Do not set `Licensing__DevGrantEdition`.

Name the server image you are evaluating. The 2026.1 release is not yet cut. Choose a public server image from [GitHub Packages](https://github.com/honua-io/honua-server/pkgs/container/honua-server) and copy its digest-qualified `ghcr.io/honua-io/honua-server@sha256:...` reference into `<CANDIDATE_SERVER_IMAGE>` below. A nightly image is a preview, not a qualified customer release. Then generate this install's admin password and connection-encryption key (the key must be at least 32 characters; `token_hex(32)` is 64):

```bash
export HONUA_SERVER_IMAGE="<CANDIDATE_SERVER_IMAGE>"
export HONUA_ADMIN_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
export HONUA_MASTER_KEY="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
```

Stay in this shell. [Publish a service from a datasource](../publish-a-service/index.md) and [Run a bounded geoprocessing job](../run-a-bounded-gp-job/index.md) export `KEY` from this `HONUA_ADMIN_PASSWORD`. Their fallback, `quickstart-admin-password`, is only the default in the repository root compose file, which binds to `127.0.0.1` and is not a file this page starts. It does not open this install.

## Bring the stack up

Two shapes. Pick one — it decides whether durable jobs can run. Each file is complete, and both use Compose project `honua` with the named volume `honua-pgdata` for PostGIS. Do not start both: they publish the same host port. Switching from one file to the other reattaches that volume; it does not create a second database.

The `honua` service sets `platform: linux/amd64`. 2026.1 qualifies x86_64 only. An arm64 host runs that child under emulation and is not a supported 2026.1 topology.

### With Redis

Save this as `compose.with-redis.yml`:

<!-- doc-run: file=compose.with-redis.yml -->
```yaml
name: honua
services:
  db:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_USER: honua
      POSTGRES_PASSWORD: honua
      POSTGRES_DB: honua
    volumes:
      - honua-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -U honua -d honua"]
      interval: 3s
      timeout: 3s
      retries: 30

  redis:
    image: redis:7.4-alpine
    command: ["redis-server", "--appendonly", "yes", "--maxmemory", "64mb", "--maxmemory-policy", "noeviction"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 3s
      timeout: 3s
      retries: 30

  honua:
    platform: linux/amd64
    image: ${HONUA_SERVER_IMAGE:?Set HONUA_SERVER_IMAGE to a digest-qualified server image}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      ASPNETCORE_ENVIRONMENT: Development
      ConnectionStrings__DefaultConnection: Host=db;Port=5432;Database=honua;Username=honua;Password=honua
      ConnectionStrings__Redis: redis:6379
      HONUA_ADMIN_PASSWORD: ${HONUA_ADMIN_PASSWORD:?Set HONUA_ADMIN_PASSWORD}
      Security__ConnectionEncryption__MasterKey: ${HONUA_MASTER_KEY:?Set HONUA_MASTER_KEY}
      Licensing__Mode: Disabled
      HostValidation__AllowedHosts: "*"
      AllowedHosts: "*"
    ports:
      - "8080:8080"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- --header=\"X-API-Key: $${HONUA_ADMIN_PASSWORD}\" http://localhost:8080/api/v1/admin/license | grep -Eq '\"mode\"[[:space:]]*:[[:space:]]*\"disabled\"'"]
      interval: 5s
      timeout: 5s
      retries: 60
      start_period: 20s

volumes:
  honua-pgdata:
```

```bash
docker compose -f compose.with-redis.yml up -d --wait
docker compose -f compose.with-redis.yml ps
```

Starts `db`, `redis` and `honua`, and returns once every container reports healthy. The server health check reads `/api/v1/admin/license` and requires `"mode": "disabled"`. The `db` health check connects over TCP (`-h 127.0.0.1`). On first start the PostGIS image initialises the database behind a Unix socket only and then restarts; a socket probe would report healthy during that window, and the server's migrations, which connect over TCP, would fail and leave it never ready. HTTP/1 REST and gRPC-Web listen on `http://localhost:8080`. Native h2c gRPC listens on port 8081 inside the compose network and is not published.

### Without Redis

Save this as `compose.no-redis.yml`. It is the same server and PostGIS with `ConnectionStrings__Redis` unset:

<!-- doc-run: file=compose.no-redis.yml -->
```yaml
name: honua
services:
  db:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_USER: honua
      POSTGRES_PASSWORD: honua
      POSTGRES_DB: honua
    volumes:
      - honua-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -U honua -d honua"]
      interval: 3s
      timeout: 3s
      retries: 30

  honua:
    platform: linux/amd64
    image: ${HONUA_SERVER_IMAGE:?Set HONUA_SERVER_IMAGE to a digest-qualified server image}
    depends_on:
      db:
        condition: service_healthy
    environment:
      ASPNETCORE_ENVIRONMENT: Development
      ConnectionStrings__DefaultConnection: Host=db;Port=5432;Database=honua;Username=honua;Password=honua
      HONUA_ADMIN_PASSWORD: ${HONUA_ADMIN_PASSWORD:?Set HONUA_ADMIN_PASSWORD}
      Security__ConnectionEncryption__MasterKey: ${HONUA_MASTER_KEY:?Set HONUA_MASTER_KEY}
      Licensing__Mode: Disabled
      HostValidation__AllowedHosts: "*"
      AllowedHosts: "*"
    ports:
      - "8080:8080"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- --header=\"X-API-Key: $${HONUA_ADMIN_PASSWORD}\" http://localhost:8080/api/v1/admin/license | grep -Eq '\"mode\"[[:space:]]*:[[:space:]]*\"disabled\"'"]
      interval: 5s
      timeout: 5s
      retries: 60
      start_period: 20s

volumes:
  honua-pgdata:
```

<!-- doc-run: skip reason="the no-Redis stack binds host port 8080, which the Redis stack this walk already starts" -->
```bash
docker compose -f compose.no-redis.yml up -d --wait
docker compose -f compose.no-redis.yml ps
```

Redis is optional; PostGIS is not. Every catalog, service, layer, style and metadata record lives in PostGIS, and the server will not start without it. The rest of this walk uses the Redis file.

## Wait for it to be ready

`--wait` returns when each container's own health check passes; the server's is the licence-mode probe above. Readiness is a separate probe, and the Python SDK reads it, retrying while the server starts.

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install honua-sdk==0.1.19
```

```python
import os
import time
from honua_sdk import HonuaClient, HonuaError

client = HonuaClient(f"http://localhost:{os.environ.get('HONUA_HTTP_PORT', '8080')}")
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

The JavaScript SDK reads the capability manifest. Install it beside the compose file:

```bash
npm install --no-save @honua/sdk-js@0.2.10
```

Save this as `manifest.mjs`:

<!-- doc-run: file=manifest.mjs -->
```js
import { HonuaClient } from '@honua/sdk-js';
import { createHonuaControlPlane } from '@honua/sdk-js/control-plane';

const client = new HonuaClient({
  baseUrl: `http://localhost:${process.env.HONUA_HTTP_PORT || '8080'}`,
  apiKey: process.env.HONUA_ADMIN_PASSWORD || 'quickstart-admin-password',
});
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

The manifest is `GET /api/v1/capabilities/manifest`. The shell above generated `HONUA_ADMIN_PASSWORD`; the client reads that value. `quickstart-admin-password` is only the fallback when the variable is unset. Authentication is optional, but an anonymous caller gets the public view, in which `jobs.runner` answers `"reasonCode": "insufficient-policy"` because an anonymous caller may not run jobs. Read it as the caller who will submit them. It is computed per request and served `no-store`, so no stale claim survives a restart.

Two places in that document decide whether a job submission will be accepted. First, the `jobs.runner` entry:

<!-- doc-run: skip reason="one manifest entry as a no-Redis install reports it; what manifest.mjs prints depends on which stack shape the reader started" -->
```json
{ "id": "jobs.runner", "category": "jobs", "lifecycle": "implemented", "optInRequired": false,
  "supported": true, "available": false, "reasonCode": "dependency-unavailable",
  "messageKey": "capabilities.jobs.runner.dependency-unavailable" }
```

`supported` says the build has the feature; `available` says this deployment can execute it now. `reasonCode` is omitted entirely when a capability is available, so its presence is the signal — do not read it as an empty string.

Second, `limits.job.durableJobRuntimeAvailable`, the second line `manifest.mjs` prints. That flag is the AND of both halves of the job substrate: a durable job store **and** a runnable queue. A store without a queue would let a submission be persisted and then never drain, so a partial substrate reports `false` rather than `true`. Its siblings under `limits.job` are `configuredWorkloadCount`, `availableBackendCount`, `supportsCancellation` and `supportsProgressPolling`.

> `jobs.runner` is a capability-manifest id, and the manifest ids and the licensing capability keys are still two vocabularies — it resolves in neither `capability-keys.v1.json` nor this site's capability catalog, so it is named here as a string instead of linked as a concept. [Track the unification here](https://github.com/honua-io/honua-server/issues/3408).

## Expect a typed refusal, not a timeout

Where a capability is not available, the server refuses the request up front rather than accepting work it cannot finish. Every refusal is `503` with the problem type `https://honua.io/problems/capability-unavailable` and the title `Capability unavailable`, and carries `code`, `capability`, `missingDependency`, `missingEntitlement`, `remediation` and `remediationRef`. Branch on `code`; never on the message.

Two causes, one code:

- **No Redis at all** — `"code": "dependency-unavailable"`, `"missingDependency": "redis"`, `"capability": "jobs.runner"`, and a `remediationRef` of `https://honua.io/docs/guides/deploy/docker-compose/#redis-is-optional-postgis-is-not`.
- **A store with no queue** — `"code": "dependency-unavailable"` with `"missingDependency": "job-queue"`.

With licensing disabled no entitlement is missing, so the `license-required` refusal does not occur on a 2026.1 install.

The same refusal is projected onto every job surface rather than being re-invented per protocol: RFC 7807 extension members on OGC API - Processes and the admin API, `error.details[]` entries on the GeoServices GPServer facade, `isError: true` with `code` and `retryable: false` on MCP, extra `ows:ExceptionText` lines on WPS 2.0, and `Unavailable` plus `honua-error-code` / `honua-capability` / `honua-remediation-ref` trailing metadata on gRPC. `capability` is omitted where no manifest id covers the refused surface — today that is the proposal and approval control plane.

## Turn durable jobs on

With licensing disabled, durable jobs need Redis and nothing else; there is no edition grant to set. If you started without Redis, stop those containers without deleting volumes and start the Redis file. This walk already started Redis, so that switch is the other shape:

<!-- doc-run: skip reason="the no-Redis project is not running in this walk; stopping it and starting Redis would only repeat the stack already up" -->
```bash
docker compose -f compose.no-redis.yml down
docker compose -f compose.with-redis.yml up -d --wait
```

Re-read the manifest from the Redis stack:

```bash
docker compose -f compose.with-redis.yml up -d --wait
node manifest.mjs
```

`jobs.runner` should come back `"available": true` with no `reasonCode`, and `limits.job.durableJobRuntimeAvailable` should be `true`.

Both files name the project `honua` and mount PostGIS data on `honua-pgdata`. `down` without `-v` keeps that volume, and the next `up` attaches the same database instead of starting a second one. The other direction is the same pair of commands swapped. Redis holds only job, workflow, proposal and cache state, and that state is dropped when the Redis container is removed. The catalog in PostGIS stays. The stop section below is the one that passes `-v` and deletes `honua-pgdata`.

## Stop the stack

```bash
docker compose -f compose.no-redis.yml down -v
docker compose -f compose.with-redis.yml down -v
```

## Next

- [Run a bounded geoprocessing job](../run-a-bounded-gp-job/index.md) — the first thing that will refuse if you skipped Redis.
- [Publish a service from a datasource](../publish-a-service/index.md) — the read path, which works on either shape.
- [Run a geoprocessing job](../../geoprocessing/index.md) — the capability slice, with the SDK surfaces.
- Capability keys touched here: [ops.health](../../../evidence-ops-health.html), [discovery.capability-manifest](../../../evidence-discovery-capability-manifest.html), [caching.redis](../../../evidence-caching-redis.html).

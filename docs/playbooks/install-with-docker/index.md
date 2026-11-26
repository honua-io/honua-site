---
type: playbook
title: "Install Honua locally with Docker"
description: "Bring the PostGIS-backed stack up with Docker Compose, then read back what this particular install can and cannot do before asking it for anything."
resource: "https://honua.io/docs/playbooks/install-with-docker/"
tags: ["shape:playbook", "task:install-with-docker", "protocol:docker-compose", "capability:ops.health", "capability:discovery.capability-manifest", "surface:cli"]
generated: "2026-11-26"
---

# Install Honua locally with Docker

Bring the stack up with Docker Compose, then read back what this particular install can and cannot do before asking it for anything. For customer-operated AWS production installs, use the [AWS CloudFormation Launch Stack guide](../../guides/deploy/aws-launch-stack/index.md) (ECS Fargate `x86_64`).

For your application's first data request, use [gRPC and cloud-native files](../../guides/native-first/index.md): gRPC for authenticated live queries and edits, with gRPC-Web through a client such as Connect in the browser. Public, read-heavy data belongs in PMTiles, GeoParquet or COG over HTTP range requests through your CDN because gRPC is not CDN-cacheable. Protect private files with signed URLs and regenerate exports when source data changes. The guide shows the browser setup and customer-operated file delivery; OGC API and GeoServices REST are compatibility paths for existing clients. The HTTP checks below configure and inspect the server's control plane.

Honua 2026.1 is zero-Redis and PostGIS-only. PostGIS holds the catalog, services, layers, styles, durable job queues, execution logs, workflows, and coordination records. Reading the capability manifest is how you verify what this install can execute before submitting work, and a typed refusal is what the server returns when a capability is unavailable.

## Before you start

Docker with Compose v2, Python 3.11 or later (`honua-sdk` 0.3.3 for the readiness check), and Node.js 22.12.0 or later with `npm` (`@honua/sdk-js` 0.5.1 and `@honua/app-platform` 0.5.1 for the capability check). These are the current public packages this example installs; see [client availability](../../../client-compatibility.html). PostGIS and the server both come out of the compose file below. Migrations run when the server first starts. On an existing database the server holds contract migrations, the ones that drop or rename schema objects, until an operator explicitly approves them, and a server image that includes the schema-reader check refuses to start on a schema with migrations it does not recognize, so qualify the image you would roll back to. See [Upgrade and roll back](https://github.com/honua-io/honua-server/blob/trunk/docs/guides/deploy/upgrade-and-rollback.md). Nothing is cloned, and the file does not build `honua-server:local`. The file publishes port 8080 on the host; PostgreSQL stays on the compose network. If 8080 is taken, stop the other listener before starting.

2026.1 runs with licensing disabled: no licence file, no edition grant, every catalog entitlement active. The server's own default is still licensing enabled, so the compose file sets `Licensing__Mode` to `Disabled`. Do not set `Licensing__DevGrantEdition`.

The 2026.1 Release Candidate channel tag is `ghcr.io/honua-io/honua-server:2026.1-rc`. This zero-Redis, PostGIS-only compose file requires **2026.1-rc.2** or later (where durable jobs, workflows, and proposals moved from Redis into PostgreSQL). Until `2026.1-rc` advances from `2026.1-rc.1` (`a4bde4b8`) to `2026.1-rc.2`, running this file against the older `rc.1` image passes readiness while refusing durable jobs (`missingDependency: "redis"`); to run the PostGIS-backed job runtime before the `2026.1-rc` tag advances, set `HONUA_SERVER_IMAGE` to the published RC.2 candidate digest `ghcr.io/honua-io/honua-server@sha256:a084fefa14fd38884c1b12510498d6844f7555f9f29370e037db295a07959613` instead. Generate this install's admin password and connection-encryption key (the key must be at least 32 characters; `token_hex(32)` is 64):

```bash
export HONUA_SERVER_IMAGE="ghcr.io/honua-io/honua-server:2026.1-rc"
# Before 2026.1-rc advances from rc.1 to rc.2, use the published PostGIS-only RC.2 candidate digest instead:
# export HONUA_SERVER_IMAGE="ghcr.io/honua-io/honua-server@sha256:a084fefa14fd38884c1b12510498d6844f7555f9f29370e037db295a07959613"
export HONUA_ADMIN_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
export HONUA_MASTER_KEY="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
```

Stay in this shell. [Publish a service from a datasource](../publish-a-service/index.md) and [Run a bounded geoprocessing job](../run-a-bounded-gp-job/index.md) export `KEY` from this `HONUA_ADMIN_PASSWORD`. Their fallback, `quickstart-admin-password`, is only the default in the repository root compose file, which binds to `127.0.0.1` and is not a file this page starts. It does not open this install.

## Bring the stack up

Save this as `compose.yml`. It uses Compose project `honua` with the named volume `honua-pgdata` for PostGIS. No Redis or separate cache service is required: PostgreSQL backs both the catalog and durable job execution.

The `honua` service sets `platform: linux/amd64`. 2026.1 qualifies `x86_64` only. An `arm64` host runs that container under emulation and is not a supported 2026.1 topology.

<!-- doc-run: file=compose.yml -->
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
    image: ${HONUA_SERVER_IMAGE:?Set HONUA_SERVER_IMAGE to ghcr.io/honua-io/honua-server:2026.1-rc}
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
      # No test: line, so Compose keeps the probe built into the server image
      # (it needs no shell) and only shortens its timings.
      interval: 5s
      timeout: 5s
      retries: 60
      start_period: 20s

volumes:
  honua-pgdata:
```

```bash
docker compose -f compose.yml up -d --wait
docker compose -f compose.yml ps
```

Starts `db` and `honua`, and returns once both containers report healthy. The server health check is the probe built into its image; the Compose file only sets its timings. The `db` health check connects over TCP (`-h 127.0.0.1`). On first start the PostGIS image initialises the database behind a Unix socket only and then restarts; a socket probe would report healthy during that window, and the server's migrations, which connect over TCP, would fail and leave it never ready. HTTP/1 REST and gRPC-Web listen on `http://localhost:8080`. Native h2c gRPC listens on port 8081 inside the compose network and is not published.

## Wait for it to be ready

`--wait` returns when each container's own health check passes; for the server that is its image's built-in probe. The Python SDK then reads readiness, retrying while the server starts.

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install honua-sdk==0.3.3
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

Readiness alone does not tell you which capabilities are available to your credential or configured on this deployment. Check the capability manifest next.

## Read back what this install can do

The JavaScript SDK reads the capability manifest through the control-plane client in `@honua/app-platform`. Install both packages, on the same release line, beside the compose file:

```bash
npm install --no-save @honua/sdk-js@0.5.1 @honua/app-platform@0.5.1
```

Save this as `manifest.mjs`:

<!-- doc-run: file=manifest.mjs -->
```js
import { HonuaClient } from '@honua/sdk-js';
import { createHonuaControlPlane } from '@honua/app-platform/control-plane';

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

<!-- doc-run: skip reason="example manifest entry when the authenticated caller has durable jobs available on PostGIS" -->
```json
{ "id": "jobs.runner", "category": "jobs", "lifecycle": "implemented", "optInRequired": false,
  "supported": true, "available": true }
```

`supported` says the build has the feature; `available` says this deployment can execute it now. `reasonCode` is omitted entirely when a capability is available, so its presence is the signal — do not read it as an empty string.

Second, `limits.job.durableJobRuntimeAvailable`, the second line `manifest.mjs` prints. That flag is the AND of both halves of the job substrate: the PostgreSQL durable job store **and** a runnable queue. A store without a queue would let a submission be persisted and then never drain, so a partial substrate reports `false` rather than `true`. Its siblings under `limits.job` are `configuredWorkloadCount`, `availableBackendCount`, `supportsCancellation` and `supportsProgressPolling`. On this PostGIS-backed compose install, `jobs.runner` returns `"available": true` and `limits.job.durableJobRuntimeAvailable` is `true`.

> `jobs.runner` is a capability-manifest id, and the manifest ids and the licensing capability keys are still two vocabularies — it resolves in neither `capability-keys.v1.json` nor this site's capability catalog, so it is named here as a string instead of linked as a concept. [Track the unification here](https://github.com/honua-io/honua-server/issues/3408).

## Expect a typed refusal, not a timeout

Where a capability is not available (for example, on a deployment without a runnable job backend or with an incompatible substrate), the server refuses the request up front rather than accepting work it cannot finish. Every refusal is `503` with the problem type `https://honua.io/problems/capability-unavailable` and the title `Capability unavailable`, and carries `code`, `capability`, `missingDependency`, `missingEntitlement`, `remediation` and `remediationRef`. Branch on `code`; never on the message.

Common dependency causes use `"code": "dependency-unavailable"`:

- **No system database configured** — `"missingDependency": "system-database"` on deployments where PostgreSQL is not composed for durable control-plane state.
- **A store with no runnable queue** — `"missingDependency": "job-queue"` on a deployment where no compatible job backend can drain queued work.

With licensing disabled no entitlement is missing, so the `license-required` refusal does not occur on a 2026.1 install.

The same refusal is projected onto every job surface rather than being re-invented per protocol: RFC 7807 extension members on OGC API - Processes and the admin API, `error.details[]` entries on the GeoServices GPServer facade, `isError: true` with `code` and `retryable: false` on MCP, extra `ows:ExceptionText` lines on WPS 2.0, and `Unavailable` plus `honua-error-code` / `honua-capability` / `honua-remediation-ref` trailing metadata on gRPC. `capability` is omitted where no manifest id covers the refused surface — today that is the proposal and approval control plane.

## Stop the stack

Run this in the shell that exported `HONUA_SERVER_IMAGE`, `HONUA_ADMIN_PASSWORD` and `HONUA_MASTER_KEY`: the compose file refuses to load without them, even for `down`. `down` without `-v` keeps `honua-pgdata` so the next `up` reattaches the same database; `-v` deletes the volume. From a new shell, change to a directory that holds no compose file and run `docker compose -p honua down -v`, which removes the same containers, network and `honua-pgdata` by project name.

```bash
docker compose -f compose.yml down -v
```

## Next

- [Run a bounded geoprocessing job](../run-a-bounded-gp-job/index.md) — submit, poll, and collect a durable job on this PostGIS-backed stack.
- [Publish a service from a datasource](../publish-a-service/index.md) — register a database table, publish a layer, and verify readback.
- [Run a geoprocessing job](../../geoprocessing/index.md) — the capability slice, with the SDK surfaces.
- Capability keys touched here: [ops.health](../../../evidence-ops-health.html), [discovery.capability-manifest](../../../evidence-discovery-capability-manifest.html).

---
type: playbook
title: "Run a bounded geoprocessing job"
description: "Submit, poll and collect one geoprocessing job over OGC API - Processes, with a deadline on every wait and a typed refusal instead of a job that never drains."
resource: "https://honua.io/docs/playbooks/run-a-bounded-gp-job/"
tags: ["shape:playbook", "task:run-a-bounded-gp-job", "protocol:ogc-api-processes", "capability:process.ogc-api-processes", "capability:process.geoprocessing", "capability:caching.redis", "agent:mcp"]
timestamp: "2026-08-28"
---

# Run a bounded geoprocessing job

Submit, poll and collect one geoprocessing job over OGC API - Processes, with a deadline on every wait and a typed refusal instead of a job that never drains.

Bounded means two things here. The submit either returns a job id or refuses up front — it never accepts work the server cannot finish. And the poll has terminal states and a deadline, so an agent that reaches its attempt limit knows it has run out of time rather than run out of information.

## Before you start

A running server ([install it with Docker](../install-with-docker/index.md)) with durable jobs actually available. Re-read `limits.job.durableJobRuntimeAvailable` from `GET /api/v1/capabilities/manifest` before submitting: `true` means both halves of the job substrate are composed, and it is the cheapest way to avoid the refusal in the last section.

Discovery is anonymous. Execution is not — `POST .../execution` needs an authenticated caller holding `Process.Execute`. Mutating processes additionally need `Process.ExecuteMutatingProcess`, and operator-supplied code additionally needs `Process.ExecuteCustomCode`. The admin password doubles as the `X-API-Key` on a compose install, and the admin role holds the execute grant.

```bash
BASE=http://localhost:8080
KEY=quickstart-admin-password
```

## Find a process

```bash
curl -sS "$BASE/ogc/processes/processes"
curl -sS "$BASE/ogc/processes/processes/geometry.buffer"
```

The base path is `/ogc/processes` — the list is at `/ogc/processes/processes`, which is not a typo. The list holds the `honua-geoprocessing` plan runner plus every catalog process the server projects individually. Processes classified protocol-only or workflow-only are not projected and answer `404 No such process`, so read the list rather than assuming an id from the operations reference.

The description response carries each input with its schema. `geometry.buffer` takes `wkb` (base64-encoded WKB), `srid` and `distance`, all required, plus an optional `geodesic` flag that is rejected at plan validation if you set it to `true`. `distance` is in the input geometry's coordinate units, not metres — for a degree-based SRID it is degrees, so project to a metric CRS first if you want a metric buffer.

## Submit it

```bash
curl -sS -D - -X POST "$BASE/ogc/processes/processes/geometry.buffer/execution" \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: respond-async" \
  -d '{"inputs":{"wkb":"AQEAAABQ/Bhz15pewNDVVuwv40JA","srid":4326,"distance":500}}'
```

That `wkb` is `POINT(-122.4194 37.7749)`.

The execute body has exactly two members: `inputs` and `response`. There is no `mode` field on the wire — asynchronous execution is requested with the `Prefer: respond-async` header, and omitting `Prefer` selects bounded synchronous execution for the fourteen `geometry.*` processes that advertise `sync-execute`. An SDK that takes `mode: 'async'` is translating it into that header for you.

`response` accepts `document` (the default) or `raw`. Raw is synchronous-only and needs exactly one inline value; asking for it on an async submit is a `400`, and any other value is a `501`.

An accepted async submit answers `201 Created` with the job at `Location: {base}/ogc/processes/jobs/{jobId}`, the same id in the body's `jobID`, and `Preference-Applied: respond-async` when you sent the preference. Job ids look like `gp-` followed by a hex string; supplying an idempotency key makes that suffix a hash of the key rather than a fresh GUID, which is what makes a retried submit safe.

## Poll to a terminal state

```bash
curl -sS "$BASE/ogc/processes/jobs/$JOB" -H "X-API-Key: $KEY"
```

The status document carries `processID`, `jobID`, `status`, `message`, `created`, `updated`, `progress` (0–100) and `links`. `type` is always the string `process`.

Five status values, and only these: `accepted`, `running`, `successful`, `failed`, `dismissed`. Three of them are terminal. Loop with a bounded attempt count and stop on `successful`, `failed` or `dismissed` — never on a timer alone.

The OGC surface and the MCP surface spell the same states differently: OGC emits the lowercase values above, while the job record MCP exposes carries the internal `Queued`, `Provisioning`, `Running`, `Succeeded`, `Failed` and `Cancelled`. Match on the surface you are actually reading.

A `results` link appears in `links` only once the job has succeeded, so its presence is a cheaper terminal check than string-matching `status`.

## Collect the results, then dismiss the job

```bash
curl -sS "$BASE/ogc/processes/jobs/$JOB/results" -H "X-API-Key: $KEY"
curl -sS -X DELETE "$BASE/ogc/processes/jobs/$JOB" -H "X-API-Key: $KEY"
```

The results route answers only for terminal jobs, and it distinguishes the failure modes rather than flattening them:

- still running — `404` with type `http://www.opengis.net/def/exceptions/ogcapi-processes-1/1.0/result-not-ready`
- failed — `500` with `.../job-failed`
- dismissed — `410 Gone` with `.../job-dismissed`
- succeeded — `200` with the outputs map, keyed by output name; a `geometry.buffer` job returns `outputFeatureLayer` as `application/geo+json`, and each value is a reference of `id`, `kind`, `title`, `href` and `type`

`GET /ogc/processes/jobs` lists your active jobs, and `DELETE /ogc/processes/jobs/{jobId}` dismisses one. There is a runnable version of this whole loop in the server repo at `samples/gp-local-dev/submit-buffer.sh`, against the `docker-compose.gp-dev.yml` stack.

## The refusal branch

On an install with no durable job runtime, every one of the four job routes refuses immediately rather than accepting a submission that could never drain. The refusal is `503` with the problem type `https://honua.io/problems/capability-unavailable`:

```json
{
  "type": "https://honua.io/problems/capability-unavailable",
  "title": "Capability unavailable",
  "status": 503,
  "code": "dependency-unavailable",
  "capability": "jobs.runner",
  "missingDependency": "redis",
  "remediationRef": "https://docs.honua.io/guides/deploy/docker-compose#redis-is-optional-postgis-is-not"
}
```

Branch on `code`, and treat the whole family as not-retryable: nothing about waiting changes the answer.

- `dependency-unavailable` with `missingDependency: "redis"` — no Redis was configured. Add it and restart.
- `license-required` with `missingEntitlement: "caching.redis"` and no `missingDependency` — Redis is there but the entitlement is not, which is the default shape of the repository quickstart. Adding Redis is not the fix; see [Install Honua locally with Docker](../install-with-docker/index.md).
- `dependency-unavailable` with `missingDependency: "job-queue"` — a store with nothing to drain it.

Do not confuse this with a job that submits successfully and then sits at `accepted` forever. That one is a worker loop that is not draining, not a refusal, and it has no typed payload to branch on — which is precisely why the manifest check in the first section is worth the round trip.

## Over MCP

The plan loop exists over MCP, but not as a one-verb geoprocessing tool. `honua_execute_plan` submits a plan and returns a job id with its `honua://jobs/{jobId}` resource URI; you read that resource with `resources/read` until the status is terminal, then read `honua://jobs/{jobId}/results`, then promote a publishable artifact with `honua_publish_result`. `honua_cancel_job` dismisses, and `honua_list_jobs` enumerates.

Two honest limits on that path:

> Job status and job results have **no MCP tool** — they are resources only, and the `honua://jobs/*` family sits outside the standard resource vocabulary in `geospatial-mcp`, recorded there as a known gap in its own schema index.

> There is no MCP verb that runs `geometry.buffer` directly. The standard analysis names — `buffer_features`, `overlay_features`, `summarize_statistics`, `reproject_features`, `join_features`, `export_dataset` — are all registered with no reference tool behind them, so the route is a hand-built plan through `honua_execute_plan`. The slice page calls the MCP surface for this capability absent for exactly that reason — [track it here](https://github.com/honua-io/honua-server/issues/3269).

## Next

- [Run a geoprocessing job](../../geoprocessing/index.md) — the capability slice, with the JavaScript, Python and .NET surfaces.
- [Publish a service from a datasource](../publish-a-service/index.md) — where a produced layer goes next.
- [Install Honua locally with Docker](../install-with-docker/index.md) — if the refusal branch is the one you landed on.
- Capability keys touched here: [process.ogc-api-processes](../../../evidence-process-ogc-api-processes.html), [process.geoprocessing](../../../evidence-process-geoprocessing.html), [caching.redis](../../../evidence-caching-redis.html).

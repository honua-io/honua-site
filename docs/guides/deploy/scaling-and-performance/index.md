---
type: guide
title: "Scale and tune performance"
description: "You'll size the database admission limits, configure caching, scale Honua horizontally, and tune outbound HTTP resilience."
resource: "https://honua.io/docs/guides/deploy/scaling-and-performance/"
tags: ["shape:guide", "task:scaling-and-performance", "audience:operator"]
generated: "2026-10-23"
---

# Scale and tune performance

You'll size the database admission limits, configure caching, scale Honua horizontally, and tune outbound HTTP resilience.

**Prerequisites:** A running deployment and access to its environment variables. Confirm effective values at runtime with `GET /api/v1/admin/config` (admin auth).

## Caching layers

- Edge / CDN — Tiles, public read endpoints — Recommended in production; honor `TileOptions__CacheMaxAge`
- In-memory — Service/layer metadata, output cache, per replica — Automatic; entries retain their configured TTL; bounded by `Cache__MaxEntries`
- Npgsql prepared statements — Query plans — Internal; inspect via `GET /api/v1/admin/performance/database/query-cache/statistics`

Each replica's in-memory cache drops entries at their TTL and evicts entries once it holds `Cache__MaxEntries`. Catalog revision checks refresh metadata across replicas, and output-cache keys include the catalog revision. Other cached values retain their configured TTL.

## Shared state across replicas

- **Durable execution**: PostgreSQL holds shared job queues, execution logs, workflow state, and coordination records. Every participating replica and compatible worker needs access to the shared system database.
- **Output artifacts**: use retained storage accessible to the workers and clients that need the output; a worker's temporary file is insufficient.
- **Catalog consistency**: each replica caches metadata in-process for `Cache__MetadataGraphTtlSeconds` (default 10). Read requests revalidate the active revision with `Cache__MetadataGraphRevalidationSeconds` (default 2, range 0–60). Administrative and mutation requests require the current revision.
- **Caching**: each replica caches metadata and output in memory; the CDN provides the shared edge cache.

A read-replica database connection is not currently supported; all queries use `ConnectionStrings__DefaultConnection`.

## Durable-state capacity and latency

Include job state, execution logs, queued imports, workflow state, and coordination traffic in PostgreSQL capacity planning. Monitor database storage, CPU, active connections, lock waits, and query latency alongside queue depth and worker progress.

When a backlog grows:

1. Identify whether producers, worker failures, polling, database contention, or output storage are limiting progress. Inspect server and worker logs and existing job status before retrying requests.
2. Check database storage and connection headroom, slow queries, and lock waits. Review log and output retention without deleting active job or coordination records.
3. Correct the identified bottleneck through the deployment's managed configuration and infrastructure process. Include shared system state and output artifacts in backup and recovery procedures.
4. Verify that existing jobs resume or reach a terminal outcome and that retained outputs remain retrievable. Confirm recovery with queue depth, worker progress, and database latency.

## Outbound HTTP resilience

Calls to external services (ArcGIS/GeoServer imports, geocoders, key vaults, webhooks) get automatic retries with exponential backoff and per-service circuit breakers. Three profiles exist — `FastApi`, `Standard`, `SlowService` — plus per-service overrides, all tunable under `HttpResilience__`:

```bash
HttpResilience__SlowService__TimeoutSeconds=300
HttpResilience__ServiceOverrides__arcgis-rest__MaxRetryAttempts=5
HttpResilience__ServiceOverrides__geoserver-rest__TimeoutSeconds=240
```

Key knobs per profile/override: `MaxRetryAttempts`, `BaseDelayMs`, `BackoffExponent`, `JitterPercentage`, `CircuitBreakerFailures`, `CircuitBreakDurationSeconds`, `TimeoutSeconds`. Defaults live in `src/Honua.Server/appsettings.HttpResilience.json`. Raise timeouts and retry counts for slow import sources; lower the breaker threshold for flaky webhooks so failures fail fast.

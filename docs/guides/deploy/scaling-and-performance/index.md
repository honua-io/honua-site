---
type: guide
title: "Scale and tune performance"
description: "You'll size the database admission limits, add Redis-backed caching, scale Honua horizontally, and tune outbound HTTP resilience."
resource: "https://honua.io/docs/guides/deploy/scaling-and-performance/"
tags: ["shape:guide", "task:scaling-and-performance", "audience:operator"]
generated: "2026-10-23"
---

# Scale and tune performance

You'll size the database admission limits, add Redis-backed caching, scale Honua horizontally, and tune outbound HTTP resilience.

**Prerequisites:** A running deployment and access to its environment variables. Confirm effective values at runtime with `GET /api/v1/admin/config` (admin auth).

## Caching layers

- Edge / CDN — Tiles, public read endpoints — Recommended in production; honor `TileOptions__CacheMaxAge`
- Redis (shared) — Service/layer metadata, output cache — Set `ConnectionStrings__Redis`; shared across replicas
- In-memory (no Redis configured) — Same surfaces, per replica — Automatic; entries retain their configured TTL
- In-memory outage fallback — Same surfaces, per replica — Controlled by `Cache__EnableFallback` and `Cache__FallbackMaxEntries`
- Npgsql prepared statements — Query plans — Internal; inspect via `GET /api/v1/admin/performance/database/query-cache/statistics`

The default no-Redis `MemoryDistributedCache` index expires with its latest tracked payload deadline. Subsequent writes remove expired membership instead of renewing it for another 30 days. A bounded background sweep also reclaims visited idle indexes and checks older index formats without removing renewed values. Updates from service instances sharing the same local cache backend are serialized together, including maintenance and renewals. The local cache cannot enumerate previously unvisited schema scopes: legacy indexes are checked when their scope is next used, and otherwise retain their existing expiry. Use Redis for shared cache behavior across replicas.

## What needs Redis when multi-node

- **Required**: durable job orchestration (geoprocessing, ETL, tile-cache jobs), queued imports, and workflow runs — the queue, execution logs, and run state are Redis-backed; those endpoints return `503` without it. Enable Redis AOF persistence so queued jobs survive restarts.
- **Strongly recommended**: shared caches (avoids N cold caches and inconsistent invalidation) and shared temporary-file quotas when `FileStorage` is S3/Azure Blob.
- **Catalog consistency**: each replica caches the metadata catalog in-process for `Cache__MetadataGraphTtlSeconds` (default 10). With Redis configured, a catalog write (publishing a service or layer, changing an access policy) is broadcast on the `<Cache__KeyPrefix>metadata:v2:graph:invalidations` pub/sub channel (`honua:metadata:v2:graph:invalidations` by default) so every replica drops its copy immediately; without Redis, other replicas can serve the previous catalog until the TTL expires.
- **Not needed**: plain read/query traffic on a single node — in-memory fallback is fine.

A read-replica database connection is not currently supported; all queries use `ConnectionStrings__DefaultConnection`.

## Redis capacity and latency

The Redis cache service sweeps expired payload references from its cache-key indexes every five seconds, including indexes left by earlier processes. Each tick permits at most 16 discovery commands and 128 total commands while draining a discovered index, with at most 128 payload keys per atomic removal. This bounds maintenance work per tick, not total cache cardinality; sustained key creation can exceed cleanup capacity, so monitor Redis memory and index counts during representative traffic. Redis `SCAN COUNT` is a page-size hint and does not impose a strict response-byte limit.

Cache maintenance requires `SCAN`, `SSCAN`, and Lua execution permitting `EXISTS` and `SREM`, in addition to the normal cache read/write commands. Permission or connectivity failures are logged and retried without failing foreground requests. Redis Cluster cache payloads and their index must share a hash tag in the configured storage/key prefix, as required by their existing atomic write transaction; maintenance declares all accessed keys for the same routing rule. The default no-Redis `MemoryDistributedCache` uses the expiry-aware JSON membership and bounded visited-scope maintenance described above. Other `IDistributedCache`-only providers retain the legacy foreground-only JSON index and 30-day expiry: the interface has no cross-process compare-and-swap primitive, so their existing pattern-invalidation index remains best effort. They do not run expiry sweeps or mutate index membership during reads. Use the native Redis path for shared deployments.

Size Redis from observed peak memory, not its empty-instance footprint. Include shared cache keys, durable job state and logs, queued imports, workflow state, persistence overhead, replication buffers, and failover headroom. Alert before the configured maximum leaves too little room for a traffic spike or persistence operation; the example `RedisMemoryHigh` threshold is 90%.

Use `maxmemory-policy noeviction` wherever Redis stores durable jobs or workflow state. An eviction policy such as `allkeys-lru` can make cache pressure silently delete durable state. If cache and durable workloads compete for memory, use separate Redis instances so the cache can use an eviction policy without weakening the durable-job contract. Enable AOF persistence for durable workloads.

When memory is high:

1. Confirm `used_memory`, `maxmemory`, `maxmemory_policy`, fragmentation, key count, and the largest key groups with your managed Redis metrics or `redis-cli INFO memory` and `redis-cli --bigkeys` from an approved operations host.
2. Check whether growth tracks cache churn, queued jobs, import logs, stuck workflows, or a recent TTL/configuration change. Do not run broad key deletion or `FLUSH*` commands; those can destroy active job state.
3. Add memory or move cache traffic to a separate instance before the limit is reached. For cache-only instances, tune TTLs or the eviction policy deliberately. For durable instances, retain `noeviction` and address the producer, backlog, or capacity constraint.
4. After mitigation, verify that durable jobs and imports still progress and that Redis memory returns below the alert threshold.

Treat the example `RedisLatencyHigh` threshold—p99 above 10 ms for five minutes—as a starting budget, then tune it to the managed service, region, and workload. Rising latency first slows shared-cache lookups and invalidation; durable jobs, queued imports, and workflows then accumulate and may time out, while plain reads can fall back to bounded in-memory caching when `Cache__EnableFallback=true`.

For high latency, compare server latency with network round-trip time, CPU, memory pressure, command rate, connection count, persistence/failover events, and large or blocking commands. Confirm recovery with p50/p95/p99 latency plus job-queue depth and cache hit rate.

## Outbound HTTP resilience

Calls to external services (ArcGIS/GeoServer imports, geocoders, key vaults, webhooks) get automatic retries with exponential backoff and per-service circuit breakers. Three profiles exist — `FastApi`, `Standard`, `SlowService` — plus per-service overrides, all tunable under `HttpResilience__`:

```bash
HttpResilience__SlowService__TimeoutSeconds=300
HttpResilience__ServiceOverrides__arcgis-rest__MaxRetryAttempts=5
HttpResilience__ServiceOverrides__geoserver-rest__TimeoutSeconds=240
```

Key knobs per profile/override: `MaxRetryAttempts`, `BaseDelayMs`, `BackoffExponent`, `JitterPercentage`, `CircuitBreakerFailures`, `CircuitBreakDurationSeconds`, `TimeoutSeconds`. Defaults live in `src/Honua.Server/appsettings.HttpResilience.json`. Raise timeouts and retry counts for slow import sources; lower the breaker threshold for flaky webhooks so failures fail fast.

---
type: runbook
title: "Scale and tune performance: cache, Redis and outbound-call alerts"
description: "What the cache hit-ratio, Redis and circuit-breaker alerts in Honua's example Prometheus rules measure, which Honua features depend on Redis, and the response the server's own runbook gives when Redis runs out of memory or slows down."
resource: "https://honua.io/docs/guides/deploy/scaling-and-performance/"
tags: ["shape:runbook", "task:scaling-and-performance", "protocol:prometheus", "capability:caching.redis", "capability:caching.output-cache", "audience:operator"]
generated: "2026-10-20"
---

# Scale and tune performance: cache, Redis and outbound-call alerts

What the cache hit-ratio, Redis and circuit-breaker alerts in Honua's example Prometheus rules measure, which Honua features depend on Redis, and the response the server's own runbook gives when Redis runs out of memory or slows down.

Six alerts in the server's example rule file, [`docs/guides/deploy/examples/prometheus-alerts.yml`](https://github.com/honua-io/honua-server/blob/1e55d67dfc/docs/guides/deploy/examples/prometheus-alerts.yml), carry a `runbook_url` that lands on one of the sections below. This page projects the matching sections of [`docs/guides/deploy/scaling-and-performance.md`](https://github.com/honua-io/honua-server/blob/1e55d67dfc/docs/guides/deploy/scaling-and-performance.md), honua-server commit `1e55d67`. The thresholds quoted here are the ones in that example file. They are a starting point, not a measured budget for your workload. The sizing steps of that guide (database admission, query and tile limits, horizontal scaling) are not on this site yet; the [troubleshooting page](../troubleshooting/index.md#database-connections) carries the pool sizing rule. Steps marked unvalidated were not run against a deployment for this page.

## Caching layers

Alerts that land here: `HonuaCacheHitRatioLow` (`honua_cache_hit_ratio` below 0.8 for 10 minutes, warning) and `HonuaCacheHitRatioCritical` (below 0.5 for 5 minutes, critical).

Honua caches at several layers, and a low hit ratio means different things at each:

- Edge or CDN, in front of tiles and public read endpoints. Recommended in production; it honours `TileOptions__CacheMaxAge`.
- Redis, shared across replicas, for service and layer metadata and the output cache. On when `ConnectionStrings__Redis` is set.
- In-memory, per replica, for the same surfaces when no Redis is configured. Automatic; entries keep their configured TTL. Each replica warms its own copy, so adding replicas without Redis can lower the hit ratio.
- In-memory outage fallback, per replica, while a configured cache backend is down. Controlled by `Cache__EnableFallback` and `Cache__FallbackMaxEntries`.
- Npgsql prepared statements, for query plans. Internal; inspect them at `GET /api/v1/admin/performance/database/query-cache/statistics`.

A drop right after a deploy is usually cold caches: the server's runbook says to watch hit rates on `GET /api/v1/metrics/cache` recover, and to consider warming critical tiles through the CDN.

Unvalidated — verify against your deployment. These are the cache settings the server's guide shows; the values are its example, not a recommendation for your traffic:

```bash
ConnectionStrings__Redis=redis.example.com:6379
Cache__Enabled=true
Cache__DefaultTtlSeconds=300
Cache__EnableFallback=true
Cache__FallbackMaxEntries=5000
Cache__KeyPrefix=honua:prod:
```

`Cache__EnableFallback` only controls fallback during an outage of a configured backend. It does not turn off the normal in-memory cache used when no Redis is configured.

## What needs Redis when multi-node

Alert that lands here: `RedisDown`, `redis_up == 0` for 1 minute (critical). `redis_up` comes from a Redis exporter you run, not from Honua; if the exporter is down, this alert can fire while Redis is fine.

What stops working depends on what Honua uses Redis for:

- Required: durable job orchestration (geoprocessing, ETL and tile-cache jobs), queued imports and workflow runs. Their queue, execution logs and run state live in Redis, and those endpoints return `503` without it. Enable Redis AOF persistence so queued jobs survive a restart.
- Strongly recommended: shared caches, which avoid one cold cache per replica and inconsistent invalidation, and shared temporary-file quotas when `FileStorage` is S3 or Azure Blob.
- Catalog consistency: each replica caches the metadata catalog in-process for `Cache__MetadataGraphTtlSeconds` (default 10). With Redis, a catalog write (publishing a service or layer, changing an access policy) is broadcast on the `<Cache__KeyPrefix>metadata:v2:graph:invalidations` pub/sub channel so every replica drops its copy at once. Without it, other replicas can serve the previous catalog until the TTL runs out.
- Not needed: plain read and query traffic on a single node, where the in-memory cache is fine.

A read-replica database connection is not supported; all queries use `ConnectionStrings__DefaultConnection`.

Unvalidated — verify against your deployment. While Redis is down, expect `503` on job, import and workflow routes and on capability refusals that name `redis`; the [Docker Compose Redis page](../docker-compose/index.md#redis-is-optional-postgis-is-not) explains those refusals. Restore Redis through your platform, then confirm on the [troubleshooting page](../troubleshooting/index.md#quick-triage) that `/healthz/ready` reports `Ready` on every replica, and that queued jobs and imports progress again.

## Redis capacity and latency

Alerts that land here: `RedisMemoryHigh` (`redis_memory_used_bytes / redis_memory_max_bytes` above 0.9 for 5 minutes, warning) and `RedisLatencyHigh` (`redis_latency_percentiles_usec{quantile="0.99"}` above 10000, that is p99 above 10 ms, for 5 minutes, warning). Both read Redis exporter metrics.

Size Redis from observed peak memory, not from an empty instance. Include shared cache keys, durable job state and logs, queued imports, workflow state, persistence overhead, replication buffers and failover headroom.

Use `maxmemory-policy noeviction` wherever Redis holds durable jobs or workflow state. An eviction policy such as `allkeys-lru` lets cache pressure delete durable state without warning. If cache and durable work compete for memory, run them on separate Redis instances, so the cache one can evict without weakening the durable one. Enable AOF persistence for durable work.

The server sweeps expired entries out of its Redis cache-key indexes every five seconds, with at most 16 discovery commands and 128 total commands per tick. That bounds the cleanup work per tick, not the number of keys: sustained key creation can outrun cleanup. Cache maintenance needs `SCAN`, `SSCAN` and Lua scripts that call `EXISTS` and `SREM`, in addition to the normal cache commands. Permission or connection failures there are logged and retried, and do not fail requests.

Unvalidated — verify against your deployment. The server's runbook gives this response when memory is high:

- Confirm `used_memory`, `maxmemory`, `maxmemory_policy`, fragmentation, key count and the largest key groups, from your managed Redis metrics or with `redis-cli INFO memory` and `redis-cli --bigkeys` from an approved operations host.
- Check whether the growth tracks cache churn, queued jobs, import logs, stuck workflows, or a recent TTL or configuration change. Do not run broad key deletion or any `FLUSH*` command; those can destroy active job state.
- Add memory, or move cache traffic to a separate instance, before the limit is reached. On a cache-only instance, tune TTLs or the eviction policy deliberately. On a durable instance, keep `noeviction` and deal with the producer, the backlog or the capacity.
- After mitigating, check that durable jobs and imports still progress and that Redis memory is back below the alert threshold.

Treat the 10 ms p99 latency threshold as a starting budget and tune it to your managed service, region and workload. Rising latency first slows shared-cache lookups and invalidation. Then durable jobs, queued imports and workflows pile up and may time out, while plain reads can fall back to the bounded in-memory cache when `Cache__EnableFallback=true`.

Unvalidated — verify against your deployment. When latency is high, the server's runbook says to compare server latency with network round-trip time, CPU, memory pressure, command rate, connection count, persistence or failover events, and large or blocking commands. Keep Honua and Redis on the same low-latency network, remove noisy or blocking clients, scale Redis up when CPU or bandwidth is saturated, and look at memory pressure before raising application timeouts. Confirm recovery with p50, p95 and p99 latency, job-queue depth and cache hit rate.

## Outbound HTTP resilience

Alert that lands here: `HonuaCircuitBreakerOpen`, any increase in `honua_circuit_breaker_state_changes_total{state="open"}` over 5 minutes. This alert is inert today. No Honua component emits `honua_circuit_breaker_state_changes_total`, so the rule evaluates to nothing and cannot fire on Honua's own metrics. Until it does, circuit-breaker-open errors show up in the server's logs and in failed imports.

Calls from Honua to external services (ArcGIS and GeoServer imports, geocoders, key vaults, webhooks) are retried with exponential backoff, behind a circuit breaker per service. There are three profiles, `FastApi`, `Standard` and `SlowService`, plus per-service overrides, all set under `HttpResilience__`. The settings per profile or override are `MaxRetryAttempts`, `BaseDelayMs`, `BackoffExponent`, `JitterPercentage`, `CircuitBreakerFailures`, `CircuitBreakDurationSeconds` and `TimeoutSeconds`. The defaults are in the server's `src/Honua.Server/appsettings.HttpResilience.json`.

A circuit-breaker-open error on imports means the external source is failing again and again. The server's runbook says to fix the upstream source, or give it more patience through `CircuitBreakDurationSeconds`, rather than turning retries off. Raise timeouts and retry counts for slow import sources; lower the breaker threshold for flaky webhooks so they fail fast.

Unvalidated — verify against your deployment. These are the override examples the server's guide shows:

```bash
HttpResilience__SlowService__TimeoutSeconds=300
HttpResilience__ServiceOverrides__arcgis-rest__MaxRetryAttempts=5
HttpResilience__ServiceOverrides__geoserver-rest__TimeoutSeconds=240
```

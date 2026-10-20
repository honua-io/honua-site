---
type: runbook
title: "Troubleshoot Honua Server: where the shipped alerts send you"
description: "What each alert in Honua's example Prometheus rules measures, what usually causes it, and the response the server's own runbook gives, for error rate, database connections, memory and latency, imports, rate limiting and a down instance."
resource: "https://honua.io/docs/guides/deploy/troubleshooting/"
tags: ["shape:runbook", "task:troubleshooting", "protocol:prometheus", "capability:ops.health", "capability:import.file", "audience:operator"]
generated: "2026-10-20"
---

# Troubleshoot Honua Server: where the shipped alerts send you

What each alert in Honua's example Prometheus rules measures, what usually causes it, and the response the server's own runbook gives, for error rate, database connections, memory and latency, imports, rate limiting and a down instance.

Thirteen alerts in the server's example rule file, [`docs/guides/deploy/examples/prometheus-alerts.yml`](https://github.com/honua-io/honua-server/blob/1e55d67dfc/docs/guides/deploy/examples/prometheus-alerts.yml), carry a `runbook_url` that lands on one of the sections below. This page projects the matching sections of [`docs/guides/deploy/troubleshooting.md`](https://github.com/honua-io/honua-server/blob/1e55d67dfc/docs/guides/deploy/troubleshooting.md), honua-server commit `1e55d67`. The thresholds quoted here are the ones in that example file. They are a starting point, not a measured budget for your workload, and your copy of the rules may differ. The startup, licence, authentication, tiles and Redis-durability tables of that guide are not on this site yet. Steps marked unvalidated were not run against a deployment for this page.

## Quick triage

Alerts that land here: `HonuaErrorRateHigh` (warning, more than 2% for 5 minutes) and `HonuaErrorRateCritical` (critical, more than 5% for 2 minutes). Both divide `honua_request_error_total` by `honua_serving_request_duration_ms_count`, summed per `job` and `instance`, so one unhealthy instance fires on its own even when the rest of the fleet is fine. Start with the `instance` label on the alert.

Unvalidated — verify against your deployment. Open `/healthz/live` and `/healthz/ready` on the affected instance. Both should report `Healthy` and `Ready`. If either fails, the server's runbook starts with startup and database causes; the database ones are under "Database connections" below. Admin-only diagnostics, sent with the admin password in the `X-API-Key` header:

- `GET /monitoring/health/production`
- `GET /monitoring/health/comprehensive`
- `GET /api/v1/admin/observability/errors`

A single-node deployment with no Redis configured reports `Ready`; feature-change events then run in node-local memory, and a startup warning says so. When Redis is configured, every readiness probe needs a working cache write, read and delete. A Redis-related readiness `503` can mean a connection failure, denied cache commands or a read-only Redis endpoint. Check `ConnectionStrings__Redis`, the Redis permissions and Redis itself.

## Database connections

Alerts that land here:

- `HonuaDbPoolUtilizationHigh`: `honua_db_pool_utilization_ratio` above 0.8 for 5 minutes (warning).
- `HonuaDbPoolUtilizationCritical`: the same ratio above 0.95 for 2 minutes (critical).
- `HonuaDbConnectionFailures`: any increase in `honua_db_connection_acquisition_failures_total` over 5 minutes, held for 1 minute (critical).

The server's runbook maps symptoms to causes as follows.

- "Connection refused" with `Host=localhost` inside Docker: the container resolves localhost to itself. Use the compose service name, for example `Host=postgres`.
- Authentication failures in the Postgres logs: a wrong user, password or database. Check each part of `ConnectionStrings__DefaultConnection`.
- `function st_intersects does not exist`: the PostGIS extension is missing. Run `CREATE EXTENSION IF NOT EXISTS postgis;` in that database.
- Timeouts and "connection pool exhausted" in the logs: the pool is saturated. Raise `Limits__Connections__MaxConnectionPoolSize` or `Limits__Connections__MaxConcurrentQueries` in steps, or add replicas with smaller pools; see [Scale and tune performance](../scaling-and-performance/index.md).
- "too many clients already" from Postgres: pool size times replicas is more than the database's `max_connections`. Lower the per-replica pool or raise `max_connections`.

Unvalidated — verify against your deployment. Check connectivity from the server's network with a trivial query, and read the pool state from the admin route `GET /monitoring/metrics/connection-pool`:

```bash
psql -h db.example.com -U honua -d honua -c "SELECT 1;"
```

## Memory and performance

Alerts that land here:

- `HonuaMemoryUsageHigh`: `honua_memory_usage_bytes` above 1.5e9 (about 1.5 GB) for 10 minutes (warning).
- `HonuaMemoryUsageCritical`: the same gauge above 2e9 (about 2 GB) for 5 minutes (critical).
- `HonuaQueryLatencyHigh`: p95 of `honua_database_query_duration_ms_bucket` above 1000 ms for 5 minutes (warning).
- `HonuaQueryLatencyCritical`: the same p95 above 5000 ms for 2 minutes (critical).

The memory thresholds are fixed byte counts in the example file, not a fraction of your container limit. Set them from the memory limit you actually give the server.

The server's runbook maps symptoms to causes as follows.

- Memory climbs with large exports or queries: result sets are buffered per request. Tighten `Limits__Query__MaxRecordCount` and `Limits__Query__MaxOffset`, and prefer paged or streaming clients.
- The container is killed for running out of memory: its limit is below the working set. Inspect `GET /api/v1/metrics/memory` and `GET /monitoring/metrics/resources`, then raise the container memory limit or tighten query and tile limits.
- High latency while the database is healthy: the shared cache is cold or missing. Check hit rates on `GET /api/v1/metrics/cache`, and configure Redis so replicas share caches.
- Slow queries after a bulk load: the planner statistics are stale. Run `ANALYZE` on the affected tables.
- Throughput drops as replicas are added: the database's connection ceiling. Re-run the pool sizing rule, `max_connections >= pool_size × replicas + headroom`.

Unvalidated — verify against your deployment. These are the server runbook's responses; confirm each route and setting on your release before changing limits in production.

## Imports

Alerts that land here: `HonuaUploadQueueDepthHigh` (`honua_upload_queue_depth` above 15 for 5 minutes, warning) and `HonuaUploadQueueFull` (the same gauge at 20 or more for 1 minute, critical). The example rule's own comment says 20 is an assumed maximum queue depth; check the real limit on your deployment before trusting the critical threshold.

The server's runbook maps symptoms to causes as follows.

- An upload is rejected as too large: the file exceeds the configured import limit. Check `GET /api/v1/admin/import/limits`, then split the file or raise the limit.
- An unsupported-format error: the format is not one the importer reads. Check `GET /api/v1/admin/import/formats` and convert the file.
- An import job fails on geometry: invalid geometry or an unsupported CRS in the source. Repair geometries before import (`ST_MakeValid`) and declare the correct source CRS.
- An import is accepted but never progresses: queued imports need Redis. Set `ConnectionStrings__Redis` and make sure Redis is reachable.
- `503` on OGC API - Processes or GPServer job routes: the Redis-backed durable job store is not configured. Enable Redis; see [Scale and tune performance](../scaling-and-performance/index.md#what-needs-redis-when-multi-node).
- The capability manifest reports `jobs.runner` or `operations.proposals` as `dependency-unavailable` although Redis is configured: Redis did not connect at startup. Check the connection string, network path, TLS and credentials, then restart.

Unvalidated — verify against your deployment. Recent import jobs are listed at `GET /api/v1/admin/import/jobs`, and a durable job's detail and logs at `GET /api/v1/admin/jobs/{jobId}/logs`. A Redis refusal links to its own page: [Docker Compose: when Redis is missing or not entitled](../docker-compose/index.md).

## Rate limiting

Alert that lands here: `HonuaRateLimitViolationsHigh`, an increase of more than 100 in `honua_rate_limit_violations_total` over 5 minutes. This alert is inert today. No Honua component emits `honua_rate_limit_violations_total`, so the rule evaluates to nothing and cannot fire on Honua's own metrics. If it fires, something else in your deployment supplies that metric; investigate it at the component that emits it.

Rate limiting belongs at the edge (WAF, API gateway, ingress or load balancer) by default. Honua also has an application limiter that is off unless `RateLimiting__Enabled=true`, and it adds to edge enforcement rather than replacing it. When it is on and a Redis counter fails, each server process falls back to its own fixed-window counters, still answering `429` with `Retry-After`. Those fallback budgets are per process and are not shared between replicas, so keep an edge limit for a fleet-wide ceiling.

Unvalidated — verify against your deployment. The server's runbook gives this response when violations spike:

- Break the metric down by route, tenant, API key, source and edge rule where those labels or logs exist. Confirm the increase is real throttling (`429` responses), not retries or a changed dashboard query.
- Look for one abusive caller, a client retry loop, shared credentials, or a broad rule catching healthy traffic. Compare the spike with request rate, error rate and latency before changing a limit.
- Block or isolate abusive sources, and fix clients that ignore `429` and `Retry-After`. Rotate a compromised API key rather than raising a global ceiling.
- If legitimate sustained traffic is affected, add capacity first, then adjust the narrowest edge policy. Keep separate edge limits for expensive query, tile, import and admin routes. Honua's admin API cannot change route-specific application limits.
- Check the change with a bounded request test, and watch `429`s, latency, saturation and error rates through at least one full limit window. Record the temporary change and its rollback value.

Do not turn rate limiting off during an attack, or raise every caller's limit for one workload. Subject policies changed through the admin rate-limit API live only in the memory of the node that handled the request: other replicas do not see them and a restart drops them. For a fleet-wide change, roll out the deployment configuration or the edge policy to every replica.

## Emergency procedures

Alert that lands here: `HonuaServiceDown`, `up{job="honua-server"} == 0` for 1 minute (critical). It means Prometheus could not scrape the instance named in `{{ $labels.instance }}`, which can be the server or the network path to it. Use these steps when it fires or when normal triage cannot restore readiness. Keep the logs and the failing instance where you can; a restart can erase the best clues.

Unvalidated — verify against your deployment. The server's runbook gives these steps.

- Confirm the scope from outside the cluster or host: `/healthz/live` and `/healthz/ready` on each instance, the load balancer's target state, recent deploys, and database and Redis health. If only one replica is unhealthy, take it out of service while the healthy ones keep serving.
- Stop new traffic, let in-flight requests drain, then restart gracefully through the platform: `docker compose restart honua`, `kubectl -n honua rollout restart deployment/honua-honua` for the supported Helm install, or the equivalent for your release or managed service. Watch the rollout and both health probes before restoring traffic.
- If an instance does not terminate within the platform's grace period, capture its logs and diagnostics, then force-delete only that container or pod. Do not force-restart every replica at once.
- If sessions left by dead instances exhaust the database pool, find them in `pg_stat_activity` by application name, client address, state and age. Terminate only the idle sessions of the failed instance, after putting the address you verified in place of `<failed-client-address>` in the query below and reviewing every matched row. Never terminate active sessions, all sessions, or migration activity.
- Honua has no application-wide maintenance or read-only switch. To stop writes, use an authenticated edge rule that rejects mutation methods and admin mutation routes while keeping health and approved read endpoints open. Setting the database read-only is a last resort for a DBA: migrations, jobs and control-plane writes fail too.
- Escalate when no healthy replica can start, data integrity may be affected, credentials may be compromised, or recovery needs a database failover or restore. Give the incident owner the alert start time, affected routes and tenants, the last good deploy, health responses, relevant logs and traces, and every mitigation already tried.

```sql
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = current_database()
  AND application_name LIKE '%honua%'
  AND client_addr = '<failed-client-address>'::inet
  AND state = 'idle'
  AND backend_type = 'client backend'
  AND pid <> pg_backend_pid();
```

After recovery, restore traffic gradually, confirm readiness on every replica, check that queued jobs and imports progress, and revert any temporary edge, capacity or database changes.

---
type: guide
title: "Troubleshoot Honua Server"
description: "You'll diagnose the most common operational failures by symptom and apply the verified fix."
resource: "https://honua.io/docs/guides/deploy/troubleshooting/"
tags: ["shape:guide", "task:troubleshooting", "audience:operator"]
generated: "2026-10-23"
---

# Troubleshoot Honua Server

You'll diagnose the most common operational failures by symptom and apply the verified fix.

**Prerequisites:** Access to server logs and the admin password (admin endpoints authenticate with the `X-API-Key` header).

## Quick triage

> Open `http://localhost:8080/healthz/live`, `http://localhost:8080/healthz/ready` in a browser.

Expected: `Healthy` and `Ready`. If either fails, start with the startup or database tables below. Admin-only diagnostics: `GET /monitoring/health/production`, `GET /monitoring/health/comprehensive`, `GET /api/v1/admin/observability/errors`.

A single-node deployment whose feature-change events run in node-local in-memory mode still reports `Ready` (a startup warning notes this). Every readiness probe requires a successful write/read/delete round-trip against the in-process cache.

## Database connections

- "Connection refused" with `Host=localhost` in Docker — Container resolves localhost to itself — Use the compose service name, e.g. `Host=postgres`
- Auth failures in Postgres logs — Wrong user/password/database — Verify each part of `ConnectionStrings__DefaultConnection`
- Function `st_intersects` does not exist — PostGIS extension missing — `CREATE EXTENSION IF NOT EXISTS postgis;`
- Timeouts, "connection pool exhausted" logs — Pool saturation — Raise `Limits__Connections__MaxConnectionPoolSize`/`MaxConcurrentQueries` in steps, or add replicas with smaller pools; see [Scale and tune performance](../scaling-and-performance/index.md)
- "too many clients already" from Postgres — `pool_size × replicas` exceeds `max_connections` — Lower per-replica pool size or raise database `max_connections`

Connectivity check: `psql -h db.example.com -U honua -d honua -c "SELECT 1;"` and pool state via `GET /monitoring/metrics/connection-pool` (admin).

## Rate limiting

Rate limiting belongs at the edge (WAF, API gateway, ingress, or load balancer). The shipped security settings also turn on an application limiter (`RateLimiting__Enabled=true`): 1,000 requests per minute for each address the trusted forwarding hop reports, or for each signed-in subject, with tighter query (100), upload (10) and metadata (200) limits. Each task counts separately. A request over a limit receives `429`. An [AWS Launch Stack](../aws-launch-stack/index.md) install sets the same switch and has no parameter for it; its web ACL also blocks above 2,000 requests per IP per five minutes. A web ACL block is a 403. The same web ACL also blocks feature, map and image queries and feature-item reads above 600, edits above 120, sign-in above 120, and geoprocessing above 60, each per IP per five minutes. Browser page loads are challenged above 1,000 in that window, which is not a 403. A companion web ACL can use different figures. The limiter supplements edge enforcement. The `HonuaRateLimitViolationsHigh` example alert is currently **inert** because Honua does not yet emit `honua_rate_limit_violations_total`; if a deployment supplies that metric, investigate it at the component that emits it.

The application limiter counts requests in a fixed window per server node, for both the shared subject limit and any endpoint-specific limit. Counters are not shared between replicas: a limit of N admits up to N requests per window on each node, so with T tasks behind a load balancer a client can reach N×T. Excess requests on a node receive `429` and `Retry-After`. Each process keeps at most 10,000 active subject/endpoint counters. Keep edge enforcement for a fleet-wide ceiling.

When violations spike:

1. Break the metric down by route, API key, source, and edge rule where those labels or logs are available. Confirm that the increase is actual throttling (`429` responses), not retries or a dashboard query change.
2. Check for one abusive caller, a client retry loop, credential sharing, or a broad rule affecting healthy traffic. Correlate the spike with request rate, error rate, and latency before changing a limit.
3. Block or isolate abusive sources and fix clients that ignore `429` and `Retry-After`. Rotate a compromised API key rather than raising a global ceiling.
4. If legitimate sustained traffic is affected, add capacity first, then adjust the narrowest edge policy. Keep separate edge limits for expensive query, tile, import, and admin routes. Honua's admin API cannot change route-specific application limits; those are fixed endpoint metadata.
5. Verify the change with a bounded request test and watch `429`, latency, saturation, and error rates through at least one complete limit window. Record the temporary change and its rollback value.

Do not disable rate limiting during an attack or raise every caller's limit to accommodate one workload. Subject policies (the `api-key`, `tenant`, or `plan` scope) can be inspected and changed through the admin rate-limit API, but they are stored only in memory on the node that handles the request: they are not shared with other replicas and disappear when that node restarts. For a production-wide change, update the coordinated deployment configuration or the edge policy and roll it out across every replica; see the [production checklist](https://github.com/honua-io/honua-server/blob/trunk/docs/guides/secure/production-checklist.md#transport-and-edge).

## Imports

- Upload rejected as too large — File exceeds the configured import limit — Check `GET /api/v1/admin/import/limits`; split the file or raise the limit
- Unsupported format error — Format not in the importer matrix — Check `GET /api/v1/admin/import/formats` and convert
- Import job fails on geometry — Invalid geometry or unsupported CRS in the source — Validate/fix geometries before import (`ST_MakeValid`), declare the correct source CRS
- Import accepted but job never progresses — No job runner is executing on any node — Check `jobs.runner` in `GET /api/v1/capabilities/manifest` and the server log for job execution errors
- `503` on OGC Processes / GPServer job routes — Durable job store not configured — Configure the system database (`ConnectionStrings__DefaultConnection`)
- Capability manifest reports `jobs.runner` or `operations.proposals` with `dependency-unavailable` — The system database is not configured or not reachable — Check `ConnectionStrings__DefaultConnection`, the network path, TLS and credentials, then restart

## Memory and performance

- Memory climbs with large exports/queries — Oversized result sets buffered per request — Tighten `Limits__Query__MaxRecordCount`/`MaxOffset`; prefer paged/streaming clients
- OOM kills in containers — Limit below working set — Inspect `GET /api/v1/metrics/memory` and `GET /monitoring/metrics/resources`; raise the container memory limit or tighten query/tile limits
- High latency, healthy DB — Cold cache after a restart or scale-out — Check `GET /api/v1/metrics/cache` hit rates; each replica warms its own in-process cache
- Slow queries after bulk load — Stale planner statistics — `ANALYZE` the affected tables
- Throughput drops as replicas are added — Database admission ceiling — Re-run pool sizing: `max_connections >= pool_size × replicas + headroom`

## Emergency procedures

Use these steps when `HonuaServiceDown` fires or normal triage cannot restore readiness.

1. Confirm scope from outside the cluster or host. Check `/healthz/live` and `/healthz/ready` on each instance, the load balancer target state, recent deploys, and the database health. If only one replica is unhealthy, remove that replica from service while healthy replicas continue serving.
2. Stop new traffic and let in-flight requests drain, then perform a graceful restart with the deployment platform (`docker compose restart honua`, `kubectl -n honua rollout restart deployment/honua-honua` for the supported Helm installation, or the equivalent release-specific or managed-service action). Watch rollout status and both health probes before restoring traffic.
3. If an instance does not terminate within the platform's grace period, capture its logs and diagnostics, then force-delete only that stuck container or pod. Do not force-restart every replica at once; keep a healthy replica serving whenever possible.
4. If database sessions from dead instances exhaust the pool, identify them in `pg_stat_activity` by application name, client address, state, and age. After replacing `<failed-client-address>` with the address verified in that inspection, terminate only idle sessions belonging to that failed instance:

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

Re-run the identification query and review every matched row before execution. Do not use a broad application-name match alone, and never terminate active sessions, all sessions, or migration activity indiscriminately.

5. Honua has no application-wide maintenance/read-only switch. To prevent writes, use an authenticated edge maintenance rule that rejects mutation methods and admin mutation routes while preserving health and approved read endpoints. Database-level read-only settings are a last-resort DBA action because migrations, jobs, and control-plane writes will also fail.
6. Escalate when no healthy replica can start, data integrity may be affected, credentials may be compromised, or recovery would require a database failover or restore. Give the incident owner the alert start time, affected routes and API keys, last known good deploy, health responses, relevant logs/traces, and every mitigation already attempted.

After recovery, restore traffic gradually, confirm readiness on every replica, verify queued jobs and imports, and revert any temporary edge, capacity, or database changes.

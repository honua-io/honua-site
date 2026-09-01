---
type: guide
title: "Prometheus troubleshooting runbook"
description: "Source-backed response guidance for database, memory, query, error-rate, import, rate-limit, and service-health alerts."
resource: "https://honua.io/docs/guides/deploy/troubleshooting/"
tags: ["shape:guide", "task:prometheus-triage", "audience:operator", "surface:observability"]
timestamp: "2026-09-01"
---

# Prometheus troubleshooting runbook

This page covers the alert rules that target this route. Alert expressions and hold periods below are taken from the shipped Prometheus example. A rule's presence does not prove that its metric is emitted in your deployment.

## Quick triage

`HonuaServiceDown` fires when `up{job="honua-server"} == 0` for 1 minute. `HonuaErrorRateHigh` fires above 2% for 5 minutes; `HonuaErrorRateCritical` fires above 5% for 2 minutes. Both error-rate rules use `honua_request_error_total / honua_serving_request_duration_ms_count` over five minutes.

### Operator response — unvalidated; verify against your deployment

Check the target's scrape status, then compare liveness and readiness before changing configuration:

```bash
curl -sS "$HONUA_URL/healthz/live"
curl -sS "$HONUA_URL/healthz/ready"
```

The server guide identifies `Healthy` and `Ready` as the expected bodies. If liveness is healthy but readiness fails with Redis configured, inspect the configured Redis connection and Redis service. For errors, use request logs and the admin observability error endpoint available in your deployment to identify the failing route before retrying traffic.

## Database connections

`HonuaDbPoolUtilizationHigh` fires above 80% for 5 minutes. `HonuaDbPoolUtilizationCritical` fires above 95% for 2 minutes. `HonuaDbConnectionFailures` fires when connection-acquisition failures increase above zero over five minutes and persist for one minute.

### Operator response — unvalidated; verify against your deployment

Check database reachability, credentials, and the deployment's connection string. The source guide recommends checking pool state through the authenticated connection-pool metrics endpoint. For saturation, change pool and concurrent-query limits gradually, or add replicas with smaller pools; total pool capacity must remain within the database's connection budget.

## Memory and performance

`HonuaMemoryUsageHigh` fires above 1.5 GB for 10 minutes. `HonuaMemoryUsageCritical` fires above 2 GB for 5 minutes. `HonuaQueryLatencyHigh` fires when the 95th percentile of `honua_database_query_duration_ms_bucket` is above 1,000 ms for 5 minutes; the critical rule uses 5,000 ms for 2 minutes.

### Operator response — unvalidated; verify against your deployment

Inspect the deployment's memory and resource metrics, then determine whether large queries, exports, or tiles are buffering excessive data. The source guide recommends tightening record-count and offset limits, preferring paged or streaming clients, and raising a container memory limit only after checking the working set. For slow queries after bulk loading, refresh planner statistics on the affected tables. Do not assume the obsolete `honua_query_duration_ms_bucket` metric exists; the alert uses `honua_database_query_duration_ms_bucket`.

## Imports

`HonuaUploadQueueDepthHigh` fires above a depth of 15 for 5 minutes. `HonuaUploadQueueFull` fires at depth 20 or greater for one minute; the shipped example comments that 20 is an assumed maximum queue depth.

### Operator response — unvalidated; verify against your deployment

Inspect the effective import limits, supported formats, and recent import jobs through the authenticated admin API exposed by your deployment. If accepted jobs do not progress, verify the Redis-backed queue configuration and Redis reachability. Do not raise a queue threshold solely because this example contains 20; verify the actual queue capacity and importer configuration first.

## Rate-limit violations

`HonuaRateLimitViolationsHigh` is an intended alert shape: it would fire when `honua_rate_limit_violations_total` increases above 100 over five minutes and remains there for five minutes. The shipped rule is explicitly inert today because no Honua component emits that metric.

### Operator response — unvalidated; verify against your deployment

Do not treat a quiet rule as proof that no traffic is rate-limited. First confirm whether the deployment emits `honua_rate_limit_violations_total`; if it does, correlate the violating route or principal from deployment telemetry before changing a limit.

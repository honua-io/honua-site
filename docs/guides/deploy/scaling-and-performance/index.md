---
type: guide
title: "Prometheus caching and resilience runbook"
description: "Source-backed response guidance for cache, Redis, and outbound circuit-breaker alerts."
resource: "https://honua.io/docs/guides/deploy/scaling-and-performance/"
tags: ["shape:guide", "task:prometheus-cache-triage", "audience:operator", "surface:observability"]
timestamp: "2026-09-01"
---

# Prometheus caching and resilience runbook

This page covers the shipped Prometheus alerts that point to caching, Redis, and outbound HTTP resilience. Thresholds and hold periods are from the alert example; command and change steps are unvalidated and must be checked against the running deployment.

## Caching layers

`HonuaCacheHitRatioLow` fires when `honua_cache_hit_ratio` is below 80% for 10 minutes. `HonuaCacheHitRatioCritical` fires below 50% for 5 minutes. The deployment guide describes three layers: edge/CDN caching for tiles and public reads, a Redis shared cache for metadata and output caches, and a per-replica in-memory fallback when Redis is unavailable.

### Operator response — unvalidated; verify against your deployment

Inspect cache hit rates from the cache metrics surface exposed by your deployment. Determine whether a cold cache, a missing shared cache, or a cache-key/TTL change explains the drop before changing capacity. For multi-replica deployments, verify that Redis configuration and cache fallback settings match the intended topology; changing cache settings without checking the effective configuration can mask an unavailable shared cache.

## What needs Redis when multi-node

`RedisDown` fires when `redis_up == 0` for one minute. It is critical because Redis backs durable job orchestration, queued imports, and workflow runs; without it those durable endpoints return `503`. Single-node plain read/query traffic can use in-memory fallback, but it is not a shared cache.

### Operator response — unvalidated; verify against your deployment

Confirm the Redis target's health and the configured `ConnectionStrings__Redis` value, then inspect the server capability manifest before resuming durable work. Do not assume readiness alone proves that Redis-backed functions are available: a no-Redis single-node deployment can be ready while durable work is absent. For multi-node recovery, verify replica count, database connection headroom, and Redis persistence policy through the deployment's approved operational process.

## Redis memory and latency

`RedisMemoryHigh` fires when `redis_memory_used_bytes / redis_memory_max_bytes` is above 90% for 5 minutes. `RedisLatencyHigh` fires when the 99th percentile `redis_latency_percentiles_usec` is above 10,000 microseconds for 5 minutes.

### Operator response — unvalidated; verify against your deployment

Inspect Redis memory limits, eviction policy, latency telemetry, and client connection errors in the running deployment. Do not change an eviction policy or memory limit from this example alone; confirm the service's persistence and workload requirements first. If the alert coincides with cache-miss or durable-work failures, establish whether Redis itself is unavailable or merely slow before restarting clients.

## Outbound HTTP resilience

`HonuaCircuitBreakerOpen` is an intended alert shape: it would fire when `honua_circuit_breaker_state_changes_total{state="open"}` increases above zero over five minutes and persists for one minute. The shipped rule is explicitly inert today because no Honua component emits that metric.

The source guide describes retries with exponential backoff and per-service circuit breakers for external imports, geocoders, key vaults, and webhooks. Supported tuning knobs include retry attempts, base delay, backoff exponent, jitter, circuit-breaker failure count and duration, and timeout values.

### Operator response — unvalidated; verify against your deployment

First verify whether the deployment emits the circuit-breaker metric. If it does, identify the external dependency named by its telemetry and investigate the upstream failure before changing resilience policy. For a slow import source, the source guide permits tuning timeout and retry settings; for a flaky webhook it recommends a lower breaker threshold so failures fail fast. Validate the effective `HttpResilience__` profile or override and test any change through the deployment's normal rollout process.

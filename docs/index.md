---
type: index
title: "Honua capability slices"
description: "One page per capability — set it up, use it from an SDK, ask it from an agent — plus the playbooks that run a whole procedure end to end, and the runbook and reference pages the server links to from its own responses."
resource: "https://honua.io/docs/"
tags: ["shape:index", "bundle:honua-capability-slices"]
generated: "2026-08-27"
---

# Honua capability slices

One page per capability. Each page carries the operator setting it up, the developer calling it, and the agent asking about it — and where a surface is missing it says so in one sentence and links the issue.

## Slices

- [Run a geoprocessing job](geoprocessing/index.md) — Over OGC API - Processes, from JavaScript, Python and .NET.

## Playbooks

Whole procedures rather than one capability: the commands in order, the check after each one, and the refusal to expect when a step cannot run here.

- [Install Honua locally with Docker](playbooks/install-with-docker/index.md) — Bring the stack up with Docker Compose, then read back what this particular install can and cannot do before asking it for anything.
- [Publish a service from a datasource](playbooks/publish-a-service/index.md) — Register a database, publish one of its tables as a layer, open it for reading, and confirm it serves — over the admin API, with the file-import and MCP variants of the same path.
- [Run a bounded geoprocessing job](playbooks/run-a-bounded-gp-job/index.md) — Submit, poll and collect one geoprocessing job over OGC API - Processes, with a deadline on every wait and a typed refusal instead of a job that never drains.

## Runbooks

Where the server sends an operator: the `remediationRef` on a typed refusal and the `runbook_url` on a shipped alert rule. Each step not exercised against a running server says so.

- [Cloud deployments: work that cannot run on a frozen host](guides/deploy/cloud-deployments/index.md) — Why a serverless Honua cell refuses managed geoprocessing and hands background file imports to AWS Batch, and what to change when a request is refused.
- [Docker Compose: when Redis is missing or not entitled](guides/deploy/docker-compose/index.md) — What the two Redis refusals mean on a Compose install, which one you have, and the fix for each, without treating a missing licence as a missing Redis.
- [Scale and tune performance: cache, Redis and outbound-call alerts](guides/deploy/scaling-and-performance/index.md) — What the cache hit-ratio, Redis and circuit-breaker alerts in Honua's example Prometheus rules measure, which Honua features depend on Redis, and the response the server's own runbook gives when Redis runs out of memory or slows down.
- [Troubleshoot Honua Server: where the shipped alerts send you](guides/deploy/troubleshooting/index.md) — What each alert in Honua's example Prometheus rules measures, what usually causes it, and the response the server's own runbook gives, for error rate, database connections, memory and latency, imports, rate limiting and a down instance.

## Reference

Contracts the server advertises on the wire, such as the SCIM `documentationUri`.

- [SCIM and SAML IdP conformance matrix](reference/compatibility/idp-conformance-matrix/index.md) — What Honua's SCIM 2.0 provisioning and SAML 2.0 sign-in support against Okta, Entra ID, Auth0 and PingFederate, and what each provider needs configured.

## Elsewhere

- [Documentation home](../docs.html)
- [Capability catalog](../capabilities.html)
- [API reference](../api-reference.html)

---
type: index
title: "Honua capability slices"
description: "One page per capability — set it up, use it from an SDK, ask it from an agent — plus the playbooks that run a whole procedure end to end."
resource: "https://honua.io/docs/"
tags: ["shape:index", "bundle:honua-capability-slices"]
timestamp: "2026-08-27"
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

## Elsewhere

- [Documentation home](../docs.html)
- [Capability catalog](../capabilities.html)
- [API reference](../api-reference.html)

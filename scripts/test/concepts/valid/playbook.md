---
type: playbook
title: Install the server locally
description: Bring the stack up, check it, and read back what it can do.
resource: https://honua.io/docs/playbooks/install/
tags: [shape:playbook, task:install, capability:ops.health]
timestamp: 2026-08-28
---

# Install the server locally

## Bring it up

```
docker compose up -d
```

## Check it

Then read the [slice](geoprocessing.md#use-it) for the SDK surfaces, or come
back to [bringing it up](#bring-it-up).

---
type: runbook
title: "Cloud deployments: work that cannot run on a frozen host"
description: "Why a serverless Honua cell refuses managed geoprocessing and hands background file imports to AWS Batch, and what to change when a request is refused."
resource: "https://honua.io/docs/guides/deploy/cloud-deployments/"
tags: ["shape:runbook", "task:cloud-deployments", "protocol:aws-lambda", "capability:process.geoprocessing", "capability:import.file", "audience:operator"]
generated: "2026-10-19"
---

# Cloud deployments: work that cannot run on a frozen host

Why a serverless Honua cell refuses managed geoprocessing and hands background file imports to AWS Batch, and what to change when a request is refused.

A typed refusal from a serverless cell links here through its `remediationRef`. This page projects the AWS Lambda sections of [`docs/guides/deploy/cloud-deployments.md`](https://github.com/honua-io/honua-server/blob/393987ccf2/docs/guides/deploy/cloud-deployments.md) and the serverless refusal in `CapabilityUnavailableCodes.cs`, honua-server commit `393987c`. Choosing between ECS/Fargate, Lambda, Azure Container Apps and Azure Functions is covered there and in the [honua-iac operator deployment guide](https://github.com/honua-io/honua-iac/blob/trunk/docs/operator-deployment.md), not here. Steps marked unvalidated were not run against a deployment for this page.

## Background file imports run on AWS Batch

A Lambda instance is frozen as soon as it returns a response, so nothing it queued in-process keeps running. That one constraint is why background file imports leave the API function for AWS Batch, and why managed geoprocessing is refused rather than queued.

A managed geoprocessing job that would wait on the host's in-process queue is refused up front, because the loop that would claim it stops when the invocation ends. The refusal is the capability-unavailable problem with `code: dependency-unavailable`, `capability: jobs.runner` and `missingDependency: long-lived-host`. Redis can be present and the refusal still stands: Redis is not what is missing. An operation that completes inside the request, without being added to the queue, is not refused by this check.

Unvalidated — verify against your deployment. The server's own remediation reads:

```text
Run managed geoprocessing on a long-lived host (local Docker or ECS). On this serverless cell, submit a native process so it runs on the GDAL worker. An operation that completes inside the request, without admission to the local job queue, is not refused by this check.
```

## How a background import reaches Batch

The API function never runs a background file import itself. With Redis on and the geoprocessing Batch workload configured (`ControlPlane__ExecutionWorkloads__0__*` with `Backend=honua-aws-batch`), the API stages the upload in file storage and submits a `FileImport` execution job to that Batch queue and job definition. The job runs the generic server image with `HONUA_OPERATION_ID` and `HONUA_JOB_KIND=FileImport`, downloads the staged file, imports it, and exits. `GET /api/v1/admin/import/jobs/{jobId}` then reports `runner: batch` and the Batch job id as `instanceId`. A dedicated `Kind=FileImport` workload takes precedence over the geoprocessing workload when one is configured, and imports larger than about 6 GiB ask for a larger job definition through `batch.ephemeral_gib`.

A Batch worker cannot read the API instance's local disk, so this path needs shared storage on both sides:

- `FileStorage__Provider=AwsS3`, `FileStorage__AwsS3__BucketName` and `FileStorage__AwsS3__Region` (optionally `FileStorage__AwsS3__KeyPrefix`) on the API function and in the job definition's environment;
- `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on that bucket for both the API function's role and the Batch job role (`gp_batch_data_bucket_enabled` and `gp_batch_data_bucket_arn` in the honua-iac `aws-serverless` module);
- Redis on both.

Without Redis, without a Batch workload, or with host-local file storage, the API function refuses a background import with `503 Background import service not available` before it stages anything, and the `import.background` capability reports `runner: unavailable` with `reasonCode` `durable-runner-required` or `shared-file-storage-required`. Imports below the background threshold still run synchronously. On ECS and other long-lived hosts with Redis, background imports run as durable jobs on the server's own workers (`runner: in-process`).

## Check the cell

Unvalidated — verify against your deployment. Read the capability manifest (`GET /api/v1/capabilities/manifest`) as the caller who will submit the work; an anonymous caller gets the public view. On a cell configured for Batch imports, `import.background` should not report `runner: unavailable`; if it does, its `reasonCode` names the missing half. Then run one import above the background threshold and confirm the job reports `runner: batch`.

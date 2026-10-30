---
type: guide
title: "Deploy on AWS and Azure"
description: "You'll pick a managed-cloud deployment pattern for Honua — ECS/Fargate, Lambda, Azure Container Apps, or Azure Functions — and know which image, configuration, and rollout mechanism each one uses."
resource: "https://honua.io/docs/guides/deploy/cloud-deployments/"
tags: ["shape:guide", "task:cloud-deployments", "audience:operator"]
generated: "2026-10-23"
---

# Deploy on AWS and Azure

You'll pick a managed-cloud deployment pattern for Honua — ECS/Fargate, Lambda, Azure Container Apps, or Azure Functions — and know which image, configuration, and rollout mechanism each one uses.

**Prerequisites:** A PostGIS database (RDS or Azure Database for PostgreSQL Flexible Server), the required env vars from [Configure Honua Server](https://github.com/honua-io/honua-server/blob/trunk/docs/guides/deploy/configuration.md) (`ConnectionStrings__DefaultConnection`, `HONUA_ADMIN_PASSWORD`, `Security__ConnectionEncryption__MasterKey`, `Cors__AllowedOrigins__0`), and TLS terminated at the edge (ALB, API Gateway, Front Door) — Honua does not terminate TLS.

**The infrastructure-as-code for every pattern below is [honua-iac](https://github.com/honua-io/honua-iac), and it is public.** Start with its [operator deployment guide](https://github.com/honua-io/honua-iac/blob/trunk/docs/operator-deployment.md) — this page explains *which* pattern to pick and what each one implies; that guide is how you stand one up.

## Background file imports run on AWS Batch

A Lambda instance is frozen as soon as it returns a response, so the API function never runs a background file import itself. With Redis on and the GP Batch workload configured (`ControlPlane__ExecutionWorkloads__0__*`, `Backend=honua-aws-batch`), the API stages the upload in file storage and submits a `FileImport` execution job to that same Batch queue and job definition. The job definition runs the generic server image. The batch backend starts it with `HONUA_OPERATION_ID` and `HONUA_JOB_KIND=FileImport`, so it runs in the execution-worker profile: it downloads the staged file, imports it, and exits. `GET /api/v1/admin/import/jobs/{jobId}` reports `runner: batch` and the Batch job id as `instanceId`. A dedicated `Kind=FileImport` workload takes precedence over the GP workload when one is configured.

A batch worker cannot read the API instance's local disk, so this path needs shared file storage on both the API function and the Batch job definition:

- `FileStorage__Provider=AwsS3`, `FileStorage__AwsS3__BucketName` and `FileStorage__AwsS3__Region` (optionally `FileStorage__AwsS3__KeyPrefix`) on the API function and in the GP job definition's environment;
- `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on that bucket for the API function's role, and the same for the Batch job role (`gp_batch_data_bucket_enabled` and `gp_batch_data_bucket_arn` in the `aws-serverless` module);
- Redis (`ConnectionStrings__redis`) on both, as GP jobs already require.

Without Redis, without a Batch workload, or with host-local file storage, the API function refuses background imports with `503 Background import service not available` before it stages anything. The `import.background` capability reports `runner: unavailable` with `reasonCode` `durable-runner-required` or `shared-file-storage-required`. Imports below the background threshold still run synchronously. On ECS and other long-lived hosts with Redis, background imports run as durable jobs on the servers' own job workers (`runner: in-process`); without Redis they run in the server that accepted the upload.

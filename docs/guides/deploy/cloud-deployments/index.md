---
type: guide
title: "Cloud deployments"
description: "Pick a 2026.1 deployment pattern for Honua — AWS CloudFormation Launch Stack on ECS Fargate is the primary GA architecture, Compose is for local evaluation, Lambda and Kubernetes are Preview, and Azure is not offered."
resource: "https://honua.io/docs/guides/deploy/cloud-deployments/"
tags: ["shape:guide", "task:cloud-deployments", "audience:operator"]
generated: "2026-11-28"
---

# Cloud deployments

Pick a 2026.1 deployment pattern for Honua: **AWS CloudFormation Launch Stack** on ECS Fargate is the primary GA deployment architecture, Docker Compose is for local evaluation, AWS Lambda and Kubernetes/Helm are Preview, and Azure is not offered in 2026.1.

## AWS CloudFormation Launch Stack (GA primary)

The [AWS Launch Stack guide](../aws-launch-stack/) deploys a complete, customer-operated stack in your own AWS account with one native CloudFormation template and no Terraform or separate CI pipeline:

- **Single-node ECS Fargate default, zero Redis:** `Size=Small` and `Availability=Standard` run a single native AOT multi-architecture (`amd64` + `arm64`, `X86_64` default) `honua-server` task with **Redis off**. RDS PostgreSQL 16 with PostGIS stores catalog metadata, durable job queues, leases, progress, and sessions.
- **Static SPA Console (2-mode deployment):** By default, Console deploys as a version-locked static SPA into a private S3 bucket behind CloudFront at `/console/` alongside the server — there is no Console Docker container. Organizations managing multiple Honua instances from one central Multi-Environment Console Hub can disable the per-instance Console via `ConsoleBundleVersion=off`.
- **OIDC primary sign-in with break-glass recovery:** Amazon Cognito (default) or an external OIDC provider handles primary operator sign-in; `AdminCredentialAccess=BreakGlass` enables local `admin` break-glass password sign-in and `X-API-Key` recovery when the identity provider is unavailable.

## Terraform modules and additional targets

**Prerequisites:** A PostGIS database (such as Amazon RDS for PostgreSQL), the required env vars from [Configure Honua Server](https://github.com/honua-io/honua-server/blob/trunk/docs/guides/deploy/configuration.md) (`ConnectionStrings__DefaultConnection`, `HONUA_ADMIN_PASSWORD`, `Security__ConnectionEncryption__MasterKey`, `Cors__AllowedOrigins__0`), and TLS terminated at the edge (CloudFront/ALB or API Gateway) — Honua does not terminate TLS.

Teams standardizing on Terraform can use the public [honua-iac](https://github.com/honua-io/honua-iac) modules (starting with the [operator deployment guide](https://github.com/honua-io/honua-iac/blob/trunk/docs/operator-deployment.md)) for ECS/Fargate or Preview targets such as AWS Lambda and Amazon EKS. Azure is not offered in 2026.1.

## Background file imports run on AWS Batch

A Lambda instance is frozen as soon as it returns a response, so the API function never runs a background file import itself. With the system database and the GP Batch workload configured (`ControlPlane__ExecutionWorkloads__0__*`, `Backend=honua-aws-batch`), the API stages the upload in file storage and submits a `FileImport` execution job to that same Batch queue and job definition. The job definition runs the generic server image. The batch backend starts it with `HONUA_OPERATION_ID` and `HONUA_JOB_KIND=FileImport`, so it runs in the execution-worker profile: it downloads the staged file, imports it, and exits. `GET /api/v1/admin/import/jobs/{jobId}` reports `runner: batch` and the Batch job id as `instanceId`. A dedicated `Kind=FileImport` workload takes precedence over the GP workload when one is configured.

A batch worker cannot read the API instance's local disk, so this path needs shared file storage on both the API function and the Batch job definition:

- `FileStorage__Provider=AwsS3`, `FileStorage__AwsS3__BucketName` and `FileStorage__AwsS3__Region` (optionally `FileStorage__AwsS3__KeyPrefix`) on the API function and in the GP job definition's environment;
- `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on that bucket for the API function's role, and the same for the Batch job role (`gp_batch_data_bucket_enabled` and `gp_batch_data_bucket_arn` in the `aws-serverless` module);
- the system database (`ConnectionStrings__DefaultConnection`) on both, as GP jobs already require.

Without a Batch workload, or with host-local file storage, the API function refuses background imports with `503 Background import service not available` before it stages anything. The `import.background` capability reports `runner: unavailable` with `reasonCode` `durable-runner-required` or `shared-file-storage-required`. Imports below the background threshold still run synchronously. On ECS and other long-lived hosts, background imports use the shared PostgreSQL job store and the servers' own job workers (`runner: in-process`). Configure the system database and shared operation key ring. With multiple tasks, staged files must also be accessible to the task that executes the import.

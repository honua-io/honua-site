---
type: guide
title: "Install Honua in your AWS account (Launch Stack)"
description: "You'll install Honua into your own AWS account with one CloudFormation stack, know what it creates and what AWS charges you for it, and know how to remove it cleanly."
resource: "https://honua.io/docs/guides/deploy/aws-launch-stack/"
tags: ["shape:guide", "task:aws-launch-stack", "audience:operator"]
generated: "2026-11-11"
---

# Install Honua in your AWS account (Launch Stack)

You'll install Honua into your own AWS account with one CloudFormation stack, know what it creates and what AWS charges you for it, and know how to remove it cleanly.

**Who this is for:** [design partners](https://honua.io/design-partners.html). The Launch Stack is how we install Honua with you during step 3 of the programme. Honua sends you a versioned template link and the server image to use; we run the install together on a call.

**Customer-operated.** Everything runs in your AWS account, under your control, on your AWS bill. Honua does not host or operate your install and has no access to it unless you grant it.

## How it works

The Launch Stack is a native AWS CloudFormation template. It creates every resource directly: there is no Terraform, no build pipeline and no nested deployment engine, and it downloads nothing except the container images you choose. You open the link in the CloudFormation console, review the template and parameters, and create the stack.

## Choose a region

- **US East (N. Virginia), `us-east-1`: one stack.** It creates its own CloudFront web ACL (AWS WAF). This is the recommended region for design partners.
- **US East (Ohio), `us-east-2`, or US West (Oregon), `us-west-2`: two stacks.** CloudFront only accepts a web ACL from `us-east-1`, so you first create the companion `waf.yaml` stack **in us-east-1**, then pass its `WebAclArn` output to the main stack in your region.

Other regions are not supported yet: the template relies on CloudFront private VPC origins, which AWS offers only in some regions and Availability Zones.

## Before you start

- **An AWS account you control.** Start with a non-production account. Your user or role needs permission for every service the template uses (VPC, ECS, RDS, S3, CloudFront, WAF, Secrets Manager, CloudWatch, Lambda, AWS Backup and, if enabled, AWS Batch) and to create those services' AWS service-linked roles. You will acknowledge IAM resource creation; the template creates no named IAM roles and no administrator policies.
- **Service quotas** in the target region: Fargate On-Demand vCPU, one Elastic IP and NAT gateway (two with `TwoNatGateways`), RDS instances, CloudFront distributions and VPC origins, and WAF web ACLs. The setup function reserves one Lambda concurrency slot, and AWS keeps 100 unreserved, so the account's Lambda concurrency quota must be at least 101; new accounts often start lower. The CloudFront managed prefix list uses 55 security-group rule units, so keep the default quota of at least 60 rules per direction. Increases are not immediate; request them early.
- **The template link and server image digest from Honua.** The template is larger than the console's inline upload limit, so it is always opened from an HTTPS link.
- **An operation key ring secret** (next section).
- **Your own domain only:** the site sends HSTS with `includeSubDomains`, so if you use a zone apex, confirm that every subdomain already serves HTTPS.

## Create the operation key ring secret

Honua encrypts the credentials of long-running operations with a certificate that you own. Create it once, on a trusted workstation with OpenSSL and the AWS CLI, in the deployment account and region:

```sh
umask 077
mkdir honua-keyring && cd honua-keyring
openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 3650 \
  -subj '/CN=Honua operation key ring' -keyout key.pem -out certificate.pem
openssl pkcs12 -export -inkey key.pem -in certificate.pem -out keyring.p12 -passout pass:
openssl base64 -A -in keyring.p12 -out keyring.txt
aws secretsmanager create-secret --region YOUR_DEPLOYMENT_REGION \
  --name honua-operation-keyring \
  --description 'Honua durable operation key-ring protection' \
  --secret-string file://keyring.txt \
  --query ARN --output text
```

The returned ARN is the `OperationKeyRingSecretArn` parameter. Use the default `aws/secretsmanager` encryption key. Keep an encrypted recovery copy of `keyring.p12` with your database backups, then delete the working files under your organisation's policy. Keep the same certificate through upgrades, scaling and restores: replacing it makes stored operation credentials unreadable. Do the same for the stack's generated connection-encryption secret (the `MasterKeySecret` resource): it protects stored data-source credentials, and AWS Backup does not back up secrets. Never put key material in stack parameters, a Launch Stack link or source control.

## Install

- **Step 1.** **Other regions only:** open the `waf.yaml` link in **us-east-1**, create that stack, and copy its `WebAclArn` output.
- **Step 2.** Open the Launch Stack link Honua sent you. Check that the region in the console header is the one you chose.
- **Step 3.** Fill in the parameters (below). At minimum: `OperationKeyRingSecretArn`, `ServerImageUri` (the digest from Honua) and, outside us-east-1, `WebAclArn`. If the image is in a private Amazon ECR repository, also set `EcrRepositoryArns`.
- **Step 4.** Acknowledge IAM resource creation and create the stack. Wait for `CREATE_COMPLETE`.
- **Step 5.** Update the stack with `LoadBalancerDeletionProtection=true`. It is off for the first create so that a failed create can roll back.
- **Step 6.** Open the `HonuaUrl` output (an `https://…cloudfront.net` address) and check `/healthz/ready`.
- **Step 7.** Read the admin credential from Secrets Manager using the `AdminSecretArn` output, and sign in with the API-key flow. Keep it out of tickets, screenshots and shell history.

## What it creates

- A new VPC across two Availability Zones: two public subnets with one NAT gateway (two with `TwoNatGateways`), two private subnets and restricted security groups. You can reuse an existing VPC instead.
- A CloudFront distribution in front of an **internal** load balancer, reached over a CloudFront private VPC origin. There is no public load balancer, the tasks have no public IP addresses, and the load balancer refuses requests that do not come from your distribution. AWS WAF protects the distribution.
- Honua server tasks on ECS Fargate (1 vCPU, 2 GiB each) with CPU autoscaling between `MinTasks` and `MaxTasks`, deployment rollback and CloudWatch logs.
- An encrypted RDS PostgreSQL 16 database with PostGIS (20 GiB gp3, growing to 100 GiB, seven-day automated backups), single-AZ unless you choose Multi-AZ.
- Versioned, encrypted, private S3 buckets for files and job outputs, and generated secrets for the database, the admin credential and connection encryption.
- A daily AWS Backup plan for the database and files.
- Optionally, AWS Batch capacity on Fargate for managed geoprocessing jobs. Off by default; Batch has no idle charge.
- A small Lambda function that only looks up the CloudFront prefix list and supported Availability Zones and validates your settings. It creates nothing.

There is no Redis and no Console container. Shared state lives in PostgreSQL.

Geoprocessing job outputs are written to task scratch space in this release, not to the job-outputs bucket, so they are lost when a task or job is replaced. Download results you need to keep.

## Parameters

- `OperationKeyRingSecretArn` (required): The secret created above. The stack refuses to start without it.
- `ServerImageUri` (pre-release image): Always set this to the image digest Honua gives you. Running more than one task needs that release image.
- `WebAclArn` (empty): The `waf.yaml` output. Required outside us-east-1; leave empty in us-east-1.
- `NamePrefix` (`honua`): Prefix for resource names.
- `MinTasks` / `MaxTasks` (1 / 1): Autoscaling bounds, 1 to 10.
- `DatabaseClass` (`db.t4g.small`): Also `db.t4g.medium`, `db.t4g.large`, `db.m7g.large`.
- `TwoNatGateways` / `DatabaseMultiAZ` (false / false): Turn on for zonal resilience; both raise the AWS bill.
- `DatabaseDeletionProtection` (true): Turn off only immediately before deleting the stack.
- `LoadBalancerDeletionProtection` (false): Turn on after `CREATE_COMPLETE`; off again before deleting.
- `DomainNames` / `AcmCertificateArn` / `HostedZoneId` (empty): Your own hostnames (up to three). The certificate must be issued in us-east-1. With a Route 53 zone in the same account, the stack creates the DNS records.
- `OidcAuthority` / `OidcClientId` / `OidcClientSecretArn` (empty): Sign-in through your identity provider. Set all three or none. The client secret is a plaintext Secrets Manager secret in the same account and region, encrypted with `aws/secretsmanager`. OIDC on the Launch Stack has not yet been through a live install; we qualify it with you.
- `EnableBatch` / `BatchImageUri` (off / empty): Adds AWS Batch capacity, using the worker image from the same release. Managed geoprocessing jobs still run on the server tasks by default; sending them to Batch needs a reviewed template change, which we make with you. Native GDAL workloads do not run on Batch.
- `ExistingVpcId` / `ExistingPrivateSubnetIds` (empty): Reuse your VPC: two private subnets in different supported Availability Zones, with outbound HTTPS through NAT or VPC endpoints. The VPC needs DNS resolution and DNS hostnames, an attached internet gateway, and enough free private IPv4 addresses for Fargate tasks and the CloudFront VPC origin. The stack never changes your routes, subnets or NAT.
- `ConsoleBundleVersion` (empty): Leave empty for now. Console hosting on the same domain is enabled once its release bundle is published.
- `EnableBackupPlan` / `BackupFrequency` (true / daily): AWS Backup for the database and files.
- `EcrRepositoryArns` (empty): Every private ECR repository your images come from, comma-separated. Required for private ECR images; without it the tasks cannot pull them.
- `WafAllowedCountries` / `WafRateLimit` / `EnableBotControl` (empty / 2000 / false): WAF country allow list, requests per IP per five minutes, and AWS Bot Control (extra charge). Outside us-east-1, set these on the `waf.yaml` stack instead; the main stack rejects them when `WebAclArn` is set.
- `LogRetentionDays` (90): CloudWatch log retention.
- `EnableFlowLogs` (false): VPC flow logs, at extra cost.

## What you pay AWS

AWS bills you directly for the resources in your account. Plan for these charges before you approve the install:

- ECS Fargate tasks, the RDS database, the load balancer and NAT gateways.
- File and object storage, CloudWatch logs, and database and file backups.
- CloudFront traffic, data transfer, and AWS WAF rules and requests.

Your bill depends on the region, resource sizes, traffic and retention settings. Two NAT gateways, a Multi-AZ database, more tasks, Batch jobs, flow logs and optional Bot Control add charges. Estimate your chosen configuration with the [AWS Pricing Calculator](https://calculator.aws/) and monitor the resources in your AWS account.


## Use your own domain

Leave the domain parameters empty to use the CloudFront address. To add a domain later, issue an ACM certificate in **us-east-1** that covers every hostname, update the stack with `DomainNames` and `AcmCertificateArn`, then point each hostname at the `CloudFrontDomain` output (a CNAME, or an alias at the zone apex). With a same-account Route 53 zone, also set `HostedZoneId` and the stack creates the records; in us-east-1 it can also create and validate the certificate for you. If you use OIDC, register `https://YOUR_FIRST_DOMAIN/admin/auth/callback` with your identity provider before the update.

## Upgrade

Take and verify a database snapshot first. Then update the stack with the same template version and the new `ServerImageUri` digest (and the new `BatchImageUri` or `PostgresClientImageUri` when the release notes say they changed), review the change set, and execute it. Database migrations run when the new server starts. Rolling back the image does not roll back a migration, and rollback is supported only to rc.2 or later releases whose migrations allow it, so keep the snapshot until the upgrade is verified.

## Remove the install

- **Step 1.** Drain any running Batch jobs.
- **Step 2.** Save the bucket names, `DatabaseInstanceIdentifier`, `BackupVaultName`, the ECS cluster name and the secret ARNs from the stack's Outputs and Resources. You need them to clean up what is retained.
- **Step 3.** Update the stack with `DatabaseDeletionProtection=false` and `LoadBalancerDeletionProtection=false`.
- **Step 4.** Delete the stack. Outside us-east-1, then delete the `waf.yaml` stack in us-east-1 (always after the main stack).

Compute, networking, the load balancer, CloudFront and WAF are removed. To protect your data, these are **kept and keep billing** until you delete them yourself:

- a final RDS snapshot (find it in RDS Snapshots by the saved database identifier);
- the S3 buckets, including all object versions;
- the generated secrets and your operation key ring secret;
- the AWS Backup vault and its recovery points;
- the application and Batch CloudWatch log groups;
- log groups AWS creates outside the stack, which keep logs indefinitely by default: `/aws/rds/instance/DB_INSTANCE_ID/postgresql`, `/aws/rds/instance/DB_INSTANCE_ID/upgrade` and `/aws/ecs/containerinsights/CLUSTER_NAME/performance`. `LogRetentionDays` does not apply to them; set their retention after install.

Delete them once your recovery and retention obligations are met. Certificates and DNS records the stack created are removed; your own certificates and DNS records are not.

## Troubleshoot

- Start with the stack's **Events** tab. The lookup function writes a short reason and logs to `/honua/YOUR_STACK_NAME/prefix-lookup`.
- **Image pull errors:** check the image URI, its architecture and registry access through the NAT gateway.
- **The server never becomes healthy:** read the application logs (the `ApplicationLogsUrl` output) for database, PostGIS or migration errors before changing health checks.
- **403 from the load balancer:** it received a request without the distribution's secret header. A 403 can also come from a WAF rule, so check the WAF logs first. Do not open the load balancer's security group to the internet.
- **Certificate stuck pending:** check the zone delegation, that the certificate covers every hostname, and CAA records (allow `amazon.com`).

Send stack events and log excerpts to your Honua contact, never secret values.

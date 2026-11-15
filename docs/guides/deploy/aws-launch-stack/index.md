---
type: guide
title: "Install Honua in your AWS account (Launch Stack)"
description: "You'll install Honua into your own AWS account with one CloudFormation stack, know what it creates and what AWS charges you for it, and know how to remove it cleanly."
resource: "https://honua.io/docs/guides/deploy/aws-launch-stack/"
tags: ["shape:guide", "task:aws-launch-stack", "audience:operator"]
generated: "2026-11-15"
---

# Install Honua in your AWS account (Launch Stack)

You'll install Honua into your own AWS account with one CloudFormation stack, know what it creates and what AWS charges you for it, and know how to remove it cleanly.

**Who this is for:** [design partners](https://honua.io/design-partners.html). The Launch Stack is how we install Honua with you during step 3 of the programme. This is a preview install. Honua supplies a versioned template link and compatible server image digest after the release candidate and clean-install checks pass.

**Customer-operated.** Everything runs in your AWS account, under your control, on your AWS bill. Honua does not host or operate your install and has no access to it unless you grant it.

## How it works

The Launch Stack is a native AWS CloudFormation template. With the default settings, it creates resources directly without Terraform or a build pipeline. You open the link in the CloudFormation console, review the template and parameters, and create the stack. The install also fetches the pinned watchdog code once from Honua's template bucket and verifies its SHA-256 checksum before use.

The form opens with one group, **Your install**: `AdminEmail`, an optional `DomainNames` and `OperationKeyRingSecretArn`. That group is most of what you enter. The **Presets** group (`Size`, `Availability`, `Protection`, `IdentityProvider`) and the groups labelled **Advanced** have defaults that install a complete, protected stack untouched. The three **Your install** fields show the parameter name in brackets; every other field is listed by its parameter name, as in this guide. For this preview install you also set `ServerImageUri`, any existing GuardDuty or CloudTrail identifiers from your account check, the certificate for your own domain if you use one and, outside us-east-1, the companion web ACL values and `WatchdogMode=Off` (see Install below).

Keep `Agents=Off` and `AiProvider=None` for this install. Agent preview uses a separate nested template and needs separate install checks and approved inputs before you enable it.

## Choose a region

- **US East (N. Virginia), `us-east-1`: one stack.** It creates its own CloudFront web ACL (AWS WAF). This is the recommended region for design partners.
- **US East (Ohio), `us-east-2`, or US West (Oregon), `us-west-2`: two stacks.** CloudFront only accepts a web ACL from `us-east-1`, so you first create the companion `waf.yaml` stack **in us-east-1**, then pass its `WebAclArn` and `WebAclMetricName` outputs to the main stack in your region. Install the main stack with `WatchdogMode=Off` (see [the watchdog](#the-watchdog)).

Other regions are not supported yet: the template relies on CloudFront private VPC origins, which AWS offers only in some regions and Availability Zones.

## Before you start

- **An AWS account you control.** Start with a non-production account. Your user or role needs permission for every service the template uses (VPC, ECS, RDS, S3, CloudFront, WAF, Secrets Manager, KMS, CloudWatch, SNS, SQS, EventBridge, Systems Manager Parameter Store, Lambda, Cognito, CloudTrail, GuardDuty, AWS Backup and, if enabled, AWS Batch) and to create those services' AWS service-linked roles. You will acknowledge IAM resource creation; the template creates no named IAM roles and no administrator policies.
- **Service quotas** in the target region: Fargate On-Demand vCPU, one Elastic IP and NAT gateway (two with `TwoNatGateways`), RDS instances, CloudFront distributions and VPC origins, and WAF web ACLs. The setup function reserves one Lambda concurrency slot, and AWS keeps 100 unreserved, so the account's Lambda concurrency quota must be at least 101; new accounts often start lower. The CloudFront managed prefix list uses 55 security-group rule units, so keep the default quota of at least 60 rules per direction. Increases are not immediate; request them early.
- **An account protection check before launch.** Identify any existing regional GuardDuty detector and CloudTrail trail with your AWS administrator. Supply their identifiers through `ExistingGuardDutyDetectorId` and `ExistingCloudTrailArn`: creating a second detector fails, and duplicating a trail adds charges. Honua supplies the account preflight with the approved install instructions; the console link cannot run it for you.
- **The template link and server image digest from Honua.** The template is larger than the console's inline upload limit, so it is always opened from an HTTPS link.
- **An operation key ring secret** (next section).
- **An administrator email address and authenticator app.** By default, `IdentityProvider=Cognito` creates sign-in in your AWS account and invites `AdminEmail`. You do not need an existing identity provider. To use your own provider, choose `IdentityProvider=External` and configure the external OIDC parameters below. `AdminEmail` also receives operational alarms and budget notices unless you set a separate `OpsNotificationEmail`.
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

- **Step 1.** **Other regions only:** open the `waf.yaml` link in **us-east-1**, create that stack, and copy its `WebAclArn` and `WebAclMetricName` outputs.
- **Step 2.** Open the Launch Stack link Honua sent you. Check that the region in the console header is the one you chose.
- **Step 3.** Fill in the **Your install** group: `AdminEmail`, `OperationKeyRingSecretArn` and, if you want your own hostname now, `DomainNames` (empty serves the install at its `cloudfront.net` address; you can add a domain later). Also set `ServerImageUri` (in **Advanced: release artifacts**) to the digest from Honua. If your account check found an existing GuardDuty detector or CloudTrail trail, set `ExistingGuardDutyDetectorId` or `ExistingCloudTrailArn` (in **Advanced: protection overrides**). If you set `DomainNames`, also set `AcmCertificateArn`, or `HostedZoneId` in us-east-1 (in **Advanced: DNS, certificate and browser access**; see [Use your own domain](#use-your-own-domain)). Outside us-east-1, also provide `WebAclArn` and `WebAclMetricName` from the companion stack (in **Advanced: protection overrides**) and set `WatchdogMode=Off` (in **Advanced: watchdog**). Keep `IdentityProvider=Cognito` for default sign-in; External mode instead requires `OidcAuthority`, `OidcClientId` and `OidcClientSecretArn`. If the image is in a private Amazon ECR repository, also set `EcrRepositoryArns`. Leave everything else at its default.
- **Step 4.** Acknowledge IAM resource creation and create the stack. Wait for `CREATE_COMPLETE`.
- **Step 5.** Review the stack events and operational outputs. The default `Protection=Contain` enables load-balancer deletion protection from the first create. If creation fails, follow the stack events and the failed-create cleanup procedure below. A failed stack may not support the update used for normal teardown.
- **Step 6.** Open `HonuaUrl` and check `/healthz/ready`. Browser sign-in requires an approved Console bundle uploaded to this installation and a matching `ConsoleBundleVersion`. With the default empty value, Console is disabled and there is no `ConsoleUrl`; this installation cannot yet complete browser sign-in or approvals. Once the bundle is available, follow Honua's upload instructions and open `ConsoleUrl`. With Cognito, use the administrator invitation email's temporary password, choose a new password and enroll an authenticator app; MFA is required. The stack registers `OidcCallbackUrl` automatically. With External mode, register that exact callback with your provider before signing in; for a custom domain it is `https://YOUR_FIRST_DOMAIN/admin/auth/callback`. Sign-in fails until the external provider accepts it.
- **Step 7.** Confirm the AWS notification subscription email sent to `OpsNotificationEmail`, or to `AdminEmail` when that is empty; alarms and budget notices reach nobody until it is confirmed. The credential behind `AdminSecretArn` is for API bootstrap and recovery; it cannot approve agent-proposed changes. Keep it out of tickets, screenshots and shell history.

## What it creates

- A new VPC across two Availability Zones: two public subnets with one NAT gateway (two with `TwoNatGateways`), two private subnets and restricted security groups. You can reuse an existing VPC instead.
- A CloudFront distribution in front of an **internal** load balancer, reached over a CloudFront private VPC origin. There is no public load balancer, the tasks have no public IP addresses, and the load balancer refuses requests that do not come from your distribution. AWS WAF protects the distribution.
- Honua server tasks on ECS Fargate (the Small preset uses 1 vCPU and 2 GiB per task) with CPU autoscaling between `MinTasks` and `MaxTasks`, deployment rollback and CloudWatch logs.
- An encrypted RDS PostgreSQL 16 database with PostGIS (20 GiB gp3, growing to 100 GiB, seven-day automated backups), single-AZ unless you choose Multi-AZ.
- Versioned, encrypted, private S3 buckets for files and job outputs, and generated secrets for the database, the admin credential and connection encryption.
- A daily AWS Backup plan for the database and files.
- A rotating encryption key for application resources and the database. No key input is required; optional application and database key overrides are independent. The stack retains its key when removed, so encrypted data remains recoverable.
- Operational alarms and email notifications, CloudTrail audit logging, and GuardDuty runtime protection. Existing account protection must be identified before launch.
- An independent watchdog, installed by default in `NotifyOnly` mode: a Lambda function outside the server that checks the site once a minute and notifies you when a check fails, without taking any action (see [the watchdog](#the-watchdog)).
- Optionally, AWS Batch capacity on Fargate for managed geoprocessing jobs. Off by default; Batch has no idle charge.
- A lookup Lambda function for the CloudFront prefix list, supported Availability Zones and settings validation.
- With default Cognito sign-in, an administrator-only user pool with mandatory MFA and the Plus plan and threat protection, a hosted sign-in domain, an authorization-code client and an `admin` group. A separate Lambda copies the generated client secret into Secrets Manager; credentials are not sent to Honua.

Shared state lives in PostgreSQL. The optional Console bundle is served on the same domain.

Geoprocessing job outputs are written to task scratch space in this release, not to the job-outputs bucket, so they are lost when a task or job is replaced. Download results you need to keep.

## The watchdog

The watchdog runs in your account, separately from the Honua server, so it can still notify you when the server is down. Every minute it checks the stack's own `cloudfront.net` address, including the uncached `/healthz/deep` database and catalog check, and notifies the same address as the other alarms when a check fails. In `NotifyOnly` it never restarts or changes anything. Because it checks the CloudFront address, a custom domain whose DNS is not set up yet is not reported as an outage.

- **Server image:** `/healthz/deep` needs a server image that has that route. With an older image, the watchdog reports once that it cannot verify the site and then reports no outages until the image is upgraded. Use the image digest Honua gives you.
- **Outside us-east-1:** the watchdog needs a per-stack token in the companion web ACL, which this stack does not create. Install with `WatchdogMode=Off`, and switch to `NotifyOnly` with a stack update after Honua has helped you add the token to that web ACL.
- **Pausing or removing it:** to pause it, use `WatchdogMode=Off` and keep it installed. `EnableWatchdog=false` removes it; the site-down alarm then relies on the public and origin checks, plus edge alarms where they are deployed. Removing it and turning it back on later does not reuse its retained state, so plan that change with Honua.

## Parameters

- `OperationKeyRingSecretArn` (required): The secret created above. The stack refuses to start without it.
- `ServerImageUri` (pre-release image): Always set this to the image digest Honua gives you. Running more than one task needs that release image.
- `WebAclArn` (empty): The `waf.yaml` output. Required outside us-east-1; leave empty in us-east-1.
- `WebAclMetricName` (`HonuaWebAcl`): Copy the companion stack's output of the same name for imported-WAF metric configuration; use the metric output, not the web ACL ARN or resource name. In us-east-1, the stack selects its own metric automatically. Outside us-east-1, the main stack creates no WAF traffic alarms: supplying this parameter does not enable them. The `OpsEdgeAlarmSetup` output calls for a separate `ops-edge.yaml` deployment in us-east-1; arrange that additional operations setup with your Honua contact before relying on edge alarms.
- `NamePrefix` (`honua`): Prefix for resource names.
- `Size` (`Small`): Choose Small, Medium or Large as a starting configuration, then qualify it with your workload. These are planning presets, not measured capacity guarantees.
- `Availability` (`Standard`): One NAT gateway and single-AZ database. `High` uses at least two tasks, two NAT gateways and a Multi-AZ database; it adds AWS charges.
- `MinTasks` / `MaxTasks` (`-1` / `-1`): Follow the preset. Small/Standard starts with one task and permits two. Advanced overrides allow up to ten tasks; zero minimum is for controlled maintenance only.
- `DatabaseClass` / `TaskSize` (`Auto`): Follow `Size`; change only after reviewing capacity and AWS charges.
- `TwoNatGateways` / `DatabaseMultiAZ` (`Auto`): Follow `Availability`; High requires both enabled.
- `OpsNotificationEmail` (empty): A separate mailbox for operational alarms and budget notices. Empty sends them to `AdminEmail`. Required only with `IdentityProvider=External` when `AdminEmail` is empty. Confirm the subscription email after creation.
- `Protection` (`Contain`): Enables protection on install, including managed WAF rules, Bot Control, private service endpoints, flow logs, HSTS preload and load-balancer deletion protection. These services add AWS charges. Watch reduces these controls; Strict also enforces GIS payload rules. Change the preset only through a reviewed stack update. Outside us-east-1, also review the companion WAF stack's protection settings.
- `DatabaseDeletionProtection` (true): Turn off only immediately before deleting the stack.
- `LoadBalancerDeletionProtection` (false): Watch uses this override. Contain and Strict enable protection even when this parameter is false. Before deleting, use an approved update to select Watch and set this parameter to false.
- `DomainNames` / `AcmCertificateArn` / `HostedZoneId` (empty): Your own hostnames (up to three). The certificate must be issued in us-east-1. With a Route 53 zone in the same account, the stack creates the DNS records.
- `IdentityProvider` (`Cognito`) / `AdminEmail` (required with Cognito): Creates sign-in and invites the first administrator, automatically adding them to the `admin` group. Invitations expire after seven days; your AWS administrator can resend them through Cognito. Self-registration is disabled; you create additional administrators and add them to `admin`. `External` uses your existing provider and invites nobody; `AdminEmail` is then only the notification address when `OpsNotificationEmail` is empty.
- `OidcAuthority` / `OidcClientId` / `OidcClientSecretArn`: Required only with `IdentityProvider=External`. Register a confidential authorization-code web client with `openid`, `profile` and `email` scopes. Store its plaintext client secret in Secrets Manager in the same account and region, encrypted with `aws/secretsmanager`. Sign-in remains subject to the recorded clean-install check before partner launch.
- `OidcRoleClaimType` (empty): External mode uses `roles` by default; set your provider's ID-token claim carrying `admin` or `administrator`. Cognito mode automatically uses `cognito:groups`.
- `EnableBatch` / `BatchImageUri` (off / empty): Adds AWS Batch capacity, using the worker image from the same release. Managed geoprocessing jobs still run on the server tasks by default; sending them to Batch needs a reviewed template change, which we make with you. Native GDAL workloads do not run on Batch.
- `ExistingVpcId` / `ExistingPrivateSubnetIds` (empty): Reuse your VPC: two private subnets in different supported Availability Zones, with outbound HTTPS through NAT or VPC endpoints. The VPC needs DNS resolution and DNS hostnames, an attached internet gateway, and enough free private IPv4 addresses for Fargate tasks and the CloudFront VPC origin. The stack never changes your routes, subnets or NAT.
- `ConsoleBundleVersion` (empty): Empty disables Console and omits `ConsoleUrl`. Leave empty until Honua supplies an approved bundle and customer upload instructions; setting a version alone does not upload files. Browser sign-in and approvals require that bundle, a matching version and a compatible server image.
- `EnableBackupPlan` / `BackupFrequency` (true / daily): AWS Backup for the database and files.
- `EnableWatchdog` / `WatchdogMode` (true / `NotifyOnly`): The independent watchdog described above. Set `WatchdogMode=Off` outside us-east-1 until its token is in place. Do not select `Act`; the acting mode is not part of this install.
- `EcrRepositoryArns` (empty): Every private ECR repository your images come from, comma-separated. Required for private ECR images; without it the tasks cannot pull them.
- `WafAllowedCountries` / `WafRateLimit` / `EnableBotControl` (empty / 2000 / false): WAF country allow list, requests per IP per five minutes, and the Watch override for AWS Bot Control (extra charge). Contain and Strict enable Bot Control regardless of this override. Outside us-east-1, set these on the `waf.yaml` stack instead; the main stack rejects them when `WebAclArn` is set.
- `LogRetentionDays` (90): CloudWatch log retention.
- `EnableFlowLogs` (false): Watch uses this override; Contain and Strict enable flow logs regardless. Flow logs add AWS charges.
- `CustomerKmsKeyArn` / `DatabaseKmsKeyArn` (empty): Optional application and database encryption-key overrides. Empty uses the rotating stack key. Review the required service key policies before supplying your own keys; changing the effective database key requires a migration.

## What you pay AWS

AWS bills you directly for the resources in your account. Plan for these charges before you approve the install:

- ECS Fargate tasks, the RDS database, the load balancer and NAT gateways.
- File and object storage, CloudWatch logs, metrics and alarms, and database and file backups.
- KMS encryption, CloudTrail audit records, GuardDuty protection and notification services enabled by the template.
- CloudFront traffic, data transfer, and AWS WAF rules and requests.
- With default sign-in, Cognito Plus user activity and threat protection, and its client-secret Lambda and Secrets Manager storage.
- The watchdog's Lambda invocations, metrics, alarms, logs, probe secret, code storage and WAF rule, unless you remove it (`EnableWatchdog=false`).

Your bill depends on the region, resource sizes, traffic and retention settings. Two NAT gateways, a Multi-AZ database, more tasks and Batch jobs add charges. The default Contain protection also enables private service endpoints, flow logs and Bot Control; Watch can enable these individually. Retained encryption keys and data continue to incur charges after stack deletion. Estimate your chosen configuration with the [AWS Pricing Calculator](https://calculator.aws/) and monitor the resources in your AWS account.

## Use your own domain

Leave the domain parameters empty to use the CloudFront address. To add a domain later, issue an ACM certificate in **us-east-1** that covers every hostname, update the stack with `DomainNames` and `AcmCertificateArn`, then point each hostname at the `CloudFrontDomain` output (a CNAME, or an alias at the zone apex). With a same-account Route 53 zone, also set `HostedZoneId` and the stack creates the records; in us-east-1 it can also create and validate the certificate for you. With External mode, register `https://YOUR_FIRST_DOMAIN/admin/auth/callback` with your identity provider before the update. Cognito mode updates the callback automatically.

## Upgrade

Take and verify a database snapshot first. Then update the stack with the same template version and the new `ServerImageUri` digest (and the new `BatchImageUri` or `PostgresClientImageUri` when the release notes say they changed), review the change set, and execute it. Database migrations run when the new server starts. Rolling back the image does not roll back a migration, and rollback is supported only to rc.2 or later releases whose migrations allow it, so keep the snapshot until the upgrade is verified.

When updating an existing external-provider stack to this template, explicitly set `IdentityProvider=External` to preserve sign-in; existing OIDC values are ignored in Cognito mode. Changing `AdminEmail` replaces the bootstrap user; when `OpsNotificationEmail` is empty it also moves the alarm subscription to the new address, which receives nothing until its owner confirms the new subscription email. Image and Console upgrades preserve the Cognito pool and client, but switching away from Cognito deletes its user directory. Verify administrator access before retiring the old provider, and export needed user metadata first. Stack rollback cannot restore deleted users or passwords.

When you update with the AWS CLI or API, a parameter you leave out takes the template's current default, not your previous value: pass every parameter, using `UsePreviousValue` for those you keep. In particular, an omitted `OpsNotificationEmail` moves alarms to `AdminEmail`, an omitted `EnableWatchdog` installs the watchdog, and an omitted `WatchdogMode` returns it to `NotifyOnly`. In the console, check these values on the parameters page before you continue.

## Remove the install

- **Step 1.** Drain any running Batch jobs. Export any needed Cognito user metadata and plan account recovery: stack deletion removes its user directory and sign-in client.
- **Step 2.** Save the bucket names, `DatabaseInstanceIdentifier`, `BackupVaultName`, the ECS cluster name, encryption-key identifiers and the secret ARNs from the stack's Outputs and Resources. You need them to clean up what is retained.
- **Step 3.** Through an approved stack update, set `Protection=Watch`, `DatabaseDeletionProtection=false` and `LoadBalancerDeletionProtection=false`. Wait for `UPDATE_COMPLETE` and confirm protection is disabled. Contain and Strict keep load-balancer deletion protection enabled even when its override is false.
- **Step 4.** Delete the stack. Outside us-east-1, then delete the `waf.yaml` stack in us-east-1 (always after the main stack).

Compute, networking, the load balancer, CloudFront and WAF are removed. To protect your data, these are **kept and keep billing** until you delete them yourself:

- a final RDS snapshot (find it in RDS Snapshots by the saved database identifier);
- the S3 buckets, including all object versions;
- the generated database, API admin, master, connection-encryption and audit-chain key secrets, and your operation key ring secret. Preserve the audit-chain key while audit rows exist. The Cognito client secret is removed with the stack;
- the stack encryption key and any customer-owned keys. Keep every key needed to decrypt retained snapshots, backups, buckets or secrets; schedule key deletion only after those recovery and retention obligations end;
- the AWS Backup vault and its recovery points;
- the created GuardDuty detector, CloudTrail trail and its bucket and delivery policy. These can protect other workloads, so review their account-wide use before removing them;
- the application, Batch and watchdog CloudWatch log groups. The template retains watchdog log groups even when the watchdog is disabled;
- the watchdog's code bucket and its object versions, its probe secret and its state parameters in Systems Manager Parameter Store;
- log groups AWS creates outside the stack, which keep logs indefinitely by default: `/aws/rds/instance/DB_INSTANCE_ID/postgresql`, `/aws/rds/instance/DB_INSTANCE_ID/upgrade` and `/aws/ecs/containerinsights/CLUSTER_NAME/performance`. `LogRetentionDays` does not apply to them; set their retention after install.

Delete them once your recovery and retention obligations are met. Certificates and DNS records the stack created are removed; your own certificates and DNS records are not.

## Clean up a failed creation

If creation rolls back into `ROLLBACK_FAILED`, inspect the stack's Events and Resources before deleting anything. This state does not support the stack update used in normal teardown; see the [AWS stack status reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/view-stack-events.html#stack-status-codes).

If events identify load-balancer deletion protection as the blocker, find the surviving load balancer's physical ID in Resources. In the EC2 console in the deployment region, select that exact load balancer, open **Attributes**, choose **Edit**, turn off **Deletion protection**, and choose **Save changes**. Apply this recovery change only to the failed install. Follow [AWS's load-balancer attribute instructions](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html#deletion-protection).

Resolve any other resource deletion errors shown in Events, then retry **Delete** on the failed CloudFormation stack. Do not delete resources belonging to another stack or shared account protection. Check the retained-resource list above after cleanup; retained data, keys and backups can still incur charges. Fix the original creation error before launching a replacement stack.

## Troubleshoot

- Start with the stack's **Events** tab. The lookup function writes a short reason and logs to `/honua/YOUR_STACK_NAME/prefix-lookup`.
- **Image pull errors:** check the image URI, its architecture and registry access through the NAT gateway.
- **The server never becomes healthy:** read the application logs (the `ApplicationLogsUrl` output) for database, PostGIS or migration errors before changing health checks.
- **403 from the load balancer:** it received a request without the distribution's secret header. A 403 can also come from a WAF rule, so check the WAF logs first. Do not open the load balancer's security group to the internet.
- **Certificate stuck pending:** check the zone delegation, that the certificate covers every hostname, and CAA records (allow `amazon.com`).

Send stack events and log excerpts to your Honua contact, never secret values.

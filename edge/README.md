# AWS edge hosting for honua.io

GitHub Pages ignores the repository `_headers` file. Production currently goes
directly to GitHub/Fastly, so only GitHub's HSTS response header is live; the
declared CSP, anti-clickjacking, content-type, referrer, and permissions headers
are not served at the HTTP layer. See [issue #38](https://github.com/honua-io/honua-site/issues/38).

## Selected architecture: private S3 + CloudFront

The prepared AWS path keeps the existing static build, publishes `dist/` to a
private versioned S3 bucket, and serves it through a dedicated CloudFront
distribution using Origin Access Control (OAC). CloudFront response-headers
policies are generated for every `_headers` path rule, including the distinct
demo and Excel policies. The distribution uses an ACM certificate issued in
`us-east-1`, redirects HTTP to HTTPS, supports HTTP/2 and HTTP/3, and maps
private-S3 403/404 responses to the checked-in `404.html`.

| File | Purpose |
| --- | --- |
| `header-rules.json` | Provider-neutral generated projection of `_headers`. |
| `cloudfront-site.template.json` | Account-neutral generated CloudFormation for the private bucket, OAC, response policies, cache policy, and distribution. |
| `cloudfront-template.test.mjs` | Regression tests for private-origin, TLS, aliases, errors, and exact path-policy coverage. |
| `production-status.json` | Checked-in production activation switch; currently records GitHub Pages and no live response-header enforcement. |
| `../scripts/deploy-aws-site.sh` | Builds, synchronizes S3, invalidates CloudFront, waits, then requires the live-header gate. |

Regenerate both committed artifacts after editing `_headers`:

```sh
./scripts/build-edge-headers.sh
node scripts/build-cloudfront-template.mjs
```

## Hostnames in scope (decided 2026-08-13)

CloudFront — not GitHub Pages — is the answer for every `honua.io` name that has
to serve a real response header. The decision was forced by two things Pages
cannot do at all: it ignores `_headers`, and it cannot express `frame-ancestors`
in either direction, which is what the capability-slice docs need in order to
frame samples safely (honua-site#215, honua-samples#41).

| Host | Origin | Distribution | State |
| --- | --- | --- | --- |
| `honua.io`, `www.honua.io` | this repo's `dist/` in private S3 | the stack below | prepared, not activated (#38) |
| `docs.honua.io` | same bucket, `/docs` prefix | **same distribution, added alias** | not built; needs the alias, the cert SAN, and a host rewrite (#231) |
| `samples.honua.io` | `honua-samples` build | **its own stack** | Pages today; separate stack because it is a different repo, build, and deploy job (honua-samples#41) |
| `demo.honua.io` | API Gateway | existing `E88FYGJVRJF6L` | live; **must not be reused or modified** |

Two consequences worth stating before anyone requests a certificate:

- **The certificate must cover `docs.honua.io` from the start.** ACM certificates
  are immutable — adding a name later means requesting and validating a new
  certificate and updating the distribution. Step 1 of the runbook below already
  includes the SAN.
- **`docs.honua.io` needs a host rewrite, not just an alias.** Sharing one
  distribution with `honua.io` means both hostnames hit the same bucket, so
  `docs.honua.io/<slice>/` must be rewritten to `/docs/<slice>/` on viewer
  request while `honua.io` is left alone. A CloudFront Function keyed on the
  `Host` header is the mechanism; that work, and parameterizing the hardcoded
  alias list in `scripts/build-cloudfront-template.mjs`, is #231.

`samples.honua.io` deliberately does **not** join this distribution. Its origin
is a different repository's artifact with its own publication contract, and the
whole point of fronting it is to set a `frame-ancestors` policy that differs
from this site's — one distribution cannot serve two conflicting response-header
policies for the same path shape without per-host behaviors it does not have.

## Why GitHub Pages is not the CloudFront origin

Keeping GitHub Pages as the custom origin would avoid a second copy of the
site, but it is not a reliable origin shape here. The repository endpoint
`https://honua-io.github.io/honua-site/` redirects to `https://honua.io/`, while
`https://honua-io.github.io/` and top-level object paths return 404. After DNS
cutover, using `honua.io` itself as the origin would recurse through the same
CloudFront distribution. CloudFront cannot turn that canonical redirect into a
stable private origin.

S3 adds one deployment target but provides a direct, private, deterministic
origin. GitHub Pages should remain enabled during migration as the immediate
DNS rollback target; it is not used in the CloudFront request path.

## Current production and AWS state

Observed July 11, 2026:

- authoritative DNS: four `*.ns.porkbun.com` nameservers;
- apex: direct GitHub Pages A records;
- `www`: CNAME to `honua-io.github.io`;
- production response: `server: GitHub.com`, without the required response set;
- accessible AWS account: `585192672263`;
- existing CloudFront distribution `E88FYGJVRJF6L` serves only
  `demo.honua.io` from API Gateway and must not be reused;
- the only issued `us-east-1` ACM certificate covers `demo.honua.io`;
- no site S3 bucket, site distribution, or `honua.io` certificate exists.
- the account has one existing custom response-headers policy; this template
  deduplicates identical path contracts into seven policies, keeping the total
  below CloudFront's default quota of 20.

No AWS, Porkbun, DNS, secret, or repository-environment mutation is performed by
the repository preparation.

Re-verified August 13, 2026 (read-only calls, account `585192672263`):

- still exactly one distribution — `E88FYGJVRJF6L`, alias `demo.honua.io`,
  API Gateway origin, `Deployed`. No site distribution exists.
- still exactly one issued `us-east-1` certificate, covering `demo.honua.io`
  only. No `honua.io` certificate exists.
- `honua.io` still answers `server: GitHub.com` with only GitHub's HSTS; the
  declared CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
  and `Permissions-Policy` are still not live. `production-status.json` remains
  truthful.
- `samples.honua.io` answers from Pages with **no** CSP and **no**
  `X-Frame-Options`, so it is framable by anyone today.
- `docs.honua.io` already resolves to `honua-io.github.io` but **no repository
  claims it**, so it fails TLS and is claimable while the org is unverified —
  honua-site#230.

## Authorized activation runbook

1. In ACM `us-east-1`, request a public certificate covering `honua.io`,
   `www.honua.io`, and `docs.honua.io`. Include the docs name even if the docs
   front door ships later — ACM certificates cannot be amended, so omitting it
   costs a second request, a second validation, and a distribution update:

   ```sh
   aws acm request-certificate \
     --region us-east-1 \
     --domain-name honua.io \
     --subject-alternative-names www.honua.io docs.honua.io \
     --validation-method DNS \
     --idempotency-token HonuaSite
   ```

   Do **not** add `samples.honua.io` here; it gets its own stack and certificate
   (see the hostname table above). Note this request now produces three
   validation CNAMEs, not two.

   Use `aws acm describe-certificate --region us-east-1 --certificate-arn
   <arn>` to obtain the two `DomainValidationOptions[].ResourceRecord` values.
   Add those CNAMEs at Porkbun and wait for `ISSUED`. Do not remove them; ACM
   uses them for renewal.
2. Validate the generated template without changing state:

   ```sh
   aws cloudformation validate-template \
     --region us-east-1 \
     --template-body file://edge/cloudfront-site.template.json
   ```

3. With explicit infrastructure approval, create a change set for a new stack,
   review it, then execute it with the issued certificate ARN. Keep the default
   `PriceClass_100` unless global edge coverage is required:

   ```sh
   aws cloudformation create-change-set \
     --region us-east-1 \
     --stack-name honua-site-production \
     --change-set-name initial-s3-cloudfront \
     --change-set-type CREATE \
     --template-body file://edge/cloudfront-site.template.json \
     --parameters ParameterKey=CertificateArn,ParameterValue=<certificate-arn>
   aws cloudformation wait change-set-create-complete \
     --region us-east-1 \
     --stack-name honua-site-production \
     --change-set-name initial-s3-cloudfront
   aws cloudformation describe-change-set \
     --region us-east-1 \
     --stack-name honua-site-production \
     --change-set-name initial-s3-cloudfront
   # Only after review and approval:
   aws cloudformation execute-change-set \
     --region us-east-1 \
     --stack-name honua-site-production \
     --change-set-name initial-s3-cloudfront
   aws cloudformation wait stack-create-complete \
     --region us-east-1 \
     --stack-name honua-site-production
   aws cloudformation describe-stacks \
     --region us-east-1 \
     --stack-name honua-site-production \
     --query 'Stacks[0].Outputs'
   ```
4. Export the stack's `BucketName`, `DistributionId`, and
   `DistributionDomainName`, then publish before DNS cutover. Keep the validation
   URL as `https://honua.io/` so curl sends the production Host header and SNI,
   but connect that name directly to the distribution hostname:

   ```sh
   AWS_SITE_BUCKET=<BucketName> \
   AWS_SITE_DISTRIBUTION_ID=<DistributionId> \
   HONUA_HEADER_CHECK_URL=https://honua.io/ \
   HONUA_HEADER_CHECK_CONNECT_TO=honua.io:443:<DistributionDomainName>:443 \
     ./scripts/deploy-aws-site.sh
   ```

   This preserves certificate verification for the custom ACM names while
   bypassing public DNS only for the pre-cutover curl. Inspect representative
   pages and the 404 response the same way before changing DNS. The script
   refuses a distribution that lacks the `honua.io` alias or does not use the
   selected bucket as an origin, preventing accidental or destructive
   cross-target deployment. It also validates generated header/template drift
   and runs the CloudFront tests before any S3 write, then repeats the live
   validation after invalidation.
5. Lower the current Porkbun apex/www TTL to 300 and wait out the previous TTL.
   Preserve the four GitHub Pages apex A records and the `www` CNAME in a dated
   rollback record.
6. At Porkbun, replace the four apex A records with one `ALIAS - CNAME
   flattening` record whose host is blank and whose answer is the
   `d*.cloudfront.net` distribution hostname. Replace the current `www` CNAME
   with a CNAME to that same hostname. Porkbun documents ALIAS as its supported
   apex-hostname record, so no nameserver migration is required.
7. Verify DNS from multiple resolvers, then run:

   ```sh
   HONUA_HEADER_CHECK_URL=https://honua.io/ HONUA_REQUIRE_LIVE_HEADERS=1 \
     ./scripts/validate-security-headers.sh
   ```

8. Configure the approved GitHub OIDC deployment role and repository variables
   only after the distribution exists. In the activation PR, wire
   `deploy-aws-site.sh` into the production workflow and atomically change
   `production-status.json` to `hostingProvider: "aws-cloudfront"` and
   `liveResponseHeaders: true`. The Pages workflow always reads this checked-in
   status: it remains green and emits an explicit notice before activation, then
   makes the bounded canonical live check non-skippable once activated.

## Rollback

If certificate, DNS, cache, or content validation fails, restore the recorded
GitHub Pages apex A records and `www -> honua-io.github.io`, then wait for the
300-second cutover TTL. Confirm GitHub's existing custom-domain certificate is
still valid after rollback; GitHub Pages is an immediate rollback path, not an
indefinite secondary origin once its DNS no longer points at GitHub. Keep the
CloudFront stack isolated for diagnosis and do not delete the versioned bucket.

## Cache and error behavior

- CloudFront default TTL is 300 seconds, minimum 0, maximum 3600.
- Deployments issue `/*` invalidations and wait for completion before the live
  gate. AWS currently includes the first 1,000 invalidation paths per month at
  no additional charge; this workflow uses one path per deployment.
- Query strings, cookies, and viewer headers are excluded from the cache key
  because the site is static and does not vary on them.
- Brotli/Gzip compression is enabled.
- S3 versioning supports object recovery; the deployment itself uses `--delete`,
  so rollback should deploy a known commit or restore prior object versions.

## Cost and tradeoffs

- ACM public certificates used with integrated AWS services have no additional
  certificate charge.
- S3 charges for stored bytes and requests; this site's footprint is small.
- CloudFront pay-as-you-go charges for requests, transfer, and invalidations
  beyond the free allowance. AWS documents a monthly free allowance of 1 TB
  transfer and 10 million HTTP/HTTPS requests for the traditional pricing
  model; actual eligibility and consolidated-account usage must be confirmed in
  the billing account.
- `PriceClass_100` limits edge regions to the lower-cost class. It is less global
  than `PriceClass_All` but appropriate for the initial low-traffic site.
- The selected design duplicates the built site in S3, but avoids a redirecting
  public origin, keeps S3 private, and makes edge headers deterministic.

## Primary references

- [AWS: restrict an S3 origin with Origin Access Control](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [AWS: add response headers with a CloudFront policy](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/modifying-response-headers.html)
- [AWS: CloudFront certificate requirements (`us-east-1`)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html)
- [AWS: CloudFront quotas](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html)
- [Porkbun: apex ALIAS/CNAME flattening](https://kb.porkbun.com/article/85-how-to-connect-your-root-domain-when-your-web-host-wont-provide-an-ip-address)

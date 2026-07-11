#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

: "${AWS_SITE_BUCKET:?set AWS_SITE_BUCKET to the provisioned private site bucket}"
: "${AWS_SITE_DISTRIBUTION_ID:?set AWS_SITE_DISTRIBUTION_ID to the site CloudFront distribution}"

aws s3api head-bucket --bucket "${AWS_SITE_BUCKET}" >/dev/null
has_site_alias="$(
  aws cloudfront get-distribution \
    --id "${AWS_SITE_DISTRIBUTION_ID}" \
    --query "contains(Distribution.DistributionConfig.Aliases.Items, 'honua.io')" \
    --output text
)"
if [[ "${has_site_alias}" != "True" ]]; then
  echo "Refusing deployment: ${AWS_SITE_DISTRIBUTION_ID} is not the honua.io distribution." >&2
  exit 1
fi

"${repo_root}/scripts/build-dist.sh"

aws s3 sync "${repo_root}/dist/" "s3://${AWS_SITE_BUCKET}/" \
  --delete \
  --only-show-errors \
  --cache-control "public,max-age=300"

invalidation_id="$(
  aws cloudfront create-invalidation \
    --distribution-id "${AWS_SITE_DISTRIBUTION_ID}" \
    --paths '/*' \
    --query 'Invalidation.Id' \
    --output text
)"
aws cloudfront wait invalidation-completed \
  --distribution-id "${AWS_SITE_DISTRIBUTION_ID}" \
  --id "${invalidation_id}"

HONUA_HEADER_CHECK_URL="${HONUA_HEADER_CHECK_URL:-https://honua.io/}" \
HONUA_REQUIRE_LIVE_HEADERS=1 \
  "${repo_root}/scripts/validate-security-headers.sh"

echo "AWS site deployment and required live-header validation passed."

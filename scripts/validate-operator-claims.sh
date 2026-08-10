#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
operations="${repo_root}/operations.html"
architectures="${repo_root}/proof-architectures.html"
claims="${repo_root}/claims.html"
belief="${repo_root}/belief.html"
index="${repo_root}/index.html"
ai_gis="${repo_root}/ai-gis.html"
pricing="${repo_root}/pricing.html"
interoperability="${repo_root}/interoperability.html"

fail() {
  echo "Operator claim validation failed: $1" >&2
  exit 1
}

require_fixed() {
  local needle="$1"
  local file="$2"
  grep -Fq "$needle" "$file" || fail "expected '${needle}' in ${file}"
}

reject_fixed() {
  local needle="$1"
  local file="$2"
  if grep -Fq "$needle" "$file"; then
    fail "stale unqualified claim '${needle}' remains in ${file}"
  fi
}

for file in "$operations" "$architectures" "$claims" "$belief" "$index" "$ai_gis" "$pricing" "$interoperability"; do
  [[ -f "$file" ]] || fail "missing required file ${file}"
done

reject_fixed "one declarative spec" "$operations"
reject_fixed "every change goes in as a plan" "$operations"
reject_fixed "ref=v0.1.0" "$operations"
reject_fixed "deployment shapes Honua actually runs in" "$architectures"
reject_fixed "<td>production</td>" "$architectures"
reject_fixed "<td>multi-env promotion</td>" "$architectures"
reject_fixed "<td>one-click cloud</td>" "$architectures"
reject_fixed "every change is a reviewed plan" "$belief"
reject_fixed "Query paths scale to zero on serverless" "$index"
reject_fixed "Plan ready across dev → staging → prod" "$ai_gis"
reject_fixed "GitOps proposals that never submit immediately" "$ai_gis"
reject_fixed "same schema as a human operator session" "$ai_gis"
reject_fixed "validated agentic GitOps with health-gated fix-forward" "$pricing"

# Marketing copy uses one simple vocabulary: implemented is unlabeled, access
# limits say Pilot access, and unavailable work says Not yet. Evidence state is
# documentation metadata, not a product-maturity badge.
if grep -Eiq "partial coverage|proof pending|source evaluation|source preview|private beta" "${repo_root}"/*.html; then
  fail "deprecated maturity or evidence labels remain in a top-level HTML page"
fi

require_fixed "Pilot access" "$operations"
require_fixed "one environment" "$operations"
require_fixed "People retain approval and release control" "$operations"
require_fixed "not available yet" "$operations"

require_fixed "GitOps-managed operations — pilot access" "$architectures"
require_fixed "Fleet promotion and verification</td><td>Not yet" "$architectures"
require_fixed "Cloud Marketplace install</td><td>Not yet" "$architectures"
require_fixed "honua-server/issues/2552" "$architectures"

require_fixed "one-environment operator requires <strong>pilot access</strong>" "$claims"
require_fixed "coordinated fleet promotion is <strong>not yet implemented</strong>" "$claims"
require_fixed "PILOT ACCESS" "$ai_gis"
require_fixed "Cross-environment fleet promotion is not yet implemented" "$ai_gis"
require_fixed "pull request for human review" "$ai_gis"
require_fixed "Explicit policy is required" "$ai_gis"
echo "Operator claim validation passed."

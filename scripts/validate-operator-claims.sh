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
reject_fixed "health-gated deploys, OpenTelemetry, OIDC" "$interoperability"
reject_fixed "validated agentic GitOps with health-gated fix-forward" "$pricing"

require_fixed "EVALUATION ONLY · PIN EXACT COMMIT" "$operations"
require_fixed "no stable SemVer Terraform module bundle" "$operations"
require_fixed "one environment" "$operations"
require_fixed "fleet promotion" "$operations"
require_fixed "Private beta" "$architectures"
require_fixed "Fleet promotion and convergence</td><td>Roadmap" "$architectures"
require_fixed "Cloud Marketplace install</td><td>Roadmap" "$architectures"
require_fixed "honua-server/issues/2552" "$architectures"
require_fixed "no stable SemVer Terraform module bundle" "$claims"
require_fixed "deterministic low-risk actions" "$belief"
require_fixed "Risky and irreversible changes stay approval-gated" "$belief"
require_fixed "single-environment operator loop is in private beta" "$index"
require_fixed "Fleet convergence is not yet shipped" "$ai_gis"
require_fixed "post-action convergence evidence is still being completed" "$ai_gis"
require_fixed "no unattended fleet self-healing claim" "$pricing"
require_fixed "fleet convergence still on the roadmap" "$interoperability"

echo "Operator claim validation passed."

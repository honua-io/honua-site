#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
headers_file="${repo_root}/_headers"
index_file="${repo_root}/index.html"

fail() {
  local message="$1"
  echo "Validation failed: ${message}" >&2
  exit 1
}

require_match() {
  local pattern="$1"
  local target="$2"
  if ! grep -Eq "${pattern}" "${target}"; then
    fail "expected pattern '${pattern}' in ${target}"
  fi
}

require_no_match() {
  local pattern="$1"
  local target="$2"
  if grep -Eq "${pattern}" "${target}"; then
    fail "unexpected pattern '${pattern}' in ${target}"
  fi
}

[[ -f "${headers_file}" ]] || fail "missing deployment headers file at ${headers_file}"

require_match "^/\\*" "${headers_file}"
require_match "Content-Security-Policy: .*frame-ancestors 'none'" "${headers_file}"
require_match "Content-Security-Policy: .*form-action 'self' https://formsubmit\\.co" "${headers_file}"
require_match "X-Frame-Options: DENY" "${headers_file}"
require_match "X-Content-Type-Options: nosniff" "${headers_file}"
require_match "Referrer-Policy: strict-origin-when-cross-origin" "${headers_file}"
require_match "Permissions-Policy: camera=\\(\\), microphone=\\(\\), geolocation=\\(\\)" "${headers_file}"
require_match "Strict-Transport-Security: max-age=[0-9]+" "${headers_file}"

require_no_match "frame-ancestors" "${index_file}"

overture_policy="$(awk '$0 == "/demo-overture.html" { getline; print; exit }' "${headers_file}")"
[[ -n "${overture_policy}" ]] || fail "missing /demo-overture.html scoped CSP"
printf '%s\n' "${overture_policy}" | grep -Fq "connect-src 'self' https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com" || \
  fail "Overture CSP must allow only the approved anonymous AWS origin after self"
if printf '%s\n' "${overture_policy}" | grep -Eq "connect-src[^;]*(\*|demo\.honua\.io|amazonaws\.com[^;]*amazonaws\.com)"; then
  fail "Overture CSP connect-src is broader than the approved AWS object origin"
fi
printf '%s\n' "${overture_policy}" | grep -Fq "worker-src 'self' blob:" || \
  fail "Overture CSP must allow its same-origin DuckDB worker"

# CloudFront response-header policies serve the _headers set on the live site
# (GitHub Pages ignores _headers). Both generated artifacts must stay current.
edge_rules="${repo_root}/edge/header-rules.json"
[[ -f "${edge_rules}" ]] || fail "missing generated edge rules at ${edge_rules}"
tmp_rules="$(mktemp)"
trap 'rm -f "${tmp_rules}"' EXIT
HONUA_EDGE_RULES_OUT="${tmp_rules}" bash "${repo_root}/scripts/build-edge-headers.sh" >/dev/null
if ! diff -q "${edge_rules}" "${tmp_rules}" >/dev/null 2>&1; then
  fail "edge/header-rules.json is out of sync with _headers; run ./scripts/build-edge-headers.sh and commit"
fi

cloudfront_template="${repo_root}/edge/cloudfront-site.template.json"
[[ -f "${cloudfront_template}" ]] || fail "missing generated CloudFront template at ${cloudfront_template}"
tmp_template="$(mktemp)"
trap 'rm -f "${tmp_rules}" "${tmp_template}"' EXIT
HONUA_CLOUDFRONT_TEMPLATE_OUT="${tmp_template}" \
  node "${repo_root}/scripts/build-cloudfront-template.mjs" >/dev/null
if ! diff -q "${cloudfront_template}" "${tmp_template}" >/dev/null 2>&1; then
  fail "edge/cloudfront-site.template.json is out of sync; run ./scripts/build-cloudfront-template.mjs and commit"
fi

header_check_url="${HONUA_HEADER_CHECK_URL:-}"
require_live_headers="${HONUA_REQUIRE_LIVE_HEADERS:-0}"
if [[ "${require_live_headers}" == "1" && -z "${header_check_url}" ]]; then
  fail "HONUA_REQUIRE_LIVE_HEADERS=1 but HONUA_HEADER_CHECK_URL is unset"
fi

if [[ -n "${header_check_url}" ]]; then
  case "${header_check_url}" in
    https://*) ;;
    *) fail "HONUA_HEADER_CHECK_URL must use https://" ;;
  esac

  response_headers="$(curl --fail --silent --show-error --head --max-time 30 \
    --proto '=https' --tlsv1.2 "${header_check_url}" || true)"
  if [[ -z "${response_headers}" ]]; then
    fail "could not fetch response headers from ${header_check_url}"
  fi

  require_live_header() {
    local description="$1"
    local pattern="$2"
    if ! printf '%s\n' "${response_headers}" | grep -Eqi "${pattern}"; then
      fail "live response from ${header_check_url} is missing ${description}"
    fi
  }

  # Assert the full claimed header set is actually served at the edge, not just
  # frame-ancestors. GitHub Pages ignores _headers, so this passes only when the
  # site is fronted by a CDN that injects these headers (see issue #38).
  require_live_header "CSP frame-ancestors 'none' enforcement" \
    "^content-security-policy: .*frame-ancestors 'none'"
  require_live_header "X-Frame-Options: DENY" \
    "^x-frame-options: *deny"
  require_live_header "X-Content-Type-Options: nosniff" \
    "^x-content-type-options: *nosniff"
  require_live_header "Referrer-Policy" \
    "^referrer-policy: *strict-origin-when-cross-origin"
  require_live_header "Permissions-Policy" \
    "^permissions-policy: *camera=\\(\\), *microphone=\\(\\), *geolocation=\\(\\)"
  require_live_header "Strict-Transport-Security" \
    "^strict-transport-security: *max-age="
fi

echo "Security header validation passed."

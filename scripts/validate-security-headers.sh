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
  if ! rg -q "${pattern}" "${target}"; then
    fail "expected pattern '${pattern}' in ${target}"
  fi
}

require_no_match() {
  local pattern="$1"
  local target="$2"
  if rg -q "${pattern}" "${target}"; then
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

require_no_match "frame-ancestors" "${index_file}"

header_check_url="${HONUA_HEADER_CHECK_URL:-}"
if [[ -n "${header_check_url}" ]]; then
  response_headers="$(curl -sSI --max-time 15 "${header_check_url}" || true)"
  if [[ -z "${response_headers}" ]]; then
    fail "could not fetch response headers from ${header_check_url}"
  fi

  if ! printf '%s\n' "${response_headers}" | rg -qi "^content-security-policy: .*frame-ancestors 'none'"; then
    fail "live response from ${header_check_url} is missing CSP frame-ancestors enforcement"
  fi
fi

echo "Security header validation passed."

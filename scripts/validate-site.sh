#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
index_file="${repo_root}/index.html"
required_pages=(
  "${repo_root}/platform.html"
  "${repo_root}/protocols.html"
  "${repo_root}/sdks.html"
  "${repo_root}/mobile.html"
  "${repo_root}/pricing.html"
  "${repo_root}/docs.html"
)

if [[ ! -f "${index_file}" ]]; then
  echo "Missing index.html" >&2
  exit 1
fi

for page in "${required_pages[@]}"; do
  if [[ ! -f "${page}" ]]; then
    echo "Missing required page: ${page}" >&2
    exit 1
  fi
done

require_match() {
  local pattern="$1"
  local target="$2"
  if ! rg -q "${pattern}" "${target}"; then
    echo "Validation failed: expected pattern '${pattern}' in ${target}" >&2
    exit 1
  fi
}

require_no_match() {
  local pattern="$1"
  local target="$2"
  if rg -q "${pattern}" "${target}"; then
    echo "Validation failed: unexpected pattern '${pattern}' in ${target}" >&2
    exit 1
  fi
}

require_match "id=\"contact\"" "${index_file}"
require_match "action=\"https://formsubmit\\.co/mike@honua\\.io\"" "${index_file}"
require_match "name=\"_captcha\" value=\"true\"" "${index_file}"
require_no_match "name=\"_captcha\" value=\"false\"" "${index_file}"

require_match "href=\"platform\\.html\"" "${index_file}"
require_match "href=\"protocols\\.html\"" "${index_file}"
require_match "href=\"sdks\\.html\"" "${index_file}"
require_match "href=\"mobile\\.html\"" "${index_file}"
require_match "href=\"pricing\\.html\"" "${index_file}"
require_match "href=\"docs\\.html\"" "${index_file}"
require_match "id=\"contact\"" "${index_file}"

require_match "GeoServices REST" "${repo_root}/protocols.html"
require_match "MCP" "${repo_root}/protocols.html"
require_match "JavaScript" "${repo_root}/sdks.html"
require_match "Python" "${repo_root}/sdks.html"
require_match "GeoPackage" "${repo_root}/mobile.html"
require_match "No per-user fees" "${repo_root}/pricing.html"
require_match "npm install @honua/sdk-js" "${repo_root}/docs.html"

"${repo_root}/scripts/validate-security-headers.sh"
"${repo_root}/scripts/validate-workflow-pinning.sh"

echo "Site validation passed."

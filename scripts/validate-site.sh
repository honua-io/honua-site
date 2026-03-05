#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
index_file="${repo_root}/index.html"

if [[ ! -f "${index_file}" ]]; then
  echo "Missing index.html" >&2
  exit 1
fi

require_match() {
  local pattern="$1"
  local target="$2"
  if ! rg -q "${pattern}" "${target}"; then
    echo "Validation failed: expected pattern '${pattern}' in ${target}" >&2
    exit 1
  fi
}

require_match "Content-Security-Policy" "${index_file}"
require_match "id=\"contact\"" "${index_file}"
require_match "action=\"https://formsubmit\\.co/mike@honua\\.io\"" "${index_file}"

for anchor in capabilities conformance contact; do
  require_match "href=\"#${anchor}\"" "${index_file}"
  require_match "id=\"${anchor}\"" "${index_file}"
done

if ! rg -q "actions/checkout@[0-9a-f]{40}" "${repo_root}/.github/workflows/pages.yml"; then
  echo "Validation failed: pages workflow must pin actions/checkout by commit SHA" >&2
  exit 1
fi

echo "Site validation passed."

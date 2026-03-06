#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workflows_dir="${repo_root}/.github/workflows"

failures=0
workflow_count=0

if [[ ! -d "${workflows_dir}" ]]; then
  echo "Validation failed: missing workflows directory at ${workflows_dir}" >&2
  exit 1
fi

while IFS= read -r workflow_file; do
  workflow_count=$((workflow_count + 1))

  while IFS= read -r match; do
    line_number="${match%%:*}"
    line_text="${match#*:}"

    if [[ "${line_text}" =~ uses:[[:space:]]*([^[:space:]#]+) ]]; then
      action_ref="${BASH_REMATCH[1]}"
    else
      echo "Validation failed: could not parse uses reference in ${workflow_file}:${line_number}" >&2
      failures=$((failures + 1))
      continue
    fi

    action_ref="${action_ref#\'}"
    action_ref="${action_ref%\'}"
    action_ref="${action_ref#\"}"
    action_ref="${action_ref%\"}"

    if [[ "${action_ref}" == ./* || "${action_ref}" == docker://* ]]; then
      continue
    fi

    if [[ "${action_ref}" != *@* ]]; then
      echo "Validation failed: ${workflow_file}:${line_number} must pin '${action_ref}' with @<40-char-commit-sha>" >&2
      failures=$((failures + 1))
      continue
    fi

    ref="${action_ref##*@}"
    if [[ ! "${ref}" =~ ^[0-9a-fA-F]{40}$ ]]; then
      echo "Validation failed: ${workflow_file}:${line_number} uses '${action_ref}' which is not pinned to a 40-character commit SHA" >&2
      failures=$((failures + 1))
    fi
  done < <(rg --line-number --no-heading "^[[:space:]]*uses:[[:space:]]+" "${workflow_file}")
done < <(find "${workflows_dir}" -maxdepth 1 -type f \( -name "*.yml" -o -name "*.yaml" \) | sort)

if (( workflow_count == 0 )); then
  echo "Validation failed: no workflow files found in ${workflows_dir}" >&2
  exit 1
fi

if (( failures > 0 )); then
  exit 1
fi

echo "Workflow pinning validation passed."

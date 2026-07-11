#!/usr/bin/env bash
# Generate edge/header-rules.json from the _headers source of truth.
#
# GitHub Pages ignores _headers, so honua.io is fronted by a Cloudflare Worker
# (edge/worker.js) that injects the same header set. This script parses _headers
# and emits the rules the Worker consumes, guaranteeing the edge headers never
# drift from _headers. Run it whenever _headers changes; CI verifies the
# committed output is up to date.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
headers_file="${repo_root}/_headers"
# Default output is the committed file; HONUA_EDGE_RULES_OUT lets the validator
# render to a temp file for a non-destructive drift check.
output_file="${HONUA_EDGE_RULES_OUT:-${repo_root}/edge/header-rules.json}"

[[ -f "${headers_file}" ]] || { echo "missing ${headers_file}" >&2; exit 1; }

# _headers format: a path line in column 0 ("/*", "/foo.html", "/dir/*"),
# followed by indented "Header-Name: value" lines. Blank lines and lines
# starting with '#' are ignored. Emit a JSON array of { match, headers:[[k,v]] }.
awk '
  function json_escape(s) {
    gsub(/\\/, "\\\\", s)
    gsub(/"/, "\\\"", s)
    return s
  }
  BEGIN { print "["; first_rule = 1 }
  /^[[:space:]]*#/ { next }                 # comment
  /^[[:space:]]*$/ { next }                 # blank
  /^\// {                                   # path line (column 0, starts with /)
    if (in_rule) { print "\n  ] }"; }
    if (!first_rule) { print "," }
    first_rule = 0
    in_rule = 1
    first_header = 1
    printf "  { \"match\": \"%s\", \"headers\": [", json_escape($0)
    next
  }
  /^[[:space:]]+[A-Za-z]/ {                 # indented header line
    line = $0
    sub(/^[[:space:]]+/, "", line)
    idx = index(line, ":")
    if (idx == 0) next
    name = substr(line, 1, idx - 1)
    value = substr(line, idx + 1)
    sub(/^[[:space:]]+/, "", value)
    if (!first_header) { printf "," }
    first_header = 0
    printf "\n    [\"%s\", \"%s\"]", json_escape(name), json_escape(value)
    next
  }
  END {
    if (in_rule) { print "\n  ] }" }
    print "]"
  }
' "${headers_file}" > "${output_file}.tmp"

mv "${output_file}.tmp" "${output_file}"
echo "Generated ${output_file} from ${headers_file}"

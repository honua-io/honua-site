#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist_dir="${repo_root}/dist"

rm -rf "${dist_dir}"
mkdir -p "${dist_dir}"

cp "${repo_root}/index.html" "${dist_dir}/index.html"
cp "${repo_root}/styles.css" "${dist_dir}/styles.css"
cp "${repo_root}/CNAME" "${dist_dir}/CNAME"
cp "${repo_root}/.nojekyll" "${dist_dir}/.nojekyll"
cp "${repo_root}/_headers" "${dist_dir}/_headers"
cp -R "${repo_root}/assets" "${dist_dir}/assets"

echo "Built static artifact at ${dist_dir}"

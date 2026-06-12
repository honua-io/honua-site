#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist_dir="${repo_root}/dist"

rm -rf "${dist_dir}"
mkdir -p "${dist_dir}"

find "${repo_root}" -maxdepth 1 -name "*.html" -exec cp {} "${dist_dir}" \;
cp "${repo_root}/styles.css" "${dist_dir}/styles.css"
cp "${repo_root}/CNAME" "${dist_dir}/CNAME"
cp "${repo_root}/.nojekyll" "${dist_dir}/.nojekyll"
cp "${repo_root}/_headers" "${dist_dir}/_headers"
cp -R "${repo_root}/assets" "${dist_dir}/assets"
cp -R "${repo_root}/excel-addin" "${dist_dir}/excel-addin"
cp -R "${repo_root}/.well-known" "${dist_dir}/.well-known"

echo "Built static artifact at ${dist_dir}"

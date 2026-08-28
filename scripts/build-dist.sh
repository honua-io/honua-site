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
cp "${repo_root}/robots.txt" "${dist_dir}/robots.txt"
cp "${repo_root}/sitemap.xml" "${dist_dir}/sitemap.xml"
cp "${repo_root}/llms.txt" "${dist_dir}/llms.txt"
cp "${repo_root}/llms-full.txt" "${dist_dir}/llms-full.txt"
cp -R "${repo_root}/assets" "${dist_dir}/assets"
cp -R "${repo_root}/data" "${dist_dir}/data"
cp -R "${repo_root}/schemas" "${dist_dir}/schemas"
cp -R "${repo_root}/excel-addin" "${dist_dir}/excel-addin"
cp -R "${repo_root}/.well-known" "${dist_dir}/.well-known"

# The capability-slice bundle is a page *directory* per slice, so it is rendered
# into the artifact rather than picked up by the root `*.html` copy above (which
# is -maxdepth 1 on purpose). It is generated from slices/*.json a second time
# here instead of being copied from docs/: the output is deterministic, CI
# proves the committed copy matches with `--check`, and generating into dist
# resolves each concept's `../../evidence-*.html` edges against the artifact.
node "${repo_root}/scripts/gen-slice-pages.mjs" --out "${dist_dir}/docs"

node "${repo_root}/scripts/sdk-docs-versions.mjs" --project "${dist_dir}"

echo "Built static artifact at ${dist_dir}"

# Honua Site

[![Pages](https://github.com/honua-io/honua-site/actions/workflows/pages.yml/badge.svg?branch=trunk)](https://github.com/honua-io/honua-site/actions/workflows/pages.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

Source for [honua.io](https://honua.io) — the static marketing, proof,
documentation-entry, and trust site for the Honua geospatial platform. Each
root `*.html` file is a standalone page; the site is plain HTML/CSS/vanilla JS
with no framework, package manifest, or bundler. Bash and Node scripts handle
validation and the deploy artifact.

Hosted product docs live at
[honua.gitbook.io/honuaio](https://honua.gitbook.io/honuaio) and are authored
in GitBook, not in this repository — `docs.html` is the site's docs entry page
that links out to them. The `docs/` directory here holds contributor contracts
(lead capture, SDK machine docs, publication cadence), not product docs.

See [docs/features/README.md](docs/features/README.md) for the current page and
claims map.

## Local preview

From the repository root:

```sh
python3 -m http.server
```

Then open `http://localhost:8000/`.

## Validation and build

CI (`.github/workflows/pages.yml`) runs these on every PR; run them locally
from the repo root before pushing:

```sh
./scripts/validate-workflow-pinning.sh
./scripts/validate-lead-capture.sh
./scripts/validate-security-headers.sh
./scripts/validate-operator-claims.sh
node scripts/validate-public-schemas.mjs
node scripts/gen-compatibility-matrix.mjs --check
node --test scripts/sdk-docs-versions.test.mjs
node scripts/sdk-docs-versions.mjs --check
node scripts/sdk-docs-versions.mjs --verify-remote
node scripts/sdk-llms-publication.mjs
node scripts/validate-site-claims.mjs
node scripts/validate-internal-links.mjs
node scripts/sdk-sample-publication.mjs
node scripts/site-demo-smoke.mjs
./scripts/build-dist.sh
```

`sdk-docs-versions.mjs --verify-remote` and `validate-site-claims.mjs` query
the GitHub API and package registries; CI provides `GITHUB_TOKEN`, and
unauthenticated local runs may hit rate limits. Everything else runs offline.

`scripts/build-dist.sh` recreates the ignored `dist/` artifact with the root
HTML pages, shared assets, public data, discovery files, Excel add-in assets,
and `.well-known` files.

If `_headers` changes, regenerate the Worker rules and commit them (CI fails
if they drift):

```sh
./scripts/build-edge-headers.sh
```

Set `HONUA_HEADER_CHECK_URL=https://honua.io/` when running the security-header
validator to include the live response.

## Deploys

- Push to `trunk` (the default branch) runs the validate job, builds `dist/`,
  and publishes it to GitHub Pages (custom domain `honua.io` via `CNAME`).
  PRs run validation only — there is no automated per-PR preview deploy;
  [honua-site-preview](https://github.com/honua-io/honua-site-preview) is
  reserved for previewing site changes but is not wired into this repo's CI.
- GitHub Pages does not interpret `_headers`; the Cloudflare Worker in
  [`edge/`](edge/) must be deployed for the complete security-header contract
  (CSP, frame-ancestors, HSTS) and HTTP redirects.

## Repository map

- `index.html` — home and migration-assessment form.
- `operations.html`, `interoperability.html`, `migration.html`, `pricing.html`
  — primary evaluation pages.
- `claims.html` and `proof-*.html` — public evidence ledger and proof pages.
- `docs.html` and `client-compatibility.html` — quickstart and registry-backed
  SDK availability.
- `demo*.html` and `sample-*.html` — live demos and SDK samples gallery; their
  content has its own publication contract
  ([docs/sdk-sample-publication.md](docs/sdk-sample-publication.md)).
- `cloud.html` — managed-service waitlist, explicitly not a GA claim.
- `privacy.html`, `terms.html`, `security.html` — privacy, legal, and trust.
- `styles.css`, `assets/nav.js`, `assets/analytics.js` — shared presentation,
  navigation, consent, analytics, and lead attribution.
- `data/sdk-availability.v1.json` — public SDK availability source of truth.
- `llms.txt`, `llms-full.txt`, and `data/sdk-llms.v1.json` — commit-pinned SDK
  machine docs; see [docs/sdk-machine-docs.md](docs/sdk-machine-docs.md) for
  the refresh contract.
- `schemas/diagnostic-bundle.v1.json` and its provenance record — public,
  byte-pinned projection of the canonical sanitized support-bundle contract.
- `robots.txt`, `sitemap.xml`, `.well-known/security.txt` — crawler and
  security-contact discovery.
- `_headers` and `edge/` — desired CSP/security headers and edge enforcement.
- [docs/lead-capture-handoff.md](docs/lead-capture-handoff.md) — form
  attribution and handoff contract.
- `scripts/` — generators, validators, smoke checks, and artifact build.

Note: `scripts/build-dist.sh` only copies root-level `*.html`, so pages must
live at the repo root to ship. Compatibility redirect pages are retained for
old URLs.

## Related Honua repositories

- [honua-server](https://github.com/honua-io/honua-server) — flagship
  multi-protocol geospatial server the site describes.
- [honua-console](https://github.com/honua-io/honua-console) — unified web
  console (Studio, Catalog, Operate, Share).
- [honua-sdk-js](https://github.com/honua-io/honua-sdk-js) — JS/TS SDKs behind
  the samples gallery and SDK machine docs published here.
- [honua-helm](https://github.com/honua-io/honua-helm) — Kubernetes deploy
  path referenced from the operations pages.

## Security and license

Report vulnerabilities to security@honua.io (see the
[org security policy](https://github.com/honua-io/.github/blob/main/SECURITY.md)).
Licensed under [Apache-2.0](LICENSE).

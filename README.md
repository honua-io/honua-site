# Honua Site

Static marketing, proof, documentation-entry, and trust site for
[honua.io](https://honua.io). Each root `*.html` file is a standalone page; the
site has no framework, package install, or bundler.

See [docs/features/README.md](docs/features/README.md) for the current page and
claims map.

## Local preview

From the repository root:

```sh
python3 -m http.server
```

Then open `http://localhost:8000/`.

## Build and validation

```sh
./scripts/validate-workflow-pinning.sh
./scripts/validate-lead-capture.sh
./scripts/validate-security-headers.sh
./scripts/validate-operator-claims.sh
node scripts/gen-compatibility-matrix.mjs --check
node scripts/sdk-llms-publication.mjs
node scripts/validate-site-claims.mjs
node scripts/validate-internal-links.mjs
node scripts/sdk-sample-publication.mjs
node scripts/site-demo-smoke.mjs
./scripts/build-dist.sh
```

`scripts/build-dist.sh` recreates the ignored `dist/` artifact with the root
HTML pages, shared assets, public data, discovery files, Excel add-in assets,
and `.well-known` files. GitHub Pages deploys that artifact from `trunk`.

If `_headers` changes, regenerate the Worker rules and commit them:

```sh
./scripts/build-edge-headers.sh
```

Set `HONUA_HEADER_CHECK_URL=https://honua.io/` when running the security-header
validator to include the live response. GitHub Pages does not interpret
`_headers`; the Cloudflare Worker in `edge/` must be deployed for the complete
header contract and HTTP redirects.

## Repository map

- `index.html` — home and migration-assessment form.
- `operations.html`, `interoperability.html`, `migration.html`, `pricing.html`
  — primary evaluation pages.
- `claims.html` and `proof-*.html` — public evidence ledger and proof pages.
- `docs.html` and `client-compatibility.html` — quickstart and registry-backed
  SDK availability.
- `cloud.html` — managed-service waitlist, explicitly not a GA claim.
- `privacy.html`, `terms.html`, `security.html` — privacy, legal, and trust.
- `qgis-plugin.html`, `honua-gis.html` — noindex experimental pages.
- `styles.css`, `assets/nav.js`, `assets/analytics.js` — shared presentation,
  navigation, consent, analytics, and lead attribution.
- `data/sdk-availability.v1.json` — public SDK availability source of truth.
- `llms.txt`, `llms-full.txt`, and `data/sdk-llms.v1.json` — commit-pinned SDK
  machine docs; see `docs/sdk-machine-docs.md` for the refresh contract.
- `schemas/diagnostic-bundle.v1.json` and its provenance record — public,
  byte-pinned projection of the canonical sanitized support-bundle contract.
- `robots.txt`, `sitemap.xml` — crawler discovery.
- `_headers` and `edge/` — desired CSP/security headers and edge enforcement.
- `docs/lead-capture-handoff.md` — form attribution and handoff contract.
- `scripts/` — generators, validators, smoke checks, and artifact build.

Compatibility redirect pages are retained for old URLs. Samples and demos have
their own publication contract; shared navigation, security, analytics, and
accessibility updates can affect them, but their content is maintained
separately.

## QGIS plugin page contract

Keep `qgis-plugin.html` aligned with the QGIS-plugin row in `claims.html`:
version 0.1.0 early preview, GPL-2.0-or-later, QGIS 3.34+, no plugin telemetry,
and no QGIS project endorsement. This repository owns only the landing page;
the plugin repository owns its package, marketplace listing, and media.

# Honua Site

Static site extracted from `honua-io/honua-server` (issue #336).

Current site sections and operational features are summarized in [docs/features/README.md](docs/features/README.md).

QGIS plugin page contract:
- `qgis-plugin.html` is the site-owned static landing page for Honua GIS Assistant at `https://honua.io/qgis-plugin.html`.
- The page links to the external `honua-io/honua-qgis-plugin` source and releases, but this repository does not own the plugin ZIP, QGIS marketplace listing, screenshots, demo video, or plugin-local privacy documentation.
- Keep `qgis-plugin.html` and `claims.html#qgis-plugin` aligned: 0.1.0 early preview, GPL-2.0-or-later, QGIS 3.34+, release ZIP/media/marketplace approval pending, local-first account-free defaults, no plugin telemetry, and no QGIS project endorsement claim.

Repository layout:
- `index.html` - minimal homepage and contact entry points
- `cloud-native.html` - modern cloud-native platform proof points
- `open-core.html` - open-core geoplatform and license boundary
- `operations.html` - operator-focused deployment, GitOps, OTel, and AI DevOps
- `interoperability.html` - standards, file, database, gRPC, and MCP compatibility
- `performance.html` - performance architecture and GeoBench entry points
- `ai-gis.html` - AI-ready GIS workflows and MCP surface
- `qgis-plugin.html` - Honua GIS Assistant QGIS plugin landing, install path, media status, and privacy boundary
- `honua-gis.html` - Honua-GIS model/eval announcement, status table, and quickstart gates
- `migration.html` - easy adoption and migration paths
- `platform.html` - platform overview
- `protocols.html` - protocol surface and compatibility story
- `sdks.html` - SDK and developer entry points
- `mobile.html` - mobile and field workflow page
- `pricing.html` - pricing and licensing page
- `docs.html` - quickstart and docs hub
- `claims.html` - public claims matrix for Preview/Beta/proof/deferred status review
- `privacy.html` - privacy and cookie notice
- `terms.html` - site terms of use
- `security.html` - security contact and DPA posture
- `docs/lead-capture-handoff.md` - contact form attribution, CRM handoff, smoke evidence, and downstream ownership
- `styles.css` - site styles
- `assets/` - static assets, navigation JavaScript, and consent-gated analytics/CTA attribution
- `_headers` - deployment response headers (CSP, clickjacking, and related security headers)
- `scripts/build-dist.sh` - build the deployable static artifact
- `scripts/validate-lead-capture.sh` - validate the contact form, attribution fields, CTA metadata, CSP allowlist, and handoff docs
- `scripts/validate-security-headers.sh` - validate live security headers when a target URL is configured
- `scripts/validate-workflow-pinning.sh` - verify workflow actions remain pinned
- `.github/workflows/` - CI/deploy workflows

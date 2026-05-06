# Honua Site

Static site extracted from `honua-io/honua-server` (issue #336).

Current site sections and operational features are summarized in [docs/features/README.md](docs/features/README.md).

Repository layout:
- `index.html` - homepage and contact form
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
- `styles.css` - site styles
- `assets/` - static assets, navigation JavaScript, and consent-gated analytics/CTA attribution
- `_headers` - deployment response headers (CSP, clickjacking, and related security headers)
- `scripts/build-dist.sh` - build the deployable static artifact
- `scripts/validate-security-headers.sh` - validate live security headers when a target URL is configured
- `scripts/validate-workflow-pinning.sh` - verify workflow actions remain pinned
- `.github/workflows/` - CI/deploy workflows

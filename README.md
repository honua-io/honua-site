# Honua Site

Static site extracted from `honua-io/honua-server` (issue #336).

Repository layout:
- `index.html` - homepage and contact form
- `platform.html` - platform overview
- `protocols.html` - protocol surface and compatibility story
- `sdks.html` - SDK and developer entry points
- `mobile.html` - mobile and field workflow page
- `pricing.html` - pricing and licensing page
- `docs.html` - quickstart and docs hub
- `styles.css` - site styles
- `assets/` - static assets
- `_headers` - deployment response headers (CSP, clickjacking, and related security headers)
- `scripts/validate-site.sh` - CI validation entrypoint for content, security headers, and workflow pinning
- `.github/workflows/` - CI/deploy workflows

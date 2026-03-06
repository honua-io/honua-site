# Honua Site

Static site extracted from `honua-io/honua-server` (issue #336).

Repository layout:
- `index.html` - landing page markup
- `styles.css` - site styles
- `assets/` - static assets
- `_headers` - deployment response headers (CSP, clickjacking, and related security headers)
- `scripts/validate-site.sh` - CI validation entrypoint for content, security headers, and workflow pinning
- `.github/workflows/` - CI/deploy workflows

# Honua Site Feature Map

This repository owns the static public site.

## Current Site Sections

- Home page and contact form.
- Platform, runtime, protocols, SDKs, mobile, modernization, AI/agentic GIS, DevOps, docs, pricing, security, privacy, terms, and related public pages.
- Static assets for logo, favicon, Open Graph image, hero/platform imagery, analytics, and navigation.
- Security headers, CSP/clickjacking response headers, workflow pinning validation, and build script for deployable static artifacts.

## Source Evidence

- Pages: `*.html`
- Assets and navigation: `assets/`
- Styles: `styles.css`
- Deployment headers: `_headers`
- Build and validation scripts: `scripts/build-dist.sh`, `scripts/validate-security-headers.sh`, `scripts/validate-workflow-pinning.sh`

## Boundary

The site should describe shipped and near-term release paths, but product claims should be verified against `honua-server`, SDK, mobile, admin, and deployment repos before publication.

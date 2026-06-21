# Edge security headers (Cloudflare Worker)

honua-site is published on **GitHub Pages**, which serves over the Fastly CDN and
**ignores the repository `_headers` file** (`_headers` is a Netlify / Cloudflare
Pages convention, not a GitHub Pages feature). The live site therefore carries
no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy` or `Permissions-Policy` response headers — only the
`Strict-Transport-Security` that Fastly adds automatically. That leaves honua.io
exposed to clickjacking and contradicts `security.html`. See
[issue #38](https://github.com/honua-io/honua-site/issues/38).

A per-page `<meta http-equiv="Content-Security-Policy">` tag enforces the CSP on
GitHub Pages today, but a meta CSP **cannot** express response-only directives —
notably `frame-ancestors` (anti-clickjacking), nor `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy` or `Strict-Transport-Security`. Those
must be served at the edge.

## What's here

| File | Purpose |
| --- | --- |
| `worker.js` | Cloudflare Worker that proxies the GitHub Pages origin and injects the header set from `_headers`, matched per path. |
| `header-rules.json` | Generated from `_headers` by `scripts/build-edge-headers.sh`. The single source of truth stays `_headers`; CI fails if this file is stale. |
| `wrangler.toml` | Deployment config binding the Worker to `honua.io/*`. |

`_headers` remains the **source of truth**. Edit `_headers`, then run
`./scripts/build-edge-headers.sh` to regenerate `header-rules.json`.

## How to activate (one-time, requires Cloudflare account access)

1. Add the `honua.io` zone to Cloudflare and point the registrar's nameservers
   at Cloudflare.
2. Create proxied (orange-cloud) DNS records for `honua.io` / `www.honua.io`
   pointing at the GitHub Pages origin (`<org>.github.io` / the Pages IPs).
3. Deploy the Worker: `cd edge && npx wrangler deploy`.
4. Set the repository **variable** `HONUA_HEADER_CHECK_URL=https://honua.io/`.
   The `Pages` workflow then runs `scripts/validate-security-headers.sh`
   post-deploy and **fails the pipeline** if the headers are absent from the
   live response.

Until step 4 the post-deploy live check is skipped (the workflow guards on
`vars.HONUA_HEADER_CHECK_URL != ''`); the static `_headers` contract and the
generated-rules drift check still run on every PR.

Alternative paths (migrate to Cloudflare Pages / Netlify, which honour
`_headers` natively) are noted in issue #38; the `_headers` file is reusable
as-is on those hosts.

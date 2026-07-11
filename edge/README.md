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
| `worker.js` | Cloudflare Worker that serves permanent legacy-URL redirects, proxies the GitHub Pages origin, and injects the header set from `_headers`, matched per path. |
| `header-rules.json` | Generated from `_headers` by `scripts/build-edge-headers.sh`. The single source of truth stays `_headers`; CI fails if this file is stale. |
| `wrangler.toml` | Deployment config binding the Worker to `honua.io/*`. |

`_headers` remains the **source of truth**. Edit `_headers`, then run
`./scripts/build-edge-headers.sh` to regenerate `header-rules.json`.

The Worker also returns HTTP 301 redirects for legacy top-level URLs such as
`open-core.html`, `cloud-native.html`, and `proof.html`. Their checked-in
meta-refresh pages remain a fallback while GitHub Pages is reached without the
edge.

## Production status

As of July 11, 2026, this Worker is **not active**. The authoritative
nameservers are still `*.ns.porkbun.com`, the apex resolves directly to the four
GitHub Pages addresses, `www` is a direct CNAME to `honua-io.github.io`, and the
repository has no repository-level Cloudflare secret or variable configured.
Production responses therefore still identify `server: GitHub.com` and do not
carry the response-only header set.

The Pages workflow now always checks `https://honua.io/` after deploying. It no
longer depends on an optional repository variable, so a production run cannot
report success while the edge check was silently skipped.

## How to activate (one-time, requires Cloudflare and registrar access)

1. Add `honua.io` to the authorized Cloudflare account and preserve all current
   DNS records during import.
2. At Porkbun, replace the four authoritative Porkbun nameservers with the two
   nameservers assigned by Cloudflare. Wait until the Cloudflare zone is active.
3. In Cloudflare DNS, keep the apex on the GitHub Pages A/AAAA origin records and
   `www` on `honua-io.github.io`, but enable the proxy (orange cloud) for both.
4. From an authenticated operator session, run `cd edge && npx wrangler deploy`.
   The committed routes bind the Worker to both `honua.io/*` and
   `www.honua.io/*`.
5. Return to the repository root, run the live gate, then re-run the Pages
   workflow:

   ```sh
   HONUA_HEADER_CHECK_URL=https://honua.io/ HONUA_REQUIRE_LIVE_HEADERS=1 \
     ./scripts/validate-security-headers.sh
   ```

Cloudflare documents Workers Routes as the correct shape when an external
origin sits behind a Worker. A proxied DNS record and an active Cloudflare zone
are prerequisites; the repository cannot perform the registrar nameserver
change or create the Cloudflare zone.

Alternative paths (migrate to Cloudflare Pages / Netlify, which honour
`_headers` natively) are noted in issue #38; the `_headers` file is reusable
as-is on those hosts.

// Cloudflare Worker: serve honua.io security response headers at the edge.
//
// WHY THIS EXISTS
// honua-site is published on GitHub Pages, which serves content over the Fastly
// CDN and silently ignores the repository's `_headers` file (a Netlify /
// Cloudflare Pages convention). As a result the live site carries no
// Content-Security-Policy, X-Frame-Options, X-Content-Type-Options,
// Referrer-Policy or Permissions-Policy headers, leaving honua.io exposed to
// clickjacking and contradicting security.html (see issue #38).
//
// This Worker fronts the GitHub Pages origin and injects exactly the header set
// declared in `_headers`, which is bundled at deploy time (see
// scripts/build-edge-headers.sh) so the rules can never drift from `_headers`.
// `_headers` remains the single source of truth.
//
// DEPLOYMENT
// Route honua.io through Cloudflare (free tier) and bind this Worker to the
// `honua.io/*` route (see edge/wrangler.toml). The origin stays GitHub Pages;
// the Worker only adds response headers. The Pages workflow's non-skippable
// post-deploy gate verifies https://honua.io/ after every production deploy.

// HEADER_RULES is generated from `_headers` by scripts/build-edge-headers.sh.
// Do not edit by hand: edit `_headers` and re-run the generator. Each entry is
// { match, headers } where `match` is a path pattern from `_headers`
// ("/*" catch-all, an exact path, or a "/prefix/*" glob) and `headers` is the
// ordered list of [name, value] pairs to set on the response.
import HEADER_RULES from "./header-rules.json" with { type: "json" };

const REDIRECTS = new Map([
  ["/index.html", "/"],
  ["/open-core.html", "/pricing.html"],
  ["/cloud-native.html", "/operations.html"],
  ["/performance.html", "/operations.html"],
  ["/proof.html", "/claims.html"],
  ["/demos.html", "/samples.html"],
]);

/**
 * Pick the most specific matching rule for a request path.
 * Specificity: exact path > prefix glob (longer prefix wins) > catch-all "/*".
 */
export function selectHeaders(pathname) {
  let best = null;
  let bestScore = -1;
  for (const rule of HEADER_RULES) {
    const { match } = rule;
    let score = -1;
    if (match === "/*") {
      score = 0;
    } else if (match.endsWith("/*")) {
      const prefix = match.slice(0, -1); // keep trailing slash
      if (pathname === match.slice(0, -2) || pathname.startsWith(prefix)) {
        score = 1 + prefix.length; // longer prefix is more specific
      }
    } else if (pathname === match) {
      score = 10000; // exact match always wins
    }
    if (score > bestScore) {
      bestScore = score;
      best = rule;
    }
  }
  return best ? best.headers : [];
}

/**
 * Return a mutable copy carrying the path-specific security header contract.
 * This is also used for Worker-generated redirects so every response on the
 * production host receives the same edge protections.
 */
export function applySecurityHeaders(response, pathname) {
  const securedResponse = new Response(response.body, response);
  for (const [name, value] of selectHeaders(pathname)) {
    securedResponse.headers.set(name, value);
  }
  return securedResponse;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const redirectPath = REDIRECTS.get(url.pathname);
    if (redirectPath) {
      url.pathname = redirectPath;
      return applySecurityHeaders(
        Response.redirect(url.toString(), 301),
        new URL(request.url).pathname,
      );
    }

    const originResponse = await fetch(request);
    return applySecurityHeaders(originResponse, url.pathname);
  },
};

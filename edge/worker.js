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
// the Worker only adds response headers. Once live, set the repository variable
// HONUA_HEADER_CHECK_URL=https://honua.io/ so the post-deploy CI gate
// (scripts/validate-security-headers.sh) verifies the headers on every deploy.

// HEADER_RULES is generated from `_headers` by scripts/build-edge-headers.sh.
// Do not edit by hand: edit `_headers` and re-run the generator. Each entry is
// { match, headers } where `match` is a path pattern from `_headers`
// ("/*" catch-all, an exact path, or a "/prefix/*" glob) and `headers` is the
// ordered list of [name, value] pairs to set on the response.
import HEADER_RULES from "./header-rules.json";

/**
 * Pick the most specific matching rule for a request path.
 * Specificity: exact path > prefix glob (longer prefix wins) > catch-all "/*".
 */
function selectHeaders(pathname) {
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

export default {
  async fetch(request) {
    const originResponse = await fetch(request);

    // Stream the original body/status through unchanged; only headers change.
    const response = new Response(originResponse.body, originResponse);

    const url = new URL(request.url);
    const headers = selectHeaders(url.pathname);
    for (const [name, value] of headers) {
      response.headers.set(name, value);
    }

    return response;
  },
};

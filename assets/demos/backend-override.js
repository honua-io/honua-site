/*
 * honua.io demos — opt-in backend override (the "shim").
 * ===========================================================================
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Every live demo page on this site talks to https://demo.honua.io and is locked
 * to that origin by the page's own `Content-Security-Policy: connect-src`. That is
 * the right default for a public site, but it makes the demos undriveable against
 * any other Honua Server — a CI candidate booted by honua-release's e2e harness, a
 * local `docker compose` stack, or a staging box during a live walkthrough.
 *
 * This shim adds ONE opt-in escape hatch:
 *
 *     demo-two-protocols.html?apiBase=http://localhost:8080
 *
 * and nothing else changes. With no `?apiBase=` and no pre-set
 * `window.HONUA_DEMO_BASE_URL`, the effective policy and every request URL are
 * byte-identical to what they were before this file existed.
 *
 * RESOLUTION ORDER
 * ----------------
 *   1. `?apiBase=` query parameter
 *   2. `window.HONUA_DEMO_BASE_URL` (settable by an inline snippet placed BEFORE
 *      this script — for a self-hosted copy of the demos)
 *   3. the page's own hardcoded default (https://demo.honua.io)
 *
 * ORIGIN ALLOW-LIST (this is a PUBLIC site — an attacker-supplied `?apiBase=` in a
 * link would otherwise redirect API traffic to a hostile origin AND widen the CSP
 * to match, so the override is deliberately narrow):
 *
 *   - scheme MUST be http: or https:
 *   - https: is REQUIRED for anything that is not a loopback host (no downgrade)
 *   - host MUST be one of: localhost | 127.0.0.1 | [::1] | honua.io | *.honua.io
 *   - no userinfo (user:pass@), no path beyond "/", no query, no fragment
 *   - the accepted value is reduced to its ORIGIN (scheme://host[:port])
 *
 * Anything else is REJECTED: the page falls back to its hardcoded default and the
 * CSP is NOT widened. Rejection is logged to the console and never throws.
 * Pointing the public demos at some other origin is intentionally a code change
 * (edit ALLOWED_HOSTS below), not a URL parameter.
 *
 * CSP MECHANISM (why the policy is emitted from JavaScript)
 * --------------------------------------------------------
 * A `<meta http-equiv="Content-Security-Policy">` is captured by the parser the
 * moment it is parsed and cannot be relaxed afterwards; adding a SECOND policy
 * only ever intersects with the first, so no post-hoc widening is possible. The
 * least invasive mechanism that still keeps the default behaviour intact is:
 *
 *   <noscript data-honua-csp><meta http-equiv="Content-Security-Policy" content="…"></noscript>
 *   <script src="assets/demos/backend-override.js"></script>
 *
 * The <noscript> block is the CANONICAL, single copy of the page policy:
 *   - scripting DISABLED -> the browser parses the noscript content as markup and
 *     the original policy applies exactly as before (no-JS posture preserved).
 *   - scripting ENABLED  -> the noscript content is inert raw text; this script
 *     reads it, appends the validated override origin to `connect-src` and
 *     `img-src` ONLY when there is one, and inserts the resulting <meta> into the
 *     head before any other subresource is fetched (this script is a classic,
 *     parser-blocking <script> placed immediately after the noscript and before
 *     every other head resource).
 *
 * The policy is widened by exactly one origin, only for the two directives that
 * actually carry backend traffic (`connect-src` for fetch/XHR/MapLibre, `img-src`
 * for Leaflet's <img> tiles), and only when an override survived validation.
 *
 * DEPLOYED honua.io ALSO SENDS A CSP RESPONSE HEADER (edge/header-rules.json ->
 * _headers, applied by CloudFront), and CSP policies INTERSECT: a meta policy can
 * never relax a header policy. So on the deployed public site this shim is inert by
 * construction — honua.io itself cannot be pointed at another backend, which is the
 * safest possible posture for a public page. The override works where there is no
 * edge header: the e2e harness's local static copy of this repo, a `python3 -m
 * http.server` checkout, or any self-hosted copy. Enabling it on the deployed site
 * would mean adding the target origin to the edge `connect-src` for the demo routes
 * too — a deliberate, reviewed change to edge/header-rules.json, not a side effect
 * of this file.
 *
 * Dependency-free, no build step, ES5 — the same shape as every other script in
 * assets/demos/.
 */
(function () {
  "use strict";

  /* The origin every demo page hardcodes today. Also the value that `rebase()`
   * rewrites away from when an override is active. */
  var DEFAULT_BASE = "https://demo.honua.io";

  /* Exact hosts, plus the honua.io apex and its subdomains. Loopback is allowed
   * over http: so a local candidate server (e2e harness / docker compose) works;
   * every other allowed host must be https:. */
  var LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];
  var ALLOWED_SUFFIX = ".honua.io";
  var ALLOWED_APEX = "honua.io";

  /* CSP directives that carry backend traffic and therefore get the override
   * origin appended. Nothing else in the policy is touched. */
  var WIDENED_DIRECTIVES = ["connect-src", "img-src"];

  function warn(message) {
    if (window.console && typeof window.console.warn === "function") {
      window.console.warn("[honua-demo-backend] " + message);
    }
  }

  function isLoopback(hostname) {
    for (var i = 0; i < LOOPBACK_HOSTS.length; i++) {
      if (hostname === LOOPBACK_HOSTS[i]) return true;
    }
    return false;
  }

  function isAllowedHost(hostname) {
    if (isLoopback(hostname)) return true;
    if (hostname === ALLOWED_APEX) return true;
    return hostname.length > ALLOWED_SUFFIX.length &&
      hostname.slice(-ALLOWED_SUFFIX.length) === ALLOWED_SUFFIX;
  }

  /* Returns the accepted ORIGIN string, or null when the candidate is rejected.
   * Never throws — a malformed value is simply not honoured. */
  function validate(candidate) {
    if (typeof candidate !== "string" || candidate === "") return null;
    var url;
    try {
      url = new URL(candidate);
    } catch (_error) {
      warn("ignored backend override (not an absolute URL): " + candidate);
      return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      warn("ignored backend override (scheme must be http/https): " + candidate);
      return null;
    }
    if (url.username || url.password) {
      warn("ignored backend override (credentials are not allowed): " + candidate);
      return null;
    }
    if (url.search || url.hash) {
      warn("ignored backend override (query/fragment are not allowed): " + candidate);
      return null;
    }
    if (url.pathname && url.pathname !== "/") {
      warn("ignored backend override (a path is not allowed, origin only): " + candidate);
      return null;
    }
    var host = url.hostname.toLowerCase();
    if (!isAllowedHost(host)) {
      warn("ignored backend override (host is not allow-listed): " + candidate);
      return null;
    }
    if (url.protocol === "http:" && !isLoopback(host)) {
      warn("ignored backend override (http is only allowed for loopback): " + candidate);
      return null;
    }
    return url.origin;
  }

  function queryOverride() {
    var search = window.location && window.location.search;
    if (!search || search.length < 2) return null;
    var pairs = search.slice(1).split("&");
    for (var i = 0; i < pairs.length; i++) {
      var eq = pairs[i].indexOf("=");
      if (eq < 0) continue;
      if (decodeURIComponent(pairs[i].slice(0, eq)) !== "apiBase") continue;
      return decodeURIComponent(pairs[i].slice(eq + 1).replace(/\+/g, "%20"));
    }
    return null;
  }

  /* ── CSP re-emission ─────────────────────────────────────────────────────── */

  function canonicalPolicy() {
    var holder = document.querySelector("noscript[data-honua-csp]");
    if (!holder) return null;
    // Scripting is enabled, so the noscript's children are one inert raw-text
    // node containing the original <meta> markup.
    var match = /content\s*=\s*"([^"]*)"/i.exec(holder.textContent || "");
    return match ? match[1] : null;
  }

  function widen(policy, origin) {
    var directives = policy.split(";");
    for (var i = 0; i < directives.length; i++) {
      var directive = directives[i];
      var trimmed = directive.replace(/^\s+/, "");
      var space = trimmed.indexOf(" ");
      if (space < 0) continue;
      var name = trimmed.slice(0, space).toLowerCase();
      if (WIDENED_DIRECTIVES.indexOf(name) < 0) continue;
      if ((" " + trimmed + " ").indexOf(" " + origin + " ") >= 0) continue;
      directives[i] = directive.replace(/\s*$/, "") + " " + origin;
    }
    return directives.join(";");
  }

  function emitPolicy(origin) {
    var policy = canonicalPolicy();
    if (!policy) {
      warn("no <noscript data-honua-csp> policy found — the page CSP was not re-emitted");
      return null;
    }
    var effective = origin ? widen(policy, origin) : policy;
    var meta = document.createElement("meta");
    meta.setAttribute("http-equiv", "Content-Security-Policy");
    meta.setAttribute("content", effective);
    (document.head || document.documentElement).appendChild(meta);
    return effective;
  }

  /* ── public surface ──────────────────────────────────────────────────────── */

  var requested = queryOverride();
  var fromQuery = requested !== null;
  if (!fromQuery && typeof window.HONUA_DEMO_BASE_URL === "string") {
    requested = window.HONUA_DEMO_BASE_URL;
  }
  var resolved = requested === null ? null : validate(requested);

  // The CSP must be in place before ANY other head resource is fetched, so emit
  // it synchronously here — this script is parser-blocking on purpose.
  var effectivePolicy = emitPolicy(resolved);

  /* Rewrite every absolute demo.honua.io URL inside a loaded config object.
   * Identity (same object, untouched) when no override is active, so the default
   * lane is provably unchanged. */
  function rebase(value) {
    if (!resolved) return value;
    if (typeof value === "string") {
      return value.indexOf(DEFAULT_BASE) === 0 ? resolved + value.slice(DEFAULT_BASE.length) : value;
    }
    if (Array.isArray(value)) {
      var list = [];
      for (var i = 0; i < value.length; i++) list.push(rebase(value[i]));
      return list;
    }
    if (value && typeof value === "object") {
      var out = {};
      for (var key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = rebase(value[key]);
      }
      return out;
    }
    return value;
  }

  window.HONUA_DEMO_BASE_URL = resolved;
  window.HonuaDemoBackend = {
    /** The validated override origin, or null when the page runs its default backend. */
    base: resolved,
    /** The origin every demo page hardcodes. */
    defaultBase: DEFAULT_BASE,
    /** True when the active override came from ?apiBase= rather than a pre-set global. */
    fromQuery: fromQuery && resolved !== null,
    /** The CSP actually emitted for this page (null when no canonical policy was found). */
    policy: effectivePolicy,
    /** resolve(pageDefault) -> the base URL the page should use. */
    resolve: function (pageDefault) {
      return resolved || pageDefault || DEFAULT_BASE;
    },
    /** rebase(config) -> the same config with demo.honua.io URLs pointed at the override. */
    rebase: rebase,
  };
})();

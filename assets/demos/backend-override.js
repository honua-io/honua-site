/*
 * honua.io demos — opt-in backend override (the "shim"), part 2 of 2.
 * ===========================================================================
 *
 * Part 1 is assets/demos/csp-bootstrap.js, inlined into each demo page's <head>. It is the only
 * place the origin allow-list is enforced, and the only place the page CSP is emitted. It hands
 * this file the already-validated result on `window.HONUA_DEMO_BACKEND_ORIGIN` (null when the page
 * is running its default backend).
 *
 * THIS file is deliberately NOT load-bearing for security. It is fetched over the network, so it
 * can fail to load; when it does, the demo pages fall back to their own guarded stubs and simply
 * run against their hardcoded default. The CSP is already installed by then either way.
 *
 * WHY ANY OF THIS EXISTS
 * ----------------------
 * Every live demo page points at https://demo.honua.io and is locked to that origin by the page
 * CSP's connect-src. That is the right default for a public site, but it makes the demos
 * undriveable against any other Honua Server — a CI candidate booted by honua-release's e2e
 * harness, a local `docker compose` stack, or a staging box during a walkthrough. One opt-in escape
 * hatch fixes that:
 *
 *     demo-two-protocols.html?apiBase=http://localhost:8080
 *
 * and nothing else changes. With no `?apiBase=` and no pre-set `window.HONUA_DEMO_BASE_URL`, the
 * effective policy and every request URL are byte-identical to what they were before this existed.
 *
 * RESOLUTION ORDER (applied by the bootstrap, mirrored here)
 *   1. `?apiBase=` query parameter
 *   2. `window.HONUA_DEMO_BASE_URL` set by an inline snippet placed BEFORE the bootstrap
 *   3. the page's own hardcoded default (https://demo.honua.io)
 *
 * ORIGIN ALLOW-LIST (enforced in csp-bootstrap.js — this is a PUBLIC site, and an attacker-supplied
 * ?apiBase= in a link would otherwise redirect API traffic AND widen the CSP to match):
 *   https:// + honua.io or any *.honua.io subdomain, or http(s):// + localhost / 127.0.0.1 / [::1],
 *   each with an optional port and an optional single trailing slash. One anchored regex over the
 *   whole candidate, so userinfo, paths, queries and fragments are rejected by construction.
 *   Anything else is ignored: the page keeps its default and the CSP is NOT widened.
 *
 * Dependency-free, no build step, ES5 — the same shape as every other script in assets/demos/.
 */
(function () {
  "use strict";

  /* The origin every demo page hardcodes, and the value `rebase()` rewrites away from. */
  var DEFAULT_BASE = "https://demo.honua.io";

  /* Validated by the inline bootstrap; null when no override is active (including when a supplied
   * one was rejected). This file never second-guesses that decision — one allow-list, one place. */
  var resolved = typeof window.HONUA_DEMO_BACKEND_ORIGIN === "string" && window.HONUA_DEMO_BACKEND_ORIGIN
    ? window.HONUA_DEMO_BACKEND_ORIGIN
    : null;

  /* Rewrite every absolute demo.honua.io URL inside a loaded config object. Identity (the same
   * object, untouched) when no override is active, so the default lane is provably unchanged.
   *
   * The match is on an ORIGIN BOUNDARY, not a prefix: the value must BE the default origin, or the
   * character after it must be "/". A bare `indexOf(DEFAULT_BASE) === 0` also matches
   * "https://demo.honua.io.evil.com/x" — a different host that merely starts with the same text —
   * and would rewrite it to "<resolved>.evil.com/x", a host the allow-list never approved
   * (CodeQL js/incomplete-url-substring-sanitization; same defect class as the one fixed in
   * honua-release's demo_canary.py). The emitted CSP would block the resulting request, but a
   * rewrite that invents a host is wrong on its own terms, so it is fixed here rather than left to
   * the policy to catch. S9-demos-shim-security asserts this directly. */
  function rebase(value) {
    if (!resolved) return value;
    if (typeof value === "string") {
      if (value === DEFAULT_BASE) return resolved;
      return value.indexOf(DEFAULT_BASE + "/") === 0 ? resolved + value.slice(DEFAULT_BASE.length) : value;
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

  /* demo-analyst-workbench.html does not run any of this repo's demo JS: it loads the published
   * spatial-analytics-workbench SDK sample, which resolves its live backend from
   * `nv(window.location, import.meta.env)` — i.e. from its OWN `baseUrl` query parameter, with the
   * build-time env values all undefined. It reads no window global and does not know about
   * `apiBase`, so ?apiBase= alone would widen that page's CSP and then leave the sample pointed at
   * an undefined backend. Mirror the resolved origin into the parameter the sample actually reads.
   *
   * Only when an override resolved, and never over an explicit caller value — a caller who passed
   * `baseUrl` meant it. The sample still selects its own lane with `mode`, which is not ours to
   * force: `?apiBase=` supplies the backend, `&mode=live` asks for it. Inert on the other four
   * demos, which ignore the parameter.
   *
   * replaceState, not assign: no reload, and it lands before the sample's deferred module runs. */
  function mirrorBackendParam() {
    if (!resolved) return;
    if (!window.history || typeof window.history.replaceState !== "function") return;
    try {
      var url = new URL(window.location.href);
      if (url.searchParams.has("baseUrl")) return;
      url.searchParams.set("baseUrl", resolved);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch (_error) {
      /* A URL we cannot parse or a blocked history call is not worth breaking the page over: the
       * page keeps whatever backend it already resolved. */
    }
  }
  mirrorBackendParam();

  window.HONUA_DEMO_BASE_URL = resolved;
  window.HonuaDemoBackend = {
    /** The validated override origin, or null when the page runs its default backend. */
    base: resolved,
    /** The origin every demo page hardcodes. */
    defaultBase: DEFAULT_BASE,
    /** The CSP the inline bootstrap actually emitted for this page. */
    policy: typeof window.HONUA_DEMO_CSP === "string" ? window.HONUA_DEMO_CSP : null,
    /** resolve(pageDefault) -> the base URL the page should use. */
    resolve: function (pageDefault) {
      return resolved || pageDefault || DEFAULT_BASE;
    },
    /** rebase(config) -> the same config with demo.honua.io URLs pointed at the override. */
    rebase: rebase,
  };
})();

/* Honua demo CSP bootstrap — INLINED verbatim into each live demo page's <head>.
 *
 * This file is the canonical source. scripts/validate-demo-backend-override.mjs asserts that every
 * demo page's inline copy matches it byte for byte, so the two can never drift.
 *
 * WHY INLINE. honua.io is served by GitHub Pages, which cannot set response headers: the page's own
 * <meta http-equiv="Content-Security-Policy"> is the ONLY policy these pages have. An external
 * script can fail to load — adblocker, network blip, partial deploy — and a public page must never
 * end up with no policy because a fetch failed. An inline classic script cannot fail to load, so the
 * policy is applied unconditionally in the scripting-on path, exactly as the parser-read <meta> was.
 * A failed fetch of assets/demos/backend-override.js therefore degrades to "no backend override",
 * never to "no CSP".
 *
 * THE SAME GUARANTEE HOLDS FOR BAD INPUT. Every step that inspects the URL runs inside one try
 * block whose failure path is "no override", so nothing between here and emitPolicy() can prevent
 * the policy being emitted. decodeURIComponent throws a URIError on malformed percent-encoding
 * (`?apiBase=%`), and a page-supplied window.HONUA_DEMO_BASE_URL could be a throwing getter; either
 * one used to abort the script before the <meta> existed, which — with scripting on, where the
 * <noscript> copy is inert — left the page with NO policy at all. A hostile input must never be able
 * to remove the CSP; that is strictly worse than the override it was trying to obtain.
 *
 * WHAT IT DOES. The canonical policy is the <noscript data-honua-csp> copy immediately above (inert
 * raw text while scripting is on; parsed as real markup, and enforced, when scripting is off). This
 * re-emits it, appending ONE allow-listed origin to connect-src and img-src — the two directives
 * that carry backend traffic — when and only when ?apiBase= (or a pre-set window.HONUA_DEMO_BASE_URL)
 * supplies one. With no override the emitted policy is character-for-character the canonical one.
 *
 * ALLOW-LIST. One anchored regex over the whole candidate, so userinfo, paths, queries and fragments
 * are rejected by construction rather than enumerated: https:// + honua.io or any *.honua.io
 * subdomain, or http(s):// + a loopback host, each with an optional port and an optional single
 * trailing slash. Anything else is ignored and the policy is left alone. Pointing a demo somewhere
 * else is a code change here, not a URL parameter.
 */
(function () {
  var canonical = document.querySelector("noscript[data-honua-csp]");
  var declared = canonical && /content\s*=\s*"([^"]*)"/i.exec(canonical.textContent || "");
  var canonicalPolicy = declared && declared[1];
  if (!canonicalPolicy) return;

  var policy = canonicalPolicy;
  var origin = null;
  var requested = "";

  if (true) {
    var param = /[?&]apiBase=([^&]*)/.exec(window.location.search || "");
    requested = param
      ? decodeURIComponent(param[1].replace(/\+/g, "%20"))
      : typeof window.HONUA_DEMO_BASE_URL === "string"
        ? window.HONUA_DEMO_BASE_URL
        : "";
    var candidate = String(requested).trim().toLowerCase();
    var allowed = /^(?:https:\/\/(?:[a-z0-9-]+\.)*honua\.io|https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]))(?::\d{1,5})?\/?$/;
    origin = allowed.test(candidate) ? candidate.replace(/\/$/, "") : null;

    if (origin) {
      policy = canonicalPolicy
        .split(";")
        .map(function (directive) {
          var name = directive.trim().split(/\s+/)[0].toLowerCase();
          if (name !== "connect-src" && name !== "img-src") return directive;
          if ((" " + directive + " ").indexOf(" " + origin + " ") >= 0) return directive;
          return directive.replace(/\s*$/, "") + " " + origin;
        })
        .join(";");
    }
  }

  var meta = document.createElement("meta");
  meta.setAttribute("http-equiv", "Content-Security-Policy");
  meta.setAttribute("content", policy);
  (document.head || document.documentElement).appendChild(meta);

  /* Handed to assets/demos/backend-override.js, which never re-validates: this bootstrap is the
   * single place the allow-list is enforced. */
  window.HONUA_DEMO_BACKEND_ORIGIN = origin;
  window.HONUA_DEMO_CSP = policy;
  if (!origin && window.location.search.indexOf("apiBase=") >= 0 && window.console && window.console.warn) {
    window.console.warn("[honua-demo-backend] ignored backend override (not allow-listed or unparseable)");
  }
})();

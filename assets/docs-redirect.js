// Runtime documentation redirect (scripts/gen-runtime-docs-redirects.mjs).
// The meta refresh alone drops the fragment, and a runbook_url points at a
// heading: landing on the right page at the wrong place is its own kind of
// broken. An external file rather than inline script so the strict
// script-src 'self' policy in _headers allows it.
(function () {
  var link = document.querySelector('link[rel="canonical"]');
  if (link && link.href) location.replace(link.href + location.hash);
})();

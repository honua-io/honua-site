// Claims that must never reach a rendered public page.
//
// Shared so the two gates that enforce them stay one list:
//   - scripts/validate-site-claims.mjs   (root *.html, the marketing site)
//   - scripts/validate-slice-voice.mjs   (dist/docs/**/*.html, the slice pages)

export const forbiddenClaims = [
  [/\b(?:6\.2\.0|4\.3\.0|2\.5\.0)\b/, "invented SDK upgrade version"],
  [/name="_webhook"/, "public form webhook"],
  [/github\.com\/honua-io\/(?:honua-esri-compat|honua-support)/, "private repository presented as public evidence"],
  [/TODO\(data\)/, "internal TODO exposed to visitors"],
  [/connect(?:s|ed)? unchanged/i, "unscoped 'connect unchanged' claim"],
  [/every GIS standard/i, "unscoped 'every GIS standard' claim"],
  [/No true-ups, ever/i, "unsupported no-true-up promise"],
  [/capacity ceiling lifts entirely/i, "unsupported unlimited surge promise"],
  [/guaranteed capacity ceiling lift/i, "unsupported guaranteed surge promise"],
  [/license never touches a request/i, "incorrect license request-path claim"],
  [/production tooling/i, "prerelease migration tooling presented as production"],
  [/\b(?:open-core GIS server|ELv2 open core|open core:\s*ELv2|open-core and self-hostable)\b/i, "ELv2 server presented as open core"],
  [/fonts\.(?:googleapis|gstatic)\.com/, "external Google Font dependency"],
  [/href="https:\/\/demo\.honua\.io\/?"/, "demo host root used as a landing page"],
];

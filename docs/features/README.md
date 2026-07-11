# Honua site feature map

`honua-site` is the static public marketing, proof, documentation-entry, and
trust site for Honua.

## Primary buyer path

1. `index.html` explains the product and routes evaluators to the quickstart or
   migration-assessment form.
2. `docs.html` provides the local quickstart and accurately labels SDK registry
   availability.
3. `interoperability.html`, `migration.html`, `operations.html`, and
   `pricing.html` explain the main evaluation dimensions.
4. `claims.html` and the `proof-*.html` pages expose evidence and gaps.
5. `index.html#contact` is the canonical commercial form; `cloud.html` has a
   separately labelled Cloud-waitlist form.

Primary navigation is: Why Honua, Operations, Compatibility, Migration,
Pricing, Proof, Docs, GitHub, and the contact CTA.

## Current pages

- `index.html` — home, proof summary, and migration-assessment form.
- `belief.html` — product principles.
- `operations.html` — deployment, observability, and private-beta operator loop.
- `interoperability.html` — protocol and client-compatibility narrative.
- `migration.html` — assessment and cutover path.
- `pricing.html` — capacity bands, editions, and availability-labelled roadmap.
- `claims.html` — public claims ledger.
- `docs.html` — quickstart and SDK availability.
- `client-compatibility.html` — registry-backed SDK availability and the correct
  server capability endpoint.
- `proof-benchmarks.html`, `proof-compatibility.html`,
  `proof-migration.html`, `proof-architectures.html`, and `proof-vs.html` —
  evidence pages with explicit dated or pending boundaries.
- `cloud.html` — managed-service waitlist; not a GA service claim.
- `privacy.html`, `terms.html`, and `security.html` — site trust and legal pages.
- `404.html` and `thanks.html` — noindex route-failure and form-confirmation pages.
- `qgis-plugin.html` and `honua-gis.html` — noindex experimental pages that must
  remain de-linked until their owning artifacts are public.

`open-core.html`, `cloud-native.html`, `performance.html`, `proof.html`, and
`demos.html` are compatibility redirects to current pages. The edge worker owns
the HTTP redirect map; meta refresh remains a GitHub Pages fallback.

## SDK availability contract

The generated table in `client-compatibility.html` reads
`data/sdk-availability.v1.json` through
`scripts/gen-compatibility-matrix.mjs`.

- A package is “public” only when the linked registry endpoint resolves.
- A source tag is not an installable package.
- A supported SDK-to-server window requires released artifacts and cross-version
  evidence; no such general matrix is published today.
- `/rest/info` is an Esri protocol-discovery response. Honua compatibility comes
  from `/api/v1/admin/capabilities`.
- `kb-compat-0001.html` is a noindex withdrawal notice retained so stale links
  cannot continue serving incorrect install guidance.

`scripts/validate-site-claims.mjs` checks registry state, forbidden stale claims,
and the generated table.

## Proof contract

- Public pages may only call evidence “open” when an anonymous visitor can reach
  it.
- GeoServices REST remains partial except where the public parity matrix states a
  narrower complete boundary.
- Dated benchmark snapshots stay dated and are not promoted to GA headline proof.
- Missing customer, sizing, TCO, marketplace, or release evidence is presented as
  an evidence boundary, never as an internal `TODO`.
- Roadmap, Beta, private-beta, Preview, and proof-pending labels remain visible at
  the point of the claim.

## Lead capture and consent

`assets/analytics.js` loads Google Analytics only after explicit consent. It must
never read the PII fields `name`, `email`, `company`, or `message`.
Attribution is session-scoped and copied into hidden `lead_*` fields only after
consent. Both forms submit through FormSubmit; no private CRM or webhook endpoint
may be embedded in public HTML.

The payload and downstream ownership contract lives in
`docs/lead-capture-handoff.md` and is enforced by
`scripts/validate-lead-capture.sh`.

## Shared infrastructure

- `styles.css` — shared visual, responsive, consent, and accessibility rules.
- `assets/nav.js` — mobile navigation behavior.
- `assets/analytics.js` — consent, CTA attribution, and form conversion events.
- `_headers` — desired response headers and CSP source of truth.
- `edge/worker.js` / `edge/header-rules.json` — response-header and redirect edge.
- `scripts/build-dist.sh` — deploy artifact.
- `scripts/validate-*.sh` and `scripts/validate-site-claims.mjs` — CI contracts.

Samples and demos have their own publication contract. Shared navigation,
security, analytics, and accessibility changes may affect them, but their content
and mechanics are maintained separately.

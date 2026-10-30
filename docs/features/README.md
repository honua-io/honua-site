# Honua site feature map

`honua-site` is the static public product, engineering-blog, evidence, documentation-entry, and trust site for the Honua spatial platform.

## Information architecture

Primary navigation: How it works, Demos, Samples, Editions, Blog, Docs, GitHub, and Talk to us. The logo links home.

- `index.html`: the AI-first spatial-platform promise; migration, creation, elastic compute, reversible operations, connectivity, and the contact form.
- `architecture.html`: interactive Platform / Deployment / Safe operations views. Deployment distinguishes single host, serverless containers, node-based clusters, and separate batch capacity.
- `editions.html`: Community, Pro, Enterprise; comparison from the committed capability registry; source-license split; current-release conditions; scale-based commercial direction without final rates.
- `pricing.html`: noindex compatibility redirect to Editions, preserving the comparison anchor for old links.
- `replaces.html`: the platform page listing, product by product, what Honua Server, Console, Studio, the SDKs, Mobile SDK, Collect, agents, and tooling replace in ArcGIS, the open-source stack, and SaaS mapping tools (Mapbox, CARTO, Felt), with release maturity per row.
- `proof-vs.html`: noindex compatibility redirect to `replaces.html`; the dated GeoServer benchmark stays on `proof-benchmarks.html`.
- `blog.html`: launch-series collection and engineering deep dives. Initial articles cover platform vision, AI mapmaking, geoprocessing, and safe operations.
- `docs.html`: quickstart, package availability, and implementation documentation entry.
- `capabilities.html`, `claims.html`, and `evidence-*.html`: existing authoritative capability/evidence projections, linked contextually and from the footer rather than duplicated in marketing.
- `security.html`, `trust.html`, `privacy.html`, `terms.html`: security, trust, and legal information.

Legacy feature narratives, demos, and samples remain reachable for existing inbound links. Preview trial enquiries and first-release availability statements are not promoted to GA purchasing claims.

## Preparation and validation

Run `node scripts/prepare-marketing-pages.mjs` before local preview or validation. It supplies deterministic metadata, font preloads, approved homepage JSON-LD/CSP, skip-link styling, redirect metadata, and the sitemap. `--check` verifies an already-prepared tree. The build and CI invoke preparation explicitly. See [remodel handoff](../website-remodel.md).

Existing generated-content contracts remain authoritative:

- `data/capabilities.v1.json` is the site's committed capability/evidence projection; Editions consumes it directly. Minimum edition and release maturity remain separate.
- `data/sdk-availability.v1.json` and `gen-compatibility-matrix.mjs` control SDK availability. A source tag is not an installable package. Compatibility claims remain operation- and version-scoped.
- Capability-slice pages under `docs/<slug>/` are generated from `slices/*.json`. Do not hand-edit those projections.
- Public support schemas remain byte-pinned to their provenance records. Do not expose private repositories as public evidence.
- Benchmarks remain dated and workload-specific. Preview/Experimental and unavailable capability boundaries stay visible at the claim.

## Shared infrastructure

- `assets/remodel.css` and `assets/remodel.js`: scoped presentation and progressive controls for remodeled routes.
- `styles.css`: existing legacy documentation/evidence/sample presentation.
- `assets/nav.js`: mobile navigation plus consistent primary links on legacy routes.
- `assets/analytics.js`: unchanged consent-gated analytics and lead attribution. It must not read PII fields.
- The homepage form retains FormSubmit, its recipient, required attribution fields, and privacy text. See [lead capture handoff](../lead-capture-handoff.md).
- `_headers` and `edge/`: unchanged desired security policies and hosting-enforcement contracts.
- `scripts/build-dist.sh`: deploy artifact plus deterministic page preparation.
- `.github/workflows/pages.yml`: preparation, existing validation gates, and trunk-only publication behavior.

Samples, demos, machine docs, and capability projections retain their existing publication contracts. The new blog does not replace implementation documentation or imply that social posts have been published.

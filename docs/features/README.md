# Honua Site Feature Map

This repository owns the static public site.

## MVP IA

The MVP public-site navigation has three primary groups and a small utility rail:

- Platform: `platform.html`, `agentic-gis.html`, `runtime.html`, and `devops.html`.
- Developers: `docs.html`, `sdks.html`, and `mobile.html`.
- Compatibility: `protocols.html` and `modernization.html#arcgis-geoserver`.
- Utilities: `modernization.html`, `pricing.html`, GitHub, and the contact/demo CTA at `index.html#contact`.

The canonical MVP conversion path is:

1. `index.html` introduces the buyer problem and sends self-serve evaluators to `docs.html#quickstart`.
2. `docs.html#quickstart` lets evaluators run Honua locally and continue into SDK, protocol, modernization, or platform detail pages.
3. Site CTAs route commercial or migration conversations to `index.html#contact`, which is the MVP lead/demo endpoint until a sales-owned CRM or marketplace handoff is approved.

CTA instrumentation belongs on site-owned links with `data-analytics-event`, `data-analytics-label`, and `data-analytics-destination` attributes. The analytics helper also accepts `data-cta-location` and `data-cta-destination` on claims-matrix links. After analytics consent, contact-form attribution is carried through hidden `lead_*` fields populated by `assets/analytics.js`. The lead payload, CRM handoff, smoke evidence, and downstream ownership model are documented in [Lead Capture And CRM Handoff](../lead-capture-handoff.md).

## Page Scope

Core MVP pages:

- `index.html`: home page, proof summary, and canonical contact/demo form.
- `docs.html`: quickstart and developer continuation path.
- `pricing.html`: Open Core and commercial-entry language bounded to approved high-level categories.
- `claims.html`: public claims matrix for Preview, Beta, proof-pending, external-owner, and deferred status review.
- `modernization.html`: migration-assessment entry point for ArcGIS and GeoServer evaluators.
- `protocols.html`: compatibility and proof entry point.
- `privacy.html`, `terms.html`, and `security.html`: trust, data-handling, legal, and security posture.

Supporting/detail pages:

- `platform.html`: platform overview for users who want the broad architecture.
- `agentic-gis.html`: AI-agent and MCP detail page.
- `qgis-plugin.html`: early-preview Honua GIS Assistant QGIS plugin landing page, bounded to source/release/media artifacts owned by `honua-qgis-plugin`.
- `honua-gis.html`: Honua-GIS open-weights model/eval track, source-backed status table, and pending model-serving release gates.
- `runtime.html`: gRPC/runtime detail page.
- `devops.html`: GitOps, observability, and operations detail page.
- `sdks.html`: SDK detail page.
- `mobile.html`: field/offline workflow detail page.

Supporting pages should only change when needed for nav consistency, CTA routing, claim alignment, or proof linking. They are not separate conversion endpoints for this MVP.

## QGIS Plugin Page Contract

`qgis-plugin.html` is a static top-level page served through the same static build and `_headers` contract as the rest of the site. The canonical URL is `https://honua.io/qgis-plugin.html`; `scripts/build-dist.sh` picks it up automatically because it copies top-level HTML files into `dist/`.

Public wording for the page must stay aligned with `claims.html#qgis-plugin`:

- Status: Honua GIS Assistant is a `0.1.0` early-preview, GPL-2.0-or-later QGIS plugin targeting QGIS 3.34+.
- Implemented behavior: toolbar/menu entry, right-docked chat/control panel, local Ollama model refresh, streamed generation with cancellation, local audit JSONL controls, default-off remote endpoint settings, and a bounded PyQGIS vector-layer query bridge.
- Install contract: direct end-user install copy points to the GitHub Releases ZIP only after `honua-qgis-plugin` publishes one. Until then, this site links to the source repository and release page and keeps release ZIP, QGIS marketplace approval, screenshots, demo poster, and demo video marked pending.
- Privacy boundary: local use requires no Honua account and sends no plugin analytics, crash reports, prompts, responses, project files, layer data, or audit records to Honua. Local model calls go only to the configured Ollama endpoint. Remote OpenAI-compatible endpoints are opt-in and governed by the endpoint operator's terms.
- Site telemetry: QGIS plugin page CTAs use the existing consent-gated `cta_click` link attributes. Analytics absence or failure must not block repository, release, anchor, or contact navigation.
- Media contract: production screenshots and native video assets should be committed under `assets/qgis-plugin/` only after the plugin owner supplies release-matched proof media. Avoid third-party embeds unless CSP and privacy copy are deliberately updated.

## Content Ownership

- `honua-site`: static IA, navigation, CTA placement, contact-form fields, privacy/security/terms site copy, analytics hook points, and links to proof assets.
- `honua-server`: runtime, protocol, compatibility, deployment, migration, and operator evidence consumed by public pages.
- `honua-qgis-plugin`: QGIS plugin source, release ZIP, marketplace approval, screenshots, demo video, install source of truth, and plugin-local privacy documentation consumed by `qgis-plugin.html`.
- SDK repos: SDK capability matrices, examples, and sample-harness evidence consumed by site proof surfaces.
- `honua-marketplace`: marketplace URL, offer/listing package, entitlement activation proof, and publish evidence.
- `honua-sales`: pricing, pilot packaging, sales handoff model, commercial terms, roles, SLAs, escalation, and content-owner commitments.
- `honua-support`: pilot support minimum and escalation boundaries.
- `honua-showcase`: repeatable demo flow used by pilot and sales motions.

## Source Evidence

- Pages: `*.html`
- Public claims matrix: `claims.html`
- Lead capture and CRM handoff: `docs/lead-capture-handoff.md`
- Assets and navigation: `assets/`
- Styles: `styles.css`
- Deployment headers: `_headers`
- Build and validation scripts: `scripts/build-dist.sh`, `scripts/validate-security-headers.sh`, `scripts/validate-workflow-pinning.sh`
- Release-lane status: `release/honua-2026-05-preview.json` in the release-planning workspace.
- Runtime and compatibility proof sources: `honua-server` docs, including platform, SDK compatibility, GIS compatibility, certification evidence, and deployment scenario documents.

## Release Gaps

The `proof-and-gtm-buyer-path` release lane spans multiple repositories. Site-owned work is limited to IA, CTA routing, attribution, the static form contract, and proof links. The remaining release-lane gaps stay bounded to their owning tickets:

- `honua-site#3`: static form contract, CTA instrumentation, consent-gated attribution, and handoff evidence. CRM monitoring and failed-sync alerting remain sales/support-owned unless a secure site-owned ingestion endpoint is approved.
- `honua-site#9`: proof hub that publishes benchmarks, compatibility matrix, migration evidence, and reference architecture after source assets are supplied.
- `honua-site#17`: public claims matrix mapping every site claim to source, proof, or roadmap status.
- `honua-marketplace#3`: marketplace handoff target, offer/listing package, activation, and publish evidence.
- `honua-sales#4`, `honua-sales#5`, `honua-sales#6`, `honua-sales#18`, and `honua-sales#25`: pricing, pilot packaging, sales handoff model, roles, SLAs, escalation, and content-owner commitments.
- `honua-sales#42`: end-to-end buyer-path acceptance from site CTA to marketplace deployment to first service publish.
- SDK repos: SDK capability matrices, sample-harness evidence, and SDK-driven migration evidence consumed by site proof surfaces.
- `honua-showcase`: repeatable demo flow used by pilot and sales motions.
- `honua-qgis-plugin`: release ZIP, QGIS marketplace approval, production screenshots, demo poster/video, and final download URL for the QGIS plugin landing page.

## Boundary

The site should describe shipped and near-term release paths, but product claims must be verified against `honua-server`, SDK, mobile, admin, sales, support, marketplace, and deployment repos before publication. Do not publish numeric pricing, pilot packages, SLAs, marketplace offer claims, or stronger proof claims in this repository until the owning tickets provide approved source-backed material.

`claims.html` is the public review surface for this contract. Each major claim should resolve to one or more of these statuses: Source-backed, Preview partial, Proof pending, Roadmap / Beta, Deferred, or External owner.

## Claims Maintenance

Public product-claim edits must update `claims.html` in the same PR when they add, remove, promote, or soften a shipped, Preview, Beta, proof-pending, roadmap, or deferred claim.

Each matrix row records the claim area, public pages, public wording rule, release status, evidence or owning issue, and review notes. Claims owned outside this repository should link the source, proof asset, or owner ticket rather than restating them as site-owned commitments.

Keep low-noise discovery for the matrix through the footer Trust column plus contextual docs/pricing links. Do not crowd primary navigation unless the site information architecture changes.

CTA and lead-form attribution remains consent-gated through `assets/analytics.js`. Analytics failures or missing consent must not block navigation or contact-form submission.

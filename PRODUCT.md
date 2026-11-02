# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary (confirmed): the GIS or IT lead who owns an ArcGIS Enterprise estate (or a GeoServer/PostGIS stack) and feels its licence cost and operations burden. They arrive evaluating whether Honua can replace pieces of that estate without breaking the ArcGIS Pro, Field Maps, QGIS, Esri Leaflet and ArcGIS JavaScript clients their organisation already runs. Their job on the site: decide whether Honua is credible enough to pilot beside what they run today, then start a conversation or a migration pilot.

Secondary (confirmed): platform and application developers building spatial apps who want a self-hosted server with open protocols, SDKs, samples and AI tooling. Their job: install it, try it live, read the API and sample code, and judge compatibility.

The buyer leads the homepage; developers are served through demos, samples, docs and the install-with-agent path.

## Product Purpose

honua.io is the public marketing, engineering-blog, evidence, documentation-entry and trust site for Honua, an AI-native, self-hosted geospatial platform. The platform is Honua Server (a source-available GIS server for PostGIS), Console, Studio (self-hosted, Preview), JavaScript / Python / .NET SDKs, an experimental Mobile SDK and Collect, agents with MCP discovery, and migration tooling.

The site exists to turn an evaluator into a qualified conversation (the contact form, routed to the CRM via FormSubmit), a migration pilot, or a live trial (demos, samples, self-install). Success is a credible, truthful case that produces contact submissions and demo/install starts, measured through consent-gated GA4 CTA and lead events.

## Positioning

One server exposes the protocols every existing client already speaks: GeoServices REST (FeatureServer, MapServer, ImageServer, VectorTileServer, GeocodeServer), OGC API and WMS/WFS/WMTS/WCS, OData, STAC, vector and raster tiles, gRPC, and MCP, so ArcGIS and open-source clients keep working while the server underneath changes. It runs in the customer's own cloud or on-premises, with the customer's own models: AI acts only through explicit tools, permissions and approval policies, and never edits source feature data directly. Serving, coordination and batch geoprocessing scale independently instead of one server sized for peak. Migration from ArcGIS and GeoServer is automated for supported workflows. Licensing is Fair Source (FCL-1.0-ALv2) for Server and Collect, Apache 2.0 for the rest. The claim a neighbour cannot copy: compatibility with the Esri client estate plus open protocols plus customer-controlled AI, in one self-hosted image.

## Operating Context

Evaluators read the homepage, then move to `replaces.html` (what Honua replaces, row by row, with release maturity), `architecture.html` (platform, deployment topology, safe operations), `editions.html` (Community / Pro / Enterprise from the committed capability registry), `demos.html` and live demos on demo.honua.io against one Maui dataset, `samples.honua.io`, `docs.honua.io`, GitHub, and `install-with-agent.html`. Capability claims resolve to `capabilities.html` and per-capability `evidence-*.html` pages generated from `data/capabilities.v1.json`. A dated GeoServer benchmark lives on `proof-benchmarks.html`. Trust, security, privacy and terms pages carry legal and security posture.

Typical usage scene: a desk evaluation on a laptop or external monitor during work hours, often with ArcGIS Enterprise admin consoles and procurement documents open beside it. Mobile visits come from shared links.

## Capabilities and Constraints

- Plain static HTML, CSS and vanilla JS. No framework, no bundler. Each root `*.html` is a page; `build-dist.sh` ships root pages plus the generated docs bundle.
- 184 root pages. 127 marketing pages share `assets/remodel.css` (scoped under `.h-site`) and `assets/theme.css` tokens; 43 legacy docs, evidence and sample pages share `styles.css`. Demos keep their own styling.
- Content Security Policy: `font-src 'self'` (fonts must be self-hosted woff2 under `assets/fonts/`), `style-src 'self' 'unsafe-inline'`, `script-src 'self'` plus GA origins with a pinned JSON-LD hash on the homepage, `img-src 'self' data:` plus GA and honua.io. `_headers` is the source of truth; keep any inline meta CSP in sync.
- `scripts/prepare-marketing-pages.mjs` rewrites metadata, font preloads, JSON-LD, CSP hash and skip-link on the marketing routes; CI runs it with `--check`.
- Lead-capture contract on the homepage: the FormSubmit form, hidden `lead_*` attribution inputs, honeypot, privacy text, and `data-analytics-event="cta_click"` plus label and destination on buyer-path CTAs. `validate-lead-capture.sh` enforces it exactly. `analytics.js` must never read name, email, company or message.
- Truth gates: `validate-site-claims.mjs`, operator-claims and capability-link validators. Preview and Experimental labels stay visible at the claim. No GA purchasing claims for Preview capabilities; no final usage rates or capacity bands; no hosted Studio demonstration exists.
- Esri trademark notice must remain on every page that names Esri products; Honua is independent of Esri.
- Default branch is `trunk`; deploys on push to trunk via GitHub Pages. Redesign work happens on `site/redesign-impeccable` in a worktree.
- Open decision: the redesign establishes its world on `index.html` first, then rolls it through `remodel.css` so other marketing pages inherit. Legacy `styles.css` pages are out of scope for this pass.

## Brand Commitments

- Name: Honua. Wordmark set lowercase "honua" beside `assets/honua-logo.svg` (also `.png`); favicon and OG image exist.
- Binding visual constraint (confirmed by the owner): the dark teal "ocean" palette. Ground `#08131a`, surfaces `#0e1e27` / `#162a34` / `#1f3a47`, lines `#22343f`, text `#e6efee`, muted `#8ea7a6`, teal `#3aa088` / `#5fc4a6`, blue `#5fa1cc` / `#85c9f4` / `#3a7aa0`, amber `#d9824a` / `#f2aa78`, cream `#e9efed`, danger `#f29c95`. Recorded in `assets/theme.css`. Typography is open; the current Geist / Geist Mono are not binding.
- Voice: plain, specific, non-hyped; claims are scoped and labelled; "AI-first, customer-controlled"; "Your infrastructure. Your data. Your AI." Tagline in use: "Spatial systems, reimagined."
- Legal: Fair Source and Apache 2.0 split stated in the footer; Mobile SDK and Collect are experimental; Esri disclaimer.

## Evidence on Hand

- Live demos on demo.honua.io (Maui 3D, one layer five protocols, web map app, spatial analytics, editing, Esri Leaflet unmodified) and a samples gallery; `assets/demos/` and `assets/sdk-samples/` hold published samples; `assets/maui-zoning-live-render.png` is a real render.
- Capability registry `data/capabilities.v1.json` with per-capability evidence pages; SDK availability matrix `data/sdk-availability.v1.json`; `replaces.html` product-by-product replacement table with maturity.
- Dated GeoServer benchmark on `proof-benchmarks.html`.
- Engineering blog articles: platform vision, AI mapmaking, geoprocessing, safe operations.
- Architecture drawings are conceptual illustrations, not product screenshots.
- Absent, never to be fabricated: customer names, logos, testimonials, case studies, press, pricing rates, hosted Studio demo, benchmark numbers beyond the dated GeoServer one.

## Product Principles

1. Compatibility is the proof: show existing clients working against Honua before asking anyone to believe anything else.
2. Every claim is scoped, dated or labelled; evidence pages back it, and maturity (GA / Preview / Experimental) is visible where the claim is made.
3. Customer control over infrastructure, data and AI is the differentiator, not a footnote.
4. The buyer decides, the developer verifies: every buyer path has a hands-on counterpart (demo, sample, install).
5. Truthful static simplicity: no dependency the CSP or the build cannot carry.

## Accessibility & Inclusion

Keyboard-visible focus, skip link, semantic landmarks and a no-JavaScript readable page are existing commitments. Evaluators read dense tables; contrast and type size at desk distance matter more than decoration.

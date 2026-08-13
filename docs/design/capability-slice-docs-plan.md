# Capability-slice docs — plan

Status: plan draft, revision 3 · 2026-08-13 (supersedes the 2026-08-10 draft)
Companion to: `samples-gallery-design-brief.md` (the gallery redesign, act one) and `slice-docs-design-brief.md` (the design handoff for these pages).
Amends: `docs/demo-samples-architecture.md` (the five-jobs split) — see "Consolidation".
Source material: `honua-samples/docs/competitive-sample-audit.md` (job-page spec + 14-track curriculum), `honua-samples/docs/job-pages.md`.

## What changed in revision 3

- **The embedding contract is written down** — which repo is framed, which is pointed at, and the GitHub Pages constraint that comes with it. See "Embedding".
- **Cloud-native formats moves to wave 1** and gets a sharper thesis: direct-to-asset, with or without a server. The JS SDK already shipped most of it.
- **Finding things is a first-class surface** — an index, a faceted finder, and one search box across slices, Operations, SDK reference, and samples. See "Finding things".
- **A backlog** with owning repos, at the end.
- A design brief now exists as a separate document, mirroring the gallery brief.

## What changed in revision 2

Owner review added four topics the first draft missed and forced two structural corrections. In short:

- **Four new slices**: Cloud-native formats, Cloud-native architecture, Catalog & discovery, Style & cartography.
- **The AI slice split three ways** — the ops loop, the Studio app builder, and the MCP contract are different products with different readers. Migration comes out on its own.
- **Ops is a section, not a slice.** Day-2 material gets its own axis; slice 11 shrinks to Auth & identity.
- **SDK reference sites stay separate and are named as a first-class surface**, which flips decision 1 toward a `docs.honua.io` umbrella.
- Alerts and geofencing are placed in Realtime, not Ops, with a defined split trigger.
- All five open decisions are answered below except the Phase-4 ranking, which needs the owner.

The slice count goes 14 → 21. That is the whole product's information architecture now, which is the point — and also why the ship rule and wave discipline matter more than they did at 14.

## The idea

One page per capability slice. Each slice covers every seat at the table:

- the **operator** setting it up (Console, CLI, admin API),
- the **developer** consuming it (JS, Python, .NET, Mobile),
- the **agent** asking about it (MCP),

with the live sample at the top and the protocol fine print at the bottom. "Realtime" is one page, not five scattered doc properties. Nobody in GIS has this — Esri splits exactly these surfaces across Server docs, Pro docs, SDK docs, and REST docs.

This is act two. The samples gallery redesign (the wow slate) ships first and is not blocked by anything here.

## Two axes, not one

The first draft assumed everything is a slice. It isn't. The docs home has two axes, and a third surface it links to rather than owns:

1. **Slices** — capability verticals. Something you do with geodata. Twenty-one of them, below.
2. **Operations** — a flat day-2 section: deploy, configure, monitor, back up, upgrade, recover, scale, troubleshoot. Its reader arrives with a different question ("how do I run this") and never wants a hero map.
3. **SDK reference sites** — per-language, symbol-level, already built and hosted separately. Slices link out; they never absorb them.

Getting this wrong is how you end up with four homes for the same sentence — the exact fork pattern that produced four capability vocabularies before the canonical key list fixed it.

## What already exists — build on it, don't reinvent

1. **The audit's cross-SDK job-page spec** already defines the page: server-contract panel, "Configure in Console" panel, "AI capability context" panel, CLI in the reference matrix, per-SDK tabs. Adopt the panel order. Strip the public evidence apparatus (receipts, maturity dossiers, provenance blocks, TTLs) — internal metadata, same rule as the gallery brief.
2. **The capability data spine.** `data/capabilities.v1.json` (110 keys, 28 categories) + `scripts/gen-capability-catalog.mjs` already generate `capabilities.html` and ~130 `evidence-*.html` pages, synced from honua-server's published artifacts via `sync-capabilities-data.mjs`. Slices are a new projection of the same data.
3. **The samples publication contract** (`sdk-sample-publication.mjs`, digest/SRI handoffs, `demo-services.v1.json`). Slices embed samples from the canonical catalog by id — never copy code, never hand-write service URLs.
4. **llms.txt machinery** (`sdk-llms-publication.mjs`). Every slice emits a markdown twin; `llms.txt` lists the slices.
5. **`api-reference.html`** — the on-site API reference generated from the demo-server OpenAPI. The "Underneath" panel deep-links here. Nav placement is honua-site#181.
6. **`honua-tokens.css`** from gallery redesign Stage 2 — the shared look. Decided: Bedrock dark.
7. **Three SDK doc sites, two of them live** — see "SDK reference" below.
8. **The GitBook** (`honua.gitbook.io/honuaio`) is substantial: Get started, Concepts, Guides whose taxonomy already half-matches the slice list. That prose is seed material for slice panels 2–3.

Net: mostly reclothing and wiring, not greenfield. The exceptions — the two genuinely unwritten topics — are **Catalog & discovery** and **Cloud-native architecture**.

## The slices

Twenty-one. Names get founder-voice treatment at design time; working list. "Wave" is the proposed build order (see Phases).

| # | Slice | Wave | Notes |
|---|---|---|---|
| 1 | First map | 1 | The ten-minute win |
| 2 | Serve your data | 2 | Import → many protocols out |
| 3 | Query & analyze | 1 | Matches the audit's first job |
| 4 | Maps & interaction | 1 | Mounting, controls, interaction — SDK-side (was "Maps & styling") |
| 5 | Style & cartography | 2 | **New split.** Styles, SLD, Esri renderers, labels, legends, print |
| 6 | Catalog & discovery | 2 | **New.** No public doc home exists today — the biggest hole |
| 7 | Edit & sync | 3 | Mobile SDK's showcase; AI panel is read-only by policy |
| 8 | Imagery & raster | 1 | STAC/COG demo already in the wow slate |
| 9 | Tiles & offline | 1 | PMTiles demo already in the wow slate |
| 10 | Cloud-native formats | 1 | **New.** Direct-to-asset, with or without a server |
| 11 | Warehouse analytics | 3 | GeoParquet/GeoArrow lanes |
| 12 | Realtime, time & geofencing | **0** | **Prototype slice** — exercises every panel |
| 13 | Search, routing & geometry | 3 | Blocked on demo services (Phase 0) |
| 14 | Auth & identity | 3 | Was "Auth & deploy"; deploy half moved to Operations |
| 15 | Migrate from Esri | 2 | Assess, codemods, cutover — no longer riding with AI |
| 16 | Operate: the AI ops loop | 4 | **New from the AI split.** Reference-shaped template |
| 17 | Build an app from a prompt | 4 | **New from the AI split.** Studio; gated on the AI release |
| 18 | Connect an agent (MCP) | 4 | **New from the AI split.** The governed tool contract |
| 19 | Cloud-native architecture | 4 | **New.** Reference-shaped template; no hero map |
| 20 | Frameworks | 4 | React/MapLibre/deck.gl integration |
| 21 | Debug, test & perf | 4 | Reference-shaped template; last |

### Notes on the four new slices

**Cloud-native formats.** The format family was filleted across three slices — COG/Zarr/NetCDF in imagery, PMTiles in tiles, GeoParquet/GeoArrow in warehouse. No page answered "my data is already in object storage, what happens?" `reference/protocols/cloud-native-formats.md` already has the whole family with an honest per-format status table and the three-role framing (registered source / produced artifact / wire format).

**Thesis: direct to the asset, with or without a server.** `connect-stac-static` and `connect-pmtiles` are client-only — no Honua server in the loop — and that is the differentiating claim, not the format list. Imagery & raster keeps the server-side serving story; Tiles & offline keeps delivery; this slice owns direct-to-asset and is the natural home for the client-only runtime kind.

**It is an assembly job, not a writing project** — which is why it moves to wave 1. Already shipped in the JS SDK: `src/cog`, `src/columnar`, `connect-pmtiles`, `connect-stac-static`, `connect-raster-evidence`; guides `cog.md`, `geoparquet.md`, `pmtiles.md`, `columnar-data-plane.md`, `honua-cloud-demo-services.md`; closed work on planner-selected columnar execution (sdk-js#1042), batch↔object conversion (#942), columnar telemetry (#1043), static-asset discovery and the PMTiles path (#820), versioned capability truth per source protocol (#821), and the Cloud-Native Spatial Analysis golden journey (#547). Four embeddable samples exist in catalog v2: `imagery-cog-quickstart`, `overture-geoparquet`, `pmtiles-static`, `stac-imagery-browser`. Demo services back it — imagery, terrain, hillshade, `demo-stac`.

Epic **sdk-js#1113** (open) states the product position this slice inherits: cloud-native formats are "a primary Honua differentiator in the samples gallery, not an 'advanced' footnote." Its children are mostly open (#1114 discovery, #1116 dynamic STAC, #1117 raster unification, #1118 PMTiles lifecycle, #1119 columnar end-to-end, #1121 NetCDF/HDF5, #1257 GeoArrow 0.2 fixture), so the slice ships against what shipped — COG, PMTiles, GeoParquet/GeoArrow, static STAC — and states plainly that Zarr and NetCDF/HDF5/GRIB are server-registered and served with no client-side reader. That matches the server's own status table.

**Cloud-native architecture.** Stateless server, object-storage-backed, serverless GP provisioned per job, autoscale, Helm/IaC, DR ownership. Material exists as `architecture.html`, `cloud-native.html`, the architecture explorer, and `guides/deploy/capability-deployment-profiles.md` — none of it connected to anything. This is the architect/buyer page.

**Catalog & discovery.** Publish → catalog entry → discoverable through every protocol. Keys are scattered across four categories: `serve.ogc-api-records`, `serve.stac`, `serve.geoservices-root`, `scene.catalog`, `discovery.capability-manifest`, `ai.mcp-discovery`. Behind them sits metadata-v2 — crosswalk, extensions, admin input model, prevalidation, parity matrix. **Every one of those docs is under `docs/internal/`.** There is no public page between "import a file" and "query a service" explaining how a thing becomes findable. The slice also owns two real operator footguns: a server without an activated v2 snapshot 500s, and honua-server#3172 (a status-less service defaults to Draft and goes silently invisible on every protocol).

**Style & cartography.** Split out of the old slice 4, which fused map mounting (developer) with cartographic authoring (operator-cartographer). Covers styleId-keyed first-class styles (ADR-0048), OGC API–Styles, SLD import, Esri `drawingInfo` dual-mode authoring, auto-suggest/defaults, legends, and the two `printing.*` keys. Its buyer-facing twin is honua-site#189. Two honest caveats: the visual editor is unbuilt (honua-studio#22, filed 2026-08-13), so the Set-it-up tab is CLI/admin API only; and there is **no labeling capability key** in the 110 — resolve whether that's a vocabulary gap or a product gap before the page makes a labeling claim.

### Alerts and geofencing: realtime, not ops

They share a word with operational alerting and nothing else. The vocabulary already separates them:

- **Alerts** (4 keys — `enter-exit`, `dwell`, `threshold`, `evaluation`) are geofence rules over feature changes. **Channels** (7 keys — Slack, Teams, email, webhook, SNS, Event Grid, digest) deliver them. Reader: the GIS or business user. Data plane.
- **Ops** is two keys — `ops.health`, `ops.observability` — plus findings, proposals, and guardrails. Reader: the SRE. Control plane, no features involved.

So alerts and geofencing live in slice 12, next to `streaming.feature-subscriptions` and the temporal keys — and they are what make it a good prototype: geofence rules exercise every panel, including channel configuration in the operator tab and a "what fired in this zone" MCP transcript.

The one real seam: `/operate/status` includes an alerts rollup. That is "is the evaluator healthy", not "what does a geofence do" — handle it as a cross-link, and keep the word "alert" out of the Operations section's headings.

**Split trigger:** if the page outgrows the template, break **Alerts & geofencing** out as its own slice in Phase 4. Eleven keys and a public-safety / fleet / utilities sales story justify it. Not before.

**Evidence caveat:** the release-safety audit found the alerts evaluator's threshold/dwell/exit branches untested. The GA-guard test-depth pack owes this slice its evidence before the page makes a claim.

## Page anatomy (the template)

1. **The map.** Live sample embedded at the top — pinned full-screen route from samples.honua.io in an iframe, static thumbnail fallback. Cool map first, even in docs.
2. **What it is.** A few paragraphs, founder register. Bigger budget than a demo page's three sentences; still no dossier.
3. **Set it up** — tabs: Console · CLI · Admin API. The operator path. Console tab is an annotated build-time screenshot; the copyable CLI/API configuration is canonical and always present.
4. **Use it** — tabs: JS · Python · .NET · Mobile. The developer path, same editable `const server = "https://demo.honua.io"` line as the gallery. Each tab shows the smallest real snippet and links out to that SDK's reference for symbols.
5. **Ask it.** The MCP/AI panel: what an agent can discover and do, with a real tool-call transcript. Analysis and discovery slices get a rich panel; editing slices state plainly that agents read, never write (ADR-0028).
6. **Underneath.** Protocol chips linking into `api-reference.html` and the OpenAPI operations; one quiet "verified" link into the capability evidence page. Fine print, last.
7. **Related** slices and samples.

### The reference-shaped variant

Three slices have no honest hero map: **Cloud-native architecture**, **Operate: the AI ops loop**, and **Debug, test & perf**. Faking one is worse than not having one. These use a lighter template: panel 1 becomes a diagram or a real interface view (the architecture explorer; a health/timeline view), panels 3–4 stay, panel 5 is often the main panel rather than a side note — the ops loop's agent story is the product — and panel 6 collapses into inline links.

Decide the variant per slice at design time, not per panel at build time, or the template stops being a template.

**Ship rule (the anti-matrix rule):** a slice ships when it has panels 1–2, one setup tab, and one use tab. A missing tab renders as one honest sentence — "Not in the Python SDK yet — track it here" — linking the SDK issue. Never a coverage matrix, never a maturity legend, never an empty tab pretending.

**Never renders publicly:** receipts, lifecycle/maturity states, owner/blocker fields, provenance blocks, support-tier legalese. Same voice banlist as the gallery, enforced by the same build gate.

## Embedding — what gets framed, what gets pointed at

Three repos, three roles. Getting these confused is how the panel-1 embed ends up hand-wired.

- **honua-demo-infra** (the repo formerly named `honua-demo`; GitHub redirects the old name, and it is public) — the live environment at demo.honua.io: terraform root module over honua-iac modules, seeding and data loaders, runbooks, manifests. `manifest/demo-services.v1.json` declares twelve services — maui-parcels, zoning, roads, flood-hazard, sea-level-rise, place-names, buildings, hillshade, terrain, imagery, basemap, demo-stac — with sources, release contracts, and assets. **Never framed.** It is what server-backed samples point at, and its manifest is the liveness truth source: a slice may claim "live" only for what the manifest says is serving.
- **honua-samples** → samples.honua.io — the runnable gallery, already embedding integrity-verified bundles. **This is what gets framed**, by sample id through the publication contract. Never a hand-written URL.
- **The docs domain** — the slice pages themselves. They own no executable code.

**Why frame rather than inline.** honua.io's strict CSP and validator regime cannot host interactive samples — that is the reason samples.honua.io became the single gallery. Re-hosting bundles on the docs domain would fork the runner and the SRI publication contract and double the integrity surface. One canonical embed, framed from the canonical home.

**The Pages constraint (decide this).** samples.honua.io is served by GitHub Pages. Live headers show no `X-Frame-Options` and no CSP, so framing works today by default — and Pages cannot set `frame-ancestors`, so it also cannot be restricted. Either accept open framing (public sample content; low risk) or put a CloudFront distribution in front of the gallery. It should be a decision, not an accident.

**Frame rules.**

- One live frame per page. Each is a full cross-origin page load with its own MapLibre context; several would wreck the page budget.
- Poster first, activate on interaction or scroll — the same progressive rule as the gallery.
- `loading="lazy"`, a fixed aspect-ratio box so nothing shifts, minimal `sandbox` and `allow`.
- The frame ships only if the pinned full-screen route passes a build-time health check. Otherwise: poster plus link, no apology.
- The sample manifest's runtime kind decides the editable line — the `const server` line for server-backed, `dataUrl`/`archiveUrl` for client-only. Cloud-native and offline slices will use the client-only form more than anything else does.

## Finding things — index, finder, search

Twenty-one slices, an Operations section, three SDK reference sites, and a sample gallery is more than navigation can carry. Three surfaces, all generated from data that already exists:

**The index.** `docs.html` becomes the slice index: the twenty-one, grouped, each with one line. Not a taxonomy — a contents page.

**The finder.** A faceted browse over the slice + sample + capability graph: filter by task, protocol, SDK, data mode (server-backed vs client-only), edition, renderer. This is not a new idea — the audit's REQ-009 already requires a generated capability-to-sample matrix that lets a developer find the smallest runnable example by exactly those axes. The finder is that requirement with a UI, built from slice manifests, the samples catalog, and `capabilities.v1.json`. Nothing new to maintain.

The banlist applies here hardest: facets are task, protocol, SDK, data mode, edition, renderer. Never maturity, lifecycle, support tier, or coverage state.

**Search.** One box covering slices, Operations pages, the SDK guide corpora, and samples. A static client-side index generated at build time — no server, works on Pages. The SDK corpora join through the canonical documentation release manifests that honua-site already consumes (site#139), which is what makes docs.honua.io a single search box rather than a fourth one. The same index is the master `llms.txt` (site#101): humans get the search box, agents get the index; one generator, two outputs.

## The Operations section

Day-2 material is not capability-shaped and should stop being forced into a slice. It gets its own flat section: **deploy · configure · monitor & OTel · backup & restore · upgrade & rollback · disaster recovery · scaling & sizing · troubleshoot**, with slice 16 (the AI ops loop) as its flagship page linking down into it.

What exists: twelve `Deploy & operate` guides in GitBook, already written and reasonably current. `guides/deploy/monitoring.md` covers health probes, Prometheus metrics, OTLP export, and pinned alert rules, and is honest that the built-in operate surfaces need neither Grafana nor Prometheus.

What's missing is the **contract-shaped** version buyers read before purchase — and it's all already ticketed: honua-site#185 (metric inventory, scrape config, span taxonomy, sample dashboard), #186 (sizing anchor), #187 (operations runbook), #188 (DR drills with published RTO/RPO evidence).

That splits the GitBook question by reader rather than by topic — see decision 2.

## SDK reference

The SDKs keep their own sites. Slices never absorb them, and the GitBook SDK section should stop competing with them.

| Surface | State |
|---|---|
| `honua-sdk-js` — 99 guide pages + TypeDoc, own build (`build-docs-site.mjs`) | Live at honua-io.github.io/honua-sdk-js/ |
| `honua-sdk-python` — ~19 guides + `reference/` | Live at honua-io.github.io/honua-sdk-python/ |
| `honua-sdk-dotnet` — ~20 guides + DocFX | **Builds on every trunk push, never published** — honua-sdk-dotnet#292 |
| GitBook "SDKs" section — overview + get-started + common-tasks × 3 | Live, and duplicates both of the above |

**Division of labor:**

- **Slices** own task-first, cross-surface work, with per-SDK tabs carrying the smallest real snippet. They never grow into per-language tutorials.
- **SDK sites** own everything symbol-level and language-specific: generated API reference, install and packaging, auth wiring, bundling and tree-shaking, framework bindings, offline/mobile specifics, retry and timeout semantics, error taxonomy, version-migration guides. None of that belongs on a slice — it is per-language by nature and would wreck the tab symmetry.
- **The GitBook SDK section reduces to a routing stub** — three links out.

## GitBook

The slice pages cannot live in GitBook: the live-map-first panel, tabs generated from `capabilities.v1.json`, build-time console screenshots, the banlist gate, and the `honua-tokens.css` skin are all impossible or crippled there.

The split is by job and by reader, migrated guide-by-guide, not as a migration project:

- **Slices own anything with a map or a capability.** Each overlapping guide (publish data, style maps, query and analyze, edit data, connect clients, migrate) donates its prose to the matching slice, then redirects when that slice ships.
- **Contract-shaped ops pages move to honua.io's Operations section** — metric inventory, sizing anchor, upgrade procedure, DR evidence. Buyers read these before purchase and will not find them in a GitBook.
- **GitBook keeps the long procedural runbooks** — Docker Compose deployment, pilot onboarding, authentication setup, and the operator procedures inventoried in the appendix. Long, procedural, versioned; GitBook is fine at those.
- **One machine-docs index.** Both surfaces emit llms.txt today; the docs domain's becomes the master index and lists the GitBook's entries rather than competing with them.

## Architecture

- **Home:** `docs.honua.io` (revised — see decision 1). Slices at `/<slice>/`, SDK reference mounted at `/sdk/js|python|dotnet`, the OpenAPI reference at `/api`, Operations at `/operations`. Repo Pages builds stay the build origin; the domain is the front door. Gotcha carried forward: `build-dist.sh` copies root `*.html` only (`-maxdepth 1`) — extend it for a page directory.
- **Content model:** one `slices/<slug>.json` (or markdown + frontmatter) per slice declaring capability keys (must exist in `capabilities.v1.json`), sample ids (must exist in the samples catalog), console routes, CLI commands, MCP operations, template variant, related slices. A `gen-slice-pages.mjs` generator renders static pages + markdown twins. Validators: every reference resolves, banlist clean, links live — wired into the existing CI validate job.
- **Console screenshots:** captured at build time with Playwright against a seeded console, pinned to the console version, sanitized fixture data. If a console screen doesn't exist, the tab is absent. No mockups. Note that honua-console has had no commits since 2026-07-01, so several slices will ship without a Console tab and that is fine.
- **Samples:** embedded by id through the publication contract. The slice never owns executable code. One canonical catalog, two projections (gallery card + slice panel).
- **Machine docs:** each slice's markdown twin joins `llms.txt` / `llms-full.txt` via the existing publication record.
- **Evidence pages:** stay generated (they back `claims.html` and the "verified" links) but leave the navigation.

## Decisions

**1. Home → `docs.honua.io`, not `honua.io/docs/<slice>/`.** *(Revised from the first draft's recommendation.)* The reason is the SDK sites. They are permanent, separate, and already built; under a path-based scheme, slices sit on one host and SDK reference on `github.io` defaults, findable only by luck. A subdomain umbrella gives one place to send a developer and one master `llms.txt` — which honua-site#101 already assumes exists. The CI, validators, and capability data still live in honua-site; only the front door moves.

**2. GitBook → split by reader.** Slices absorb the capability guides guide-by-guide with redirects; contract-shaped ops pages move to the Operations section on the docs domain; GitBook narrows to long procedural runbooks. This is sharper than the first draft's "GitBook keeps the runbooks", which — as the appendix shows — would have meant two files.

**3. Evidence pages → demote to fine-print links.** Unchanged. They stay generated and leave the nav; the slice is the public face.

**4. Prototype slice → Realtime, time & geofencing.** Confirmed. Geofencing makes it stronger: it exercises the operator tab (rules + channels), the developer tab (subscriptions), and the agent tab in one page.

**5. Phase 4 order → still open.** Proposed ranking below, but this one needs the owner: rank by what sales calls keep asking for.

## Phases

**Phase 0 — prerequisites** (parallel with gallery redesign)

- Gallery Stage 1/2 delivers `honua-tokens.css` in Bedrock dark. Slices inherit it.
- Stage the missing demo services on demo.honua.io: geocoding, routing, a live sensor/incident feed. Unblocks slices 12 and 13 and three gallery demos at once.
- Fix the two 404 starter links on `samples.html` (already ticketed with the gallery work).

**Phase 1 — prototype one slice end to end: Realtime, time & geofencing**

- Short design session: the slice template in Bedrock dark, using the wow-slate incident feed as the embedded map. Slices are text-heavier than the gallery — the light-on-dark reading treatment gets proven here.
- Hand-build the page with real content: Console/CLI/API setup including channels, JS + Mobile tabs, MCP transcript, protocol fine print.
- Gate: owner reviews the one page and locks the template. Nothing scales until this looks right.
- Estimate: ~1 week of agent work after the design pick.

**Phase 2 — machinery**

- Slice manifest schema, `gen-slice-pages.mjs`, validators, page-directory build support, markdown twins, screenshot capture harness, and the reference-shaped variant.
- The finder and the search index generator, plus the master `llms.txt` output — all three are projections of the same graph, so they are one build step, not three.
- Migrate the hand-built realtime page into the generator; byte-identical output is the acceptance test.
- Estimate: 1–2 weeks of agent work.

**Phase 3 — wave 1 (six slices)**

First map · Query & analyze · Maps & interaction · Imagery & raster · Tiles & offline · Cloud-native formats. Chosen to reuse wow-slate demos and existing catalog-v2 samples as their embedded maps. Wave 1 grew by one because cloud-native arrived with its SDK surface and four samples already built. Each slice is one agentflow bundle — content, sample wiring, console capture, SDK tabs, review pass — landed as one bundle PR per wave. ~2–4 agent-days per slice.

**Phase 4 — waves 2–4 (fourteen slices)**

- **Wave 2 (proposed, pending decision 5):** Catalog & discovery · Migrate from Esri · Style & cartography · Serve your data. Rationale: catalog is the only slice with no doc home at all; migration and cartography are what evaluators ask about.
- **Wave 3:** Edit & sync · Auth & identity · Warehouse analytics · Search, routing & geometry.
- **Wave 4 (gated):** Operate: the AI ops loop · Build an app from a prompt · Connect an agent (MCP) · Cloud-native architecture · Frameworks · Debug, test & perf.

Every missing SDK tab files an SDK backlog issue — this is how the docs grind feeds the SDK gap list instead of hiding it.

**Phase 5 — consolidation**

- `docs.html` → slice index; nav rewired; evidence pages out of nav.
- Remaining GitBook capability guides redirected; GitBook sidebar reduced to the runbooks.
- Amend `demo-samples-architecture.md`: Learn = slice docs on the docs domain; GitBook = runbooks only.
- Search across slices + samples. Analytics decision applied.

Rough calendar: gallery redesign lands first (Aug), Phase 1 early Sep, machinery mid-Sep, wave 1 by early Oct, the rest through Q4 and into Q1.

## Backlog

Umbrella epic in **honua-site**: *Capability-slice docs — one page per capability, every seat at the table*. Children below, in owning repos, cross-linked. Nothing here starts before the gallery's Stage 2 ships.

### Foundations (honua-site)

| # | Ticket | Notes |
|---|---|---|
| F1 | `docs.honua.io` front door — domain, Pages routing, page-directory build support | Fixes `build-dist.sh -maxdepth 1`; mounts `/sdk/*`, `/api`, `/operations`. Absorbs site#101 |
| F2 | Slice manifest schema + validators | Capability keys resolve against `capabilities.v1.json`, sample ids against the catalog, banlist clean, links live. Wired into the existing CI validate job |
| F3 | `gen-slice-pages.mjs` + markdown twins | Static pages from manifests; twins feed the machine index |
| F4 | Slice template implementation — map-shaped and reference-shaped | From the design handoff; inherits `honua-tokens.css` |
| F5 | Console screenshot capture harness | Playwright against a seeded console, version-pinned, sanitized fixtures; absent tab when the screen doesn't exist |
| F6 | The finder — faceted browse over slice + sample + capability graph | Facets: task, protocol, SDK, data mode, edition, renderer. Satisfies the audit's REQ-009 |
| F7 | Search index generator + search UI + master `llms.txt` | One build step, three outputs; joins SDK corpora via the release manifests (site#139) |
| F8 | Operations section IA | Lands site#185 (observability contract), #186 (sizing), #187 (ops runbook), #188 (DR evidence) as its first pages |
| F9 | Evidence pages out of nav; `docs.html` becomes the slice index | Fine-print links only, per decision 3 |

### Content (honua-site, one per slice)

| # | Ticket | Notes |
|---|---|---|
| C0 | Prototype: Realtime, time & geofencing | Hand-built, template-locking. Phase 1 |
| C1–C6 | Wave 1: First map · Query & analyze · Maps & interaction · Imagery & raster · Tiles & offline · Cloud-native formats | One bundle PR for the wave |
| C7–C10 | Wave 2: Catalog & discovery · Migrate from Esri · Style & cartography · Serve your data | Order pending decision 5 |
| C11–C14 | Wave 3: Edit & sync · Auth & identity · Warehouse analytics · Search, routing & geometry | |
| C15–C20 | Wave 4: the AI ops loop · Build an app from a prompt · Connect an agent (MCP) · Cloud-native architecture · Frameworks · Debug, test & perf | Gated on the AI release for three of them |

### Upstream (other repos)

| # | Repo | Ticket |
|---|---|---|
| U1 | honua-demo-infra | Stage the missing demo services: geocoding, routing, a live sensor/incident feed. **Phase 0 blocker** for slices 12 and 13 and three gallery demos |
| U2 | honua-demo-infra | Expose `demo-services.v1.json` as the published liveness source the slice build reads before allowing a "live" claim |
| U3 | honua-samples | Stable embed contract: pinned full-screen route per sample id, health-checked at build time |
| U4 | honua-samples | Framing posture — accept open framing on Pages, or front the gallery with a CDN that can set `frame-ancestors` |
| U5 | honua-samples | Sample coverage for wave-1 slices that have no embeddable map yet |
| U6 | honua-server | GitBook narrowing: donate capability-guide prose slice by slice, add redirects, reduce SUMMARY toward runbooks |
| U7 | honua-server | Public catalog & discovery docs — today every metadata/catalog doc is under `docs/internal/` |
| U8 | honua-server | Resolve labeling: vocabulary gap or product gap. Blocks slice 5's labeling claims |
| U9 | honua-server | Publish the two Studio AI guides in SUMMARY (already tracked in the AI release plan) |

Standing process, not a ticket: every missing SDK tab discovered while writing a slice files an issue in that SDK's repo. That is how the docs grind feeds the SDK gap list instead of hiding it.

## Known blockers

| Blocker | Blocks |
|---|---|
| Demo services absent: geocoding, routing, live feed | Slices 12, 13; three gallery demos |
| honua-server#3188 — catalog styles ignore negotiated Esri encoding, reject `PUT` | The Esri authoring mode, and honua-studio#22 |
| honua-studio live E2E red 8 nights — `POST /api/v1/studio/package-drafts` 500s on demo | Slice 17 (can't claim what isn't live-proven) |
| Alerts evaluator threshold/dwell/exit untested | Slice 12's claims |
| honua-console frozen since 2026-07-01 | Console tabs across most slices |
| honua-sdk-dotnet#292 — DocFX site never published | The .NET tab's "see reference" link |
| Labeling has no capability key | Slice 5's labeling claims |

## Filed 2026-08-13

- **honua-studio#22** — dual-mode visual style editor (Maputnik/MapLibre + Esri `drawingInfo`), under Studio epic #2. Records the home correction: ADR-0007 routed this to honua-console before honua-console#324 decided to retire the Blazor per-family editors and embed the JS Studio.
- **honua-server#3192** — amend ADR-0007 accordingly; stop honua-server#2446's "completed" closure from reading as a shipped style studio.
- **honua-sdk-dotnet#292** — publish the DocFX site; deploy steps are gated on an unset `DEPLOY_GITHUB_PAGES` repo variable, so the job is green and publishes nothing.
- Comment on **honua-console#324** tying `StudioStyleEditorPage.razor`'s retirement to #22.

## Risks

- **The matrix trap.** 21 slices × 7 panels × 4 SDK tabs is a very big grid. The ship rule and the wave order exist so slices ship incomplete and honest instead of late and exhaustive. Guard structurally, not by intention.
- **Scope arrival.** The list went 14 → 21 in one review. Expect more. The manifest schema should make adding a slice cheap and the ship rule should make a thin slice acceptable, so growth costs pages rather than replans.
- **Console screenshot rot, and console stasis.** Build-time capture with version pinning contains rot; the frozen repo is the bigger issue, and the answer is that CLI/API tabs are canonical so a missing Console tab never blocks a slice.
- **Voice regression.** Generated pages drift toward spec language. The banlist gate catches vocabulary; a founder-register read of each slice before publish catches tone.
- **Priority creep.** Nothing here starts before the gallery's Stage 2 ships. Cool maps first.

## Appendix — the runbook inventory

Taken 2026-08-13, since decision 2 turns on what "GitBook keeps the runbooks" actually means.

**Published today (GitBook):** exactly two — `guides/deploy/pilot-onboarding-runbook.md` (138 lines) and `gis/CLIENT_TEMPLATE_RUNBOOK.md` (244). Everything else operator-facing is the twelve-guide Deploy & operate set, which is runbook-shaped in all but name.

**Demo environment — `honua-demo/runbook/`** (the largest real corpus): `demo-honua-io-capability-runbook.md` (713), `demo-b-ops-runbook.md` (518), `demo-b-safe-rollback.md`, `wms-release-promotion.md`, `client-compat-rotation.md`, `client-compat-evidence-contract.md`, plus probe and rollback scripts. Note this repo is **public**.

**Infra / DR — `honua-iac/docs/devops/`:** `backup-restore-runbook.md` (268), `failover-drill-runbook.md` (227, RTO/RPO evidence), `manual-cloud-runbook-validation.md` (208), evidence templates, `capture-runbook-evidence.sh`. (`honua-terraform` is the old name of this repo — GitHub redirect, not a second repo.)

**DevOps platform — `honua-devops/docs/`:** `manual-cloud-runbooks.md` (173), `backup-restore-gameday.md`, plus a wide adjacent set.

**Migration / support — `honua-support/docs/runbooks/`:** `cutover-rollback-runbook.md` (232), `cutover-signoff-checklist.md`, `migration-playbook.md`.

**Internal engineering — `honua-server/docs/internal/contributor/`:** `cite-runbook.md` (185), `merge-coordination-runbook.md` (107); archived `PRODUCTION_RUNBOOK.md` (452).

**Other:** `honua-esri-compat/docs/windows-runner-runbook.md` (247), `honua-mobile/docs/demo-build-runbook.md` (135), `honua-sales/docs/strategy/SHOWCASE_OPERATOR_RUNBOOK.md` (398, May, stale).

Two observations that matter for decision 2: the buyer-relevant runbooks (backup, failover, RTO/RPO) live in a private repo, which is exactly what honua-site#188 is asking to fix; and the corpus is spread across five repos with no index, so whichever surface owns Operations should link out to them rather than try to hold them.

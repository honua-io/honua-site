# Capability-slice docs — plan

Status: plan draft, revision 3 · 2026-08-13 (supersedes the 2026-08-10 draft)
Companion to: `samples-gallery-design-brief.md` (the gallery redesign, act one) and `slice-docs-design-brief.md` (the design handoff for these pages).
Amends: `docs/demo-samples-architecture.md` (the five-jobs split) — see "Consolidation".
Source material: `honua-samples/docs/competitive-sample-audit.md` (job-page spec + 14-track curriculum), `honua-samples/docs/job-pages.md`.

## What changed in revision 3

- **The embedding contract is written down** — which repo is framed, which is pointed at, and the GitHub Pages constraint that comes with it. See "Embedding".
- **Cloud-native formats moves to wave 1** and gets a sharper thesis: direct-to-asset, with or without a server. The JS SDK already shipped most of it.
- **Finding things is a first-class surface** — an index, a faceted finder, and one search box across slices, Operations, SDK reference, and samples. See "Finding things".
- **A backlog** with owning repos, at the end — since filed as real issues under honua-site#213.
- **Decision 5 answered**: the wave order is ranked from the persona-evaluation record and the settled buying motion, not from taste. All five decisions are now closed.
- A design brief now exists as a separate document, mirroring the gallery brief.

## What changed in revision 2

Owner review added four topics the first draft missed and forced two structural corrections. In short:

- **Four new slices**: Cloud-native formats, Cloud-native architecture, Catalog & discovery, Style & cartography.
- **The AI slice split three ways** — the ops loop, the Studio app builder, and the MCP contract are different products with different readers. Migration comes out on its own.
- **Ops is a section, not a slice.** Day-2 material gets its own axis; slice 11 shrinks to Auth & identity.
- **SDK reference sites stay separate and are named as a first-class surface**, which flips decision 1 toward a `docs.honua.io` umbrella.
- Alerts and geofencing are placed in Realtime, not Ops, with a defined split trigger.
- Four of the five open decisions answered; the fifth (wave order) closed in revision 3.

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

**The docs-side constraint (scheduled, not assumed).** The frame is blocked today by *our own* policy, not the gallery's: `_headers` sets `default-src 'self'` with no `frame-src`, plus `X-Frame-Options: DENY`, so a browser refuses the samples.honua.io child before any poster or health-check logic runs. Nothing in this plan works until that changes, and the change is four pieces — a `frame-src https://samples.honua.io` allowance in `_headers`, the same allowance in whatever edge policy fronts the docs domain, a per-page `<meta http-equiv="Content-Security-Policy">` emission (GitHub Pages ignores `_headers`, so the meta tag is the enforced copy, exactly as `/demo.html` already documents), and a validator that keeps the two copies in sync. That is **F1a (#215)**, and it gates every slice with a live frame. Treat a slice page shipped before F1a as a permanently blocked iframe, not a slow one.

**The Pages constraint — decided 2026-08-13: CloudFront.** samples.honua.io is served by GitHub Pages, and live headers confirm it: no `X-Frame-Options`, no CSP, so it is framable by anyone today and Pages cannot express `frame-ancestors` in either direction. The decision is to front it, not to accept that. The gallery gets its own S3 + CloudFront stack — its own, not this site's, because the origin is a different repository's artifact with its own publication contract and the entire purpose is a `frame-ancestors` policy that *differs* from honua.io's. Tracked as honua-samples#41, modelled on the tested stack this repo already carries in `edge/`.

The same decision settles the docs front door: `docs.honua.io` is an alias on the honua.io distribution, not a Pages site — which also removes a live exposure, since `docs.honua.io` already resolves to GitHub Pages with no repository claiming it (honua-site#230). Sequencing, cert scope, and the host-rewrite requirement are recorded in `edge/README.md`; the template work is honua-site#231.

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

**The master index does not go in the root `llms.txt`.** That file and `llms-full.txt` at the repo root are not ours to write: they are byte-for-byte mirrors of honua-sdk-js, written only by `scripts/sdk-llms-publication.mjs --write` and checked on every Pages build against the commit-pinned digests in `data/sdk-llms.v1.json`. The script fails on any target outside `honua-io/honua-sdk-js` and on any byte that differs from the record, so appending slice twins there would either break required CI or destroy the SDK publication contract. The master index therefore gets its own path on the docs front door — `docs/llms.txt` and `docs/llms-full.txt` — and *links to* the SDK corpus at its pinned root path rather than absorbing it. F7 carries an assertion that the slice generator never writes the two SDK-owned files.

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
- **One machine-docs index.** Both surfaces emit llms.txt today; the docs domain's becomes the master index and lists the GitBook's entries — and the SDK corpus — rather than competing with or overwriting them.

## Architecture

- **Home:** `docs.honua.io` (revised — see decision 1). Slices at `/<slice>/`, SDK reference mounted at `/sdk/js|python|dotnet`, the OpenAPI reference at `/api`, Operations at `/operations`. Repo Pages builds stay the build origin; the domain is the front door. Gotcha carried forward: `build-dist.sh` copies root `*.html` only (`-maxdepth 1`) — extend it for a page directory.
- **Content model:** one `slices/<slug>.json` (or markdown + frontmatter) per slice declaring capability keys (must exist in `capabilities.v1.json`), sample ids (must exist in the samples catalog), console routes, CLI commands, MCP operations, template variant, related slices. A `gen-slice-pages.mjs` generator renders static pages + markdown twins. Validators: every reference resolves, banlist clean, links live — wired into the existing CI validate job.
- **Console screenshots:** captured at build time with Playwright against a seeded console, pinned to the console version, sanitized fixture data. If a console screen doesn't exist, the tab is absent. No mockups. Note that honua-console has had no commits since 2026-07-01, so several slices will ship without a Console tab and that is fine.
- **Samples:** embedded by id through the publication contract. The slice never owns executable code. One canonical catalog, two projections (gallery card + slice panel).
- **Machine docs:** each slice's markdown twin joins the docs domain's own `docs/llms.txt` / `docs/llms-full.txt`, generated alongside the search index. The repo-root `llms.txt` / `llms-full.txt` stay exactly as they are — SDK-owned, digest-pinned, written only by `sdk-llms-publication.mjs` — and are linked from the master index, never merged into it.
- **Evidence pages:** stay generated (they back `claims.html` and the "verified" links) but leave the navigation.

## The slice manifest schema (F2)

Landed by honua-site#216. `schemas/slice.v1.schema.json` (`honua.slice/v1`,
JSON Schema 2020-12, fail-closed) defines one `slices/<slug>.json` per slice:
`slug`, `title`, `variant` (`map` | `reference`), an optional `preview` label,
`capabilityKeys[]`, an optional `sample` (`{ id, runtimeKind, poster? }`), and
the four panel groups — `setup{console,cli,adminApi}`, `use{js,python,dotnet,mobile}`,
`ask{mcp}`, `underneath{protocols[],evidencePage?}` — plus `related[]`. It is
the honua-samples `job-page.v1` shape with the maturity/evidence apparatus
removed (honua-samples#47): **every surface entry is
`{ state: available | partial | absent, issue?, route?|command?|snippet?|tools? }`**,
and that is the entire vocabulary. `available` requires its payload and forbids
an issue; `absent` and `partial` require the issue URL behind the honest-gap
sentence. Field-by-field reference: `slices/README.md`.

Three validators, all wired into the CI `validate` job and all Node-stdlib only
(the repo has no npm dependency surface, so `scripts/json-schema-mini.mjs` is a
small JSON Schema subset validator rather than ajv):

- **`validate-slices.mjs`** — schema conformance, slug/filename agreement,
  capability keys resolving in `data/capabilities.v1.json`, sample ids resolving
  in the samples portfolio, `related[]` slugs existing, `evidencePage` existing,
  and a live unauthenticated GitHub REST check that every gap issue is 200 and
  open (cached in the OS temp dir; `--offline` skips it). A gap sentence cannot
  outlive its gap.
- **`validate-slice-voice.mjs`** — the banlist gate over `dist/docs/**/*.html`:
  the gallery's list plus this surface's *coverage, maturity, tier, roadmap,
  lifecycle state*, plus the site-wide `forbiddenClaims` list now shared with
  `validate-site-claims.mjs` via `scripts/forbidden-claims.mjs`. Markup,
  `<script>`, `<style>`, `<pre>` and `<code>` are stripped before matching — an
  API symbol is not voice, and neither is a CSS hook.
- **`validate-slice-concepts.mjs`** — the D0.7 (OKF-first) additions over the
  emitted concept bundle: frontmatter validity (`type` required and from the
  documented set — `slice` and `index` are emitted today,
  `capability`/`tool`/`error`/`playbook` reserved; `title`/`description`/`resource`/`tags`/`timestamp` well-formed when
  present) and relative-link + `#anchor` resolution. The link half is a direct
  port of `geospatial-mcp`'s `tools/check_links.py` — same GitHub slug
  algorithm, same `-1`/`-2` duplicate-heading suffixes, same fenced-code
  exclusion — credited and mapped line-for-line in the script header rather than
  reinvented.

Every failure mode is fixture-proven under `scripts/test/` by the three
`*.test.mjs` suites. Two scoped items are deliberately absent from v1 and
recorded here rather than silently dropped: the `live: true` claim rule, which
needs `demo-services.v1.json` (honua-demo-infra#54) to be published before it
can mean anything, and per-sample pinned-route resolution, which arrives with
honua-samples#40. Because the schema is fail-closed, neither can be asserted in
a manifest in the meantime.

## The generator and the template (F3/F4)

Landed by honua-site#217 (`scripts/gen-slice-pages.mjs`) and #218
(`scripts/slice-template.mjs`, `assets/slice.css`, `assets/slice-tabs.js`).
Node stdlib only, no dependencies, deterministic.

**The D0.7 inversion is the order of operations, not a note.** For each manifest
the generator builds the Open Knowledge Format concept, writes it to
`docs/<slug>/index.md`, and renders the HTML page **from those bytes**. Nothing
else is in scope when the page is produced, so "the page is a projection of the
concept" is how the pipeline is built rather than a property asserted about it
afterwards — `gen-slice-pages.mjs --from-concept docs/<slug>/index.md`
reproduces the committed page exactly, and a test pins that.

The concept carries `type: slice`, `title`, `description` (derived: the title,
the protocols underneath it, and the SDKs the manifest does not call absent),
`resource` (the page's own URL), `tags` (the finder facets, prefixed —
`shape:`, `label:`, `task:`, `protocol:`, `capability:`, `surface:`, `sdk:`,
`agent:`, `sample:`) and `timestamp`. `related[]` and `capabilityKeys[]` render
as relative markdown links — to the sibling concept and to the per-key page at
the site root — so the bundle is a graph the F2 link checker walks. The bundle
entry point `docs/index.md` (`type: index`) is OKF progressive disclosure: one
fetch, the whole map.

**`timestamp` is pinned, never wall-clock.** OKF calls the field build time, but
a build time read off the clock makes every regeneration a diff and turns
`--check` into a test of what minute CI ran in. The generator uses
`SOURCE_DATE_EPOCH` when it is set and otherwise the epoch constant in
`scripts/slice-concept.mjs`, bumped by an edit rather than by the passage of
time. Determinism is proved by double-generation zero-diff, not asserted.

The template renders the panels from the concept's own structure: a `##`
section is a panel, a `##` section with two or more `###` children is a tab
group, a blockquote is the honest-gap component, a fence is a code card. The two
tab groups are deliberately different controls — Set it up gets pill tabs, Use
it gets underlined tabs — both are the WAI-ARIA tabs pattern, both deep-link
(`#use=python`, and the bare `#python` heading anchor a markdown edge points at
resolves to the same tab), and the language choice persists across slices in
`localStorage`. Panels in a group share one CSS grid cell, so a group is as tall
as its tallest panel and a tab switch cannot move the page. The Console tab is
v1 per D0.3: route, one paragraph, and a way across to the CLI and Admin API
tabs — no reserved screenshot slot, because the capture harness is #219.

Pages carry no inline `<script>` or `<style>`, so the site CSP
(`script-src 'self'`) holds. `build-dist.sh` renders the bundle into
`dist/docs/` with `--out`; the root `*.html` copy stays `-maxdepth 1` and no
existing page changes.

Two things this pair does not do yet, recorded rather than implied: the hero
panel **links** the sample rather than framing it, because the pinned per-sample
embed route (honua-samples#40) and the framed-sample CSP (#215) are both
unbuilt; and the Console tab has no link to a running console because no console
URL exists to link.

## Playbooks — the authored half of the bundle (WS4)

The OKF knowledge-graph program (`agent-delivery-spec/.specifica/okf-knowledge-graph-agent-effective-docs`, WS4) adds a second concept type to this bundle: `playbook`, a golden-path procedure whose body is the command sequence. Slices answer "what can this capability do"; a playbook answers "do this whole thing, in order, and here is what the server says when a step cannot run here". They are hand-written — principle 3 of that spec, generated spine and authored judgment — so they are the first thing in `docs/` that the generator does not compose.

**Placement: `docs/playbooks/<slug>/index.md`.** One directory per playbook, the same page-directory shape a slice gets, one level deeper. Three reasons, in order of weight:

1. **A separate namespace, so authored and generated never collide.** `docs/<slug>/` is owned by `slices/<slug>.json`; a future manifest whose slug happened to match an authored playbook would silently overwrite it. `docs/playbooks/` cannot be reached that way — the generator's stale-page scan recognises a slice directory by its `type: slice` concept and a stale playbook directory by a projection whose authored concept is gone, so neither can delete the other's work.
2. **The path is the identity.** In OKF the file path *is* the concept id, so `playbooks/install-with-docker` says what the concept is before anything is parsed — and it keeps saying it when the bundle is served over `honua://docs/{concept-path}`.
3. **A page directory keeps the projection rules unchanged.** `resource` is a directory URL, so the template's asset-depth calculation and the `index.md` → `./` edge rewrite work at three levels down exactly as they do at two.

**They ride the same generator, on the same terms.** `gen-slice-pages.mjs` reads each authored concept, carries its bytes into the output tree unchanged, and renders `index.html` from *those* bytes — so a playbook page is a projection of its concept in precisely the sense D0.7 means, and `--out dist/docs` ships the authored half of the bundle without a second copy step. The generator writes no playbook prose; the one thing it derives is the bundle root's `## Playbooks` section, built from each concept's own `title` and `description`. That is deliberate: it puts the authored half behind the same `--check` drift gate as the generated half, because adding, renaming or retitling a playbook without regenerating leaves `docs/index.md` stale and fails CI.

**No separate playbook index.** The bundle root already exists to be the one fetch that returns the whole map; a second index between it and three files would add a hop and buy nothing.

**Facets are checked, not asserted.** A `capability:` tag on any committed concept must resolve in `data/capabilities.v1.json` — a test enforces it. An id that resolves in no published catalog (`jobs.runner` is today's example: a capability-manifest id with no licensing key behind it, pending honua-server#3408) belongs in the prose with an honest-gap sentence, never in the facet list where the finder would offer it as a filter that matches nothing.

## Decisions

**1. Home → `docs.honua.io`, not `honua.io/docs/<slice>/`.** *(Revised from the first draft's recommendation.)* The reason is the SDK sites. They are permanent, separate, and already built; under a path-based scheme, slices sit on one host and SDK reference on `github.io` defaults, findable only by luck. A subdomain umbrella gives one place to send a developer and one master `llms.txt` — which honua-site#101 already assumes exists. The CI, validators, and capability data still live in honua-site; only the front door moves.

**2. GitBook → split by reader.** Slices absorb the capability guides guide-by-guide with redirects; contract-shaped ops pages move to the Operations section on the docs domain; GitBook narrows to long procedural runbooks. This is sharper than the first draft's "GitBook keeps the runbooks", which — as the appendix shows — would have meant two files.

**3. Evidence pages → demote to fine-print links.** Unchanged. They stay generated and leave the nav; the slice is the public face.

**4. Prototype slice → Realtime, time & geofencing.** Confirmed. Geofencing makes it stronger: it exercises the operator tab (rules + channels), the developer tab (subscriptions), and the agent tab in one page.

**5. Phase 4 order → ranked by evaluator evidence (owner-approved 2026-08-13).** Not a guess: the 2026-08 persona evaluation (four personas, two rounds, backlog honua-site#196) is a record of what evaluators asked for and could not find, and the 2026-06-09 positioning session settles the buying motion as migration and conversion — scan-as-quote, partners converting Web AppBuilder / Experience Builder apps, ArcPy, ModelBuilder — on an adoption ladder that starts at "Pro and QGIS connect unchanged" and ends at "outputs ship to maps and dashboards."

- **Wave 2, the cutover conversation:** Migrate from Esri (the whole GTM is a conversion motion) · Catalog & discovery (no doc home at all, and #192's estate-scoping question about portal and web maps is a catalog question) · Style & cartography (#189 by name; #191's day-in-the-life is publish → style → share) · Serve your data (the admin's actual cutover work, rung 1 of the ladder).
- **Wave 3, as evaluation deepens:** Auth & identity (procurement gate, 8 keys, portal-sharing crosswalk) · Edit & sync (Survey123 → `fieldops.forms`; a named estate workload) · Search, routing & geometry (#192 names NAServer scoping) · Warehouse analytics (a differentiator, but no migration blocks on it).
- **Wave 4, after the gates clear:** Operate: the AI ops loop · Build an app from a prompt · Connect an agent (MCP) · Cloud-native architecture · Frameworks · Debug, test & perf.

**For the three AI slices, wave 4 is a gate, not a queue.** By sales pull, "Build an app from a prompt" is the strongest page in the list — rungs 3 and 4 of the ladder, and the thing no incumbent has. It sits late only because it cannot ship honestly until the Studio live E2E gate is green. Build all three the moment their gate clears, even if wave 3 is unfinished.

**Gap this ranking exposed — CRS and projection.** honua-site#190 records zero occurrences site-wide, and no slice owns them. They are cross-cutting, so they belong in **Serve your data** plus a reference page, not a slice of their own. Decided here so they don't fall through the same crack twice.

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

Order per decision 5.

- **Wave 2:** Migrate from Esri · Catalog & discovery · Style & cartography · Serve your data (which also absorbs the CRS/projection statement).
- **Wave 3:** Auth & identity · Edit & sync · Search, routing & geometry · Warehouse analytics.
- **Wave 4 (gated, not queued):** Operate: the AI ops loop · Build an app from a prompt · Connect an agent (MCP) · Cloud-native architecture · Frameworks · Debug, test & perf. The first three start when their release gate goes green, not when wave 3 ends.

Every missing SDK tab files an SDK backlog issue — this is how the docs grind feeds the SDK gap list instead of hiding it.

**Phase 5 — consolidation**

- `docs.html` → slice index; nav rewired; evidence pages out of nav.
- Remaining GitBook capability guides redirected; GitBook sidebar reduced to the runbooks.
- Amend `demo-samples-architecture.md`: Learn = slice docs on the docs domain; GitBook = runbooks only.
- Search across slices + samples. Analytics decision applied.

Rough calendar: gallery redesign lands first (Aug), Phase 1 early Sep, machinery mid-Sep, wave 1 by early Oct, the rest through Q4 and into Q1.

## Backlog

Filed 2026-08-13. Umbrella: **honua-site#213** — *Epic: capability-slice docs — one page per capability, every seat at the table*. Nothing here starts before the gallery's Stage 2 ships.

### Foundations (honua-site)

| # | Ticket | Notes |
|---|---|---|
| F1 | **#214** — `docs.honua.io` front door: domain, routing, page-directory build support | Fixes `build-dist.sh -maxdepth 1`; mounts `/sdk/*`, `/api`, `/operations`. Closes site#101 |
| F1a | **#215** — CSP for framed samples: per-page meta emission + validator | The site's policy (`frame-ancestors 'none'`, no `frame-src`) currently blocks the embed outright; Pages ignores `_headers`, so the meta tag is the enforced copy. Carries the Pages-vs-CloudFront decision |
| F2 | **#216** — slice manifest schema + validators | Keys resolve against `capabilities.v1.json`, sample ids against the catalog, banlist clean, links live |
| F3 | **#217** — `gen-slice-pages.mjs` + OKF concepts | Deterministic, stdlib-only; the concept is canonical and the page is rendered from it. Byte-identical reproduction of the prototype is measured against #224 |
| F4 | **#218** — slice template, map-shaped and reference-shaped | The two tab groups (different controls, deep-linkable, no reflow), code as a first-class object, the honest-gap component |
| F5 | **#219** — console screenshot capture harness | Own scheduled workflow committing pinned artifacts, not inline in the site build |
| F6 | **#220** — the finder | Facets: task, protocol, SDK, data mode, edition, renderer. Satisfies the audit's REQ-009 |
| F7 | **#221** — search index + UI + master `llms.txt` | One pass, two outputs; joins SDK corpora via the release manifests (site#139). Emits `docs/llms.txt`, never the root SDK-owned pair — with a test that proves it |
| F8 | **#222** — Operations section | Lands site#185/#186/#187/#188 as its first pages |
| F9 | **#223** — docs index; evidence pages out of nav | Per decision 3 |

### Content (honua-site)

| # | Ticket | Notes |
|---|---|---|
| C0 | **#224** — Prototype: Realtime, time & geofencing | Hand-built, template-locking. Blocked on demo-infra#53 and the alerts test-depth gap |
| C1–C6 | Wave 1: First map · Query & analyze · Maps & interaction · Imagery & raster · Tiles & offline · Cloud-native formats | Filed once the template locks; one bundle PR per wave |
| C7 | **#225** — Migrate from Esri | Wave 2, rank 1 |
| C8 | **#226** — Catalog & discovery | Wave 2, rank 2; blocked by honua-server#3201 |
| C9 | **#227** — Style & cartography | Wave 2, rank 3; gaps link honua-studio#22 and honua-server#3202 |
| C10 | **#228** — Serve your data | Wave 2, rank 4; carries the CRS statement (site#190) |
| C11–C14 | Wave 3: Auth & identity · Edit & sync · Search, routing & geometry · Warehouse analytics | |
| C15–C20 | Wave 4: the AI ops loop · Build an app from a prompt · Connect an agent (MCP) · Cloud-native architecture · Frameworks · Debug, test & perf | Three gated on the AI release |

### Upstream

| # | Ticket | Notes |
|---|---|---|
| U1 | **honua-demo-infra#53** — stage geocoding, routing, a live incident feed | **Phase 0 blocker** for slices 12 and 13 and three gallery demos |
| U2 | **honua-demo-infra#54** — publish `demo-services.v1.json` as the liveness contract | The mechanism that keeps "live" honest without a human checking |
| U3 | **honua-samples#40** — stable embed contract: pinned route per sample id, health-checked | Also exposes runtime kind per sample |
| U4 | **honua-samples#41** — framing posture: accept open framing, or front with a CDN | Pages cannot set `frame-ancestors` |
| U5 | **honua-samples#42** — sample coverage for wave-1 slices | Reuse gallery work; a deliberate poster fallback is an acceptable outcome |
| U6 | **honua-server#3200** — narrow the GitBook to runbooks as slices land | Guide by guide, with redirects |
| U7 | **honua-server#3201** — publish the catalog and discovery story | Internal-only today; blocks slice 6 |
| U8 | **honua-server#3202** — resolve labeling: vocabulary gap or product gap | Blocks slice 5's labeling claims |
| U9 | **honua-server#3203** — publish the two Studio AI guides in `SUMMARY.md` | Also carried in the AI release plan |

Related, filed earlier the same day: **honua-studio#22** (dual-mode Maputnik + Esri style editor — the Style & cartography slice's Console tab), **honua-sdk-dotnet#292** (unpublished DocFX site — the .NET tab's reference link), **honua-server#3192** (ADR-0007 home correction).

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

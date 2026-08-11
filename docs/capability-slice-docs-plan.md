# Capability-slice docs — plan

Status: plan draft · 2026-08-10
Companion to: `honua-samples/docs/design-handoff/samples-gallery-design-brief.md` (the gallery redesign, act one).
Amends: `docs/demo-samples-architecture.md` (the five-jobs split) — see "Consolidation".
Source material: `honua-samples/docs/competitive-sample-audit.md` (job-page spec + 14-track curriculum).

## The idea

One page per capability slice. Each slice covers every seat at the table:

- the **operator** setting it up (Console, CLI, admin API),
- the **developer** consuming it (JS, Python, .NET, Mobile),
- the **agent** asking about it (MCP),

with the live sample at the top and the protocol fine print at the bottom. "Realtime" is one page, not five scattered doc properties. Nobody in GIS has this — Esri splits exactly these surfaces across Server docs, Pro docs, SDK docs, and REST docs.

This is act two. The samples gallery redesign (the wow slate) ships first and is not blocked by anything here.

## What already exists — build on it, don't reinvent

1. **The audit's cross-SDK job-page spec** already defines this page: server-contract panel, "Configure in Console" panel, "AI capability context" panel, CLI in the reference matrix, per-SDK tabs. Adopt the panel order. Strip the public evidence apparatus (receipts, maturity dossiers, provenance blocks, TTLs) — that stays internal metadata, same rule as the gallery brief.
2. **The capability data spine.** `data/capabilities.v1.json` + `scripts/gen-capability-catalog.mjs` already generate `capabilities.html` and ~130 `evidence-*.html` pages, synced from honua-server's published artifacts (`sync-capabilities-data.mjs`). Slices are a new projection of this same data — the capability keys, protocol mappings, and demo/sample links are already machine-checked.
3. **The samples publication contract** (`sdk-sample-publication.mjs`, digest/SRI handoffs, `demo-services.v1.json` manifest). Slices embed samples from the canonical catalog by id — never copy code, never hand-write service URLs (honua-samples#20).
4. **llms.txt machinery** (`sdk-llms-publication.mjs`). Every slice emits a markdown twin; `llms.txt` lists the slices. Capability pages are exactly what LLMs want to ingest.
5. **`api-reference.html`** — the new on-site API reference generated from demo-server OpenAPI. The "Underneath" panel deep-links here.
6. **`honua-tokens.css`** from gallery redesign Stage 2 — the shared look. Slices use the same skin Mike picks for the gallery (A or B).
7. **The GitBook** (`honua.gitbook.io/honuaio`) is substantial, not a stub: Getting Started, Concepts, and Guides whose taxonomy already half-matches the slice list (publish data ≈ Serve your data, style maps ≈ Maps & styling, query and analyze, edit data, migrate…). That prose is seed material for slice panels 2–3 — half the writing is already done. See "GitBook" below.

Net: this plan is mostly reclothing and wiring, not greenfield.

## The slices

Fourteen, straight from the audit's curriculum tracks. Names get founder-voice treatment at design time; working list:

| # | Slice | Audit track | Notes |
|---|---|---|---|
| 1 | First map | 1 start and connect | The ten-minute win |
| 2 | Serve your data | 2 sources and protocols | Import → many protocols out |
| 3 | Query & analyze | 3 query and analyze | First-wave; matches audit's "Query Features" first job |
| 4 | Maps & styling | 4 map, style, interact | First-wave |
| 5 | Edit & sync | 5 edit and sync | Mobile SDK's showcase; AI panel is read-only by policy |
| 6 | Imagery & raster | 6 imagery, raster, multidim | STAC/COG demo already in wow slate |
| 7 | Tiles & offline | 7 vector tiles, portable delivery | PMTiles demo already in wow slate |
| 8 | Warehouse analytics | 8 columnar and warehouse | GeoParquet/GeoArrow lanes |
| 9 | Realtime & time | 9 realtime and time | **Prototype slice** — exercises every panel |
| 10 | Search, routing & geometry | 10 search, routing, geometry | Blocked on demo services (Phase 0) |
| 11 | Auth & deploy | 11 authentication and deployment | Operator-heavy; Helm/IaC links |
| 12 | AI & migration | 12 AI, automation, migration | MCP + esri-assess + codemod story |
| 13 | Frameworks | 13 frameworks and components | React/MapLibre/deck.gl integration |
| 14 | Debug, test & perf | 14 debug, test, performance | Reference-heavy, last |

## Page anatomy (the template)

1. **The map.** Live sample embedded at the top — pinned full-screen route from samples.honua.io in an iframe, static thumbnail fallback. Cool map first, even in docs.
2. **What it is.** A few paragraphs, founder register. Bigger budget than a demo page's three sentences; still no dossier.
3. **Set it up** — tabs: Console · CLI · Admin API. The operator path. Console tab shows an annotated build-time screenshot; the copyable CLI/API configuration is canonical and always present.
4. **Use it** — tabs: JS · Python · .NET · Mobile. The developer path. Same editable `const server = "https://demo.honua.io"` line as the gallery.
5. **Ask it.** The MCP/AI panel: what an agent can discover and do with this capability, with a real tool-call transcript. Analysis and discovery slices get a rich panel; editing slices state plainly that agents read, never write (ADR-0028).
6. **Underneath.** Protocol chips linking into `api-reference.html` and the OpenAPI operations; one quiet "verified" link into the capability evidence page. Fine print, last.
7. **Related** slices and samples.

**Ship rule (the anti-matrix rule):** a slice ships when it has panels 1–2, one setup tab, and one use tab. A missing tab renders as one honest sentence — "Not in the Python SDK yet — track it here" — linking the SDK issue. Never a coverage matrix, never a maturity legend, never an empty tab pretending.

**Never renders publicly:** receipts, lifecycle/maturity states, owner/blocker fields, provenance blocks, support-tier legalese. Same voice banlist as the gallery, enforced by the same build gate.

## Architecture

- **Home:** `honua.io/docs/<slice>/` in honua-site. `docs.html` becomes the slice index. Gotcha: `build-dist.sh` copies root `*.html` only (`-maxdepth 1`) — extend it for a `docs/` page directory. (Decision below: subdirectory vs `docs.honua.io` subdomain.)
- **Content model:** one `slices/<slug>.json` (or markdown + frontmatter) per slice declaring: capability keys (must exist in `capabilities.v1.json`), sample ids (must exist in the samples catalog), console routes, CLI commands, MCP operations, related slices. A `gen-slice-pages.mjs` generator renders the static pages + markdown twins. Validators: every reference resolves, banlist clean, links live — wired into the existing CI validate job.
- **Console screenshots:** captured at build time with Playwright against a seeded console (reuse the smoke-harness pattern), pinned to the console version, sanitized fixture data. If a console screen doesn't exist yet, the tab is absent — CLI/API tabs carry the slice. No mockups.
- **Samples:** embedded by id through the publication contract. The slice never owns executable code. One canonical catalog, two projections (gallery card + slice panel).
- **Machine docs:** each slice's markdown twin joins `llms.txt` / `llms-full.txt` via the existing publication record.
- **Evidence pages:** stay generated (they back `claims.html` and the "verified" links) but leave the navigation. The slice is the public face; evidence is the fine print behind it.

## GitBook

The slice pages cannot live in GitBook: the live-map-first panel, tabs generated from `capabilities.v1.json`, build-time console screenshots, the banlist gate, and the `honua-tokens.css` skin are all impossible or crippled there. GitBook would flatten the idea back into prose docs with someone else's theme.

But GitBook already holds real content, so the split is by job, not a big-bang migration:

- **Slices own anything with a map or a capability.** Each overlapping GitBook guide (publish data, style maps, query and analyze, edit data, connect clients, migrate) donates its prose to the matching slice, then redirects to it when that slice ships. Migrate guide-by-guide as slices land — no migration project.
- **GitBook keeps, for now, only what has no map:** the operational runbooks — Docker Compose deployment, pilot onboarding, authentication setup. Long, procedural, versioned; GitBook is fine at those. Whether they eventually fold into an operator section on honua.io is a later call that blocks nothing.
- **One machine-docs index.** Both surfaces emit llms.txt today. honua.io's `llms.txt` becomes the master index; the GitBook's entries are listed from it, not maintained as a rival index.

## Phases

**Phase 0 — prerequisites** (parallel with gallery redesign)
- Gallery Stage 1/2 delivers `honua-tokens.css` and the A/B pick. Slices inherit both.
- Stage the missing demo services on demo.honua.io: geocoding, routing, a live sensor/incident feed. Unblocks slices 9 and 10 and three gallery demos at once. Server-side work — mind the red trunk CI; stage on the demo box directly if the deploy path allows.
- Fix the two 404 starter links on `samples.html` (already ticketed with the gallery work).

**Phase 1 — prototype one slice end-to-end: Realtime & time**
- Short design session: the slice template, in the gallery-winning skin, using the wow-slate incident feed as the embedded map.
- Hand-build the page with real content: Console/CLI/API setup, JS + Mobile tabs, MCP transcript, protocol fine print.
- Gate: Mike reviews the one page and locks the template. Nothing scales until this looks right.
- Estimate: ~1 week of agent work after the design pick.

**Phase 2 — machinery**
- Slice manifest schema, `gen-slice-pages.mjs`, validators, `build-dist.sh` subdir support, markdown twins, screenshot capture harness.
- Migrate the hand-built realtime page into the generator; byte-identical output is the acceptance test.
- Estimate: 1–2 weeks of agent work.

**Phase 3 — first wave (five slices)**
- First map · Maps & styling · Imagery & raster · Tiles & offline · Query & analyze.
- Chosen to reuse wow-slate demos as their embedded maps and to match the audit's initial increment.
- Each slice is one agentflow bundle: content, sample wiring, console capture, SDK tabs, review pass. ~2–4 agent-days per slice.

**Phase 4 — breadth (remaining eight)**
- Sales-priority order (decision below). Every missing SDK tab files an SDK backlog issue — this is how the docs grind feeds the audit's P0–P3 SDK gap list instead of hiding it.

**Phase 5 — consolidation**
- `docs.html` → slice index; nav rewired; evidence pages out of nav.
- Remaining GitBook capability guides redirected to their slices; GitBook sidebar reduced to the runbooks.
- Amend `demo-samples-architecture.md`: Learn = slice docs on honua.io; GitBook = runbooks only.
- Search across slices + samples. Analytics decision applied.

Rough calendar: gallery redesign lands first (Aug), Phase 1 early Sep, machinery mid-Sep, first wave by early Oct, breadth through Q4.

## Risks

- **The matrix trap.** 14 slices × 7 panels × 4 SDK tabs is a big grid. The ship rule exists so slices ship incomplete and honest instead of late and exhaustive. This is the overshoot pattern — guard against it structurally, not by intention.
- **Trunk CI red** on honua-server blocks merging demo-service changes. Phase 0 may need the CI fix first, or a direct staging path.
- **Console screenshot rot.** Console moves fastest. Build-time capture + version pinning contains it; CLI/API canonical means a stale screenshot never blocks a slice.
- **Voice regression.** Generated pages drift toward spec language. The banlist gate catches vocabulary; a founder-register read of each slice before publish catches tone.
- **Priority creep.** Nothing here starts before the gallery's Stage 2 ships. Cool maps first.

## Decisions for Mike

1. **Home:** `honua.io/docs/<slice>/` (recommended — all the CI, validators, capability data, and llms machinery live in honua-site) vs a `docs.honua.io` subdomain.
2. **GitBook:** confirm the split above — slices absorb the capability guides (guide-by-guide, with redirects), GitBook narrows to operational runbooks. The alternative — keeping GitBook as a parallel Learn surface — means two canonical homes for the same topics and guaranteed drift.
3. **Evidence pages:** demote to fine-print links (recommended) vs fold their content into slices and delete the standalone pages.
4. **Prototype slice:** confirm Realtime & time.
5. **Phase 4 order:** rank the remaining eight by what sales calls keep asking for.

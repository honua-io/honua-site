# samples.honua.io — design brief

Status: handoff · 2026-08-11 · look decided: Bedrock dark
Audience: the Claude design session producing the new gallery's look, page templates, and tokens.
Precedence: this brief wins on everything visitor-facing. `docs/competitive-sample-audit.md` still governs internal cataloging and content sequencing — none of which appears on a public page. One standing rule: public pages tell the truth — nothing ships claiming to be live, fast, or keyless unless it is (see "When a demo ships").

## The job

Redesign samples.honua.io so a visitor's first thought, within ten seconds, is: **"Honua makes cool maps."**

Everything else — protocol breadth, conformance, migration tooling — is proven *incidentally*, by the maps being real and the code being short. It is never the headline.

## The one-sentence problem

The current gallery is a text-only compliance report: 11 cards, zero images, no code on the page, and internal vocabulary ("not-admitted", "coverage gaps") in public view. The machinery behind it is solid. The surface sells nothing.

## Readers, in order

1. **A GIS manager or server admin** who clicked "samples" from honua.io or a founder email. Decides in 60 seconds whether Honua is real. Will not read code.
2. **A developer evaluating** — wants the code next to the running map and to run it against their own server in five minutes, no signup.
3. **Mike in a sales call** — needs a handful of full-screen, reliably live demos that carry a story.

## The rule that overrides everything

Every demo is a cool map first. Code and a short explanation attach to the map. Process never does: no evidence receipts, no lifecycle states, no cross-SDK matrices, no job-page dossiers on the demo path. That apparatus lives in internal metadata and, later, reference docs — not here.

## What a demo page is

- A full-bleed poster appears immediately. The live map progressively replaces it and becomes interactive within the measured page budget. If activation fails, retain the poster and show a human retry action.
- A title that names the outcome, 2–3 sentences under it. That is the entire explanation budget.
- For a browser Example, the code is one complete, syntax-highlighted standalone HTML entry document. For a production-shaped Project, show the smallest truthful entry file and link prominently to the complete project. Copy button. Download where the artifact is genuinely standalone.
- Server-backed examples put one editable line at the top: `const server = "https://demo.honua.io"`. Client-only examples instead expose the relevant `dataUrl`, `archiveUrl`, or equivalent input. Never imply that a server line applies to PMTiles, static COG, or another client-only path.
- Say "no key, token, or signup" only where it's literally true.
- "Open full screen" — the sales-call button.
- Three related demos at the bottom.
- Nothing else.

## The gallery

- The landing hero starts as an optimized poster and progressively activates one verified live map. Do not make WebGL a prerequisite for seeing the page.
- A grid of real screenshot thumbnails, consistent crop, chosen for visual drama. The grid itself should read like a poster wall of maps.
- Title plus one line per card. One or two small chips ("3D", "realtime", "works in ArcGIS Pro"). No maturity or lifecycle words, ever.
- A curated row up top ("Start with these five"), the full grid below with plain search and a few topic filters. No taxonomy engineering.
- One quiet status dot: `demo.honua.io · live`, backed by a real health check. It belongs to the server-backed demos; client-only demos don't wear it.

## Launch slate

Design with all ten — real copy, no lorem, and clearly marked placeholder map art until real screenshots exist. These are targets: the demos get built to fill this page, not the other way round. Picked for wow, not coverage:

1. 3D Maui terrain flyover (hillshade + Terrain-RGB)
2. Sea-level rise slider over Maui parcels
3. Flood-exposed parcels with a live count that updates as you pan
4. Temporal playback (time slider)
5. Live incident feed (realtime)
6. Satellite imagery browser (STAC → COG)
7. 50,000 buildings aggregated with deck.gl
8. Offline basemap from a single PMTiles file
9. One dataset, four styles (style swap)
10. "ArcGIS Pro connects to this server" (screen capture + live layer)

Titles get rewritten in founder voice.

## When a demo ships (the publish gate)

Truth-gating happens at publish time, enforced by the build — never at design time. A demo appears on samples.honua.io only when it has:

- A stable live URL passing a health check at build time.
- A real screenshot (Playwright-captured), replacing any placeholder art.
- A working code link, and a runtime kind — `server-backed` or `client-only` — so the page shows the right editable line.
- Copy that's true: no invented numbers, no compatibility chips for things that don't work, no "no signup" claim where one exists.

A demo that isn't reliably live doesn't ship — no placeholder cards in production, no "coming soon". If fewer than five are live at launch, the curated row is shorter.

## Voice

- Founder register: short, declarative, opinionated. The test for any public sentence: would Mike say it to a prospect's face?
- Titles are outcomes, not protocols. Protocol names are chips, not headlines.
- Banned from rendered HTML: *admitted, governed, qualification, assertion, evidence, semantic, canonical, receipt, fixture, maintained*. A build gate enforces this.
- Numbers only when they're the point: "1.2M parcels at 60fps", "loads in 300ms".
- Budgets: card title ≤ 7 words · card line ≤ 16 words · page intro ≤ 3 sentences.

## Look

No new design system. One shared `honua-tokens.css` extracted from the existing brand — Bedrock palette, Geist + Geist Mono (self-hosted), the mono-label rule, `//` eyebrows, 22px dot grid, the existing focus ring. The current unbranded `gallery.css` is replaced.

Brand assets — logo, Geist font files, Bedrock values, focus ring, dot grid — come straight from the honua-site repo. Use the real files; don't approximate them from prose.

**The look is decided: Bedrock dark.** Dark ocean ground; the maps are the light source. Continuity with honua.io; terrain, imagery, and deck.gl read cinematic. Two hard requirements come with it:

- Code panels stay calm on the dark ground — a full HTML file must read comfortably. Solve this first; it is the direction's one real risk.
- Commit fully: explicit colors everywhere, so OS dark mode can never half-theme a page.

## Steal / refuse

- **Steal** — Esri: keyless runnable samples, real-screenshot thumbnails. Mapbox: complete standalone code documents; metadata-driven cards; a markdown twin of every page for LLMs. deck.gl/CARTO: dark map drama, live counters, stated scale as implicit perf proof, map + tiny insight panel.
- **Refuse** — Esri: 412-sample sprawl and title-only search. Mapbox: static screenshots in the buyer path; rotting demo subdomains. CARTO: live demos buried three properties away from buyers. All three: account walls anywhere.
- **Beat all three with:** a live map as the landing hero (none of them has one), and no token, key, or signup anywhere.

## Constraints

- Static output from the existing `build-gallery.mjs` (no framework). Browsing works without JS; search, filters, and code widgets enhance progressively.
- No external CDNs. Fonts self-hosted. Thumbnails AVIF, lazy-loaded. Landing must be fast on hotel wifi.
- Visible keyboard focus, alt text on every thumbnail, reduced-motion variants of any flyover.
- Mobile: the grid stacks; full-screen demos usable on an iPad — sales calls happen there.
- Target WCAG 2.2 AA contrast and interaction behavior. Provide a skip path around map canvases and a non-map text equivalent for the demonstrated result.
- Use explicit light/dark declarations and colors throughout; browser or OS color-scheme preferences must not create a half-themed page.
- The no-CDN rule covers the gallery's own delivery. Copied demo code uses the SDK's documented distribution path, never an invented import URL.

## Deliverables

1. **Stage 1:** one self-contained HTML exploration of the landing page in Bedrock dark, built with the real launch slate. Mike reviews; iterate until it lands.
2. **Stage 2, after sign-off:** `honua-tokens.css`, the demo-page template, the gallery template, a card + states sheet (loading / demo paused / temporarily unavailable, in human words), and a thumbnail art-direction spec with two worked examples.

## Stage 1 execution boundary

- Produce only one self-contained landing-page HTML exploration. Do not redesign sample internals, repository schemas, evidence systems, or deployment infrastructure.
- Use real brand assets from the repos. Fake the map thumbnails with placeholder art that sells the drama, clearly marked as placeholder in code comments — never shipped publicly.
- Show representative desktop (`1440 × 900`), mobile (`390 × 844`), and iPad (`1024 × 768`) layouts.
- Include loading, reduced-motion, no-JavaScript, and temporarily-unavailable behavior for an already-published demo.
- Keep the page useful without JavaScript, prevent horizontal overflow, and make all non-map controls keyboard operable.
- Preserve visible focus and WCAG 2.2 AA contrast. Do not solve the dark code-panel risk by lowering contrast or shrinking type.
- Do not add analytics, external requests, animation libraries, or speculative product copy.
- Stage 1 is accepted only when the hero, poster wall, code-panel treatment, mobile hierarchy, and failure behavior can be reviewed from the single artifact without hidden dependencies.

## Open for Mike

- Slate order.
- Whether the ArcGIS Pro demo is video, live, or both.
- Gallery analytics: Mapbox measures per-example usage; Honua's "no phone-home" promise is about the product — does it extend to the website?

## Engineering notes (not design — file as tickets)

- honua.io/samples.html has two 404 starter links today. Fix immediately, independent of the redesign.
- Thumbnail capture: reuse the existing Playwright smoke infrastructure at build time.
- Voice banlist gate in `build-gallery.mjs`.
- The audit's evidence and cataloging machinery stays as internal metadata; the public surface renders none of it.

---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["assets/remodel.css","assets/remodel.js"]
---

# Surface brief: index.html (honua.io homepage)

## Scope and mode

Persuade. The homepage is the first surface of a replacement visual world for the marketing shell (`assets/remodel.css`, 127 pages). Legacy `styles.css` pages are out of scope. Work happens on branch `site/redesign-impeccable`.

## Audience, job, action, proof, constraints

- Audience: the GIS/IT lead with an ArcGIS Enterprise or GeoServer estate (buyer leads); developers second.
- Job: decide Honua is credible enough to pilot beside what they run; developers verify by installing or trying live.
- Action: scope a migration pilot (the contact form on this page) and install with an agent; try it live as the developer counterpart.
- Proof: the kinds of client that keep working (legacy GIS clients on GeoServices REST, QGIS on OGC, Power BI and Excel on OData, SDK applications on gRPC-Web and gRPC, AI agents on MCP), each tied through a documented protocol with the registry's evidence word; no Esri product is named in the hero, by the owner's decision on 2026-10-30; the capability registry and evidence pages; live demos.
- Constraints: lead-capture contract, prepared head (CSP, JSON-LD, preloads via `scripts/prepare-marketing-pages.mjs`), self-hosted fonts only, dark teal ocean palette pinned, Esri notice, no invented customers, numbers, or rates.

## Direction contract

THESIS: Every client you already run is a survey station tied to one datum, and that datum is Honua Server. The page is a control-network diagram and its datasheet, not a product hero. It refuses the category arrangement: a headline beside a decorative map, a badge row, and a grid of equal cards.

OWN-WORLD: Continuous ocean ground (#08131a) with no light bands. A ruled chart collar (#22343f hairlines with graticule ticks) frames the viewport and every section. Display type: Archivo, width 112 to 125, weight 600, tracking -0.03em, never above 6rem. Datasheet type: Martian Mono 12 to 13px, tracked caps for designations; tabular numerals everywhere. Protocol tints, used identically on the net, the strip, tables, and links: GeoServices REST teal-bright #5fc4a6; OGC blue-bright #85c9f4; OData and STAC blue #5fa1cc; gRPC cream #e9efed; MCP and anything Preview amber #f2aa78. Station marks are stroked triangles; the Honua monument is a triangle inside a circle. Controls are square-cornered datasheet cells: primary filled teal on ink, secondary hairline. States are two-valued: lit or unlit, hover is a hard cut. No kickers, no rounded cards, no glows. Theme selection, caret, focus ring, and scrollbar from the palette.

STORY: The visitor recognises their own clients named as stations, reads the protocol and maturity on each baseline, understands that the server underneath can change while the clients do not, and either scopes a pilot or installs to verify.

FIRST VIEWPORT: Collar top band carries the wordmark and navigation as datasheet fields. Left 44%: H1 "The AI-native geospatial platform." in two lines with the second line blue-bright (the owner leads with the positioning, 2026-10-30), the promise line "Every client you run, connected to one server." beneath it; a lede; beneath it the datasheet panel, the only calm surface on the page, with rows DESIGNATION, PROTOCOLS, LICENCE, AI and a final action row holding the primary action "Scope a migration pilot" (to #contact) and the secondary "Install with an agent". Right 56%: the triangulation net, an SVG at least 700px tall, five client stations connected by protocol-tinted baselines to the Honua monument at centre, each baseline labelled with protocol and maturity in datasheet caps, stations linked to their compatibility evidence. Collar bottom band: one unbroken protocol strip that scales and never wraps, each protocol with its tint and GA or Preview state, ending in the all-capabilities link.

FORM: Geodetic control network (USC&GS triangulation diagram with NGS datasheet), candidate 6 of 7 on the ordered list. seed:db9ef5d4786bf1fc. Signature interaction: hovering or focusing a station, baseline, or strip entry lights that tie hard (two-state) and surfaces its datasheet line (protocol, maturity, evidence link); the net is keyboard-navigable. Motion grammar: on load the baselines draw once, exponential ease-out, nothing else animates; reduced motion shows the net complete.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved

- Rolling the world through the other 126 remodel pages beyond nav, footer, tokens, frame and type is a later pass; this pass verifies they still render.
- `.h-kicker` remains in use as an eyebrow on other pages (editions, capabilities, blog articles); the homepage drops it. The finish review flagged this as the inheritance pass's first job: remove the eyebrows, do not restyle them.
- The protocol strip never wraps; it fits whole down to 1280px (its inset narrows below 1340px), and below about 1240px it scrolls horizontally with the "All capabilities" link pinned at the right over a ground-coloured fade. Accepted adaptation for a nine-entry line whose states stay visible at rest.
- The net is capped at 548px tall (FIRST VIEWPORT asked for at least 700px) so the collar bottom band, the strip, stays inside a 900px-tall viewport at 1440 and 1600; 700px was unattainable with the strip in frame. The owner may trade back: restore 700px and accept the strip below the fold.
- The strip lists protocol families, as the original homepage strip did (it never listed tiles either); vector and raster tiles ship under GeoServices VectorTileServer and OGC API Tiles, reached through the "All capabilities" link and the capability registry, so "Vector tiles" is not a separate strip entry.
- Visitor-facing copy carries no survey vocabulary (owner decision, 2026-10-30): no "datum", "station", "baseline", "tied" or "control network" in headings, captions, labels or readouts. The form (frame, graticule, triangle marks, datasheet cells, labelled lines) stays; the words say client, protocol, server and evidence grade.
- Below 900px the control net is replaced by the station list (same stations, ties and links); the SVG is desktop-only.

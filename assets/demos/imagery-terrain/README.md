# Imagery & Terrain Studio (`/demo-imagery-terrain.html`)

The raster-side companion to `/demo.html` — four scenes over the same live
archives on demo.honua.io: NAIP imagery behind a swipe blade, a client-side
elevation profile decoded from real terrarium tiles, hillshade through both
serving paths (static archive vs live render, raced), and a STAC browser.

## Files

| File | Purpose |
| --- | --- |
| `../../../demo-imagery-terrain.html` | The page (app shell, no site nav, noindex). |
| `studio.js` | All page logic. |
| `studio.css` | Scoped styles (`.its-` / `#its-` prefixes only). |
| `config.json` | This demo's endpoint/parameter contract extension (STAC lanes, profile params, latency race). |
| `stac-items.json` | Bundled STAC ItemCollection — 8 REAL Sentinel-2 L2A scenes over Maui (generated, see below). |
| `thumbs/*.jpg` | The scenes' preview thumbnails, downloaded at build time (~230 KiB total). |
| `generate-stac-fixture.mjs` | Generator for the fixture (network required). |

Shared, consumed **read-only**: `assets/demo/layers.json` (server base URL, the
vector basemap style, the three PMTiles raster archives, and the dynamic
ImageServer / `/terrain` fallback routes), `assets/vendor/*` (MapLibre,
pmtiles, the Honua SDK bundle), `styles.css`.

## The four scenes

1. **Imagery swipe** — main map shows the dark vector base; a second,
   non-interactive MapLibre map showing only the NAIP PMTiles pyramid is
   camera-synced (`jumpTo` on every `move`) and clipped in screen space with
   CSS `clip-path: inset(…)`. This is the standard MapLibre compare technique
   (what `maplibre-gl-compare` does), hand-rolled here in ~60 lines — no new
   vendored dependency, strict-CSP safe. The slider is interaction code, not a
   widget.
2. **Elevation profile** — click two points (preset: Pāʻia → Haleakalā summit,
   runs on scene entry). The page reads terrarium-encoded DEM tiles **directly
   off the `maui-terrain-static` PMTiles archive** via `pmtiles.PMTiles`
   byte-range reads — the same archive MapLibre simultaneously drapes as 3D
   terrain — decodes pixels on a canvas
   (`elevation = (R*256 + G + B/256) − 32768` m), and draws a hand-rolled SVG
   chart (Analyst Workbench precedent: no chart library). The sampler reads
   the archive's own header for its zoom range and walks down from max zoom
   until a profile touches ≤ `maxTiles` tiles.
3. **Hillshade anatomy** — the hillshade toggle drives the SDK basemap
   switcher (`map` ↔ `terrain` composite base), so hillshade and imagery can
   never stack. The **latency race** fetches the *same* z11 West Maui tile
   through both seeded paths on user click: static PMTiles range read vs the
   live ImageServer render (PostGIS raster per request — `layers.json`
   documents it as the deliberate dynamic lane). Factual numbers against our
   own server.
4. **STAC browser (dual lane)** — on boot the page probes
   `GET {base}/stac/collections`. The live catalog is **valid but empty**
   (verified 2026-06-12: `{"collections":[]}`), so the page runs the fixture
   lane, labeled “sample catalog — live STAC pending collections”, and flips
   to live search (`POST /stac/search`) automatically once collections exist.

## STAC fixture provenance

`stac-items.json` is a valid STAC ItemCollection of **8 real Sentinel-2 L2A
scenes** over central Maui (grid 4QGJ, distinct acquisition dates, cloud cover
< 12%), fetched at build time from **Earth Search by Element 84**
(`https://earth-search.aws.element84.com/v1`, the public STAC API over the
Sentinel-2 open data on AWS). The page CSP allows images only from self +
demo.honua.io, so the preview thumbnails are **downloaded into `thumbs/` at
build time** — no third-party hotlinking at runtime. Each item keeps its
original Earth Search hrefs under `honua:source_href` / a `via` link, and the
file carries a `honua:fixture` provenance block. Attribution (shown on the
page): *Contains modified Copernicus Sentinel data, processed by ESA · Earth
Search by Element 84*. Regenerate with `node generate-stac-fixture.mjs`.

## SDK gaps found while building this page

Documented here per the demo convention (the code-strip snippets are honest
about what is SDK and what is page code):

- **No swipe/compare helper.** `@honua/sdk-js` exports nothing for
  swipe/compare interactions; `src/esri-compat/swipe.ts` (`SwipeCompat`) is an
  ArcGIS-API compatibility shim that tracks `position`/layer state and emits
  events but renders nothing. Scene 1 hand-rolls the standard two-map
  clip-path technique.
- **No elevation decode/profile helper.** The SDK's `terrain-rgb-elevation`
  example decodes Terrain-RGB with demo-local code and calls a server-side
  profile route via `pipelineRequestJson`; there is no first-class
  `decodeElevation`/profile export. Scene 2 carries the terrarium decode
  itself.
- **`HonuaStacSearch` exists in the SDK but not in the site's vendored
  bundle.** `assets/vendor/honua-sdk.min.js` cherry-picks the surface
  `demo.html` uses (see `assets/vendor/README.md`); the STAC client
  (`createHonuaStacSearch`, `search`/`searchAll`/`searchStream`) is not in it.
  The probe + live lane here are plain `fetch()` against the same routes (the
  Workbench precedent for OData); the code strip shows the SDK call the live
  lane maps to. A future bundle refresh can adopt it without UI changes.

## Seeding contract

Everything this page needs is already declared in `assets/demo/layers.json`
and live as of 2026-06-12: `maui-basemap`, `maui-imagery-static`,
`maui-hillshade-static`, `maui-terrain-static` (PMTiles range proxy), plus the
seeded dynamic `maui-hillshade` ImageServer route for the latency race.
Graceful absence: each scene probes its archive with a `HEAD` request and
shows the standard “not seeded yet” note if missing; the STAC scene always
works (bundled fixture) and self-upgrades to the live lane.

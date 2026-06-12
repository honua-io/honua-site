# Maui in 3D demo (`/demo-maui-3d.html`)

Overture Maps building footprints extruded by their real height attributes
over USGS 3DEP terrain, rendered 2.5D with MapLibre GL through the
`@honua/sdk-js` scene-workspace runtime. Same app-shell conventions as
`demo.html` / `demo-public-safety.html`: noindex, no site nav, status pill,
scene chips, capability sidebar with pricing.html edition badges, code strip
showing the real SDK calls.

## Files

| File | Purpose |
| --- | --- |
| `maui-3d.js` | The whole app (plain hand-written JS, IIFE, same conventions as `assets/demo/demo.js`). |
| `maui-3d.css` | Scoped styles (`.m3d-` / `#m3d-` prefixes), Bedrock tokens from `styles.css`. |
| `config.json` | Page contract: the maui-buildings service/tiles routes, fixture URL, scene framing. |
| `fixtures/kahului-buildings.json` | Offline lane: ~200 real Kahului-harbor footprints from the same Overture extract that seeded the live layer. Generated — do not hand-edit. |
| `honua-sdk-scene-entry.ts` | Bundle entry for the extra SDK surface (scene-workspace primitives + MapLibre 2.5D adapter). |
| `honua-sdk-scene.min.js` | Committed esbuild bundle of the entry above (`window.HonuaSceneSDK`). |

## Why MapLibre 2.5D and not Cesium

Investigated first, per the demo ground rules (no faked capability):

- The SDK **does** ship a Cesium scene adapter
  (`@honua/sdk-js/scene-workspace`, `createCesiumSceneAdapter`) and Honua
  Server **does** ship a Community-edition 3D Tiles route
  (`/scenes/{sceneId}/tileset.json`, `Honua.Protocols.Scene`).
- But the live demo server has **no published scene tileset** (the
  `/api/scenes` registry is filesystem-backed — ephemeral on the Lambda
  deployment) and **no quantized-mesh terrain route** (quantized-mesh is a
  tracked follow-up in honua-server; the seeded terrain is terrarium-encoded
  raster-dem PMTiles, which Cesium cannot drape).
- Rather than render buildings on a flat ellipsoid or stream a third-party
  globe, the page renders the honest path: the same renderer-neutral scene
  primitives (`elevation-source` + `extrusion`) applied through the SDK's
  MapLibre 2.5D adapter (`applyMapLibreScenePrimitives`). A Cesium adapter
  consumes those primitives unchanged the day a scene tileset is published —
  that upgrade is a data seeding task, not a page rewrite.

## Lanes

- **Live lane (default when seeded):** `maui-buildings` MVT. The page prefers
  the pre-baked static archive `maui-buildings-static` (tippecanoe, z12–14,
  internal layer `layer`) streamed as byte ranges through
  `/api/v1/tiles/pmtiles/maui-buildings-static` (HEAD-probed; no database on
  the render path). The dynamic
  `/ogc/tiles/collections/maui-buildings/tiles/WebMercatorQuad/{z}/{y}/{x}`
  route (source maxzoom 14, extrusion minzoom 12, probed via SDK layer
  metadata) stays seeded as the documented live-rendering fallback and is used
  when the archive is absent. Click queries go through
  `dataset.source("buildings").query()` against
  `/rest/services/maui-buildings/FeatureServer/{layerId}` on both variants.
- **Sample lane (graceful absence / offline):** the bundled GeoJSON fixture —
  ~200 real Kahului footprints cut from the same Overture extract — renders
  through the *same* extrusion primitive; clicks hit-test client-side. The
  lane chip always says which lane is up.
- **Terrain:** terrarium raster-dem PMTiles (`maui-terrain-static`) via the
  Honua range proxy, HEAD-probed; absent terrain degrades to a flat (but
  still tilted) view.
- **Bases:** the SDK's native `<honua-basemap-switcher>` with the shared
  contract's Map / Imagery / Terrain-composite definitions — exclusive bases
  can never stack.

## Data / attribution

Buildings: Overture Maps Foundation release **2026-05-20.0**,
`theme=buildings/type=building`, Maui Nui bbox `-157.40,20.45,-155.95,21.25`,
license **ODbL** — attribution `Overture Maps Foundation · © OpenStreetMap
contributors` is required and carried on both lanes' map sources.
`render_height` is computed at seed time:
`COALESCE(height, num_floors * 3.0, 4.0)`, with `height_source` recording
which fallback fired. Terrain/imagery/basemap attribution comes from the
shared contract (`assets/demo/layers.json`).

## honua-sdk-scene.min.js (Apache-2.0)

The shared vendored bundle (`assets/vendor/honua-sdk.min.js`) exposes only the
surface `demo.js` needs. This page additionally needs the SDK's
scene-workspace module, so it ships a second, page-scoped bundle built the
same way (the vendor bundle is never modified):

- Source: `github.com/honua-io/honua-sdk-js`
  - commit `1888872095421fe09f9d5720ebabf70c7a35258e`
  - package version `0.0.14-alpha.0`
  (same commit as the ops bundle in `assets/demos/public-safety`)
- Entry file: `honua-sdk-scene-entry.ts` (committed next to this README).
- Build command (run from a directory containing both the entry file and a
  checkout of `honua-sdk-js` as a sibling `honua-sdk-js/` directory; no
  `npm install` needed — esbuild compiles the SDK's TypeScript directly):

```sh
npx -y esbuild@0.25.5 honua-sdk-scene-entry.ts \
  --bundle --minify --format=iife --global-name=HonuaSceneSDK --target=es2020 \
  --outfile=honua-sdk-scene.min.js \
  --external:@connectrpc/connect --external:@connectrpc/connect-web \
  --external:@bufbuild/protobuf --external:cesium \
  --external:maplibre-gl --external:@maplibre/maplibre-gl-style-spec
```

## Edition badges

Capability badges mirror the published split on `pricing.html`: every
protocol surface this page exercises — vector tiles (MVT/OGC API Tiles),
FeatureServer attribute query, terrain tiles, the PMTiles range proxy, and
even the (not-exercised-here) 3D Tiles Scene route — is **Community**.

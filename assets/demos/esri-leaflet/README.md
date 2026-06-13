# Esri Leaflet demo (`/demo-esri-leaflet.html`)

The BYO-web-client proof: this page's map stack is **unmodified Leaflet +
Esri Leaflet** (vendored verbatim — see `assets/vendor/README.md`), not
Honua's SDK. Every layer and query goes through Honua Server's GeoServices
REST surface exactly as it would against ArcGIS. Only the URLs point at
demo.honua.io.

## Files

| File | Purpose |
| --- | --- |
| `../../../demo-esri-leaflet.html` | The page (app shell, no site nav, noindex). |
| `leaflet-demo.js` | All page logic — scenes, probes, the esri-leaflet wiring. |
| `leaflet-demo.css` | Scoped styles (`.el-` / `#el-` prefixes) + dark-theme restyling of Leaflet's own chrome. |

Shared, consumed **read-only**: `assets/demo/layers.json` (server base URL,
GeoServices service paths), `assets/vendor/leaflet.{js,css}`,
`assets/vendor/images/` (Leaflet control sprites),
`assets/vendor/esri-leaflet.js`, `styles.css`.

## The scenes

1. **Feature layers** — `L.esri.featureLayer` streaming zoning polygons
   (styled client-side by district family — the same palette constants the
   first-party demos use) and GNIS place names (circle markers + popups)
   from the FeatureServer, over Wailuku.
2. **Click to query** — `L.esri.query({url}).intersects(latlng).run(…)`
   against the parcels FeatureServer; the popup shows the attributes and the
   code strip shows the literal call with the measured round trip.
3. **Server-rendered tiles** — Honua's ImageServer tile route
   (`…/ImageServer/tile/{z}/{y}/{x}`): NAIP imagery and 3DEP hillshade
   rendered by the server per request, cached 24 h at the CDN edge.
   Deliberately the **dynamic lane** — this page is about the Esri-shaped
   surface; the static PMTiles lanes star on the other demos. Bases swap
   through Leaflet's own layers control (bottom-right).

   Consumed via plain `L.tileLayer` on the Esri-shaped template rather than
   `L.esri.tiledMapLayer`. The original blocker — 30–40 s ImageServer
   `f=json` metadata renders — is fixed (honua-server#1643 snapshots), but a
   tiledMapLayer flip attempted 2026-06-12 surfaced a second, contract-level
   blocker: Honua's ImageServer metadata reports `singleFusedMapCache: false`
   with no `tileInfo`, and esri-leaflet's TiledMapLayer throws reading
   `metadata.tileInfo.lods` (verified headless). Flip once the server
   advertises a tiled cache in ImageServer metadata. Same tile URLs either
   way — the page says so in the code strip.

Leaflet's native controls (zoom, layers, scale, attribution, popups) are
used on purpose — the foreign client's idioms are the story. The
"SDK-controls-only" rule applies to the first-party demos; here the absence
of our SDK *is* the demonstration.

## Editing note (sidebar copy, kept factual)

esri-leaflet's editing methods (`addFeature`/`updateFeature`/`deleteFeature`)
call the FeatureServer **applyEdits** surface, which Honua gates behind the
Pro `editing.featureserver-edits` entitlement (honua-server #1591/#1614):
the Esri-compatibility premium is paid on the write side only, while editing
through the open protocols (OGC API Features, WFS-T, OData CRUD, gRPC) is
Community and ungated. This page is read-only and labels that split in the
scene-2 capability sidebar.

## Graceful absence

Every service is probed with a `f=json` metadata request on boot (the same
contract the first-party demos use, expressed in this client's terms).
Missing layers drop out of their scenes with the standard pending note; with
nothing seeded the page stays presentable on the dark base.

## CSP

One page-scoped `_headers` block (+ matching meta tag). Delta vs /demo.html:
`img-src` additionally allows `https://demo.honua.io` because **Leaflet loads
raster tiles with plain `<img>` elements** (the MapLibre pages fetch tiles
via XHR/blob, which rides `connect-src` instead).

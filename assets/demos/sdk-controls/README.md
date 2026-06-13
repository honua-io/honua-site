# SDK Controls Gallery (`/demo-sdk-controls.html`)

Every built-in UI control in `@honua/sdk-js/controls` — the SDK's native,
framework-free control kit — exercised live on one Maui map. The kit today
ships **two custom elements** plus their helpers; this page shows all of it,
in every documented mode, and gains a station when the kit grows (its own
docs note a layer-list control "to follow").

## Files

| File | Purpose |
| --- | --- |
| `../../../demo-sdk-controls.html` | The page (app shell, no site nav, noindex). |
| `gallery.js` | All page logic + the bundled overlay cartography. |
| `gallery.css` | Scoped styles (`.sc-` / `#sc-` prefixes only) — including all `::part()` theming. |

Shared, consumed **read-only**: `assets/demo/layers.json` (server base URL,
vector basemap style, the PMTiles base archives), `assets/vendor/*`
(MapLibre, pmtiles, the Honua SDK bundle), `styles.css`. No config of its
own: this demo adds no new endpoints.

## The stations

1. **`<honua-basemap-switcher>`** — the real control, mounted top-right
   exactly as `demo.html` mounts it, wired with `.connect(map)` + `.bases`
   (the same three exclusive bases from the canonical contract: Map /
   Imagery / Terrain). The station drives it programmatically via
   `.select(id)` buttons and logs the `change`
   `CustomEvent<HonuaBasemapSwitcherChangeDetail>` stream live — clicks,
   keyboard (it is a real radio group: Arrow keys, Home/End), and
   programmatic selection all emit the same event. With zero seeded archives
   the switcher hides itself (its documented empty state) and the pending
   note says so.
2. **`<honua-legend>` — explicit sections** — sections built from the same
   palette constants that paint the overlay layers (one constant, two
   consumers). Per-layer checkboxes write a single
   `setLayoutProperty(…, "visibility", …)`; `follow-layer-visibility` +
   `auto-refresh` hide/show the matching section with no page code in the
   loop. Demonstrates all three swatch shapes (`fill` with split
   fill/outline colors, `line`, `circle`) and the `heading` attribute.
3. **`<honua-legend>` — derive mode** — no entries assigned; the element
   parses the layer's own categorical `match` paint expression (the kit's
   headline: map and legend cannot drift). A palette-shuffle button repaints
   the layer with one `setPaintProperty` call and the legend re-derives
   itself off `styledata`. The raw `deriveLegendEntries(map, layerId)`
   output is dumped alongside as JSON; derive failures render the
   `HonuaLegendDeriveError` message in the dump (the element fails just as
   gracefully).

4. **Esri-compat (the migration lane)** — a widget GRID running real ArcGIS
   widget code unchanged against the same map: **20 of the lane's 77
   API-compatible classes**, wired live. The shims are HEADLESS — they
   preserve widget STATE and EVENT contracts (plus `watch()`), render no
   DOM, and this page paints every pixel; that split is exactly the
   migration story the station narrates. The wirings:

   | Shim | Wiring on this page |
   | --- | --- |
   | `HomeCompat` | viewpoint + `go()` flies the duck-typed view |
   | `BookmarksCompat` | `goTo()` + `watch("activeBookmark")` highlighting |
   | `SwipeCompat` | `position` state paints the real clip blade (camera-synced NAIP follower map) |
   | `CompassCompat` | map bearing ↔ `orientation`; the card's needle resets north via `goToNorth()` |
   | `ZoomCompat` | `zoomIn()`/`zoomOut()` write `view.zoom`; the accessor eases the map |
   | `FullscreenCompat` | `active` state requests real fullscreen on the shell + marks it |
   | `ExpandCompat` | `expanded` state shows/hides the card's panel section |
   | `BasemapToggleCompat` | `toggle()` drives the page's real `<honua-basemap-switcher>`; switcher changes flow back over the bus |
   | `ScaleBarCompat` | zoom → `{scale, text}`; also refreshes off bus `view.go-to` emissions |
   | `AttributionCompat` | seeded with the page's real data credits; `addAttribution()` exercised |
   | `LocateCompat` | real geolocation, or a documented SIMULATED Kahului position when denied/unavailable (the card says so) |
   | `LayerListCompat` | the three gallery overlays behind `items`/`toggle()`; its `layer.visibility-changed` bus event is the only writer of the map's layout property (the kit's native layer-list control is tracked in honua-sdk-js#280) |
   | `DistanceMeasurement2DCompat` | two map clicks → geodesic `lastMeasurement`; the page draws the segment |
   | `AreaMeasurement2DCompat` | clicked ring → area `lastMeasurement`; the page draws the polygon |
   | `SketchCompat` | point/polyline/polygon `create()`/`complete()` onto a scratch GeoJSON source via the duck-typed layer contract |
   | `PopupCompat` + `PopupTemplateCompat` | click a gallery point → template interpolates `{name}`/`{kind}` → popup state → MapLibre bubble |
   | `PrintCompat` | `execute()` carries the export request contract; the page fulfils the job from the live canvas as a PNG download |
   | `FeatureLayerCompat` | constructed against the LIVE `maui-place-names/FeatureServer/6` (read-only): `load()` metadata, `queryFeatureCount()`, `queryFeatures()` |
   | `FeatureTableCompat` | `refresh()` runs the layer's real `queryFeatures()`; top 8 rows rendered, row click → `highlightIds` selection + map halo |

   Every emission flows through the shared `CompatEventBus` log
   (`bus.onAny`), and a collapsible catalog lists the lane's full 77-class
   surface with this page's wirings in bold. The exercised shims (+ the
   event bus) are bundled per-file into the vendored bundle
   (`assets/vendor/README.md`); the full lane lives in
   `@honua/sdk-js/esri-compat`.

Also covered in the code strips: `defineHonuaControls()` (registration is an
import side effect in the vendored bundle; the explicit call is for scoped
registries) and `HonuaBasemapStyleBinding` (the engine inside the switcher —
narrated, not duplicated).

## Overlay data

The three overlay layers (harbors / airfields / lighthouses points, a
Hāna Highway polyline, a West Maui watershed polygon) are **bundled,
illustrative page data** — real, recognizable Maui locations placed by hand
for this gallery, labeled as sketches in the UI. They are deliberately not a
served dataset: the legend stations must work even with zero archives
seeded, so the page's only server dependency is the base archives
(HEAD-probed, graceful absence).

## Theming note

Both elements ship structural-only shadow CSS on purpose; every visual
decision on this page (Bedrock colors, radii, typography) is applied from
`gallery.css` via `::part()` — `group`/`radio`/`radio-active` on the
switcher, `root`/`heading`/`section`/`section-title`/`row`/`swatch`/`label`
on the legend. That is itself part of the demo.

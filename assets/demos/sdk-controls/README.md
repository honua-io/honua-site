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

4. **Esri-compat (the migration lane)** — runs real ArcGIS widget code
   unchanged against the same map: `HomeCompat` (viewpoint + `go()`),
   `BookmarksCompat` (`goTo()` + `watch("activeBookmark")` highlighting),
   and `SwipeCompat`, whose `position` state paints an actual clip blade (a
   camera-synced follower map showing NAIP imagery — the shim owns the
   STATE and event contract, the page owns the pixels, which is exactly the
   migration split). A live `CompatEventBus` log shows the emissions
   migrated code subscribes to, and a collapsible catalog lists the lane's
   full 77-class surface. The three exercised shims (+ the event bus) were
   added to the vendored bundle (`assets/vendor/README.md`, +7 KB); the
   full lane lives in `@honua/sdk-js/esri-compat`.

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

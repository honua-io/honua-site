# Analyst Workbench demo (`/demo-analyst-workbench.html`)

Charts + bidirectionally synced map over the Honua Server **OData v4** surface —
the data-analyst persona showcase. The OData surface is the point: every chart
is an `$apply` aggregation, the literal URL that just ran is displayed in the
query bar, and the same feed opens directly in Excel / Power BI.

## Files

| File | Purpose |
| --- | --- |
| `../../../demo-analyst-workbench.html` | The page (app shell, no site nav, noindex). |
| `workbench.js` | All page logic. Plain `fetch()` against OData + MapLibre rendering. |
| `workbench.css` | Scoped styles (`.wb-` / `#wb-` prefixes only). |
| `workbench-config.json` | This demo's endpoint/field contract extension (see below). |
| `fixture-parcels.json` | Bundled SYNTHETIC sample lane (generated, see below). |
| `generate-fixture.mjs` | Deterministic generator for the fixture. |

Shared, consumed **read-only**: `assets/demo/layers.json` (server base URL +
parcels MVT tile template), `assets/vendor/maplibre-gl.{js,css}`, `styles.css`.

## Charts: hand-rolled SVG, no vendored chart library

This page needs exactly two chart types (category bars + a brushable
histogram), so they are built directly as SVG in `workbench.js` (~150 lines).
That was the lighter path versus vendoring uPlot into `assets/vendor/` —
no new third-party bundle, nothing to track for provenance, strict-CSP safe.

## Dual lane

1. **Live lane** — on boot the page probes `GET {base}/odata/Layers`, resolves
   the `maui-parcels` layer key, and smoke-tests
   `?$apply=aggregate($count as parcels)`. If all of that works, aggregations
   run live and the map draws the real parcels MVT.
2. **Fixture lane** — otherwise the page loads `fixture-parcels.json`
   (437 synthetic, Maui-shaped parcels around six real town centers; seeded
   PRNG, regenerate with `node generate-fixture.mjs`) and aggregates
   client-side **using the same arithmetic the `$apply` pipeline runs**, while
   still displaying the exact URLs the live lane would issue. The page is
   labeled "sample data — live server pending" in the status pill, rail badge,
   and query bar. A live lane that starts failing mid-session degrades to the
   fixture lane without a reload.

## The OData queries (live lane)

Verified against `honua-server/docs/gis/specifications/odata-v4-coverage.md`:

```
# zoning chart + acreage  (crossfilter: excludes its own zoning filter)
GET /odata/Layers({id})/Features?$apply=
  filter(geo.intersects(Geometry, geography'SRID=4326;POLYGON((…extent…))'))
  /groupby((zoning),aggregate($count as parcels,gisacres with sum as acres))

# acreage histogram — server-side bins from documented compute arithmetic
GET /odata/Layers({id})/Features?$apply=
  filter(geo.intersects(…))
  /compute(gisacres sub (gisacres mod 0.5) as acrebin)
  /groupby((acrebin),aggregate($count as parcels))

# KPI tiles + flood chart (all filters applied)
GET /odata/Layers({id})/Features?$apply=
  filter(geo.intersects(…) and zoning eq 'R-2' and (gisacres ge 0.5 and gisacres lt 1))
  /groupby((flood_zone),aggregate($count as parcels,gisacres with sum as acres))
```

Notes on deliberate choices:

- **No `in` operator** — the server's `$filter` parser doesn't implement it
  (documented), so the zoning filter is a single `eq` (single-select bars).
- **Histogram bins** avoid `floor()` inside `$apply` because the coverage doc
  only documents arithmetic expressions for compute; `x sub (x mod w)` needs
  nothing else.
- **Extent filter** is `geo.intersects()` with a `geography` WKT literal —
  the only documented spatial filter shape (no bbox shorthand).
- **GeoParquet** is exported from the GeoServices REST query surface
  (`f=parquet`), not OData — per `docs/developer/API_EXAMPLES.md`. The button
  is enabled in the live lane only.

## Seeding contract

`workbench-config.json` extends the canonical `assets/demo/layers.json`
contract: the seeded `maui-parcels` layer must be discoverable by name in
`/odata/Layers`, expose `zoning` / `gisacres` / `flood_zone` attributes (the
flood class is a seed-time spatial join against `maui-flood-hazard`, `'X'`
outside any hazard polygon), and encode the same attributes in the parcels
MVT so chart→map filters run client-side. Graceful absence: a missing
`flood_zone` attribute only hides the flood chart and KPI.

## Why no `window.HonuaSDK` on this page

The vendored SDK bundle (`assets/vendor/honua-sdk.min.js`, see
`assets/vendor/README.md` — not modified by this demo) cherry-picks only the
surface `demo.html` uses and does **not** include the SDK's OData helpers
(`HonuaOdataEntitySet`, `buildOdataSpatialFilter` exist in the SDK source but
aren't in the bundle). Plain `fetch()` is also exactly the message of this
page: OData is a URL any client can run — browsers, Excel, Power BI. If a
future bundle refresh adds the OData entry points, `workbench.js` can adopt
them without UI changes.

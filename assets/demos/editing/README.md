# Inspection & Editing demo (`/demo-editing.html`)

Field-ready feature editing through the **open protocols**: one map of
**synthetic inspection points** at real Maui parks, trailheads, and harbors,
where clicking a point opens an editable card and Save sends a plain
**OData v4 PATCH** to a live scratch layer on demo.honua.io — with the
literal wire request shown in the code strip. "Add inspection" is a plain
POST. The Esri FeatureServer `applyEdits` surface (Pro) exists on the same
layer and is deliberately **not** used; that contrast is the page's story.

Every feature is **synthetic demo data** — no real inspection program,
finding, or condition is represented; every note carries the
"Demo data — synthetic inspection." marker.

## Files

| File | Purpose |
| --- | --- |
| `app.js` | The whole app (plain hand-written JS, IIFE, same conventions as `assets/demo/demo.js`). |
| `editing.css` | Scoped styles (`.ed-` / `#ed-` prefixes), Bedrock tokens from `styles.css`. |
| `config.json` | Page contract: OData layer name, capability probe, field/enum schema, map framing. |
| `inspections.geojson` | Generated fixture — the same data seeded server-side; the page's offline lane. |
| `generate-inspections.mjs` | Deterministic generator for `inspections.geojson` (`node generate-inspections.mjs`). |

The map uses the shared contract (`assets/demo/layers.json`) for the server
base URL, glyphs, and the Map/Imagery base archives; the SDK's native
`<honua-basemap-switcher>` and `<honua-legend>` (from the shared vendored
`assets/vendor/honua-sdk.min.js` bundle) are the only non-MapLibre controls.

## Lanes

- **Data lane:** boot probes `GET {baseUrl}/odata/Layers` and resolves the
  layer named `maui-inspections`; reads run over
  `GET /odata/Layers({id})/Features?$top=500`. If the probe fails the page
  falls back to the bundled `inspections.geojson`, clearly chipped.
- **Write lane (no shipped credential, by design):** the page probes
  `GET {baseUrl}/api/v1/capabilities/manifest` and lights LIVE writes only
  when the `edit.features` capability reports `available: true`. When it
  does, Save = `PATCH /odata/Layers({id})/Features({objectId})` and
  Create = `POST /odata/Layers({id})/Features`, optimistic UI with per-row
  results (rollback + the HTTP status on rejection). When it does not —
  honua-server #1548/#1552 gates ALL protocol writes (OData, OGC API
  Features, WFS-T, FeatureServer, gRPC) behind the Pro
  `editing.feature-edits` entitlement, and demo.honua.io currently runs
  Community → 402 — edits apply **locally only**, the writes chip says so,
  and the code strip still shows the exact request that would run. The page
  lights up with zero code changes once a license lands on the server.
- **ETag semantics:** the server supports optimistic concurrency
  (`@odata.etag` + `If-Match`, `412` on mismatch). This page documents but
  does not send `If-Match`, for two live-server reasons (both reported
  upstream): the CORS preflight `access-control-allow-headers` list omits
  `If-Match`, and the single-entity GET — the etag source — currently 500s
  under the AOT build (`ODataCrudService.GetFeatureAsync` hits
  reflection-based `System.Text.Json`). Last-write-wins is acceptable for a
  synthetic sandbox.

## Server-side scratch layer (seeding contract)

Seeded 2026-06-12 via the pipeline in `honua-iac` `_seed-work` notes
(FlatGeobuf staged to S3 with `--content-type application/flatgeobuf` →
admin remote import → flatten/typed-table SQL via the postgis-bootstrap
Lambda → publish → extents refresh):

- Service `maui-inspections`, internal/OData layer id **12**, table
  `public.maui_inspections` (pk `id`, Point/EPSG:4326), 27 seeded rows with
  ids 9000001+ (clear of the global `features.objectid` space).
- Schema: `name` (≤200), `category` ∈ trail|park|harbor|facility, `status` ∈
  ok|needs_attention|urgent, `note` (≤500), `reported_at` (timestamptz) —
  all enforced by CHECK constraints, so the public sandbox blast radius is
  one synthetic, enum-validated table.
- Access policy: `AllowAnonymous` + `AllowAnonymousWrite` via
  `PUT /api/v1/admin/services/maui-inspections/access-policy` — anonymous
  reads work today; anonymous writes additionally require the
  `editing.feature-edits` entitlement (see Lanes above).

Regenerate the fixture (and the seed source) with:

```sh
node generate-inspections.mjs
```

## Edition badges

Capability badges mirror the published split on `pricing.html` exactly:
feature editing via open protocols (OGC API Features, WFS-T, OData, gRPC) =
Community; Esri FeatureServer `applyEdits` = Pro; serving/query = Community;
SDK UI controls = Community (Apache 2.0 SDK). Note: honua-server #1552
currently gates open-protocol writes behind Pro server-side, which does not
match the published Community row on `pricing.html` — flagged upstream; this
page follows the published split and chips the live-server state honestly.

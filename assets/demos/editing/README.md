# Inspection & Editing demo (`/demo-editing.html`)

Field-ready feature editing through the **open protocols**: one map of
**synthetic inspection points** at real Maui parks, trailheads, and harbors,
where clicking a point opens an editable card and Save sends a plain
**OData v4 PATCH** to a live scratch layer on demo.honua.io — with the
literal wire request and the server's answer shown in the code strip.
"Add inspection" is a plain POST. The Esri FeatureServer `applyEdits`
surface (Pro) exists on the same layer and is deliberately **not** used; that
contrast is the page's story.

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
  first published layer named in `config.json` `odata.layerNames`
  (`maui-inspections-scratch`, the editable copy, then `maui-inspections`, the
  original seed); reads run over `GET /odata/Layers({id})/Features?$top=500`.
  If the probe fails the page falls back to the bundled `inspections.geojson`,
  clearly chipped.
- **Write lane (no shipped credential, by design):** when the data lane is
  live, Save sends the real anonymous
  `PATCH /odata/Layers({id})/Features({objectId})` and Create sends
  `POST /odata/Layers({id})/Features`. The server's answer decides, and the
  code strip appends it under the literal request:

  | Answer | Card + writes chip |
  | --- | --- |
  | 2xx | "saved on the server", then the feature is re-read with `GET /odata/Layers({id})/Features({objectId})` and the card is marked saved on the server |
  | 401 / 403 | kept locally: "this server's access policy does not allow anonymous writes on {layer}" |
  | 402 | kept locally: the server's license does not include feature editing |
  | 405 / 501 | kept locally: the server does not accept OData writes on this layer (for example `501 ProviderWriteNotSupported`) |
  | 428 | kept locally: the server demands `If-Match`, which the page cannot send yet (see below) |
  | fetch `TypeError` after live reads | kept locally: "blocked by browser preflight" (the CORS preflight refused the write) |
  | timeout / other network failure | kept locally: the demo server could not be reached |
  | 412 / other 4xx / 429 / 5xx | the edit is rolled back with the HTTP status |

  Writes are governed by the layer's access policy (`allowAnonymousWrite`);
  2026.1 ships `Licensing__Mode=Disabled`, so no license tier is involved on
  the demo. The capability manifest (`GET /api/v1/capabilities/manifest`) is
  read only as a hint for the chip tooltip: honua-server reports
  `edit.features` as `insufficient-policy` for every anonymous caller,
  whatever the layer's policy allows, so it cannot gate a public demo.
- **ETag semantics:** the server supports optimistic concurrency
  (`@odata.etag` + `If-Match`, `412` on mismatch). This page documents but
  does not send `If-Match`, `Prefer`, `OData-Version` or `OData-MaxVersion`,
  because the demo's CloudFront CORS policy allows only `Range`,
  `Authorization`, `X-API-Key`, `If-None-Match`, `If-Range`, `Content-Type`,
  `If-Modified-Since` and `X-Correlation-ID` (re-checked 2026-10-24); any other
  header fails the preflight. Concurrency headers return once honua-demo-infra
  #96 is applied. Until then writes are last-write-wins, which is acceptable
  for a synthetic sandbox.

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
- Access policy: `allowAnonymous` + `allowAnonymousWrite` via
  `PUT /api/v1/admin/services/maui-inspections/access-policy` (confirmed with
  a read-only admin `GET .../settings` on 2026-10-24). The policy admits the
  anonymous write, but this layer was published `storageMode: source` over
  the typed table, so honua-server answers OData writes with
  `501 ProviderWriteNotSupported` (and OGC API Features with 405, since the
  publication declares only `Query`). Live writes need the managed-store
  editable copy `maui-inspections-scratch`; the publish, policy, revert, and
  reset steps live in honua-demo-infra
  `runbook/editing-scratch-layer-anonymous-writes.md` and
  `runbook/scripts/reset-inspections-scratch.sh`.

Regenerate the fixture (and the seed source) with:

```sh
node generate-inspections.mjs
```

## Edition badges

Capability badges mirror the published split on `editions.html`: feature
editing via open protocols (OGC API Features, WFS-T, OData, gRPC) =
Community; Esri FeatureServer `applyEdits` = Pro; serving/query = Community;
SDK UI controls = Community (Apache 2.0 SDK).

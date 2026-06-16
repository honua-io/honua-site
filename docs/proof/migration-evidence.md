# Migration Evidence

Moving off an Esri (or GeoServer) estate is a discovery problem before it is a
deployment problem. Honua's migration story is backed by two open tools plus the
benchmark and compatibility evidence already in this hub:

1. **Assess** the existing Esri footprint with an open, read-only scanner.
2. **Verify** that Esri clients keep working against Honua after the move.
3. **Show** the performance and cost difference on an identical dataset.

## Step 1 — Assess the Esri footprint (open, read-only)

[`honua-io/honua-esri-assess`](https://github.com/honua-io/honua-esri-assess) is
Apache-2.0 footprint-assessment tooling — deliberately open so prospects can
audit the code before running it against their own ArcGIS Online, ArcGIS Server,
or FileGDB inventories. It produces a versioned `EsriFootprint.json` artifact.

**Safety posture (quoted from the source):** the scanner is **strictly read-only
(`GET`-only)**, mints no credentials, never touches your databases, and does
**not send network telemetry by default**. Credentials are accepted only through
`--token-env VAR` (no plaintext `--token`), and the variable *name* is logged,
never the value.

Supported sources:

| Source | CLI surface | Notes |
|--------|-------------|-------|
| ArcGIS Online | `scan agol --target <…/sharing/rest>` | Portal Sharing REST API, read-only |
| ArcGIS Server | `scan server --target <…/arcgis/rest>` | ArcGIS Server REST service metadata, read-only |
| FileGDB (descriptor) | `scan filegdb --target <path>` | Reads a local `_inventory.json` descriptor; no network |
| FileGDB (workspace) | `scan filegdb-workspace --target <path.gdb>` | Read-only `pyogrio`/GDAL metadata on a local `.gdb` |
| RBAC / access | `scan rbac --target <portal-or-server-admin-url>` | Read-only identity/RBAC posture into `EsriAccessFootprint.json` |

```bash
pipx install honua-esri-assess
export AGOL_TOKEN="..."
honua-esri-assess scan agol \
  --target https://yourorg.maps.arcgis.com/sharing/rest \
  --token-env AGOL_TOKEN \
  --output EsriFootprint.json --validate
honua-esri-assess report --input EsriFootprint.json --output readiness-report.md
```

The `EsriFootprint.json` v0.1 contract is published in the repo (schema
`$id: https://schemas.honua.io/esri-footprint/v0.1.0/esri-footprint.json`), with
a canonical sample, a sample readiness report, and a prospect-facing
handoff-contract doc describing exactly what flows between this open tool and the
closed Honua migration product. (v0.x is unstable; v1.0 is the first stability
promise.)

## Step 2 — Verify Esri clients still work

After the data lands in Honua, the [Compatibility Matrix](compatibility-matrix.md)
shows the evidence that ArcGIS Pro / arcpy, the ArcGIS API for Python, the
ArcGIS Maps SDK for .NET, and raw GeoServices REST clients keep working —
including auth flows (token `generateToken`, OAuth2, API key, expiry/refresh)
and authorization (service scoping, layer/field/row policy, anonymous policy).

The fastest verification is the live demo: point ArcGIS Pro or `arcgis` at
**[demo.honua.io](https://demo.honua.io)** and add a FeatureServer layer.

- Esri Leaflet / GeoServices demo: <https://honua.io/demo-esri-leaflet.html>
- Two-protocol (same data via Esri REST and OGC) demo:
  <https://honua.io/demo-two-protocols.html>
- Editing round-trip demo: <https://honua.io/demo-editing.html>

## Step 3 — Show the difference

The [Benchmarks](benchmarks.md) page shows Honua leading every comparable
performance cell in the current GeoBench snapshot on an identical 100K-point
dataset and database budget, and the [cost section](benchmarks.md#cost-and-price)
covers the open-core / no-per-seat economics.

## Known migration gaps (honest)

From the compatibility evidence, these are the operations still in flight or
genuinely not yet implemented — surface them to a migrating customer rather than
hide them:

- **FeatureServer:** 12 catalogued operations not implemented, 46 still
  `unknown` (see `honua-esri-compat/matrix/feature-server.matrix.json`).
- **ImageServer:** the thinnest surface — 33 not implemented, 29 partial; known
  server gaps include JSON `bboxSR` on `exportImage`,
  `computeStatisticsHistograms` (501), and missing `computeHistograms` /
  `getSamples` / `keyProperties` routes.
- **Geometry Service & GPServer:** partial; geometry-service knobs are the
  lowest SDK pass rate (6/22), and several geometry ops are tracked under
  honua-server issue #1301.
- **GeocodeServer:** reachable and config-driven; metadata is GET-only so the
  Esri Geocoder's POST hydration returns 405 (tracked, same class as #1298), and
  the default provider does not support `suggest`.

> `TODO(data): honua-io/honua-esri-assess` — Add a real (or canonical-sample)
> readiness-report excerpt showing a scanned estate mapped to Honua-supported vs.
> gap operations, so the migration page carries a concrete before/after example.
> The sample report at `docs/samples/readiness-report.sample.md` is the source.

> `TODO(data): honua-server / GeoServer migration` — The proof-hub scope names
> both Esri **and GeoServer** displacement. GeoBench already compares Honua vs.
> GeoServer head-to-head; add a GeoServer-specific migration/standards-mapping
> guide (data + WMS/WFS config equivalents) once the owning source exists. Do
> not author GeoServer migration steps from memory.

> `TODO(data): honua-sales` — Reference customer / pilot migration case study
> (anonymized estate size, timeline, outcome) when sales publishes one.

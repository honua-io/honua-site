# Esri to Honua Compatibility Matrix

Honua is a multi-protocol geospatial server, and **Esri clients are first-class
consumers**. This page summarizes the open compatibility evidence: which Esri
REST operations Honua implements, and which Esri clients verifiably work against
it end to end.

> **"Certification" here means this project's own internal compatibility
> evidence**, produced by the open harness in
> [`honua-io/honua-esri-compat`](https://github.com/honua-io/honua-esri-compat) —
> **not** certification by Esri or any standards body. Esri, ArcGIS, ArcGIS Pro,
> and ArcPy are trademarks of Esri, used here nominatively to identify the
> clients under test. No Esri software is redistributed.

## Clients verified against Honua

From the honua-esri-compat harness lanes:

| Client | What it verifies | License needed |
|--------|------------------|----------------|
| **ArcGIS Pro / arcpy** | Licensed desktop gold standard: render, edit, GP, 3D, parity | ArcGIS Pro (Windows) |
| **ArcGIS API for Python (`arcgis`)** | Official Esri Python client consuming FeatureServer | none — runs anywhere |
| **ArcGIS Maps SDK for .NET** | Native runtime, metadata + query matrix (ServiceFeatureTable, ServiceGeodatabase, FeatureLayer, MapImageLayer) | none — metadata-only, no API key |
| **Raw GeoServices REST** | stdlib HTTP probes reproducing Esri request patterns | none |

The Python and .NET client lanes give official-Esri-client coverage with **no
license and no ArcGIS Pro**, so most of the surface is verifiable anywhere; the
licensed arcpy desktop lane is gated for render/edit/3D evidence.

## Service-operation coverage (GeoServices REST surface)

The harness measures coverage against the **actual Esri REST operations Honua
implements**, derived from honua-server's own coverage matrices (machine-readable
manifests under `honua-esri-compat/matrix/`). Counts below are quoted verbatim
from `matrix/index.json` (`source_parity_reviewed: 2026-04-29`); `parity` is
the repo's own per-service rating.

| Service | Implemented | Supported (impl. + partial) | Total Esri operations catalogued | Parity rating |
|---------|------------:|----------------------------:|---------------------------------:|---------------|
| **FeatureServer** | 77 | 80 | 139 | partial |
| **MapServer** | 89 | 90 | 113 | partial |
| **ImageServer** | 35 | 64 | 117 | partial |
| **Geometry Service** | 22 | 23 | 40 | partial |
| **GPServer** | 3 | 3 | 7 | partial |

Notes from the manifests:
- "Total" counts every Esri operation/parameter catalogued for the service,
  including ones not yet implemented and ones still marked `unknown` (e.g.
  FeatureServer lists 46 `unknown`, 12 not-implemented; ImageServer lists 29
  `partial`, 33 not-implemented, 18 `unknown`).
- ImageServer includes one Honua-extension operation and one `not_honoured`
  parameter; MapServer marks 5 operations `ignored`.
- These are catalogued-operation counts, **not** percentages of "all of ArcGIS."
  Use the per-service manifests for the exact operation list.

## Esri SDK integration knobs

The deeper SDK certification tracks **135 integration "knobs"** across six lanes
(`docs/sdk-certification-matrix.md` in honua-esri-compat). Status quoted verbatim
from `docs/CERTIFICATION-STATUS.md`:

> **Today: 79 / 135 knobs pass (59%)** against a live nightly target with the
> in-flight fixes simulated by the harness shim.

| Lane | Pass / total |
|------|-------------:|
| feature-query | 48 / 57 |
| geometry-service | 6 / 22 |
| map-service | 16 / 17 |
| image-service | 3 / 9 |
| editing | 8 / 24 |
| geocode | 3 / 7 |

Each remaining knob is attributed in the source repo to either a specific
honua-server change (several already merged — e.g. PR #1277 `returnAllRecords`
strip, #1294 JSONB attrs query, #1297 default `drawingInfo`) or a harness-seed
gap with no production bug. The path to full certification is documented step by
step in `honua-esri-compat/docs/CERTIFICATION-STATUS.md`.

> `TODO(data): honua-io/honua-esri-compat` — When an all-fixes server image is
> built and the shim is dropped, replace the "59% with shim simulation" figure
> with the live, no-shim pass rate (the recert matrix scaffold already exists at
> `docs/no-shim-recert-matrix.md`). Do not promote the shimmed number to a
> live-verified claim.

> `TODO(data): honua-io/honua-esri-compat` — Publish the latest
> `coverage-report.md` percentage and `summary.md` pass/fail rollup from a live
> evidence run (`evidence/<run-id>/`) so the matrix carries a dated, live
> coverage figure alongside the catalogue counts above.

## OGC / STAC standards

Esri compatibility is only half the interoperability story; Honua also speaks the
open standards directly. The honua-esri-compat **ogc** lane verifies OGC API
Features plus classic WFS / WMS / WMTS from ArcGIS Pro, and the public demo
exposes the standards surface for direct testing:

- OGC API Features / OData: <https://demo.honua.io/odata/>
- STAC operations sample: <https://demo.honua.io/samples/stac-ops/>
- GeoBench independently exercises OGC API Features, WMS (`GetMap`,
  reprojection, `GetFeatureInfo`), WFS (`GetFeature`, filtered), WMTS, and
  experimental WCS — see [Benchmarks](benchmarks.md).

> `TODO(data): honua-server` — Embed the authoritative OGC API Features / WMS /
> WFS / WMTS / STAC conformance-class coverage table from honua-server's own
> standards/conformance docs (per-conformance-class implemented vs. declared).
> The site's `interoperability.html` and honua-server docs are the owning
> sources; do not hand-author conformance claims here.

## Reproduce it

honua-esri-compat is open and runnable without a server or ArcGIS Pro for the
contract lanes:

```bash
git clone https://github.com/honua-io/honua-esri-compat
cd honua-esri-compat
./scripts/check.sh                                    # local, no server/network
./scripts/run-esri-clients.sh --targets config/targets.local-docker.yaml
```

The licensed desktop run (ArcGIS Pro on Windows, adds render/GP/parity evidence)
is documented in `docs/windows-runner-runbook.md`.

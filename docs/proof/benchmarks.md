# Benchmarks

All numbers on this page are quoted **verbatim** from the
[`honua-io/geobench`](https://github.com/honua-io/geobench) headline snapshot.
GeoBench is an open, vendor-neutral benchmark suite for geospatial feature and
map servers — *"TechEmpower for GIS"*: transparent workloads, disclosed
configuration, and repeatable results. Do not edit the figures here without
re-pulling them from the geobench README and the underlying result directory.

> **Source of record:** geobench README, "Current Headline Snapshot" section, and
> the run artifacts under `results/20260428-192053/` (report at
> `results/20260428-192053/report.md`, action ledger at
> `results/20260428-192053/loss-ledger-final/loss-ledger.md`). The result
> directory is regenerated per run and is not tracked in git; the README headline
> table is the published snapshot of record.

## Snapshot conditions (disclosed)

The current headline snapshot was generated on **April 28, 2026 HST**
(April 29, 2026 UTC in the report timestamp) against the **100K-point dataset**.

- **5-run median** per scenario.
- Baseline profile with **no spatial response cache**.
- **30-second warmup + 30-second measured window** per scenario.
- Strict bounded database profile for both servers: Honua active-query / pool
  settings `6/6/3`; GeoServer datastore pool settings `6/3`.
- GeoServer was run with the **GSR community extension** for the GeoServices rows.
- Server containers, PostGIS, and k6 each use **4 CPU cores and 4 GB memory**;
  each server runs against its own dedicated PostGIS initialized from the same
  deterministic dataset (seed=42, 100,000 point features, 10 attribute fields).
- QGIS Server remains runnable in the harness, but the headline table focuses on
  the Honua vs. GeoServer profile.

**Servers in the harness:** Honua Server (.NET 10), GeoServer 2.28.0 (Java/JVM),
QGIS Server 3.38 (C++/Qt).

## At a glance

> Honua led every comparable performance cell in this snapshot. Across the
> headline rows below, Honua delivered **2.6x to 470x higher throughput** and
> **3.1x to 450x lower tail latency**, depending on the protocol and scenario.
> The six comparable error-rate cells were ties at `0.0%`.

In this report, **all 204 measured performance cells where both servers had data
favored the Honua row.** `MapServer/export` has no GeoServer row in this harness
profile.

### Advantage by scenario (Honua vs. GeoServer)

| Scenario | Throughput Advantage | Tail-Latency Advantage |
|----------|---------------------:|-----------------------:|
| GeoServices `MapServer/identify`, large bbox | **470x higher req/s** | **450x lower p95** |
| WMS filtered `GetMap`, range | **101x higher req/s** | **113x lower p95** |
| Attribute filter, LIKE | **73x higher req/s** | **185x lower p95** |
| Spatial bbox, large bbox | **55x higher req/s** | **63x lower p95** |
| WFS filtered, LIKE | **20x higher req/s** | **20x lower p95** |
| WMS reprojection, large bbox | **14x higher req/s** | **24x lower p95** |
| Concurrent mixed workload, 100 VUs | **12x higher req/s** | **8.9x lower p99** |
| WFS `GetFeature`, large bbox | **10x higher req/s** | **14x lower p95** |
| WMS `GetFeatureInfo`, medium bbox | **6.9x higher req/s** | **11x lower p95** |
| GeoServices `FeatureServer/query`, medium bbox | **4.1x higher req/s** | **5.2x lower p95** |
| WMS `GetMap`, medium bbox | **2.6x higher req/s** | **3.1x lower p95** |

## Raw headline values

| Track | Scenario | Honua | GeoServer |
|-------|----------|------:|----------:|
| Attribute filter | LIKE | 1632.8 req/s, p95 5.2 ms | 22.3 req/s, p95 959.3 ms |
| Spatial bbox | large bbox | 1069.3 req/s, p95 15.5 ms | 19.5 req/s, p95 977.1 ms |
| Concurrent mixed workload | 100 VUs | 1190.2 req/s, p99 201.4 ms | 96.2 req/s, p99 1793.2 ms |
| WMS `GetMap` | medium bbox | 80.1 req/s, p95 186.4 ms | 30.5 req/s, p95 582.5 ms |
| WMS reprojection | large bbox | 131.9 req/s, p95 99.3 ms | 9.3 req/s, p95 2356.7 ms |
| WFS `GetFeature` | large bbox | 581.5 req/s, p95 29.0 ms | 57.8 req/s, p95 418.5 ms |
| WFS filtered | LIKE | 1094.3 req/s, p95 13.2 ms | 54.6 req/s, p95 269.1 ms |
| WMS `GetFeatureInfo` | medium bbox | 2808.9 req/s, p95 4.9 ms | 407.1 req/s, p95 53.7 ms |
| WMS filtered `GetMap` | range | 171.4 req/s, p95 105.5 ms | 1.7 req/s, p95 11953.6 ms |
| GeoServices `FeatureServer/query` | medium bbox | 937.2 req/s, p95 13.8 ms | 228.9 req/s, p95 71.7 ms |
| GeoServices `MapServer/identify` | large bbox | 2868.9 req/s, p95 6.3 ms | 6.1 req/s, p95 2833.6 ms |
| GeoServices `MapServer/export` | large bbox | 152.2 req/s, p95 108.6 ms | Not available |

## Caveats (published with the snapshot)

These are reproduced from the geobench README so the headline is read honestly:

- **Response-shape audits are included in the report.** Some feature and native
  rows show payload metadata or property-key drift, so public claims should
  include those caveats.
- **Reproducibility:** the exact Honua image for this snapshot,
  `honua-geobench:trunk-b650a321-rendergate2`, is a local benchmark build from
  Honua source around `b650a321` (raster render-gate defaults: 8 concurrent
  renders, 5-second acquire timeout). A matching Honua Server source/image must
  be published or pinned before treating this exact snapshot as externally
  re-runnable.
- The GeoServer image resolved locally to digest
  `sha256:48fcd9488f35c29ef8b8dd2d0b6ae491d1bef73cea83f0ef27f6fa124ddcf245`,
  run with `GEOSERVER_COMMUNITY_EXTENSIONS=gsr` for the GeoServices rows.
- The geobench matrix status notes that `wms-getfeatureinfo` has been flagged as
  blocked on Honua in a separate rerun context (HTTP 405 in one harness profile);
  the value above is the figure published in the current headline table. Treat
  rerun status as authoritative when it conflicts — see
  `geobench/docs/matrix-status.md`.

## Reproduce it

GeoBench is Apache-2.0 and designed to be re-run:

```bash
git clone https://github.com/honua-io/geobench
cd geobench
python3 data/small/generate.py
./scripts/run-benchmark.sh
```

The exact reproduction command for the headline two-server profile (image
digests, pool settings, per-scenario warmup/duration) is in the geobench README
under *"Exact snapshot images and reproduction commands."*

## Cost and price

Performance numbers only matter against what they cost to run. Honua's
commercial position is **open-core and self-hostable**, which changes the cost
basis versus a per-named-user proprietary stack:

- **Open core, Apache-2.0 components** you can audit and self-host — no runtime
  license server gating reads.
- **No per-named-user seat tax** for client access. ArcGIS Pro, the ArcGIS API
  for Python, QGIS, and OGC/STAC clients connect to the same server without
  per-seat client entitlements on Honua's side.
- The throughput advantage above is also a **density advantage**: in this
  snapshot Honua served 1632.8 req/s vs. 22.3 req/s on the attribute-filter LIKE
  scenario under an identical 4-core / 4 GB / `6/6/3` vs `6/3` database budget —
  i.e. far more work per unit of provisioned hardware.

For the published commercial tiers and entry pricing, see the public
[pricing page](https://honua.io/pricing.html). Per the site's content-ownership
boundary, numeric pricing and pilot packaging are owned by the sales workstream
and are not restated here.

> `TODO(data): honua-sales` — Supply an apples-to-apples TCO / list-price
> comparison table (Honua self-host vs. a named proprietary stack: license +
> per-seat + infrastructure for an equivalent workload) once sales publishes
> source-backed figures. Do not invent competitor list prices.

> `TODO(data): honua-io/geobench` — Add a cost-normalized benchmark view
> (e.g. req/s per provisioned vCPU, or req/s per $/hour of equivalent cloud
> instance) if/when geobench publishes a cost-normalized track.

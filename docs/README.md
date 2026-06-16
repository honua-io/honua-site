# Honua Documentation

Honua is an Esri-compatible, standards-first geospatial platform. It speaks the
GeoServices REST surface that ArcGIS clients expect **and** the open OGC / STAC
standards that the rest of the ecosystem uses, on modern cloud-native infrastructure.

This documentation set is authored in Markdown and synced to GitBook.

## Why Honua

Honua is strong on four pillars, and the [Proof / Why Honua](proof/README.md)
section makes each one checkable against a repeatable source rather than a claim
on a slide:

1. **Broad compatibility** — Esri clients (ArcGIS Pro, the ArcGIS API for Python,
   the ArcGIS Maps SDK for .NET) plus OGC / STAC standards, verified by an open
   compatibility harness. See the [Compatibility Matrix](proof/compatibility-matrix.md).
2. **Performance** — published, reproducible benchmark results against GeoServer
   on an identical dataset and database budget. See [Benchmarks](proof/benchmarks.md).
3. **Lower price** — an open-core, self-hostable platform with no per-named-user
   lock-in. See the [cost section of the Benchmarks page](proof/benchmarks.md#cost-and-price)
   and the public [pricing page](https://honua.io/pricing.html).
4. **Security and modern infrastructure** — cloud-native deployment, GitOps,
   OpenTelemetry, and a documented security posture. See
   [Reference Architectures](proof/reference-architectures.md).

> AI-enhanced workflows are a **Preview** capability with a dated roadmap, not a
> launch claim. The proof hub leads with the four pillars above.

## Try it live

A seeded, public instance runs at **[demo.honua.io](https://demo.honua.io)**.
You can point ArcGIS Pro, `arcgis` (the ArcGIS API for Python), QGIS, or a plain
browser at it. Entry points used throughout this hub:

- REST / GeoServices + docs: <https://demo.honua.io/docs>
- OGC / OData feature surface: <https://demo.honua.io/odata/>
- STAC operations sample: <https://demo.honua.io/samples/stac-ops/>

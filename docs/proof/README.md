# Proof Hub Overview

Product claims should be checkable. This proof hub maps each public claim about
Honua to a **repeatable source** — an open benchmark harness, an open
compatibility harness, an open assessment tool, or the live demo — so that a
prospect, partner, or auditor can verify it without a custom deck.

It leads with the four pillars Honua delivers solidly today. AI-enhanced
workflows are tracked separately as a **Preview** capability with a dated
roadmap.

## What's in this hub

| Page | Claim it backs | Primary source |
|------|----------------|----------------|
| [Benchmarks](benchmarks.md) | Honua is faster than the open-source incumbent on an identical dataset and database budget | [`honua-io/geobench`](https://github.com/honua-io/geobench) headline snapshot |
| [Compatibility Matrix](compatibility-matrix.md) | Esri clients and OGC/STAC standards work against Honua | [`honua-io/honua-esri-compat`](https://github.com/honua-io/honua-esri-compat) certification + operation matrices |
| [Migration Evidence](migration-evidence.md) | A real Esri estate can be assessed and moved | [`honua-io/honua-esri-assess`](https://github.com/honua-io/honua-esri-assess) footprint scanner |
| [Reference Architectures](reference-architectures.md) | Honua deploys in the shapes customers actually run | honua-server / honua-helm / honua-iac deployment evidence |

## How to read the proof

- **Numbers are quoted verbatim** from the source repositories' published
  artifacts. Where a number would have to be invented, the cell is left as a
  `TODO(data)` gap pointing at the repository that must supply it — it is never
  guessed.
- **"Certification" means this project's own compatibility evidence**, produced
  by an open harness. It is **not** certification by Esri or any standards body.
  Esri, ArcGIS, ArcGIS Pro, and ArcPy are trademarks of Esri, used here
  nominatively to identify the clients under test.
- Benchmark results are a **snapshot** with a disclosed date, dataset, image
  digest, and database budget. Re-running the harness is the intended way to
  confirm them.

## Try it live

The fastest proof is the running system. A seeded public instance is at
**[demo.honua.io](https://demo.honua.io)** — point ArcGIS Pro, the ArcGIS API
for Python, QGIS, or a browser at it.

- REST / GeoServices + interactive docs: <https://demo.honua.io/docs>
- OGC / OData feature surface: <https://demo.honua.io/odata/>
- STAC operations sample: <https://demo.honua.io/samples/stac-ops/>
- Demo gallery (analyst workbench, editing, imagery/terrain, public safety,
  planning & permitting, two-protocol): <https://honua.io/demos.html>

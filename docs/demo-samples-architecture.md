# Documentation, demo, and samples architecture

## Decision

Honua uses five distinct information jobs. They may cross-link, but they must
not reconstruct one another's inventory.

| Job | Public surface | Owner | Primary question |
| --- | --- | --- | --- |
| Learn | GitBook guides, routed by `honua.io/docs.html` | Documentation | How do I complete a task? |
| Build | `samples.honua.io` | `honua-samples` plus producer handoffs | What is the smallest reproducible code? |
| Evaluate | `honua.io/demos.html` and commit-pinned demo routes | `honua-site` | Does the complete workflow fit my need? |
| Reference | GitBook/API reference and machine docs | Producer repositories | What is the exact contract? |
| Prove | `honua.io/claims.html` and evidence pages | Evidence producers | What was verified, when, and within what boundary? |

`demo.honua.io` remains a seeded live API target. Its root is not a fourth
gallery.

## Competitor survey

The [ArcGIS JavaScript sample index](https://developers.arcgis.com/javascript/latest/sample-code/)
is a searchable code product with hundreds of entries and dense technical tag
filters. A detail page such as
[Query](https://developers.arcgis.com/javascript/latest/sample-code/query/index.html)
offers sandbox, CodePen, and live transitions before the explanatory material.
Separate [tutorials](https://developers.arcgis.com/javascript/latest/tutorials/)
own longer learning journeys.

The [CARTO examples gallery](https://docs.carto.com/carto-for-developers/examples)
is smaller and visually organized by recognizable intents such as basemaps,
styling, raster, and widgets. Separate
[guides](https://docs.carto.com/carto-for-developers/guides) own complete
solution paths such as public applications, private applications, massive
datasets, and embedding.

Honua should combine the useful parts of both models:

- Curated starting points reduce choice cost.
- The exhaustive catalog still needs search, technical facets, and stable URLs.
- A product demo, a task guide, a single-concept sample, and an API reference
  are different artifacts.
- Browser-capable samples need obvious run, source, and evidence transitions.
- Tags come from a controlled capability taxonomy.

## Ownership contract

### `honua-site`

- Owns the Developer Center routing page, Demo Center narrative, accessibility,
  security policy, analytics, and the curated ordering of flagships.
- Keeps at most six maintained product demos.
- Uses `samples.html` only as a starter page; it never rebuilds the canonical
  sample inventory.
- Consumes producer browser artifacts through the existing digest and SRI
  publication contract.

### `honua-samples`

- Owns the exhaustive catalog generator, search, filters, stable detail routes,
  sample manifest schema, runner, browser bundles, and run receipts.
- Merges producer projections without cloning executable source or
  double-counting producer evidence.
- Requires repository-owned samples to declare goal, level, estimated time,
  and prerequisites.
- Preserves `?caps=` and supports shareable text, SDK, edition, source, and
  runnable filters.

### Producer repositories

- Own executable source, fixture data, build configuration, and qualification
  evidence.
- Publish versioned handoffs and integrity-bound browser artifacts.
- Declare lifecycle, support tier, replacement, and coverage gaps.

## Demo release gate

A Demo Center flagship must record its outcome, maintainer, data mode, auth
mode, duration, exact producer commit, current evidence, degradation behavior,
and closest reproduction path. A demo is retired when its pinned artifact can
no longer be rebuilt, its outcome is no longer strategic, or a maintained
flagship replaces it.

## Sample quality gate

A sample teaches one primary concept, produces one observable result, declares
learning and technical metadata, leads with useful code, links to source and a
run receipt, and exposes a browser run action only for a staged and verified
bundle.

## Success measures

- A new developer reaches a rendered map or verified API result in under ten
  minutes.
- Every Demo Center card exposes data state before launch.
- Every browser-runnable sample exposes run and source above the fold.
- Catalog filters are shareable by URL.
- No executable sample is independently maintained in both repositories.
- No projected SDK card is double-counted as repository-owned evidence.

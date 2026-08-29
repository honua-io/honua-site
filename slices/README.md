# Slice manifests

One `slices/<slug>.json` per capability-slice docs page. The manifest is the
only hand-written input to the slice pipeline: the generator (#217) renders the
markdown concept file and its HTML projection from it, the finder (#220) reads
its facets, and the master index (#221) lists it.

- Schema: [`../schemas/slice.v1.schema.json`](../schemas/slice.v1.schema.json)
  (`honua.slice/v1`, published at `https://honua.io/schemas/slice.v1.schema.json`).
- Validator: `node scripts/validate-slices.mjs` (add `--offline` to skip the
  issue-liveness fetch).
- Plan: [`../docs/design/capability-slice-docs-plan.md`](../docs/design/capability-slice-docs-plan.md#the-slice-manifest-schema-f2).

## The shape

```jsonc
{
  "schemaVersion": "honua.slice/v1",
  "slug": "geoprocessing",          // must equal the filename stem
  "title": "Run a geoprocessing job", // names the outcome, not the protocol
  "variant": "map",                 // "map" (framed sample) | "reference" (diagram)
  "label": "preview",               // optional; "preview" is the only value
  "capabilityKeys": ["process.ogc-api-processes"],
  "sample": { "id": "gp-runner", "runtimeKind": "server", "poster": "assets/…png" },
  "setup":      { "console": …, "cli": …, "adminApi": … },   // panel 3, the operator
  "use":        { "js": …, "python": …, "dotnet": …, "mobile": … }, // panel 4, the developer
  "ask":        { "mcp": … },                                 // panel 5, the agent
  "underneath": { "protocols": ["OGC API - Processes"], "evidencePage": "evidence-….html" },
  "related":    ["first-map"]       // every slug needs its own slices/<slug>.json
}
```

Every surface entry has the same shape:

```jsonc
{ "state": "available" | "partial" | "absent",
  "issue": "https://github.com/honua-io/<repo>/issues/<n>",
  // exactly one payload, by slot:
  "route": "/operate/geoprocessing",  // setup.console
  "command": "honua process submit …", // setup.cli
  "snippet": "…",                      // setup.adminApi and every use.* tab
  "tools": ["submit_raster_process"] } // ask.mcp
```

## Rules the validator enforces

1. **An absent or partial surface must name an open issue.** That URL is the
   honest-gap sentence's link — "Not in the Python SDK yet, track it here". The
   validator fetches every distinct URL from the unauthenticated GitHub REST API
   and fails if it does not return 200 or is not open, so a gap sentence cannot
   outlive the gap. An `available` surface must *not* carry one.
2. **An available surface must carry its payload.** No empty tab pretending.
3. **Every `capabilityKeys[]` entry resolves in `data/capabilities.v1.json`.**
4. **`sample.id` resolves in the samples portfolio.** Until honua-samples#40
   (the pinned per-sample embed contract) lands, that means the catalogs this
   repo commits: `assets/samples/manifest.json` (recipes + journeys) and
   `assets/samples/sdk-publication.v1.json`.
5. **`variant: map` requires a `sample`; `variant: reference` may omit it.**
6. **Every `related[]` slug has its own manifest**, and no slice links to itself.
7. **`slug` equals the filename stem**, and `underneath.evidencePage` is an
   existing `evidence-*.html` page at the site root.
8. **The manifest carries nothing else.** The schema is fail-closed
   (`additionalProperties: false`) — a new field is a schema change, reviewed.

## What is deliberately not here

- **No maturity, support-tier, coverage or lifecycle apparatus.** The seed for
  this schema was honua-samples' `job-page.v1.schema.json`; that shape's
  `maturity` / evidence blocks are dropped on purpose (honua-samples#47). A
  surface says available, partial or absent, and a gap links to an issue. That
  is the whole vocabulary.
- **No `live: true` flag yet.** A "live" claim is only honest against the demo
  services manifest, and `demo-services.v1.json` is not published
  (honua-demo-infra#54). The schema is fail-closed, so a manifest cannot assert
  liveness today; the flag and its check land with that manifest.
- **No per-tab reference links or snippet languages.** Those are rendering
  concerns for the template (#218) and get a schema revision if they need to be
  authored rather than derived.

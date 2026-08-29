# Slice manifests

One `slices/<slug>.json` per capability-slice docs page. The manifest is the
only hand-written input to the slice pipeline: the generator (#217) renders the
markdown concept file and its HTML projection from it, the finder (#220) reads
its facets, and the master index (#221) lists it.

- Schema: [`../schemas/slice.v1.schema.json`](../schemas/slice.v1.schema.json)
  (`honua.slice/v1`, published at `https://honua.io/schemas/slice.v1.schema.json`).
- Validator: `node scripts/validate-slices.mjs` (add `--offline` to skip the
  issue-liveness fetch).
- Generator: `node scripts/gen-slice-pages.mjs` (`--check` in CI).
- Plan: [`../docs/design/capability-slice-docs-plan.md`](../docs/design/capability-slice-docs-plan.md#the-slice-manifest-schema-f2).

## What a manifest turns into

One manifest produces one directory under [`../docs/`](../docs), and the order
matters:

1. `docs/<slug>/index.md` — the **Open Knowledge Format concept**, `type: slice`.
   This is the artifact of record. Its frontmatter carries `title`,
   `description`, `resource` (the page's own URL), `tags` (the finder facets) and
   a pinned `timestamp`; `related[]` and `capabilityKeys[]` are written as
   relative markdown links, so the directory is a graph an agent can walk.
2. `docs/<slug>/index.html` — the page, rendered **from those bytes**. Nothing
   reaches the template except the concept, which is why
   `gen-slice-pages.mjs --from-concept docs/<slug>/index.md` reproduces the
   committed page exactly.
3. `docs/index.md` and `docs/index.html` — the bundle entry point
   (`type: index`), listing every slice as a relative edge.

`build-dist.sh` renders the same bundle into `dist/docs/` for the artifact. All
of that is generated: hand-editing a page is undone by the next run and fails
`--check` in CI.

## The one part of the bundle that is written by hand

`docs/playbooks/<slug>/index.md` — Open Knowledge Format concepts with
`type: playbook`, one golden-path procedure each (WS4 of the OKF
knowledge-graph program). There is no manifest behind them: the markdown *is*
the source. The generator reads each one, carries its bytes through unchanged,
renders `index.html` from those same bytes, and lists it from `docs/index.md`
using its own `title` and `description` — which is what puts an authored
playbook behind the same `--check` drift gate as a generated slice. Add one by
writing the file and rerunning `node scripts/gen-slice-pages.mjs`; remove one by
deleting its directory and rerunning.

Two rules a playbook has to keep: every `capability:` tag resolves in
`data/capabilities.v1.json` (a test enforces it — an id that resolves nowhere
goes in the prose with its gap sentence, not in the facets), and every relative
link resolves, since `validate-slice-concepts.mjs` walks playbooks exactly like
everything else in the bundle.

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
   (the pinned per-sample embed contract) lands, that means
   `assets/samples/manifest.json` (recipes + journeys) — the catalog that
   carries the `title`, `blurb` and `href` the hero panel renders. Not
   `assets/samples/sdk-publication.v1.json`: that is the build contract, keyed
   by the SDK's own sample name and joined back through `contractRef`, and
   accepting its ids let a manifest validate that the generator then rendered
   with no hero panel at all. Naming a contract id fails with the portfolio id
   to use instead, and the generator refuses to build a map slice whose sample
   it cannot render.
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

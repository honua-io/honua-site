# Public site data

Machine-readable data used by public pages lives here and is copied into `dist/`
by `scripts/build-dist.sh`.

## `sdk-availability.v1.json`

This snapshot drives the generated table in `client-compatibility.html`.
It records only externally verifiable package availability and the public
compatibility boundary:

- JavaScript / TypeScript is a public npm prerelease; the matching
  `@honua/sdk-esri-compat` and `@honua/honua-migrate` companion packages are
  tracked in the same record.
- .NET and Python are source previews until their registry packages publish.
- Honua has not published a general SDK-to-server version matrix.
- Server compatibility is read from `/api/v1/admin/capabilities`, not the
  ArcGIS-compatible `/rest/info` response.

Update the JSON when a public registry or released compatibility contract
changes, then run:

```bash
node scripts/gen-compatibility-matrix.mjs
node scripts/validate-site-claims.mjs
```

The generated region in `client-compatibility.html` must not be edited by hand.
CI checks that it matches this file and that the stated registry availability is
still true.

## `capabilities.v1.json`

**DRAFT FIXTURE.** This snapshot drives the generated capability catalog table
in `capabilities.html` and the per-capability `evidence-<key>.html` L2 pages.
It is a hand-authored placeholder (`schemaVersion: "capabilities.v1"`,
`source: "DRAFT-FIXTURE"`) that exists so the catalog page and its generator
pattern can ship ahead of the real evidence artifact. It will be replaced by
the `capability-matrix.v1.json` published by honua-server CI
(honua-io/honua-server#2892 / #2893). Numeric evidence counts in this file are
either already published on `claims.html` / `proof-compatibility.html`, or the
capability is marked `"proof-pending"` with zero counts — never invented.

Update the JSON when a capability's public evidence, edition, or gaps change,
then run:

```bash
node scripts/gen-capability-catalog.mjs
node scripts/validate-site-claims.mjs
node scripts/validate-internal-links.mjs
```

The generated region in `capabilities.html` and every `evidence-<key>.html`
page must not be edited by hand. CI (`gen-capability-catalog.mjs --check`)
fails if either is out of date with this file, or if a capability was removed
from this file but its `evidence-*.html` page was left behind.

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

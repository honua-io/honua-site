# SDK sample publication for site routes

The `honua.io` sample starter and transition routes consume two
deployment-gated contracts. They are not the public learning gallery: the
canonical gallery at `samples.honua.io` is owned, built, and deployed by
`honua-samples`. This repository does not keep a second copy of SDK version,
source, capability, provenance, freshness, or health metadata in its local
narrative manifest.

## SDK-owned artifacts

[`sdk-publication.v1.json`](../assets/samples/sdk-publication.v1.json) consumes
the SDK v2 site projection, sample catalog, browser-artifact manifest, and schemas
from SDK commit
[`4ee1e2f`](https://github.com/honua-io/honua-sdk-js/commit/4ee1e2fca86d84bbd7c6c566c419aa4efbb1045a).
The retained Overture route uses runtime artifacts built from the pinned SDK
0.4.0 source repair recorded below, with fresh fixture evidence from that build.
The upstream projection self-reports `0.3.7`; the
contracts are copied verbatim and both versions remain visible. Other SDK
samples are published by `samples.honua.io`, and their unused older bundles
are removed from this site.

`demo.html` left this publication on 2026-10-24. It is now the site-owned
live Maui map flagship ("Put a map on the page"), admitted as the
`maui-quickstart` site exception below. It loads the `@honua/sdk-js` **0.2.10**
npm browser bundle (`dist/browser/honua-sdk.min.js`), vendored byte-for-byte
with the producer's `honua.sdk.browser-artifacts.v1.json` under
`assets/sdk-samples/0.2.10/965c013/browser/` and loaded with the producer's
published SRI. `site-sample-exceptions.mjs` fails if the bytes, the producer
record, or the page's `integrity` attribute disagree. The SDK's own
`maplibre-quickstart` stays canonical at `samples.honua.io`.

The publication binds every route shell and transitive file by byte count,
SHA-256, and SRI. Evidence stays truthful:

- Overture retains fresh browser-executed fixture evidence for the published
  static route, including its local DuckDB worker, WebAssembly, and Parquet
  extension.
- Live execution is explicitly skipped because AWS execution is opt-in.
  Fixture success does not certify the public-live lane.

## Site-owned exceptions

[`site-exceptions.v1.json`](../assets/samples/site-exceptions.v1.json) admits the
remaining transition routes without calling them SDK-owned artifacts. Each
record contains:

- a commit-pinned source link and explicit support state;
- embedded SDK version/commit, or an explicit “no SDK bundle” role;
- data mode, provenance, attribution, and freshness text;
- a truthful unavailable live-evidence state when no producer envelope exists;
- route and local-asset SHA-256/SRI records;
- approved `connect-src` origins and required SDK symbol checks; and
- canonical guide, API, compatibility, source, and evidence links.

These records govern only legacy `honua.io` routes; they are not canonical
gallery entries and do not assign gallery ownership to `honua-site`.

The committed exception publication is generated deterministically from
[`site-sample-exceptions.mjs`](../scripts/site-sample-exceptions.mjs). It covers
all 21 legacy site samples through a contract reference in the curation
manifest, plus the exact-commit SDK first-map source recipe. It never performs
a live request during build or replaces missing evidence with fixture output.

## Public rendering

[`manifest.json`](../assets/samples/manifest.json) owns only local starter
ordering, journey copy, route intent, and filtering for the `honua.io`
projection. It neither defines nor deploys the canonical gallery inventory.
Every card resolves its
`contractRef` from one of the publications above and displays SDK version,
support state, data mode, provenance, attribution, freshness, evidence status,
observation time, and degradation reason.

The evidence freshness window is seven days. An older retained observation is
shown as stale alongside its original executed, skipped, or failed result; age
does not rewrite the historical result or promote fixture data into a live
claim.

## Deterministic validation

Run from the repository root:

```bash
node scripts/sdk-sample-publication.mjs
node scripts/site-sample-exceptions.mjs
node scripts/site-demo-smoke.mjs
node scripts/validate-internal-links.mjs
./scripts/validate-security-headers.sh
./scripts/build-dist.sh
```

To intentionally update retained digests after a reviewed source change, run
the relevant generator with `--write`, inspect the complete publication diff,
and rerun all gates. Do not hand-edit digests, relax the approved CSP origins,
or claim a newer observation without a retained evidence artifact.

The Overture runtime is pinned to SDK source commit `bd037a2781533a8236893027e24a13f163bd23a8` for the numeric-rendering repair. Relative asset preloads support its versioned
publication path. The verbatim release contracts and browser manifest retain their
original 0.4.0 source pin and embedded 0.3.7 contract version.

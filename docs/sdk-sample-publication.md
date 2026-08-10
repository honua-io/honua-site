# SDK sample publication

The public gallery is a consumer of two deployment-gated contracts. It does
not keep a second copy of SDK version, source, capability, provenance,
freshness, or health metadata in its narrative manifest.

## SDK-owned artifacts

[`sdk-publication.v1.json`](../assets/samples/sdk-publication.v1.json) consumes
the SDK v2 site projection, sample catalog, browser-artifact manifest, schemas,
and retained evidence from SDK commit
[`ec58b44`](https://github.com/honua-io/honua-sdk-js/commit/ec58b44045b8979a4fc2ed0d5368505505505b4c).
The five deployed flagships use the `0.1.2-beta.0` runtime artifacts. The
retained upstream projection self-reports `0.1.1-beta.0`; both versions are
rendered rather than collapsed into one claim.

The publication binds every route shell and transitive file by byte count,
SHA-256, and SRI. Producer evidence stays truthful:

- MapLibre quickstart retains an executed anonymous live observation while the
  public route itself remains fixture-backed.
- Incident operations retains a live skip because realtime streams require Pro;
  replay is visible and mutation stays disabled.
- Spatial analytics retains executed fixture evidence and an explicit live
  configuration skip.
- Overture retains executed fixture evidence and the failed public-live attempt
  caused by the missing DuckDB spatial extension.
- Safe Agent retains executed fixture evidence and a host-adapter live skip.

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

The committed exception publication is generated deterministically from
[`site-sample-exceptions.mjs`](../scripts/site-sample-exceptions.mjs). It covers
all 21 legacy site samples through a contract reference in the curation
manifest, plus the exact-commit standalone SDK source recipe. It never performs
a live request during build or replaces missing evidence with fixture output.

## Public rendering

[`manifest.json`](../assets/samples/manifest.json) owns only task ordering,
journey copy, route intent, and filtering. Every card resolves its
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

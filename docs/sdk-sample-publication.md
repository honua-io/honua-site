# SDK sample publication

The site consumes the sample publication contract introduced by
[`honua-sdk-js#411`](https://github.com/honua-io/honua-sdk-js/pull/411). The SDK
owns executable source, the static projection, browser artifacts, and evidence;
the site owns the public routes, gallery narrative, accessibility, analytics,
security policy, and deployment.

## Published slice

This deployment publishes five SDK-owned flagships. The first three remain
pinned to SDK commit
[`892873e`](https://github.com/honua-io/honua-sdk-js/commit/892873e8b6cd336fc67cec2a033c41f9e26b6473).
The Overture flagship is built from the reviewed squash commit
[`88dd067`](https://github.com/honua-io/honua-sdk-js/commit/88dd067f1a5d12e87b0609d56706b13cb339c1e4).
The Safe Agent Workbench is built from its reviewed squash commit
[`cc7cc4f`](https://github.com/honua-io/honua-sdk-js/commit/cc7cc4f46adee587fbb00a8f75b1b680408aac90):

| SDK sample | Public route | Current evidence |
| --- | --- | --- |
| `maplibre-quickstart` | `/demo.html` | Deterministic fixture is executed; the live lane remains planned. |
| `realtime-incident-dashboard` | `/demo-public-safety.html` | Live is attempted first at runtime; no successful current live evidence is published, so unavailable streaming degrades visibly to read-only replay. |
| `spatial-analytics-workbench` | `/demo-analyst-workbench.html` | Committed fixture evidence is executed; committed live evidence is a structured skip because no source configuration was supplied. |
| `overture-geoparquet` | `/demo-overture.html` | The deterministic fixture and pinned anonymous AWS object were both executed. Browser-observed range bytes are verified; DuckDB rows scanned and row groups pruned remain explicitly unverified. |
| `ai-spatial-app-builder` | `/demo-safe-agent.html` | The deterministic fixture executes a signed, atomic, single-use approval and verifies the receipt. Live/model integration is a structured skip because the static deployment has no host adapter. |

`/sample-spatial-analytics.html` is retained as a redirect to the canonical
analytics route. Other existing sample routes remain site-owned transition
previews and retain their existing disclosure.

## Integrity and provenance

Assets live below commit-pinned roots
`/assets/sdk-samples/0.1.0-beta.0/892873e/` and
`/assets/sdk-samples/0.1.0-beta.0/88dd067/`, with the Safe Agent Workbench below
`/assets/sdk-samples/0.1.0-beta.0/cc7cc4f/`. The committed
[`sdk-publication.v1.json`](../assets/samples/sdk-publication.v1.json) binds the
SDK version and full Git commit to:

- the SDK-owned site projection, complete sample catalog, and their digests;
- the upstream browser artifact manifest and its digest;
- the four consumed SDK schemas and their digests, with offline schema validation of the projection, catalog, browser manifest, and evidence;
- every deployed JavaScript and CSS file by byte count, SHA-256, and SRI;
- each public route shell and its digest; and
- the actual committed analytics and Overture fixture/live evidence.

The route shells enforce SRI on their executable entry JavaScript and CSS. CI
also validates every transitive chunk digest offline. No credential, live
feature payload, or invented observation is stored in the publication.

The MapLibre fixture normally runs behind the SDK example's mock server. A
small site-owned `static-fixture.js` adapter maps only its three expected
same-origin reads to the SDK's committed JSON fixtures so the unchanged SDK
bundle can run on GitHub Pages. The publication manifest labels the adapter,
fixtures, and Vite outputs with distinct provenance and integrity-checks all of
them.

The Overture route uses the SDK-owned Vite output without copying application
logic into the site. Its 1.9 KB fixture, DuckDB worker, 34 MB WASM runtime, and
Parquet extension are self-hosted beneath the same version root. Fixture mode
makes no cross-origin request. The live lane is explicit and its page-scoped
CSP allows only the pinned anonymous Overture AWS origin; no signed URL,
credential, or full-object fallback is present.

The Safe Agent route also uses the SDK-owned Vite output unchanged. Its
page-scoped CSP permits only same-origin connections, so model-provider and
live-data credentials cannot be introduced into the static browser route. The
published fixture evidence proves zero effects before approval and one bounded
read after approval; the companion live evidence is explicitly skipped.

Run the deterministic checks from the site root:

```bash
node scripts/sdk-sample-publication.mjs
node scripts/site-demo-smoke.mjs
./scripts/build-dist.sh
```

When consuming a future SDK release, rebuild from the exact producer commit,
update the pinned namespace and route SRI, then run
`node scripts/sdk-sample-publication.mjs --write`. Never hand-edit digests or
promote a lane without a producer-owned evidence artifact.

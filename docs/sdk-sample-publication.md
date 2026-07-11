# SDK sample publication

The site consumes the sample publication contract introduced by
[`honua-sdk-js#411`](https://github.com/honua-io/honua-sdk-js/pull/411). The SDK
owns executable source, the static projection, browser artifacts, and evidence;
the site owns the public routes, gallery narrative, accessibility, analytics,
security policy, and deployment.

## Published slice

This deployment intentionally publishes only the three rebuilt flagships that
were merged together by SDK commit
[`892873e`](https://github.com/honua-io/honua-sdk-js/commit/892873e8b6cd336fc67cec2a033c41f9e26b6473):

| SDK sample | Public route | Current evidence |
| --- | --- | --- |
| `maplibre-quickstart` | `/demo.html` | Deterministic fixture is executed; the live lane remains planned. |
| `realtime-incident-dashboard` | `/demo-public-safety.html` | Live is attempted first at runtime; no successful current live evidence is published, so unavailable streaming degrades visibly to read-only replay. |
| `spatial-analytics-workbench` | `/demo-analyst-workbench.html` | Committed fixture evidence is executed; committed live evidence is a structured skip because no source configuration was supplied. |

`/sample-spatial-analytics.html` is retained as a redirect to the canonical
analytics route. Other existing sample routes remain site-owned transition
previews and retain their existing disclosure.

The safe-agent example from SDK PR #416 and Overture/GeoParquet example from SDK
PR #417 are not included in the publication manifest or deployed artifact tree.
They remain draft work and must not be described as complete.

## Integrity and provenance

Assets live below
`/assets/sdk-samples/0.1.0-beta.0/892873e/`. The committed
[`sdk-publication.v1.json`](../assets/samples/sdk-publication.v1.json) binds the
SDK version and full Git commit to:

- the SDK-owned site projection and its digest;
- the upstream browser artifact manifest and its digest;
- every deployed JavaScript and CSS file by byte count, SHA-256, and SRI;
- each public route shell and its digest; and
- the actual committed analytics fixture/live-skip evidence.

The route shells enforce SRI on their executable entry JavaScript and CSS. CI
also validates every transitive chunk digest offline. No credential, live
feature payload, or invented observation is stored in the publication.

The MapLibre fixture normally runs behind the SDK example's mock server. A
small site-owned `static-fixture.js` adapter maps only its three expected
same-origin reads to the SDK's committed JSON fixtures so the unchanged SDK
bundle can run on GitHub Pages. The publication manifest labels the adapter,
fixtures, and Vite outputs with distinct provenance and integrity-checks all of
them.

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

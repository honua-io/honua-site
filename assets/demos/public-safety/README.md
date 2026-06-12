# Public Safety Ops demo (`/demo-public-safety.html`)

A county-style emergency-operations board over Maui open data, built on
`@honua/sdk-js`. Everything incident-shaped on the page is a **SIMULATED
SCENARIO** — synthetic storm-response data replayed on a deterministic
10-minute loop. Real Maui geography and the hazard layers from the shared
contract (`assets/demo/layers.json`) are the backdrop.

## Files

| File | Purpose |
| --- | --- |
| `app.js` | The whole app (plain hand-written JS, IIFE, same conventions as `assets/demo/demo.js`). |
| `public-safety.css` | Scoped styles (`.psops-` / `#ps-` prefixes), Bedrock tokens from `styles.css`. |
| `config.json` | Page contract: live-lane streaming endpoints, geocoding locator, replay asset URLs. |
| `scenario.json` | Generated replay file — incidents, units, advisory zones. Do not hand-edit. |
| `generate-scenario.mjs` | Deterministic generator for `scenario.json` (`node generate-scenario.mjs`). |
| `places.json` | GNIS-style Maui place-name fixture for the dispatch search fallback. |
| `honua-sdk-ops-entry.ts` | Bundle entry for the extra SDK surface (realtime + geocoding). |
| `honua-sdk-ops.min.js` | Committed esbuild bundle of the entry above (`window.HonuaSDKOps`). |

## Lanes

- **Replay lane (default, server-independent):** a local transport replays
  `scenario.json` through `createRealtimeFeatureStore()` from
  `@honua/sdk-js/realtime` — the same store the live lane uses. Elapsed-time
  based, loops every 600 s, no wall-clock seeding.
- **Live lane (config-gated probe):** at boot the page probes
  `GET {baseUrl}/api/v1/streaming/features/capabilities`. When the server
  advertises streaming (Pro), a "connect live feed" button swaps the store
  onto `createRealtimeServerSentEventsTransport` against
  `GET {baseUrl}/api/v1/streaming/features?serviceId=maui-incidents&layers=0`
  (SSE). 403/404/network errors render a graceful "live feed not yet enabled"
  chip. `{baseUrl}` comes from `assets/demo/layers.json` (`server.baseUrl`).
- **Geocoding:** probed via `GET {baseUrl}/rest/services/maui/GeocodeServer?f=json`.
  Live hits go through `HonuaGeocodingClient.forwardGeocode()`; on 402/403/404
  the dispatch search falls back to the bundled GNIS fixture so the
  interaction always works.

Live-lane seeding contract (server side): publish an incidents layer as
serviceId `maui-incidents` (layer 0) with feature streaming enabled, and a
geocoding locator named `maui`. Declared in `config.json`.

## honua-sdk-ops.min.js (Apache-2.0)

The shared vendored bundle (`assets/vendor/honua-sdk.min.js`) exposes only the
surface `demo.js` needs. This page additionally needs the SDK's realtime and
geocoding modules, so it ships a second, page-scoped bundle built the same way
(the vendor bundle is never modified):

- Source: `github.com/honua-io/honua-sdk-js`
  - commit `1888872095421fe09f9d5720ebabf70c7a35258e`
  - package version `0.0.14-alpha.0`
  (same commit as the vendored `assets/vendor/honua-sdk.min.js`)
- Entry file: `honua-sdk-ops-entry.ts` (committed next to this README).
- Build command (run from a directory containing both the entry file and a
  checkout of `honua-sdk-js` as a sibling `honua-sdk-js/` directory; no
  `npm install` needed — esbuild compiles the SDK's TypeScript directly):

```sh
npx -y esbuild@0.25.5 honua-sdk-ops-entry.ts \
  --bundle --minify --format=iife --global-name=HonuaSDKOps --target=es2020 \
  --outfile=honua-sdk-ops.min.js \
  --external:@connectrpc/connect --external:@connectrpc/connect-web \
  --external:@bufbuild/protobuf --external:cesium \
  --external:maplibre-gl --external:@maplibre/maplibre-gl-style-spec
```

## Regenerating the scenario

```sh
node generate-scenario.mjs
```

Hand-authored road polylines and the incident timeline live in the generator.
Keep the messaging rules: everything labeled SIMULATED; no real events.

## Edition badges

Capability badges on the page mirror the published split on `pricing.html`
exactly: real-time streams = Pro; geocoding (forward + reverse) = Pro (batch =
Enterprise); geofence enter/exit alerts + webhook delivery = Pro; dwell +
attribute-threshold triggers and email/Slack/Teams/SNS/Event Grid/digest
channels = Enterprise; open-protocol editing = Community and Esri FeatureServer
`applyEdits` = Pro; serving/query = Community.

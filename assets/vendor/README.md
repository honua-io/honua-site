# Vendored third-party / first-party browser bundles

This site has **no build step** (see AGENTS.md), so browser dependencies for
`demo.html` are committed here as prebuilt files. Do not hand-edit the bundles;
regenerate them with the steps below and update this file.

## maplibre-gl (BSD-3-Clause)

- Files: `maplibre-gl.js`, `maplibre-gl.css`
- Version: **maplibre-gl@5.21.1**
- Provenance: copied verbatim from the npm registry tarball
  `https://registry.npmjs.org/maplibre-gl/-/maplibre-gl-5.21.1.tgz`
  (`package/dist/maplibre-gl.js` — the production UMD build — and
  `package/dist/maplibre-gl.css`). No modifications.

## leaflet (BSD-2-Clause)

- Files: `leaflet.js`, `leaflet.css`, `images/*.png` (control + marker sprites
  referenced relatively by the CSS)
- Version: **leaflet@1.9.4**
- Provenance: copied verbatim from the npm registry tarball
  `https://registry.npmjs.org/leaflet/-/leaflet-1.9.4.tgz`
  (`package/dist/leaflet.js`, `package/dist/leaflet.css`,
  `package/dist/images/`). No modifications. Used only by
  `demo-esri-leaflet.html` — the BYO-web-client demo runs a deliberately
  foreign map stack.

## esri-leaflet (Apache-2.0)

- File: `esri-leaflet.js`
- Version: **esri-leaflet@3.0.19**
- Provenance: copied verbatim from the npm registry tarball
  `https://registry.npmjs.org/esri-leaflet/-/esri-leaflet-3.0.19.tgz`
  (`package/dist/esri-leaflet.js` — the production UMD build). No
  modifications. Used only by `demo-esri-leaflet.html`.

## honua-sdk.min.js (Apache-2.0)

The Honua JS SDK (`@honua/sdk-js`) publishes ESM + TypeScript only — no
UMD/browser bundle — so this bundle was produced locally and committed.

- Source: `github.com/honua-io/honua-sdk-js`
  - commit `43fe4fab7dc6e1ffed232677302d4143fd5bdff7`
  - package version `0.0.14-alpha.0`
- Bundle size: 284,601 bytes minified (277,588 before the esri-compat
  additions; +7,013 bytes for `HomeCompat`/`BookmarksCompat`/`SwipeCompat`/
  `CompatEventBus`, exercised by /demo-sdk-controls.html's migration-lane
  station. Earlier: 258,630 before the `controls` entry).
- Entry file: `honua-sdk-entry.ts` (committed next to this README). It
  re-exports only the surface the demo pages use: the native control
  kit from `@honua/sdk-js/controls` (`HonuaBasemapSwitcherElement`,
  `HonuaLegendElement`, `HonuaBasemapStyleBinding`, `defineHonuaControls`,
  `deriveLegendEntries` + the control types), `HonuaClient`,
  error classes + `isHonuaError`, spatial-filter helpers (`envelope`, `point`,
  `spatialIntersects`), the `createDataset` contract +
  `PROTOCOL_DEFAULT_CAPABILITIES`, the MapLibre style/source helpers
  from `@honua/sdk-js/map`, and three `@honua/sdk-js/esri-compat` widget
  shims + their event bus (the migration-lane station on
  /demo-sdk-controls.html).
- **Tag ownership**: the controls re-export is deliberately the FIRST
  statement in the entry file. Importing `controls` registers
  `<honua-basemap-switcher>`/`<honua-legend>` as a side effect, and those
  registrations are if-missing guarded (the SDK's `web-components` entry
  registers its own `honua-legend`). Controls-first import order guarantees
  the controls-entry elements own the tags in this bundle. Keep it first if
  the entry ever grows more imports.
- Build command (run from a directory whose PARENT contains a checkout of
  `honua-sdk-js` — the entry imports `../honua-sdk-js/src/...` relative to
  its own location; no `npm install` needed — esbuild compiles the SDK's
  TypeScript directly):

```sh
npx -y esbuild@0.25.5 honua-sdk-entry.ts \
  --bundle --minify --format=iife --global-name=HonuaSDK --target=es2020 \
  --outfile=honua-sdk.min.js \
  --external:@connectrpc/connect --external:@connectrpc/connect-web \
  --external:@bufbuild/protobuf --external:cesium \
  --external:maplibre-gl --external:@maplibre/maplibre-gl-style-spec
```

Notes:

- The `--external` flags cover optional peer dependencies the demo never
  exercises. The only one referenced at runtime is `@connectrpc/*`, behind a
  dynamic `import()` that fires solely when `HonuaClient` is created with
  `transport: "grpc-web"` — the demo uses the default HTTP transport.
- The bundle exposes `window.HonuaSDK` and is loaded by `demo.html` before
  `assets/demo/demo.js`.

## honua-webcomponents.min.js (Apache-2.0)

The full `@honua/sdk-js/web-components` kit — ~15 controller-driven custom
elements (`honua-map`, `honua-layer-list`, `honua-legend`, `honua-search`,
`honua-feature-table`, `honua-editor`, `honua-chart`, `honua-basemap-control`,
`honua-bookmarks`, `honua-locate-control`, `honua-measure-control`,
`honua-sketch-control`, `honua-print-export`, `honua-map-status`,
`honua-action-panel`). Used by `demo-sdk-controls.html`. Exposed as
`window.HonuaWC`.

Kept separate from `honua-sdk.min.js` because the current SDK no longer ships
the older `controls` kit, and the web-components kit registers its own
controller-driven `honua-legend` (the two would collide on one page).

- Entry: `honua-webcomponents-entry.ts`.
- `maplibre-gl` and `@maplibre/maplibre-gl-style-spec` are *dynamic* imports in
  the SDK. esbuild aliases them to local shims: `maplibre-global-shim.js`
  resolves to the page's vendored `maplibregl` global; `style-spec-stub.js` is a
  no-op validator (the gallery styles are hand-authored and MapLibre validates
  at render time).

Rebuild (place a `honua-sdk-js` checkout at `assets/honua-sdk-js` — a junction
is fine — then from `assets/vendor/`):

```sh
npx -y esbuild@0.25.5 honua-webcomponents-entry.ts \
  --bundle --minify --format=iife --global-name=HonuaWC --target=es2020 \
  --outfile=honua-webcomponents.min.js \
  --alias:maplibre-gl=./maplibre-global-shim.js \
  --alias:@maplibre/maplibre-gl-style-spec=./style-spec-stub.js \
  --external:@connectrpc/connect --external:@connectrpc/connect-web \
  --external:@bufbuild/protobuf --external:cesium
```

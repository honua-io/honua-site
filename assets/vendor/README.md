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

## honua-sdk.min.js (Apache-2.0)

The Honua JS SDK (`@honua/sdk-js`) publishes ESM + TypeScript only — no
UMD/browser bundle — so this bundle was produced locally and committed.

- Source: `github.com/honua-io/honua-sdk-js`
  - commit `1888872095421fe09f9d5720ebabf70c7a35258e`
  - package version `0.0.14-alpha.0`
- Entry file: `honua-sdk-entry.ts` (committed next to this README). It
  re-exports only the surface `assets/demo/demo.js` uses: `HonuaClient`,
  error classes + `isHonuaError`, spatial-filter helpers (`envelope`, `point`,
  `spatialIntersects`), the `createDataset` contract +
  `PROTOCOL_DEFAULT_CAPABILITIES`, and the MapLibre style/source helpers
  from `@honua/sdk-js/map`.
- Build command (run from a directory containing both this entry file and a
  checkout of `honua-sdk-js` as a sibling `honua-sdk-js/` directory; no
  `npm install` needed — esbuild compiles the SDK's TypeScript directly):

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

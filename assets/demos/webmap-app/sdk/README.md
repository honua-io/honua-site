# honua-webmap.min.js (Apache-2.0)

Browser bundle behind `demo-webmap-app.html`. Exposed as `window.HonuaWebMap`.

The published `@honua/sdk-js` browser artifact (`dist/browser/honua-sdk.min.js`,
vendored for `demo.html` under `assets/sdk-samples/0.2.10/`) carries only the
root entry. This page uses the subpath kits too, so it ships a site-built bundle
of **public subpath exports only**, compiled from the published npm tarball.

- Package: `@honua/sdk-js@0.2.10` from the npm registry (gitHead
  `965c013637722cb70d1a781c3d2d4f6537e6bf44`, tag `js-sdk-v0.2.10`).
- Entry: `honua-webmap-entry.mjs` (imports `@honua/sdk-js`, `/web-components`,
  `/controls`, `/interactions`, `/filter-registry`, `/expr`, `/geocoding`,
  `/map`). `claim-legend.mjs` is imported first so the controls-kit
  `<honua-legend>` (derive mode) owns the tag before the web-components entry
  auto-registers the rest of its elements.
- Peer shims: `maplibre-global-shim.mjs` and `pmtiles-global-shim.mjs` resolve
  the optional `maplibre-gl` / `pmtiles` peers to the page's vendored globals
  (`assets/vendor/maplibre-gl.js` 5.21.1, `assets/vendor/pmtiles.js`).
- Output: `honua-webmap.min.js`, 1355045 bytes, sha256 `ea44b14e31c2764f997dac5c2e0da84f8aadb83c3553b13dd73afb18675ab7fc`.

Rebuild (any empty directory outside the repo, Node 22+):

```sh
npm init -y >/dev/null
npm install --ignore-scripts --no-audit --no-fund @honua/sdk-js@0.2.10 esbuild@0.25.5
SDK_DIR=<honua-site>/assets/demos/webmap-app/sdk
cp "$SDK_DIR"/*.mjs .
npx esbuild honua-webmap-entry.mjs \
  --bundle --minify --format=iife --global-name=HonuaWebMap --target=es2020 \
  --legal-comments=none --outfile="$SDK_DIR/honua-webmap.min.js" \
  --alias:maplibre-gl=./maplibre-global-shim.mjs \
  --alias:pmtiles=./pmtiles-global-shim.mjs \
  --external:@connectrpc/connect --external:@connectrpc/connect-web \
  --external:@bufbuild/protobuf --external:cesium \
  --external:terra-draw --external:terra-draw-maplibre-gl-adapter \
  --external:@duckdb/duckdb-wasm --external:apache-arrow \
  --external:proj4 --external:@deck.gl/layers --external:uplot
```

The externals are optional peers this page never reaches (gRPC transport,
Cesium, terra-draw sketching, DuckDB/Arrow, proj4, deck.gl, uPlot); they remain
as unreached dynamic imports in the output.

# honua-webmap.min.js (Apache-2.0)

Browser bundle behind `demo-webmap-app.html`. Exposed as `window.HonuaWebMap`.

The published `@honua/sdk-js` browser artifact (`dist/browser/honua-sdk.min.js`,
vendored for `demo.html` under `assets/sdk-samples/0.2.10/`) carries only the
root entry. This page uses the subpath kits too, so it ships a site-built bundle
of **public subpath exports only**, compiled from the published npm tarballs.

- Packages: `@honua/sdk-js@0.3.7` and `@honua/app-platform@0.3.7` from the npm
  registry (tag `js-sdk-v0.3.7`, commit `4843a99e9c7d8233c47ee75b6a479f42171bd3db`),
  plus their peer `@honua/sdk@0.3.7`, which npm installs alongside.
  Since 0.4.0 the application-platform surfaces (`/web-components`, `/controls`
  and the other app, operator and collaboration subpaths) are published only by
  `@honua/app-platform`; this bundle imports them from there.
- Entry: `honua-webmap-entry.mjs` (imports `@honua/app-platform/web-components`,
  `@honua/app-platform/controls`, and `@honua/sdk-js`, `/interactions`,
  `/filter-registry`, `/expr`, `/geocoding`, `/map`). `claim-legend.mjs` is
  imported first so the controls-kit `<honua-legend>` (derive mode) owns the tag
  before the web-components entry auto-registers the rest of its elements.
- Peer shims: `maplibre-global-shim.mjs` and `pmtiles-global-shim.mjs` resolve
  the optional `maplibre-gl` / `pmtiles` peers to the page's vendored globals
  (`assets/vendor/maplibre-gl.js` 5.21.1, `assets/vendor/pmtiles.js`).
- Bundled third-party inputs (resolved on 14 Nov 2026): `@maplibre/maplibre-gl-style-spec@24.10.0`, `@turf/area@7.4.0`, `@turf/bbox@7.4.0`, `@turf/boolean-contains@7.4.0`, `@turf/boolean-disjoint@7.4.0`, `@turf/boolean-intersects@7.4.0`, `@turf/boolean-point-in-polygon@7.4.0`, `@turf/boolean-point-on-line@7.4.0`, `@turf/boolean-within@7.4.0`, `@turf/buffer@7.4.0`, `@turf/center@7.4.0`, `@turf/centroid@7.4.0`, `@turf/clean-coords@7.4.0`, `@turf/clone@7.4.0`, `@turf/convex@7.4.0`, `@turf/difference@7.4.0`, `@turf/distance@7.4.0`, `@turf/geojson-rbush@7.4.0`, `@turf/helpers@7.4.0`, `@turf/intersect@7.4.0`, `@turf/invariant@7.4.0`, `@turf/jsts@2.7.2`, `@turf/length@7.4.0`, `@turf/line-intersect@7.4.0`, `@turf/line-segment@7.4.0`, `@turf/line-split@7.4.0`, `@turf/meta@7.4.0`, `@turf/nearest-point@7.4.0`, `@turf/nearest-point-on-line@7.4.0`, `@turf/polygon-to-line@7.4.0`, `@turf/simplify@7.4.0`, `@turf/truncate@7.4.0`, `@turf/union@7.4.0`, `bignumber.js@9.3.1`, `concaveman@1.2.1`, `d3-array@2.12.1`, `d3-geo@2.0.2`, `internmap@1.0.1`, `mgrs@1.0.0`, `point-in-polygon@1.1.0`, `point-in-polygon-hao@1.2.4`, `polyclip-ts@0.16.8`, `proj4@2.23.0`, `rbush@3.0.1`, `robust-predicates@2.0.4`, `splaytree-ts@1.0.2`, `wkt-parser@1.9.0`.
- Output: `honua-webmap.min.js`, 2026955 bytes, sha256 `81c723624b6e681a9eb5569eab91199ed97fe5dcedd84e6320cb9a7412eeb41f`.

Rebuild (any empty directory outside the repo, Node 22+). A fresh install can
resolve newer patch versions of the bundled inputs above; pin them with
`npm install <name>@<version>` to reproduce the recorded hash.

```sh
npm init -y >/dev/null
npm install --ignore-scripts --no-audit --no-fund @honua/sdk-js@0.3.7 @honua/app-platform@0.3.7 esbuild@0.25.5
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
  --external:@deck.gl/layers --external:uplot
```

The externals are optional peers this page never reaches (gRPC transport,
Cesium, terra-draw sketching, DuckDB/Arrow, deck.gl, uPlot); they remain as
unreached dynamic imports in the output. `proj4` is bundled: since 0.3.x
`@honua/app-platform` imports it at module load, so leaving it external breaks
the page with "Dynamic require of proj4 is not supported".

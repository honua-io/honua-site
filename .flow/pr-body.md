fix(sdk-claims): advance @honua/sdk-js and @honua/sdk-esri-compat pins to 0.2.4 (unblocks validate)

Every honua-site PR currently fails `validate` (e.g. #267, run 39289711504):

```
- @honua/sdk-js: registry publishes 0.2.4; site says 0.2.3
- @honua/sdk-esri-compat: registry publishes 0.2.4; site says 0.2.3
```

The upstream hosted manifest `https://honua-io.github.io/honua-sdk-js/versions.json` already declares `latestRelease` 0.2.4, the same as npm `latest` for both packages. So the site snapshot and pins can move now, with no upstream change needed first.

## Change (pin data only)
- `data/sdk-docs-versions.v1.json`: `node scripts/sdk-docs-versions.mjs --refresh` (upstream source revision `8103be65a`, latestRelease 0.2.4). The refresh script writes its own pretty-printed output, so the file goes from one minified line to that format. Most of the diff is that formatting change.
- `data/sdk-availability.v1.json`: `publishedVersion`/`installCommand` for `@honua/sdk-js` and companion `@honua/sdk-esri-compat` go to 0.2.4.
- `client-compatibility.html`: regenerated with `node scripts/gen-compatibility-matrix.mjs`.
- `claims.html`: the one `@honua/sdk-js 0.2.3` mention goes to 0.2.4. `validate-site-claims.mjs` / `registry-claims.test.mjs` bind it to the published claim.

No other site content is touched.

## Verification (local, Windows host, every step of the `validate` job in pages.yml)
```
node scripts/sdk-docs-versions.mjs --check
node scripts/sdk-docs-versions.mjs --verify-remote
node scripts/gen-compatibility-matrix.mjs --check
node --test scripts/*.test.mjs            # 154 pass, 0 fail
node scripts/validate-site-claims.mjs      # passed for 155 non-sample pages
./scripts/build-dist.sh
```
All other validate steps also exit 0.

Follow-up: once this merges, re-run checks on #267 (and the other open PRs) and comment on #267 that the pin lag is fixed. The upstream guard that stops this happening again silently for stable releases is honua-sdk-js `fix/docs-registry-stable-freshness`.

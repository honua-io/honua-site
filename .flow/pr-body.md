fix(sdk-claims): claim the published @honua/sdk-js and @honua/sdk-esri-compat 0.2.4
Refs #214.

## Problem

The claim gate on trunk is red. Every Pages deploy is refused before it runs:

```
$ node scripts/validate-site-claims.mjs
Site claim validation failed:
- @honua/sdk-js: registry publishes 0.2.4; site says 0.2.3
- @honua/sdk-esri-compat: registry publishes 0.2.4; site says 0.2.3
```

This also blocks the runtime-docs pages for #214 from deploying. The 2026-09-01 disposition named 0.1.9-beta.0 as the target. That target is stale. Checked on 2026-10-19:

- `npm view @honua/sdk-js dist-tags` returns `latest: 0.2.4`.
- `npm view @honua/sdk-esri-compat dist-tags` returns `latest: 0.2.4`.
- `https://honua-io.github.io/honua-sdk-js/versions.json` reports `latestRelease: 0.2.4` and `packageBaseline: 0.2.4`.

## Change

- `data/sdk-availability.v1.json`: `@honua/sdk-js` and `@honua/sdk-esri-compat` move from `0.2.3` to `0.2.4`, including the install command. No other package changes; the gate accepts the Python, .NET and `honua-migrate` claims as they are.
- `client-compatibility.html`: regenerated with `node scripts/gen-compatibility-matrix.mjs`.
- `claims.html`: the one prose `@honua/sdk-js` version.
- `data/sdk-docs-versions.v1.json`: regenerated with `node scripts/sdk-docs-versions.mjs --refresh`. It now records upstream `latestRelease: 0.2.4` and development revision `324d610`. The large diff is a format change. #298 committed this snapshot minified on one line. The refresh tool writes it pretty-printed, and that is the form #295 committed.

No gate, test or validator changed.

## Verification

Every step of the Pages `validate` job, run locally at this head:

```
node scripts/validate-site-claims.mjs              # passed for 155 non-sample pages
node scripts/gen-compatibility-matrix.mjs --check  # up to date
node scripts/sdk-docs-versions.mjs --check         # latest 0.2.4
node scripts/sdk-docs-versions.mjs --verify-remote # release state current
node --test scripts/*.test.mjs                     # 154 pass, 0 fail
./scripts/validate-workflow-pinning.sh; ./scripts/validate-lead-capture.sh; ./scripts/validate-security-headers.sh
node --test edge/cloudfront-template.test.mjs; ./scripts/validate-operator-claims.sh; node scripts/validate-public-schemas.mjs
node scripts/validate-slices.mjs; node scripts/validate-slice-concepts.mjs --links-only slices docs
node scripts/gen-capability-catalog.mjs --check; node scripts/gen-slice-pages.mjs --check; node scripts/sync-capabilities-data.mjs --check
node scripts/validate-capability-links.mjs; node scripts/sdk-llms-publication.mjs; node scripts/validate-internal-links.mjs
node scripts/sdk-sample-publication.mjs; node scripts/site-sample-exceptions.mjs; node scripts/site-demo-smoke.mjs; node scripts/validate-demo-backend-override.mjs
./scripts/build-dist.sh; node scripts/validate-slice-voice.mjs; node scripts/validate-slice-concepts.mjs
# all exit 0; the dist artifact checks (llms.txt head, sdk-docs snapshot, _headers CSP) pass
```

## Follow-ups (P2/P3)

- P2: this drift returns every time sdk-js releases. A scheduled job could open the availability bump and the `--refresh` automatically. The current alternative is a red trunk that blocks unrelated deploys.
- P3: keep `data/sdk-docs-versions.v1.json` in its generator form. A minified hand-commit turns the next refresh into a whole-file diff.

fix(site): redirect honua-server runtime docs URLs to their rendered pages
Fixes #308 (part 1 of 2; part 2 is an operator-only billing fix, see below).

## Problem

honua-server hands operators and agents absolute `https://honua.io/docs/<path>/` links at runtime: a typed refusal's `remediationRef`, the SCIM `documentationUri`, Prometheus `runbook_url`. The list lives in honua-server `scripts/ci/code-referenced-anchors.v1.json`. The pages are rendered on GitBook. This site's `/docs/` only held the capability-slice bundle, so all five registered pages returned 404 on honua.io.

## Change

- `data/runtime-docs-redirects.v1.json` maps each runtime path to its GitBook page, listing the headings the server links to. Targets come from GitBook's own `llms.txt`, not from file paths.
- `scripts/gen-runtime-docs-redirects.mjs --out dist/docs` (called from `build-dist.sh` after the slice generator) writes a page per path: `rel=canonical`, `noindex`, meta refresh. It refuses to overwrite a page another generator wrote.
- `assets/docs-redirect.js` carries the `#fragment` (e.g. `#redis-is-optional-postgis-is-not`). It is an external file, not inline script, so the strict `script-src 'self'` policy in `_headers` allows it.
- `--verify-remote` (new last CI step, next to the SDK upstream check) fails when:
  - the server registry lists a path or anchor this file does not cover, or
  - a target page or heading no longer resolves.
- Tests: `scripts/runtime-docs-redirects.test.mjs`. The page-write check runs against the real data. Further tests cover slice/playbook collisions, the overwrite refusal, fragment carry (run in `vm`), escaping and no inline script, the coverage diff, and malformed entries.

Only availability changes; no documentation content changes.

## Not fixable from this repo (operator)

docs.honua.io is served by `honua-io/honua-docs`. Its Pages deploys have not run since 2026-10-17: "recent account payments have failed or your spending limit needs to be increased". So deep `docs.honua.io/...` links (in already-shipped builds) fall through to the 404 page. Exact steps are on #308.

## Verification

```
node --test scripts/*.test.mjs                        # 161 pass, 0 fail
./scripts/build-dist.sh                               # "Wrote 5 runtime docs redirect page(s)."
node scripts/validate-slice-voice.mjs                 # 10 pages clean
node scripts/validate-slice-concepts.mjs              # bundle OK
node scripts/gen-slice-pages.mjs --check              # bundle unchanged
node scripts/validate-internal-links.mjs              # pass
./scripts/validate-workflow-pinning.sh                # pass
node scripts/gen-runtime-docs-redirects.mjs --verify-remote   # 5 paths cover the server registry and resolve
(cd dist && python -m http.server 8765) ; curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/docs/guides/deploy/docker-compose/   # 200
```

Pre-existing, unrelated: `node scripts/validate-site-claims.mjs` already fails on trunk. npm publishes `@honua/sdk-js` / `@honua/sdk-esri-compat` 0.2.4; the site says 0.2.3. Separate follow-up.

## Follow-ups (P2/P3)

- P2: anchor verification matches GitBook's rendered `id="..."` attributes. A GitBook markup change would show up as a red `--verify-remote` run, not as silently broken links.
- P3: once `docs.honua.io` terminates at CloudFront (#231), these targets can point there instead of GitBook. Only the data file changes.

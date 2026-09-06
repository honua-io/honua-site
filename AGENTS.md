# AGENTS.md

## Overview

`honua-site` is the public marketing/documentation website for Honua, served at
`https://honua.io` (see `CNAME`). It was extracted from `honua-io/honua-server`
(issue #336). The site is a **plain static HTML/CSS/JS site** — no framework, no
bundler, no build toolchain beyond a shell copy step. It deploys to GitHub Pages.

Each top-level `*.html` file is a standalone page. The site has marketing pillar
pages, a public claims matrix, legal pages, and a consent-gated analytics/lead-
capture layer that feeds a CRM handoff via FormSubmit.

## Tech Stack

- Static HTML5 pages (one file per route, e.g. `index.html` → `/index.html`).
- `styles.css` — single shared stylesheet for the whole site.
- Vanilla JavaScript (no framework/dependencies): `assets/nav.js` (mobile nav
  toggle) and `assets/analytics.js` (consent-gated GA4 events + lead/CTA
  attribution).
- Bash scripts (`scripts/*.sh`, `set -euo pipefail`) and Node ESM scripts
  (`scripts/*.mjs`, no npm dependencies) for build, generation, and validation.
- GitHub Actions for CI + GitHub Pages deploy (`.github/workflows/pages.yml`).
- `_headers` defines deployment security headers (CSP, X-Frame-Options, HSTS, etc.).
- No `package.json`, lockfile, or language version manifest exists; the `.mjs`
  scripts run on the Node standard library only.

## Setup

No dependency install step. You need:

- `bash` (scripts use `set -euo pipefail`).
- `node` (recent LTS) for the `scripts/*.mjs` generators/validators and the
  `node --test` suite.
- `perl` and `grep -E` (used by `validate-lead-capture.sh` / header checks).
- `curl` (only for the optional live header check).

To preview locally, serve the repo root with any static file server, e.g.
`python3 -m http.server` from the repo root, then open the `*.html` pages.
(Local preview command is not encoded in the repo; this is a static directory.)

## Commands

Run all scripts from the repo root.

- Build deployable artifact: `./scripts/build-dist.sh`
  - Wipes and recreates `dist/`, copies all root `*.html`, SDK machine-doc
    text files, `styles.css`, `CNAME`, `.nojekyll`, `_headers`, and `assets/`
    into `dist/`.
- Validate lead-capture contract: `./scripts/validate-lead-capture.sh`
  - Asserts the contact form, hidden `lead_*` attribution fields, CTA
    `data-analytics-*` metadata, CSP `form-action` allowlist, and handoff doc.
- Validate security headers: `./scripts/validate-security-headers.sh`
  - Checks `_headers` content and that `edge/header-rules.json` is in sync with
    `_headers`. Set `HONUA_HEADER_CHECK_URL` to also fetch and validate the full
    live response-header set (CSP+frame-ancestors, X-Frame-Options,
    X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS).
- Regenerate edge header rules: `./scripts/build-edge-headers.sh`
  - Parses `_headers` into provider-neutral `edge/header-rules.json`. Then run
    `node scripts/build-cloudfront-template.mjs`; CI fails if either committed
    projection is stale.
- Validate workflow action pinning: `./scripts/validate-workflow-pinning.sh`
  - Fails unless every non-local `uses:` is pinned to a 40-char commit SHA.
- Validate operator claim status: `./scripts/validate-operator-claims.sh`
- Validate public schema provenance: `node scripts/validate-public-schemas.mjs`
  - Byte-pins `schemas/diagnostic-bundle.v1.json` to its provenance record.
- Regenerate/check generated page content (all support `--check` for CI mode):
  - `node scripts/gen-compatibility-matrix.mjs --check` — SDK availability
    table on `client-compatibility.html` from `data/sdk-availability.v1.json`.
  - `node scripts/gen-capability-catalog.mjs --check` — capability catalog on
    `capabilities.html` + `evidence-*.html` from `data/capabilities.v1.json`.
  - `node scripts/gen-slice-pages.mjs --check` — the capability-slice bundle in
    `docs/` (one `docs/<slug>/index.md` concept + its `index.html` projection
    per `slices/<slug>.json`, plus the bundle `docs/index.md`) — see
    "Capability-slice docs" below.
  - `node scripts/sync-capabilities-data.mjs --check` — non-writing structural
    check of `data/capabilities.v1.json` against honua-server's published
    artifacts (prints a notice on content drift but does not modify the file);
    run without `--check` to actually regenerate the committed data.
- Validate capability demo/sample links: `node scripts/validate-capability-links.mjs`
- Capability-slice docs (see `slices/README.md`):
  - `node scripts/gen-slice-pages.mjs` — renders the bundle from `slices/*.json`
    into `docs/`. Per slice it writes the Open Knowledge Format concept
    (`docs/<slug>/index.md`, `type: slice`) and then renders `index.html` from
    those bytes, so the page is a projection of the concept rather than a second
    output beside it. `--out <dir>` renders into a build tree (this is how
    `build-dist.sh` fills `dist/docs/`), `--check` fails if the committed bundle
    is stale, and `--from-concept <file>` prints the page for one concept from
    the concept alone. Output is deterministic: the concept `timestamp` is
    pinned (`SOURCE_DATE_EPOCH`, else the epoch in `scripts/slice-concept.mjs`),
    never wall-clock. Never hand-edit anything under `docs/<slug>/`.
    The same pass carries the **authored** concepts — the `type: playbook`
    files under `docs/playbooks/<slug>/index.md` — into the output tree byte
    for byte, renders each one's `index.html` from those bytes, and builds the
    bundle root's playbook list from their own frontmatter, so an authored
    playbook is behind the same `--check` drift gate as a generated slice.
  - `node scripts/validate-slices.mjs` — `slices/*.json` against
    `schemas/slice.v1.schema.json`, capability keys against
    `data/capabilities.v1.json`, sample ids against the committed sample
    catalogs, `related[]` slugs, and a live unauthenticated GitHub REST check
    that every `absent`/`partial` surface's issue is 200 and open. `--offline`
    skips the network pass.
  - `node scripts/validate-slice-voice.mjs [dir …]` — voice banlist + the shared
    `forbiddenClaims` list over `dist/docs/**/*.html` (default root). Run it
    after `build-dist.sh`.
  - `node scripts/validate-slice-concepts.mjs [root …]` — OKF frontmatter
    validity and relative-link/`#anchor` resolution over the emitted concept
    bundle (default root `dist/docs`); the link half is a port of
    `geospatial-mcp`'s `tools/check_links.py`. `--links-only slices docs` runs
    just the link/anchor half over this repo's own markdown.
  - Both rendered-output gates no-op cleanly when `dist/docs` does not exist
    yet; `build-dist.sh` creates it by running the generator with
    `--out dist/docs`.
- SDK docs versions: `node --test scripts/sdk-docs-versions.test.mjs`, then
  `node scripts/sdk-docs-versions.mjs --check` and
  `node scripts/sdk-docs-versions.mjs --verify-remote` (needs network access
  for unauthenticated fetches; no token — `GITHUB_TOKEN` is only used by
  `validate-site-claims.mjs`).
- Validate SDK machine docs: `node scripts/sdk-llms-publication.mjs`
  - Verifies root `llms.txt` / `llms-full.txt` against the immutable SDK
    producer commit and SHA-256 publication record.
- Validate public site claims: `node scripts/validate-site-claims.mjs`
- Validate internal links: `node scripts/validate-internal-links.mjs`
- Samples gallery + flagship demo smoke:
  `node scripts/sdk-sample-publication.mjs` and `node scripts/site-demo-smoke.mjs`

There is no linter or formatter configured. The test suites are the
`scripts/*.test.mjs` files, run with the built-in Node test runner
(`node --test scripts/*.test.mjs`), plus `edge/cloudfront-template.test.mjs`.
CI (`pages.yml` `validate` job) runs, in order: workflow pinning, lead capture,
security headers, operator claims, public schema provenance,
`validate-slices.mjs`, the generated-content `--check` passes (including
`gen-slice-pages.mjs --check`),
capability links, the `node --test` suite, SDK docs versions (`--check` +
`--verify-remote`), `sdk-llms-publication.mjs`, site claims, internal links,
the samples/demo smoke scripts, then `build-dist.sh`, the rendered-slice gates
(`validate-slice-voice.mjs`, `validate-slice-concepts.mjs`), and artifact checks
(machine docs present, no unexpanded `{{HONUA_SDK_` tokens, schema
byte-compare, and `frame-ancestors 'none'` in `dist/_headers`).

## Architecture

- **Pages**: each `*.html` is self-contained and links to the shared
  `styles.css`, `assets/nav.js`, and `assets/analytics.js`.
- **Analytics / lead capture** (`assets/analytics.js`): consent-gated. Emits GA4
  events only when `hasAnalyticsConsent()` is true; uses
  `transport_type: "beacon"`. The contact form in `index.html` posts to
  FormSubmit (`https://formsubmit.co/info@honua.io`) with hidden `lead_*`
  attribution inputs. Analytics must **not** read PII fields
  (`name`/`email`/`company`/`message`) — the validator enforces this.
- **CRM handoff**: documented in `docs/lead-capture-handoff.md` (attribution
  field meanings, CRM mapping, failure alerting). The validator cross-checks
  this doc against the form and headers.
- **Security headers**: `_headers` is the source of truth for CSP and related
  headers; the CSP `frame-ancestors`/`form-action` directives are validated and
  must NOT also appear inline in `index.html` (`frame-ancestors` is forbidden in
  the page meta). GitHub Pages **ignores `_headers`**, so the prepared production
  path is a private versioned S3 bucket behind CloudFront OAC, with one generated
  response-headers policy per path rule. `edge/header-rules.json` and
  `edge/cloudfront-site.template.json` are generated from `_headers`; CI fails if
  either drifts. A meta CSP cannot carry `frame-ancestors`/X-Frame-Options/HSTS,
  so `security.html` must not claim those are live until AWS is activated and
  the required post-deploy check passes. See issue #38.
- **Deploy**: `pages.yml` currently builds `dist/` and publishes to GitHub Pages
  on push to `trunk`; `edge/production-status.json` truthfully keeps the live
  response gate inactive with an explicit issue notice until the activation PR,
  then makes the canonical check required without relying on an optional secret
  or variable.
  `scripts/deploy-aws-site.sh` is the prepared fail-closed S3/CloudFront publish
  path and must be wired to an approved GitHub OIDC role during activation.
  GitHub Pages remains the DNS rollback target. PRs run validation only.

## Directory Layout

```
.
├── *.html                       # one file per page (index, claims, security, …)
├── styles.css                   # shared stylesheet
├── CNAME                        # custom domain: honua.io
├── .nojekyll                    # disable Jekyll on GitHub Pages
├── _headers                     # deployment security/response headers
├── assets/
│   ├── nav.js                   # mobile nav toggle
│   ├── analytics.js             # consent-gated GA4 + lead/CTA attribution
│   ├── sdk-samples/             # immutable per-commit published SDK samples
│   └── *.png / *.svg            # logos, favicon, og-image, hero image
├── data/                        # generated/public JSON (capabilities, SDK
│                                # availability, docs versions, llms records)
├── schemas/                     # public schema projections + provenance
├── slices/                      # capability-slice manifests (one per page)
│   └── README.md                # the slice manifest contract
├── edge/                        # generated header rules + CloudFront template
│                                # + production activation status
├── docs/                        # hand-written contracts + the GENERATED
│   │                            # capability-slice bundle (docs/index.md and
│   │                            # docs/<slug>/, written by gen-slice-pages.mjs)
│   ├── playbooks/<slug>/        # AUTHORED OKF concepts (type: playbook) that
│   │                            # join the same bundle; index.html beside each
│   │                            # one is generated from index.md
│   ├── lead-capture-handoff.md  # CRM handoff contract
│   ├── sdk-machine-docs.md      # llms.txt refresh contract
│   ├── sdk-docs-versioning.md   # SDK docs version pin contract
│   ├── sdk-sample-publication.md# samples publication contract
│   ├── operating-cadence.md
│   └── features/README.md       # site features/sections summary
├── scripts/                     # bash + node generators/validators (see
│                                # Commands above for the full list)
└── .github/workflows/pages.yml  # CI validate + Pages deploy
```

Key pages: `index.html`, `cloud-native.html`, `open-core.html`,
`operations.html`, `interoperability.html`, `performance.html`, `ai-gis.html`,
`migration.html`, `docs.html`,
`claims.html`, `privacy.html`, `terms.html`, `security.html`.

## Conventions & Gotchas

- **Default branch is `trunk`** (not `main`). Deploys happen on push to `trunk`.
- **Build output `dist/` is git-ignored** and regenerated by `build-dist.sh`.
  Do not commit it.
- **`build-dist.sh` only copies root-level `*.html`** (`-maxdepth 1`). Pages must
  live at the repo root to ship — with one exception: the capability-slice
  bundle is a page directory per slice, and `build-dist.sh` renders it into
  `dist/docs/` by running `gen-slice-pages.mjs --out`. Nothing else under
  `docs/` ships.
- **`docs/<slug>/` and `docs/index.*` are generated.** Edit
  `slices/<slug>.json` and re-run `node scripts/gen-slice-pages.mjs`; CI fails
  on a hand-edit (`--check`).
- **`docs/playbooks/<slug>/index.md` is the exception — write that one by hand.**
  It is an OKF concept with `type: playbook` and no manifest behind it. The
  `index.html` beside it is still generated, and `docs/index.md` lists it from
  its own `title`/`description`, so rerun the generator after any edit or CI
  fails on the stale root. Every `capability:` tag must resolve in
  `data/capabilities.v1.json` (a test enforces it); an id that resolves nowhere
  goes in the prose with a gap sentence and an issue link, never in the facets.
- **Run validators before committing changes to forms/CTAs/headers.** The
  lead-capture validator enforces an exact contract: hidden `lead_*` fields,
  `data-analytics-event="cta_click"` + `data-analytics-label` +
  `data-analytics-destination` on buyer-path CTAs, the FormSubmit action URL,
  and the CSP `form-action 'self' https://formsubmit.co` allowlist.
- **Never let `analytics.js` touch PII** (`name`/`email`/`company`/`message`);
  the validator fails the build if it does.
- **All CI workflow `uses:` actions must be pinned to a 40-char commit SHA**
  (enforced by `validate-workflow-pinning.sh`), not tags/branches.
- CSP allows GA4 (`googletagmanager.com`, `google-analytics.com`) and Google
  Fonts; keep `_headers` and any inline CSP meta in sync when adding origins.

## Shared dev-environment rules (multi-agent WSL)

This machine runs many agents concurrently (**Codex + Claude**, often via agentflow with multiple tabs/agents). To prevent host lockups and lost work, every agent MUST follow these:

1. **Heavy builds/tests are throttled by a shared lock.** `dotnet` and `npm` are PATH-shimmed, so their build/test/publish/pack and ci/install/test/run-build/run-test subcommands automatically run under a global semaphore (default 1 concurrent, `HONUA_BUILD_SLOTS`). For other heavy tools, call the wrapper explicitly: `with-build-lock pytest ...`, `with-build-lock cargo build`, `with-build-lock make build`. The lock is shared across ALL of this user's processes (every Codex/Claude tab, agentflow children). Do not bypass it for compiles or test suites. Long-running servers (`dotnet run`, `npm run dev`) are intentionally NOT locked — never wrap those.

2. **Commit and push when you finish a task** so your worktree can be reclaimed. An hourly job (`honua-clean`) removes a worktree ONLY when it is clean AND fully pushed (merged, remote-gone, or idle >=2d). Dirty or unpushed worktrees are NEVER touched — but uncommitted/unpushed work blocks reclamation and is at risk if the instance is reset. Build artifacts (bin/obj and untracked node_modules) are reclaimed automatically and safely.

3. **Commit hygiene — no agent attribution.** Author every commit as the repo owner only (git identity: Mike McDougall <mike@honua.io>). Do **NOT** add any agent/tool attribution to commits: no `Co-Authored-By: Claude ...`, no `Co-Authored-By: Codex ...` (or other bot co-authors), and no "Generated with Claude Code" / "Generated with Codex" / "🤖" lines in the message or PR body. Write a plain, descriptive commit message and stop.

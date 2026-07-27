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
- `_headers` defines deployment security headers (CSP, X-Frame-Options, etc.).
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
  - Parses `_headers` into `edge/header-rules.json` (consumed by the Cloudflare
    Worker in `edge/worker.js`). Run after editing `_headers`; CI fails if the
    committed file is stale.
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
  - `node scripts/sync-capabilities-data.mjs --check` — regenerates
    `data/capabilities.v1.json` from honua-server's published artifacts.
- Validate capability demo/sample links: `node scripts/validate-capability-links.mjs`
- SDK docs versions: `node --test scripts/sdk-docs-versions.test.mjs`, then
  `node scripts/sdk-docs-versions.mjs --check` and
  `node scripts/sdk-docs-versions.mjs --verify-remote` (needs `GITHUB_TOKEN`).
- Validate SDK machine docs: `node scripts/sdk-llms-publication.mjs`
  - Verifies root `llms.txt` / `llms-full.txt` against the immutable SDK
    producer commit and SHA-256 publication record.
- Validate public site claims: `node scripts/validate-site-claims.mjs`
- Validate internal links: `node scripts/validate-internal-links.mjs`
- Samples gallery + flagship demo smoke:
  `node scripts/sdk-sample-publication.mjs` and `node scripts/site-demo-smoke.mjs`

There is no linter or formatter configured. The only test suite is
`scripts/sdk-docs-versions.test.mjs`, run with the built-in Node test runner
(`node --test`). CI (`pages.yml` `validate` job) runs, in order: workflow
pinning, lead capture, security headers, operator claims, public schema
provenance, the generated-content `--check` passes, capability links, the
`node --test` suite, SDK docs versions (`--check` + `--verify-remote`),
`sdk-llms-publication.mjs`, site claims, internal links, the samples/demo
smoke scripts, then `build-dist.sh` and artifact checks (machine docs present,
no unexpanded `{{HONUA_SDK_` tokens, schema byte-compare, and
`frame-ancestors 'none'` in `dist/_headers`).

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
  the page meta). GitHub Pages **ignores `_headers`**, so the live site is
  fronted by a Cloudflare Worker (`edge/worker.js`) that injects the same set;
  its rules (`edge/header-rules.json`) are generated from `_headers` by
  `scripts/build-edge-headers.sh` and CI fails if they drift. A meta CSP cannot
  carry `frame-ancestors`/`X-Frame-Options`/HSTS, so only the edge delivers
  anti-clickjacking — `security.html` must not claim those are edge-enforced
  until the Worker is live (`HONUA_HEADER_CHECK_URL` set). See issue #38.
- **Deploy**: `pages.yml` builds `dist/` and publishes to GitHub Pages on push
  to `trunk`. PRs run validation only.

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
├── edge/                        # Cloudflare Worker + header-rules.json
├── docs/
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
  live at the repo root to ship.
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

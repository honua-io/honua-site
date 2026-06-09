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
- Bash scripts for build and validation (`scripts/*.sh`, `set -euo pipefail`).
- GitHub Actions for CI + GitHub Pages deploy (`.github/workflows/pages.yml`).
- `_headers` defines deployment security headers (CSP, X-Frame-Options, etc.).
- No `package.json`, lockfile, or language version manifest exists.

## Setup

No dependency install step. You need:

- `bash` (scripts use `set -euo pipefail`).
- `perl` and `grep -E` (used by `validate-lead-capture.sh` / header checks).
- `curl` (only for the optional live header check).

To preview locally, serve the repo root with any static file server, e.g.
`python3 -m http.server` from the repo root, then open the `*.html` pages.
(Local preview command is not encoded in the repo; this is a static directory.)

## Commands

Run all scripts from the repo root.

- Build deployable artifact: `./scripts/build-dist.sh`
  - Wipes and recreates `dist/`, copies all root `*.html`, `styles.css`,
    `CNAME`, `.nojekyll`, `_headers`, and `assets/` into `dist/`.
- Validate lead-capture contract: `./scripts/validate-lead-capture.sh`
  - Asserts the contact form, hidden `lead_*` attribution fields, CTA
    `data-analytics-*` metadata, CSP `form-action` allowlist, and handoff doc.
- Validate security headers: `./scripts/validate-security-headers.sh`
  - Checks `_headers` content. Set `HONUA_HEADER_CHECK_URL` to also fetch and
    validate live response headers.
- Validate workflow action pinning: `./scripts/validate-workflow-pinning.sh`
  - Fails unless every non-local `uses:` is pinned to a 40-char commit SHA.

There is **no test framework, linter, or formatter** configured in the repo.
CI (`pages.yml`) runs `validate-lead-capture.sh` then `build-dist.sh`, then
greps `dist/_headers` for `frame-ancestors 'none'`.

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
  the page meta).
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
│   └── *.png / *.svg            # logos, favicon, og-image, hero image
├── docs/
│   ├── lead-capture-handoff.md  # CRM handoff contract
│   └── features/README.md       # site features/sections summary
├── scripts/
│   ├── build-dist.sh
│   ├── validate-lead-capture.sh
│   ├── validate-security-headers.sh
│   └── validate-workflow-pinning.sh
└── .github/workflows/pages.yml  # CI validate + Pages deploy
```

Key pages: `index.html`, `cloud-native.html`, `open-core.html`,
`operations.html`, `interoperability.html`, `performance.html`, `ai-gis.html`,
`qgis-plugin.html`, `honua-gis.html`, `migration.html`, `docs.html`,
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
- **Keep `qgis-plugin.html` and `claims.html#qgis-plugin` aligned** (per
  README): 0.1.0 early preview, GPL-2.0-or-later, QGIS 3.34+, no plugin
  telemetry, no QGIS project endorsement. This repo does NOT own the plugin ZIP,
  marketplace listing, or plugin media.
- The README lists some pages (e.g. `platform.html`, `protocols.html`,
  `sdks.html`, `mobile.html`, `pricing.html`) that are not present in the repo;
  trust the actual files on disk, not the README list.
- CSP allows GA4 (`googletagmanager.com`, `google-analytics.com`) and Google
  Fonts; keep `_headers` and any inline CSP meta in sync when adding origins.

## Shared dev-environment rules (multi-agent WSL)

This machine runs many agents concurrently (**Codex + Claude**, often via agentflow with multiple tabs/agents). To prevent host lockups and lost work, every agent MUST follow these:

1. **Heavy builds/tests are throttled by a shared lock.** `dotnet` and `npm` are PATH-shimmed, so their build/test/publish/pack and ci/install/test/run-build/run-test subcommands automatically run under a global semaphore (default 1 concurrent, `HONUA_BUILD_SLOTS`). For other heavy tools, call the wrapper explicitly: `with-build-lock pytest ...`, `with-build-lock cargo build`, `with-build-lock make build`. The lock is shared across ALL of this user's processes (every Codex/Claude tab, agentflow children). Do not bypass it for compiles or test suites. Long-running servers (`dotnet run`, `npm run dev`) are intentionally NOT locked — never wrap those.

2. **Commit and push when you finish a task** so your worktree can be reclaimed. An hourly job (`honua-clean`) removes a worktree ONLY when it is clean AND fully pushed (merged, remote-gone, or idle >=2d). Dirty or unpushed worktrees are NEVER touched — but uncommitted/unpushed work blocks reclamation and is at risk if the instance is reset. Build artifacts (bin/obj and untracked node_modules) are reclaimed automatically and safely.

3. **Commit hygiene — no agent attribution.** Author every commit as the repo owner only (git identity: Mike McDougall <mike@honua.io>). Do **NOT** add any agent/tool attribution to commits: no `Co-Authored-By: Claude ...`, no `Co-Authored-By: Codex ...` (or other bot co-authors), and no "Generated with Claude Code" / "Generated with Codex" / "🤖" lines in the message or PR body. Write a plain, descriptive commit message and stop.

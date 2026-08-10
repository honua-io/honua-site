# Brand assets — GitHub social previews & org avatar

Generated 1280×640 social-preview cards for every public honua-io repo, plus
1024×1024 org-avatar renders of `assets/honua-logo.svg`. Design matches
`assets/og-image.png` (palette from `styles.css`, Geist fonts from
`assets/fonts/`, contour-line motif).

This directory is NOT part of the deployed site — `scripts/build-dist.sh` only
copies root `*.html` and `assets/`, so nothing here ships to honua.io.

## Applying (manual — GitHub has no API for either)

- **Org avatar**: org Settings → Profile → upload `org-avatar-navy.png`
  (preferred: the mark's dark flippers vanish on GitHub dark mode with the
  transparent version).
- **Per-repo social preview**: repo Settings → General → Social preview →
  upload `social-previews/<repo>.png`. `dot-github.png` is for the `.github`
  repo.

## Regenerating

Requires Node and a Chromium binary (defaults to the Playwright cache path;
override with `CHROME=/path/to/chrome`):

```bash
node brand/gen-cards.mjs
```

Repo names, one-liners, and category chips are data at the top of
`gen-cards.mjs` — edit there when a repo's description changes, rerun, and
re-upload the affected card.

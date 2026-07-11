# Site data snapshots

Machine-readable data that public pages are generated from, kept in the repo so a
page and the data behind it always ship together.

## `compatibility-policy.v1.json`

A **synced snapshot** of the canonical versioned server↔SDK compatibility policy. It
drives the SDK matrix on [`client-compatibility.html`](../client-compatibility.html)
and the guided-fix numbers in the compatibility KB articles (e.g.
[`kb-compat-0001.html`](../kb-compat-0001.html)).

- **Canonical source of truth:** `compatibility/compatibility-policy.v1.json` in
  [`honua-io/honua-support`](https://github.com/honua-io/honua-support) (honua-support#42).
  That repo owns the policy; this file is a copy so the static site has no build-time
  network dependency. **Do not edit the version data here by hand** — edit it upstream,
  then resync.
- **Resync (manual today; automation is a follow-up — see below):**

  ```bash
  gh api repos/honua-io/honua-support/contents/compatibility/compatibility-policy.v1.json \
    --jq '.content' | base64 -d > data/compatibility-policy.v1.json
  node scripts/gen-compatibility-matrix.mjs        # regenerate the on-page tables
  git diff                                          # review, then commit
  ```

- **Regeneration:** [`scripts/gen-compatibility-matrix.mjs`](../scripts/gen-compatibility-matrix.mjs)
  reads this file and rewrites the tables inside the
  `<!-- GENERATED:sdk-matrix ... -->` markers in `client-compatibility.html`. The tables
  are generated, not hand-maintained, so the matrix cannot drift from the policy without
  a visible diff.

### Follow-up: close the sync loop automatically

The resync above is manual. The intended follow-up (tracked with honua-support#46) is a
small CI check — either a scheduled workflow that opens a PR when the upstream policy
changes, or a check that fails if `data/compatibility-policy.v1.json` is behind the
honua-support canonical and/or if `scripts/gen-compatibility-matrix.mjs` would produce a
diff. Until that lands, treat the resync steps above as the release checklist whenever
the compatibility policy changes.

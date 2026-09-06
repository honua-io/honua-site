# Release compatibility publication

`client-compatibility.html` imports the SDK/server and upgrade-edge tables generated
by `honua-release` from its platform lock. The import preserves qualification
status: a draft lock and missing receipts remain explicitly unqualified on the
customer page. Package availability is checked separately by the existing registry
table and does not certify a release pairing.

Refresh from an immutable release commit after its generated-document check passes:

```sh
node scripts/release-compatibility.mjs --import-from /path/to/honua-release FULL_COMMIT_SHA
node scripts/release-compatibility.mjs --verify-remote
```

The importer reads Git objects at that commit, copies the generated Markdown and
source lock into `data/`, records both byte SHA-256 hashes, and regenerates the page.
The current source is the explicitly incomplete lock draft. At candidate publication,
update the release repository's generated document and source-lock path together;
do not replace the draft label by hand or claim pairing certification without receipts.

`--check` verifies local source bytes and page freshness without network access.
`--verify-remote` additionally compares both immutable GitHub files with the recorded
hashes. Pages CI requires this check. The normal build copies the page, Markdown,
lock, and provenance record into the public artifact. No browser fetch is required.

The site projects the release documentation; capability-floor derivation and lock
qualification remain release tooling responsibilities. SDK runtime declaration
correction and exact-candidate certification remain tracked by honua-release#233.

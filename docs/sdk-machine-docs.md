# SDK machine-doc publication

The root `llms.txt` and `llms-full.txt` files are generated and owned by
`honua-io/honua-sdk-js`. The site publishes an exact copy from one immutable SDK
commit; do not edit either file in this repository.

`data/sdk-llms.v1.json` records the producer commit, source URL, byte count, and
SHA-256 digest for each file. Required CI runs the offline parity check:

```bash
node scripts/sdk-llms-publication.mjs
```

To refresh from a reviewed SDK commit in a local sibling checkout:

```bash
node scripts/sdk-llms-publication.mjs --write \
  --sdk-repo ../honua-sdk-js \
  --commit <full-sdk-commit-sha>
node scripts/sdk-llms-publication.mjs
```

Write mode also verifies that every curated `llms.txt` link names an existing
file at the producer commit. Review and commit the two text files and their
publication manifest together.

The parent workstream still needs a cross-repository trigger or routing layer to
refresh these files on every SDK documentation deployment. The site build stays
offline and deterministic until that authority is available.

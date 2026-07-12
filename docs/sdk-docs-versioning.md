# SDK documentation version projection

`data/sdk-docs-versions.v1.json` is the build-time snapshot used by the public
site. Its source of truth is the SDK documentation manifest at
`https://honua-io.github.io/honua-sdk-js/versions.json`.

The site never fetches version state in a visitor's browser. Instead, run:

```bash
node scripts/sdk-docs-versions.mjs --refresh
node scripts/sdk-docs-versions.mjs --check
node scripts/sdk-docs-versions.mjs --verify-remote
./scripts/build-dist.sh
```

The refresh records the source URL, normalized-manifest SHA-256 digest, refresh time, exact SDK
development commit, latest released package, immutable tagged fallbacks, and
supported-prior policy. Review and commit the snapshot with the site change.

`--check` fails when the snapshot, SDK availability record, sample publication
version, or required page tokens disagree. `build-dist.sh` resolves those
tokens into static HTML, so the version and provenance remain accessible with
JavaScript disabled. Release pages always use the tagged source fallback;
development pages always show their exact commit and are never labelled as an
immutable package release.

CI also runs `--verify-remote`. It compares the complete release history,
compatibility ranges, latest release, and supported-prior policy with the live
SDK manifest, and proves that the pinned development SHA remains an accessible
SDK commit. The development SHA is intentionally a reproducible pin; it need
not change for unrelated later SDK commits when release state is unchanged.

docs(site): make the Windows quickstart use published artifacts

## Summary

The public quickstart currently starts from a source checkout and raw HTTP shell command. It now starts an isolated Production stack from an exact public image digest and published Python clients in PowerShell, then routes directly into import/publish/query and recovery. Linux has an explicit package-only path.

## Changes

- Publish the release-owned customer manifest and immutable source/hash record plus the checksum-verified Compose download.
- Replace the source quickstart and capability HTTP shell example with PowerShell/published admin-client commands.
- Correct stale npm availability and the .NET source-only claim; link credential setup only for GitHub Packages NuGet.
- Refresh the SDK docs snapshot from its canonical versions publication so the site still builds with the verified npm pins.

## Validation

- Site claims and internal links: passed for 140 non-sample pages.
- Compatibility generator check, static site build, SDK docs check and upstream verification: passed.
- Rendered slice voice/concept gates: passed.
- Native Windows PowerShell 5.1: all 30 customer command blocks across the packet parse.
- Manifest public projection matches the immutable release-source bytes and digest; downloaded Compose bytes match the literal guide.
- GitBook companion records a fresh Linux shell replay of install/auth/import/publish/query/restart/database restore/file-storage restore/container recreation/scoped teardown using anonymous registry pulls.

## Companion PRs

- Public site and downloads: https://github.com/honua-io/honua-site/pull/276
- GitBook sources and validation record: https://github.com/honua-io/honua-server/pull/4574
- Release artifact profile and client pin: https://github.com/honua-io/honua-release/pull/314

Coordinate the site/download publication with the GitBook update; the profile remains explicitly pre-cut.

## Artifact identities

The public projection is `data/customer-install-manifest.json`, copied byte-for-byte from honua-release commit `4a8b3673d03f1bc8c2b53e847e6bcb40043a885a:customer-install-manifest.json`; its publication record pins that source and SHA-256.

| Artifact | Exact identity | Source |
| --- | --- | --- |
| Server | `ghcr.io/honua-io/honua-server@sha256:273b4c616e806b8ac2809946659986960a1803e55bda79d99db5f3955b6c30b9`, selected platform `linux/amd64`, source `5a657b9eaed7cdeac915d584ad58c028a52ca61e` | Successful pre-cut Windows rehearsal in server #4429; anonymous OCI index digest and image source label reverified |
| Control plane | `honua-admin==0.1.8`; wheel SHA-256 `fe69794cdcf9293e095401a9c361b6cfb00a28886dc504df511a0795d8d7096b` | Version-specific PyPI JSON and `python-admin-v0.1.8` tag at `f7930b6e9c3ce47ade148bba3d4510eeffd2ccc4`; now recorded in platform manifest |
| Data plane | `honua-sdk==0.1.11`; wheel SHA-256 `80ac6a25fa5fed0ee7d8dca4ca94d14c098d9f72a149c9e271b1a1d04b78c3e9` | Existing platform-manifest pin, reverified against version-specific PyPI JSON |
| Import transport | `mcp==2.1.1`; wheel SHA-256 `1c6c31c5d6471c58db76af3af8af67f46d11d01f0a59077d0a308cbdb3d3e915` | Version-specific PyPI JSON |
| Supporting containers | `pgrouting/pgrouting:17-3.5-3.7.3`, `redis:7.4-alpine` | Existing Windows rehearsal configuration; anonymously pulled during this replay |
| Alternative clients, not used in the Python journey | `@honua/sdk-js@0.1.9-beta.0`, `@honua/mcp-server@0.1.4-beta.0`, `Honua.Sdk` `1.6.0` | Existing release-manifest pins; integrity/digests retained in the profile |

PyPI and the public server image require no package-read credentials. Only the optional GitHub Packages NuGet client needs package access and `read:packages`.

## Qualification boundary

This is the pre-cut documentation/packaging packet under [operator ruling A](https://github.com/honua-io/honua-server/issues/4300#issuecomment-5588019114). **Post-cut validation on a clean Windows machine against the signed exact candidate and its compatible clients is a separate step in the Windows licensed lane.** The existing Windows-host receipt and this Linux runtime replay do not satisfy that acceptance item. Public DNS/TLS and host reboot behavior still require validation on the deployment host. Leave #4300 open; link that later qualification record there.

Refs honua-io/honua-server#4300


## Trunk merge (2026-10-19)

- Merged `origin/trunk`. Trunk's SDK availability now wins: .NET is the public NuGet.org `Honua.Sdk 1.11.1`, which CI checks against all three registries. The earlier GitHub Packages `1.6.0` wording and the narrowed blockquote from the review fixes are superseded and have been removed.
- Kept this PR's Windows PowerShell quickstart and pre-cut artifact manifest.

## Known blocker (follow-up)

- `scripts/registry-claims.test.mjs:222` fails with `docs.html: names honua-sdk 0.1.11; the published claim is 0.1.17`. The quickstart installs `honua-sdk==0.1.11` from `data/customer-install-manifest.json`, which is a byte-identical copy of honua-release@4a8b367 (sha256 `d711aa05…`). No honua-release manifest pins 0.1.17; release trunk pins 0.1.13. Fix: honua-release cuts a customer-install manifest pinning honua-sdk 0.1.17, then this PR re-syncs the manifest and publication record. Hand-editing the mirrored manifest would break its provenance.
- `validate-site-claims.mjs` registry-lag failures (sdk-js 0.2.6, Honua.Sdk 1.12.0) are the same on trunk and are not caused by this PR.

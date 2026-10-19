# Capability navigation and architecture

## Scope

The capability overview now groups related interfaces and workflows. Database
connections and file formats have their own sections. The complete checklist is
`capability-details.html`; individual evidence pages keep their URLs and use the
product-site shell. `capabilities.html?caps=...` and old `#cap-*` / `#cat-*` links
forward to the detailed catalog. The retired price estimator is removed.

No edition assignment, source license, support promise, release policy, or runtime
gate changes in this redesign. Large release-licensing banners are replaced with
links to release notes and Editions. Maturity labels remain beside capabilities.

## Sources and generation

`data/capabilities.v1.json` is unchanged. `data/capability-navigation.v1.json`
contains editorial grouping, documentation links, and source-pinned provider scope;
it is not an entitlement registry. Provider details are based on the server data-
source documentation at `e6271fd35ffb7b77779438fd853fe14cc067130c`.
The gRPC/WPS and Studio links supplement the older site snapshot without inventing
capability keys or evidence. Explicit source-backed release labels may demote a
claim; counted proving tests never promote one to GA.

Run `node scripts/gen-capability-catalog.mjs` after editing its templates or data.
It emits the hub region, the detailed catalog, and the existing evidence routes.
`--check` verifies every projection. Navigation and evidence share
`scripts/capability-page-shell.mjs` and `assets/capability-hub.css`.

## Architecture

The original request trace and migration/operations steppers are restored from
`bee278714a0f3411fb5ff9aad8fe28ec2eb2ba6e`, with separate AWS and Azure views.
The newer platform overview and topology selector remain. There is no separate
hand-authored edition matrix, stale aggregate test score, or competitor-comparison
paragraph. The page is vendor-neutral apart from deployment providers and named
technical interfaces. Historical fragments remain valid. Reduced-motion settings
and keyboard tab controls remain supported.

## Agent installation

`install-with-agent.html` provides a copyable prompt and links to the official
installation and MCP guides on docs.honua.io. It does not execute an install.
`data/agent-install-prompt.txt` provides the same instructions as plain text.
The homepage CTA now points here; its product copy and layout are otherwise kept.
The general Docs navigation still goes directly to docs.honua.io.

## Validation

Run the existing Pages suite, including capability generation and internal-link
checks. `scripts/capability-hub.test.mjs` adds grouping, provider scope, release
label, legacy-anchor, architecture, and install-link regression checks. The review
workflow captures the built hub, evidence, checklist, restored architecture,
and installation page, and checks the historical redirect in a real browser.

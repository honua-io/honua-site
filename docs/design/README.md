# Design documents

Working design and planning documents for the public surfaces this repository
builds. These are source of truth; published renderings of them exist as shared
artifacts, but the copies here are what gets reviewed and changed.

| Document | What it governs |
|---|---|
| [`samples-gallery-design-brief.md`](samples-gallery-design-brief.md) | The samples.honua.io gallery redesign — demo page anatomy, launch slate, publish gate, voice rules. Act one. |
| [`capability-slice-docs-plan.md`](capability-slice-docs-plan.md) | The capability-slice docs: 21 slices, the Operations section, the SDK-reference boundary, embedding, search, phases, backlog. Act two. |
| [`slice-docs-design-brief.md`](slice-docs-design-brief.md) | The design handoff for the slice pages — template, tab pairs, finder, search, deliverables. |

Precedence: the gallery brief wins on anything it and the slice brief both
touch — same product, one act later. The plan governs scope and sequencing; the
briefs govern how the surfaces look and read.

Two rules carry across all three: nothing ships claiming to be live unless it
is, and the voice banlist keeps internal vocabulary (receipts, maturity,
coverage, lifecycle states) out of rendered HTML.

Both are meant to be enforced by the build rather than by review, and **neither
validator exists yet** — the liveness check and the banlist gate are still
unwritten work, tracked as an engineering note in the gallery brief
(`samples-gallery-design-brief.md`, the `build-gallery.mjs` voice gate) and as
acceptance criteria on the slice manifest validators, honua-site#216. Until
those land, the rules hold only as far as a reviewer enforces them: do not read
this page as a promise that CI will catch a prohibited word or an unverified
live claim.

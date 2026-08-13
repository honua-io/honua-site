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

Two rules carry across all three and are enforced by the build, not by review:
nothing ships claiming to be live unless it is, and the voice banlist keeps
internal vocabulary (receipts, maturity, coverage, lifecycle states) out of
rendered HTML.

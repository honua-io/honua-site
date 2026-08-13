# Capability-slice docs — design brief

Status: handoff · 2026-08-13 · look inherited: Bedrock dark
Audience: the design session producing the slice template, the index, the finder, and the token additions.
Companion to: `samples-gallery-design-brief.md` (act one — the gallery). Governed by: `capability-slice-docs-plan.md` (revision 3).
Precedence: the gallery brief wins on anything both documents touch — this is the same product, one act later. Where this brief is silent, the gallery brief's rules still apply, including the voice banlist and the publish gate.

## The job

Twenty-one pages, one per capability. Each one answers a working question — "how do I do realtime / geoprocessing / cloud-native imagery with this?" — for the operator setting it up, the developer consuming it, and the agent asking about it, on one page.

The design job is to make a dense, four-audience technical page feel **inevitable rather than exhausting**. The gallery had to say *Honua makes cool maps* in ten seconds. This has to say *you can do this, here's exactly how* in sixty — and then get out of the way while someone copies code.

## The one-sentence problem

Every incumbent splits these surfaces across four doc properties, so a developer answering one question opens four tabs and reconciles them by hand; the slice page is the bet that one page can hold all of it without becoming a spec.

## Readers, in order

1. **A developer with a task.** Arrived from search or the finder, mid-problem, impatient. Wants the smallest code that works, in their language, against a server they can hit right now. Will scroll past prose to find a code block.
2. **An operator or admin.** Needs to know what to configure before the developer's code works. Reads the setup tabs, copies a CLI line, ignores everything else.
3. **An evaluator, skimming.** Deciding whether this platform does the thing at all. Reads the map, the title, the first paragraph, and the protocol chips. Never scrolls to panel 5.
4. **An agent.** Consumes the markdown twin. Never sees the design, but the structure it reads is the same structure — so the visual hierarchy and the document hierarchy must agree.

## The rule that overrides everything

**The map proves it, the code delivers it, and process never renders.** Panel 1 exists so the page is credible before it is read. Panels 3–4 exist so it is useful. Everything else is support. No receipts, no maturity legends, no coverage matrices, no lifecycle vocabulary — same banlist and same build gate as the gallery.

Second rule, close behind: **an honest gap beats a padded page.** A missing SDK tab renders as one sentence — "Not in the Python SDK yet — track it here" — linking the issue. That sentence is a designed element, not an error state, and it should read as confidence rather than apology.

## What a slice page is

Seven panels, in this order. The order is fixed; the weight is not.

1. **The map.** A live sample, framed from samples.honua.io, poster-first and activating on interaction. One per page. If the pinned route fails its build-time health check, the poster stays and links out — no broken frame, no apology.
2. **What it is.** Two to four paragraphs, founder register. This is the only prose budget on the page; spend it on what the capability *is for*, not how it works.
3. **Set it up** — tabs: Console · CLI · Admin API. The operator path. The Console tab is an annotated build-time screenshot; CLI and Admin API are canonical and always present.
4. **Use it** — tabs: JS · Python · .NET · Mobile. The developer path. Smallest real snippet, one editable line at the top, a copy button, and a link out to that SDK's reference for symbols.
5. **Ask it.** What an agent can discover and do, with a real tool-call transcript. On editing slices this panel says plainly that agents read and never write.
6. **Underneath.** Protocol chips into the API reference; one quiet "verified" link. Fine print, visually recessive.
7. **Related** slices and samples.

### The two tab groups are the hardest problem on the page

Panels 3 and 4 are both tab groups, stacked, with different axes — surfaces versus languages. If they look identical the reader loses track of which one they're in.

Design them as a pair that is obviously *not* the same control: different label shape, different rhythm, ideally different position relative to their panel. Both must be keyboard-operable, both must deep-link (`#use=python` lands on the Python tab and scrolls to it), and the language choice should persist across slices for the session — a Python developer should not re-pick Python twenty-one times.

Tab switching must not reflow the page. Reserve the height of the tallest panel in the group, or the reader loses their scroll position every time they compare two SDKs.

### Code is a first-class object

Most of this page's value is in code blocks, so they get real design attention rather than a default treatment: a considered mono face, syntax colors that hold on the dark ground without turning into confetti, a visible copy affordance, and the editable server line marked as the one thing you're meant to change. Long snippets scroll inside their own box; the page body never scrolls sideways. Aim for roughly forty visible lines before the block scrolls.

### The reference-shaped variant

Three slices have no honest hero map — **Cloud-native architecture**, **Operate: the AI ops loop**, **Debug, test & perf**. Faking one is worse than not having one. For these, panel 1 becomes a diagram or a real interface view, panel 5 may become the main event (the ops loop's agent story *is* the product), and panel 6 collapses into inline links.

Design this as a declared variant of the same template — a page that visibly belongs to the same family, not a different-looking page. The variant is chosen per slice at design time and recorded in the manifest.

## The index and the finder

**The index** (`docs.html`) is a contents page, not a taxonomy: twenty-one slices, grouped, one line each. It should be readable in a single screen on a laptop. Alongside it sit the other three doorways — Operations, SDK reference, API reference — presented as peers, because a reader who wants "how do I run this" should not have to guess that it isn't a slice.

**The finder** is the browse feature: faceted filtering over the slice, sample, and capability graph. Facets are **task, protocol, SDK, data mode (server-backed vs client-only), edition, renderer**. It answers "show me the smallest runnable example that uses OGC API Features from Python against my own server."

Design constraints: results are cards that look like the gallery's, because they often *are* gallery samples; filters are visible and clearable at a glance, never a wizard; an empty result says which facet to relax; and the facet list itself never grows a maturity, support-tier, or coverage axis. That is the banlist expressed as information architecture.

**Search** is one box covering slices, Operations, the SDK guide corpora, and samples — static, client-side, no server. Treat it as the primary navigation for readers two and three: give it a keyboard shortcut, show result type (slice / operations / SDK / sample) as a quiet label, and make the first result usable without opening it. The same index is the machine twin that agents read, so the ranking should reward the page that actually answers the question, not the page that mentions the word most.

## The prototype

**Realtime, time & geofencing** is built first, by hand, and locks the template. It was chosen because it exercises every panel: a live incident feed for the map, geofence rules and delivery channels in the operator tabs, subscriptions in the developer tabs, and a genuinely interesting agent transcript. Design against it with real content — no lorem, no placeholder tabs.

Everything after it is generated from manifests, so anything the design leaves ambiguous becomes twenty-one inconsistent pages.

## When a slice ships

Enforced by the build, never at design time:

- Panels 1–2 present, at least one setup tab, at least one use tab.
- Every capability key resolves in `capabilities.v1.json`; every sample id resolves in the catalog.
- A "live" claim appears only where the demo services manifest says the service is serving.
- The embedded route passes its health check, or the poster ships instead.
- Banlist clean. Links live. Markdown twin emitted.

A slice that can't meet this ships smaller. It never ships padded.

## Voice

Inherited from the gallery, unchanged: founder register, short, declarative. Titles name outcomes, not protocols. Protocol names are chips, not headlines. Numbers only when they're the point.

Budgets: page title ≤ 6 words · intro paragraph ≤ 3 sentences · panel 2 ≤ 250 words · facet labels ≤ 2 words · the honest-gap sentence ≤ 20 words.

Banned from rendered HTML, same as the gallery: *admitted, governed, qualification, assertion, evidence, semantic, canonical, receipt, fixture, maintained* — plus, for this surface, *coverage, maturity, tier, roadmap*.

## What the design session delivers

1. The slice template, map-shaped, designed against the realtime prototype with real content.
2. The reference-shaped variant.
3. The index page.
4. The finder, including its empty and over-filtered states.
5. Search: the box, the results, the keyboard model.
6. Token additions to `honua-tokens.css`: the docs reading scale, code-block treatment, tab chrome, table treatment, and the recessive style for panel 6.
7. The honest-gap sentence as a designed component.

Not in scope: re-deciding the palette, the gallery's card design, or the Operations section's internal pages — those come after the template is locked.

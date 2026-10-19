# AI-first spatial website remodel

## Information design

Homepage: the product promise. Architecture: conceptual platform, deployment topology, safe operations. Editions: registry-backed capabilities and commercial direction without unvalidated rates. Blog: engineering rationale. Docs: implementation reference.

Primary navigation: How it works / Editions / Blog / Docs / GitHub / Talk to us. Existing evidence, trust, samples, schema contracts, consent analytics, and lead capture remain intact. Legacy feature pages remain reachable for inbound links but are no longer primary destinations. The pricing URL redirects to Editions; its old prospective rate card is removed.

## Local preview and build

The eight remodeled root HTML files carry authored content. A dependency-free Node preparation step supplies consistent metadata, local font preloads, the approved homepage structured-data/CSP contract, accessible skip links, and the sitemap before validation or deployment:

```sh
node scripts/prepare-marketing-pages.mjs
node scripts/prepare-marketing-pages.mjs --check
python3 -m http.server
```

`build-dist.sh` runs the same idempotent preparation step. CI runs it before the existing validators. No existing validation gate or security policy is disabled. The approved structured data continues to describe the organization and Server component; its edge CSP hash stays unchanged. The existing social preview image is retained with an accurate alt description.

The styled pages are scoped with `.h-site`; other documentation, evidence, and sample pages keep their existing presentation. The shared navigation script normalizes legacy page navigation. No-JavaScript visitors can still use static navigation and read all architecture panels. The editions catalog falls back to the existing static capability reference.

## Capability data and commercial policy

The editions comparison reads `data/capabilities.v1.json`, not a separate hand-written entitlement list. It exposes the dated source revision, cumulative edition filters, search and categories. Evidence status is not translated into GA maturity. Unknown status or failed loading has an explicit fallback. The full capability catalog remains available.

Community / Pro / Enterprise feature tiering is independent of usage/capacity pricing and release maturity. Server and Collect use ELv2; other platform components use Apache 2.0. Mobile SDK and Collect are experimental. Current 2026.1 disabled licensing is a release condition, not the permanent commercial model. No final usage rate or capacity band is promised.

## Editorial scope

The articles in this review branch are proposed website copy, not published social posts. They expand the founder's September 19 launch-series drafts and the subsequent approved product-positioning discussion. The original collection order remains: manifesto, interoperability, cloud execution, GP/batch/Python, AI, DevOps, gRPC, benchmarks, migration, JavaScript, .NET/ETL, licensing, support. Cloud execution leads into GP; licensing and support close the sequence.

Four initial articles are proposed: platform vision, real-time AI mapmaking, GP/elastic compute, and protected operations. Remaining launch drafts should be edited and verified before adding them. Studio's self-hosted Preview, vector-only renderer, and fixture-backed GP-panel boundaries remain explicit.

## Visuals and review

Architecture drawings are conceptual/reference illustrations, not product screenshots, live telemetry, benchmark evidence, or universal deployment qualifications. A real approved product recording can replace the homepage illustration. No hosted Studio demonstration is invented.

Isolated Chromium rendering exercised the eight pages at desktop/tablet/mobile widths, navigation, architecture controls, and capability filters using source-derived fixture records. Network navigation and unchanged analytics were excluded in that environment; these checks do not replace full repository CI. Metadata unit tests additionally cover idempotence, SEO fields, original CSP hash, noindex redirects, sitemap inclusion, and preservation of unrelated pages.

Production publication still happens only through the existing trunk workflow. This branch is intended for review before merge.

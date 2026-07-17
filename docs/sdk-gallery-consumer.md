# SDK gallery consumer

The canonical `/samples/` catalog is generated from the producer-owned S3
handoff introduced by `honua-sdk-js#550`. The site does not maintain a second
sample inventory and does not copy example implementations.

## Pinned producer input

`data/sdk-gallery/source.v1.json` pins full SDK revision
`aba7f32dd6135a66298a16aba773ac47bf77aafd` and the byte count and SHA-256 of:

- `honua-site-consumer-handoff.v1.json`;
- its site projection, capability matrix, and visual-evidence inputs;
- the v3 site consumer fixture; and
- every schema referenced by those consumer artifacts.

The producer paths are preserved below
`data/sdk-gallery/aba7f32d/`. This lets the handoff's content bindings resolve
without rewriting producer data. Only JSON contracts and schemas are imported;
executable examples remain in `honua-io/honua-sdk-js` and every sample page
links to source and documentation at the exact pinned commit.

## Admission and freshness

`scripts/sdk-gallery-consumer.mjs` fails closed when:

- an imported artifact changes byte count, digest, format, or schema version;
- the v3 fixture no longer binds the exact handoff;
- input, count, filter, route, ownership, interaction, or qualification
  assertions drift;
- a producer evidence record with an expiry becomes stale; or
- Realtime Incident Operations stops being live-first/realtime with a visible
  read-only replay degradation.

The current handoff truthfully contains 32 cards, 0 qualified journeys, 20
legacy routes, and 422 matrix gaps. Planned, partial, experimental,
unsupported, lifecycle, fixture, and live states are rendered directly from
the handoff. They are not promoted in site copy.

Run the deterministic validation and build from the repository root:

```bash
node scripts/sdk-gallery-consumer.mjs --check
node --test scripts/sdk-gallery-consumer.test.mjs
./scripts/build-dist.sh
node scripts/sdk-gallery-browser-smoke.mjs --project dist
```

`HONUA_SDK_GALLERY_NOW=<RFC3339>` may set the validation clock in a test only.
Production and CI checks use the real clock so stale producer evidence stops
publication.

## Routes

The build emits:

- `/samples/index.html`, the nine-dimension accessible gallery;
- one stable `/samples/<sample-id>.html` page for every handoff card;
- `/samples/routes.html` and `/samples/site-handoff.v1.json`; and
- every declared legacy redirect or status page.

GitHub Pages cannot return a literal HTTP 308. A legacy route whose handoff
resolution requests 308 therefore publishes a canonical link, an immediate
meta refresh, and a visible fallback link. Non-public fixtures and site
exceptions receive explicit status pages. If deployment moves behind an edge
that supports status-code redirects, the same handoff should generate native
308 rules without changing canonical paths.

## Updating the pin

An update must start from a reviewed SDK commit that contains the complete S3
handoff set. Import the producer JSON bytes unchanged, update
`data/sdk-gallery/source.v1.json` from that exact commit, and run all commands
above. Never edit cards, support labels, routes, evidence, or digests in the
site. If the fixture or interaction contract changes, update the consumer and
tests in the same change before advancing the pin.

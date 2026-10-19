docs: publish the source-pinned 2026.1 customer operating envelope
Adds `deploy-operations-2026-1.html` and its markdown mirror `docs/guides/deploy/2026.1-operating-envelope.md`. Links them from `operations.html` and `docs.html` and adds the page to the sitemap.

Review adjudication (all 4 threads replied to and resolved):
- Table captions/scopes (P1): already fixed in 38e4441; refuted with line evidence.
- Pin the quality-contract revision (P2): fixed. Both refs now point at honua-flow 0c1859e4.
- Commit author identity (P1): refuted. The commit is authored by Mike McDougall <mike@honua.io>.
- Sitemap lastmod (P2): fixed in 2f6649e. Trunk has since replaced the sitemap with a generated one that has no lastmod, and the generated version is kept here.

Merged trunk (22 commits). Conflicts were resolved in favor of trunk's generated artifacts (sdk-availability.v1.json, client-compatibility.html matrix, docs/geoprocessing/index.html, sitemap.xml). Then `scripts/prepare-marketing-pages.mjs` was re-run so the new page is in the generated sitemap.

Verification: all pages.yml validate steps pass locally except `validate-site-claims.mjs`. It fails on npm drift: @honua/sdk-js and @honua/sdk-esri-compat 0.2.4 are now published, and trunk's snapshot says 0.2.3. The data file is identical to trunk, so trunk has the same failure. It needs a separate SDK-availability refresh.

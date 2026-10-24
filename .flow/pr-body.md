docs: correct clean-room setup prerequisites and operations links
Trunk #293 (b4cb9a2) has since replaced the bare `docker compose up -d` fast lane with the image-based `scripts/docker/quickstart.py` lane and moved the geoprocessing Admin API gap link to open site#235. This branch now merges trunk and takes trunk's quickstart block. The earlier "source build / GitHub Packages build secret" text is dropped because the canonical honua-server quickstart no longer needs a checkout, a compiler, or registry credentials.

Remaining changes on top of trunk:
- docs.html: the beginner route card now describes what the quickstart actually does: one container beside PostGIS and Redis, publish a bundled table, query it back with the Python SDK. It previously said it imports GeoJSON, which the quickstart no longer does.
- docs.html: a new note points own-data GeoJSON uploads at "Your first dataset" (https://honua.gitbook.io/honuaio/get-started/first-dataset, HTTP 200).
- operations.html: the "Open the operations docs" CTA now goes to the Operating Honua guide (https://honua.gitbook.io/honuaio/guides/operate, HTTP 200). Before, it looped back to docs.html. The earlier `guides/deploy-and-operate` slug returned 404.

Review: the only thread (Codex P2, docs.html div balance) was refuted and resolved. It still holds after the merge: a full tag-stack parse of docs.html and operations.html finds no mismatched or unclosed tags.

Validation (native Windows, Node 24.7.0):
- node scripts/validate-internal-links.mjs: passed, 155 pages
- node --test scripts/docs-navigation.test.mjs scripts/marketing-metadata.test.mjs: 8/8 pass
- node scripts/gen-slice-pages.mjs --check: 10 generated files match
- node scripts/validate-site-claims.mjs: fails on @honua/sdk-js / sdk-esri-compat 0.2.4 registry drift. It fails identically on origin/trunk, and this PR touches no SDK data.

This PR changes documentation only.

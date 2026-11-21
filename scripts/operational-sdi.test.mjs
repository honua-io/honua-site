import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'operational-sdi.html'), 'utf8');
const capabilities = JSON.parse(readFileSync(join(root, 'data', 'capabilities.v1.json'), 'utf8')).capabilities;
const byKey = new Map(capabilities.map((c) => [c.key, c]));

test('operational-sdi.html maps every cited capability key accurately to data/capabilities.v1.json and its evidence page', () => {
  const capRows = [...html.matchAll(/<tr data-capability-key="([^"]+)">([\s\S]*?)<\/tr>/g)];
  assert.ok(capRows.length >= 12, `expected at least 12 mapped capability rows, found ${capRows.length}`);

  for (const [, primaryKey, rowBody] of capRows) {
    const statusMatch = rowBody.match(/<td>([^<]+)<\/td>/);
    assert.ok(statusMatch, `row for ${primaryKey} missing status cell`);
    const statusLabel = statusMatch[1].trim();
    const rowKeys = [...rowBody.matchAll(/<code>([a-z]+\.[a-z0-9-]+)<\/code>/g)].map((m) => m[1]);
    assert.ok(rowKeys.includes(primaryKey), `row primary key ${primaryKey} must appear in <code>`);

    for (const key of rowKeys) {
      const cap = byKey.get(key);
      assert.ok(cap, `unknown capability key cited on operational-sdi.html: ${key}`);

      const expectedEvidence = `evidence-${key.replaceAll('.', '-')}.html`;
      assert.ok(rowBody.includes(`href="${expectedEvidence}"`), `row for ${key} must link to ${expectedEvidence}`);
      assert.ok(existsSync(join(root, expectedEvidence)), `missing linked evidence page: ${expectedEvidence}`);

      if (statusLabel === 'Implemented') {
        assert.equal(
          cap.status,
          'source-backed',
          `capability ${key} has status=${cap.status} and must not be labelled plain Implemented`
        );
      }
      if (cap.status === 'proof-pending') {
        assert.notEqual(statusLabel, 'Implemented', `proof-pending key ${key} cannot be labelled Implemented`);
      }
      if (key === 'serve.sensorthings') {
        assert.match(statusLabel, /Preview/i, 'serve.sensorthings must carry Preview disclosure');
      }
    }
  }
});

test('operational-sdi.html keeps roadmap items explicitly labelled Not yet and stays vendor-neutral', () => {
  const roadmapRows = [...html.matchAll(/<tr data-roadmap="true">[\s\S]*?<\/tr>/g)].map((m) => m[0]);
  assert.ok(roadmapRows.length >= 4, `expected at least 4 explicit roadmap rows, found ${roadmapRows.length}`);
  for (const row of roadmapRows) {
    assert.match(row, /Not yet/, 'every roadmap row must be explicitly labelled Not yet');
  }

  assert.match(html, /honua-server\/issues\/8260/);
  assert.match(html, /honua-server\/issues\/4718/);
  assert.match(html, /honua-server\/issues\/8271/);

  // Keep public positioning vendor-neutral and free of price figures.
  assert.doesNotMatch(html, /\b(?:CARTO|Portolan|Esri|ArcGIS)\b/i);
  assert.doesNotMatch(html, /\$\d/);
});

test('operational-sdi.html meets site metadata, accessibility, and sitemap requirements', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/honua\.io\/operational-sdi\.html" \/>/);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /<main id="main-content" tabindex="-1">/);

  const tables = [...html.matchAll(/<table\b/gi)].length;
  const captions = [...html.matchAll(/<caption\b/gi)].length;
  assert.equal(tables, 2);
  assert.equal(captions, 2);

  const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
  assert.ok(sitemap.includes('https://honua.io/operational-sdi.html'), 'sitemap.xml must include operational-sdi.html');
});

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { pausedPages, writePausedNotices } from './paused-pages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('No published page links to a paused page and the sitemap omits them', () => {
  const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
  for (const paused of pausedPages) {
    assert.ok(!sitemap.includes(`/${paused}<`), `sitemap omits ${paused}`);
    for (const name of readdirSync(root).filter(n => n.endsWith('.html') && !pausedPages.includes(n))) {
      assert.ok(!readFileSync(join(root, name), 'utf8').includes(`href="${paused}`), `${name} does not link ${paused}`);
    }
  }
});

test('The build replaces each paused page with a notice that is kept out of search', (t) => {
  const directory = mkdtempSync(join(os.tmpdir(), 'honua-paused-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writePausedNotices(directory);
  for (const paused of pausedPages) {
    const notice = readFileSync(join(directory, paused), 'utf8');
    assert.match(notice, /<meta name="robots" content="noindex,follow" \/>/);
    assert.match(notice, /href="design-partners\.html"/);
    assert.doesNotMatch(notice, /data-copy-install|<form/);
  }
});

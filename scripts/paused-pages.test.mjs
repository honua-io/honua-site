import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { pausedPages, pausedSections, withoutPausedSections, writePausedNotices } from './paused-pages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('No published page links to a paused page and the sitemap omits them', () => {
  const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
  for (const paused of pausedPages) {
    assert.ok(!sitemap.includes(`/${paused}<`), `sitemap omits ${paused}`);
    for (const name of readdirSync(root).filter(n => n.endsWith('.html') && !pausedPages.includes(n))) {
      assert.ok(!withoutPausedSections(name, readFileSync(join(root, name), 'utf8')).includes(`href="${paused}`), `${name} does not link ${paused}`);
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

test('A paused section is replaced by a notice under the same id, and nothing published links into it', () => {
  for (const { page, id } of pausedSections) {
    const source = readFileSync(join(root, page), 'utf8');
    const published = withoutPausedSections(page, source);
    assert.match(published, new RegExp(`<section id="${id}"[^>]*>[\\s\\S]*is paused`));
    assert.doesNotMatch(published, /docker compose|HONUA_SERVER_IMAGE/);
    for (const name of readdirSync(root).filter(n => n.endsWith('.html') && !pausedPages.includes(n))) {
      const html = withoutPausedSections(name, readFileSync(join(root, name), 'utf8'));
      assert.ok(!html.includes(`href="${page}#${id}"`), `${name} does not link ${page}#${id}`);
      if (name === page) assert.ok(!html.includes(`href="#${id}"`), `${page} does not link its own paused section`);
    }
  }
});

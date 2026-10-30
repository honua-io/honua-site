import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePage } from './prepare-marketing-pages.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const hero = html.match(/<div class="h-hero-copy">([\s\S]*?)<div class="h-actions">/)?.[1];
const operations = html.match(/<article class="h-promise" id="operate">([\s\S]*?)<\/article>/)?.[1];

test('Homepage connects AI with less day-to-day server work', () => {
  assert.ok(hero);
  assert.ok(hero.includes('use AI to reduce the day-to-day work of running your GIS'));
  assert.ok(hero.includes('Scale compute with demand'));
  assert.match(hero, /The AI-native<br><span>geospatial platform\.<\/span>/);
  assert.ok(hero.includes('Automate migration. Create with AI.'));
  assert.ok(hero.includes('Scale with demand. Operate with confidence.'));
});

test('Operations card leads with reduced work and keeps review and recovery controls', () => {
  assert.ok(operations);
  assert.ok(operations.includes('Spend less time<br>on server operations.'));
  for (const phrase of ['Use AI to help configure services', 'investigate failures',
    'prepare deployments and upgrades', 'Ops Inbox', 'findings and suggested fixes',
    'Review and approve supported changes', 'Git-backed history', 'recovery checks',
    'Recovery depends on the operation, deployment, and schema compatibility.']) {
    assert.ok(operations.includes(phrase), `Missing operations benefit or boundary: ${phrase}`);
  }
  assert.ok(operations.includes('href="blog-safe-operations.html">Explore AI-assisted operations'));
});

test('Operations teaser explains AI assistance without changing the article title or safety boundary', () => {
  assert.ok(html.includes('How AI helps investigate service problems and prepare changes, with approval and recovery checks.'));
  assert.ok(html.includes('<h3>Make change routine—and reversible</h3>'));
  assert.ok(html.includes('Direct editing of source feature data stays outside the AI interface.'));
  assert.ok(html.includes('aria-label="Abstract spatial layers and connected observations"'));
  assert.ok(html.includes('href="install-with-agent.html"'));
  assert.ok(html.includes('href="https://docs.honua.io/"'));
  assert.ok(html.includes('<a class="h-button h-button-secondary" href="#contact"'));
  assert.equal(normalizePage('index.html', html), html);
});

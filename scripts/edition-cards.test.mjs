import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { highlights, renderEditionCards, updateEditionCards } from './gen-edition-cards.mjs';
import { marketingPages, normalizePage, homeCspHash } from './prepare-marketing-pages.mjs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const snapshot = JSON.parse(read('data/capabilities.v1.json'));

test('committed edition cards are generated from the same registry as the full comparison', () => {
  const page = read('editions.html');
  assert.equal(updateEditionCards(page, snapshot), page);
  assert.equal((page.match(/data-capability-key=/g) || []).length, 24);
  assert.doesNotMatch(page, /<table\b|data-capability-registry/);
  for (const [edition, keys] of Object.entries(highlights)) {
    for (const key of keys) {
      const c = snapshot.capabilities.find(c => c.key === key);
      assert.equal(c.edition, edition);
      assert.ok(page.includes(`data-capability-key="${key}"`));
    }
  }
});
test('missing, moved, or duplicate capability keys fail instead of guessing an edition', () => {
  const key = highlights.pro[0];
  assert.throws(() => renderEditionCards({ capabilities: snapshot.capabilities.filter(c => c.key !== key) }), /does not match/);
  assert.throws(() => renderEditionCards({ capabilities: snapshot.capabilities.map(c => c.key === key ? {...c, edition: 'enterprise'} : c) }), /does not match/);
  assert.throws(() => renderEditionCards({ capabilities: [...snapshot.capabilities, snapshot.capabilities[0]] }), /Duplicate/);
});
test('titles follow canonical data and explicit maturity remains visible', () => {
  const changed = structuredClone(snapshot);
  const c = changed.capabilities.find(c => c.key === highlights.pro[0]);
  c.displayName = '<Canonical & name>'; c.releaseStatus = 'experimental';
  const html = renderEditionCards(changed);
  assert.match(html, /&lt;Canonical &amp; name&gt;/);
  assert.match(html, /<span class="h-badge">Experimental<\/span>/);
  assert.doesNotMatch(html, /<Canonical & name>/);
});
test('the full comparison retains controls and legacy overview anchors still resolve', () => {
  const page = read('compare-editions.html');
  for (const id of ['capability-search','capability-edition','capability-category','capability-count','capability-rows','release-posture']) assert.ok(page.includes(`id="${id}"`));
  assert.match(page, /data-capability-registry/);
  assert.match(page, /static capability catalog/);
  assert.match(read('editions.html'), /id="capability-comparison"/);
  assert.match(read('editions.html'), /id="pricing-table"/);
  assert.ok(marketingPages.includes('compare-editions.html'));
  const normalized = normalizePage('compare-editions.html',page);
  assert.equal(normalizePage('compare-editions.html',normalized),normalized);
  assert.match(normalized, /rel="canonical" href="https:\/\/honua.io\/compare-editions.html"/);
});
test('homepage positioning and security contract remain intact', () => {
  assert.match(read('index.html'), /<h1>The AI-native<br><span>geospatial platform\.<\/span><\/h1>/);
  assert.equal(homeCspHash, 'sha256-/kCiB6T7nGhDqQWa4JxjIEm6YhpFufWdxiQYQ4sZQHc=');
  assert.match(read('index.html'), /Automate migration\. Create with AI\./);
  assert.match(read('index.html'), /Scale with demand\. Operate with confidence\./);
});

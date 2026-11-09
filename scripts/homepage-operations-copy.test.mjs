import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePage } from './prepare-marketing-pages.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const hero = html.match(/<div class="h-net-copy">([\s\S]*?)<div class="h-sheet-actions">/)?.[1];
const ledger = html.match(/<section class="h-wrap h-section" id="platform"([\s\S]*?)<div class="h-ledger">/)?.[1];
const operations = html.match(/<article class="h-promise" id="operate">([\s\S]*?)<\/article>/)?.[1];

test('Homepage connects AI with less day-to-day server work', () => {
  assert.ok(hero);
  assert.ok(hero.includes('Bring services, data, and code forward.'));
  assert.ok(hero.includes('use AI to safely reduce the day-to-day work of running your GIS.'));
  assert.ok(hero.includes('<dt>Where it runs</dt><dd>One container · your cloud or on-premises · host, serverless or cluster'));
  assert.ok(html.includes('<small class="h-sheet-sub">Send one service URL&nbsp;· see it running on Honua'));
  assert.ok(ledger);
  // The platform section keeps its own heading; the hero's promise and lede are not repeated under it.
  assert.ok(ledger.includes('Keep your options open and move the whole system forward.'));
  assert.ok(!ledger.includes('reduce the day-to-day work of running your GIS'));
  assert.ok(!ledger.includes('Scale compute with demand'));
  assert.ok(!ledger.includes('Automate migration. Create with AI.'));
  assert.ok(!ledger.includes('Scale with demand. Operate with confidence.'));
});

test('Operations row leads with reduced work and keeps review and recovery controls', () => {
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
  assert.ok(html.includes('href="install-with-agent.html"'));
  assert.ok(html.includes('href="https://docs.honua.io/"'));
  assert.ok(html.includes('<a class="h-button" href="design-partners.html" data-analytics-event="cta_click" data-analytics-label="home_design_partner"'));
  assert.equal(normalizePage('index.html', html), html);
});

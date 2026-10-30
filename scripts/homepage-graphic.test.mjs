import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const homepage = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const graphic = homepage.match(/<div class="h-stack">([\s\S]*?)<\/section>/)?.[1];

test('Homepage graphic omits the decorative range and illustration caption', () => {
  assert.ok(graphic, 'Homepage graphic must remain present');
  assert.doesNotMatch(graphic, /01[—–-]04|Conceptual illustration|class="h-figure-note"/);
});

test('Homepage graphic retains its content, accessible image description, and architecture link', () => {
  for (const label of ['ONE SPATIAL FOUNDATION', 'People', 'Applications', 'AI agents',
    'DISCOVER', 'COMPOSE', 'PUBLISH', 'Shared spatial capabilities', 'Policy &amp; operations',
    'SERVERLESS', 'CLUSTERS', 'BATCH']) {
    assert.ok(graphic.includes(label), `Missing graphic label: ${label}`);
  }
  assert.match(graphic, /role="img" aria-label="Abstract spatial layers and connected observations"/);
  assert.match(graphic, /class="h-figure-link" href="architecture\.html"/);
  // The decorative marker must not inherit the removed range's span:last-child alignment.
  assert.match(graphic, /<i class="h-dot" aria-hidden="true"><\/i> ONE SPATIAL FOUNDATION/);
});

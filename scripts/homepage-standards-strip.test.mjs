import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const strip = html.match(/<nav class="h-ties-strip" aria-label="Protocols">[\s\S]*?<\/nav>/)?.[0];

test('Homepage strip represents spatial services, data formats, and modern APIs', () => {
  assert.ok(strip, 'The homepage protocol strip is present');
  for (const family of ['GeoServices REST', 'OGC API', 'WMS · WFS', 'STAC', 'OData', 'gRPC · gRPC-Web', 'MCP', 'Cloud-native formats']) {
    assert.ok(strip.includes(`<span>${family}</span>`), `Missing representative family: ${family}`);
  }
  assert.ok(!strip.includes('CONNECT WHAT YOU ALREADY USE'));
  // Every protocol entry carries the registry's evidence word or names what it is, never an invented maturity.
  for (const small of [...strip.matchAll(/<small>([^<]+)<\/small>/g)].map(m => m[1])) {
    assert.ok(['source-backed', 'partial', 'SDK transport', 'live code'].includes(small), small);
  }
});

test('The representative strip links the evidence pages, the formats section, and the complete capabilities page', () => {
  assert.match(strip, /href="capabilities\.html">All capabilities/);
  assert.match(strip, /href="capabilities\.html#formats"/);
  for (const page of ['evidence-serve-geoservices-root.html', 'evidence-serve-ogc-api-features.html', 'evidence-serve-odata.html', 'evidence-serve-stac.html', 'evidence-ai-mcp-discovery.html']) {
    assert.ok(strip.includes(`href="${page}"`), `strip links ${page}`);
  }
  assert.ok(html.includes('href="install-with-agent.html"'));
  assert.ok(html.includes('href="https://docs.honua.io/"'));
});

test('The datasheet offers the pilot, the agent install, and a live demo', () => {
  const sheet = html.match(/<div class="h-sheet">[\s\S]*?<\/div><p class="h-sheet-foot">[\s\S]*?<\/p><\/div>/)?.[0];
  assert.ok(sheet, 'datasheet present');
  assert.match(sheet, /<a class="h-button" href="#contact" data-analytics-event="cta_click" data-analytics-label="home_talk" data-analytics-destination="index\.html#contact">Scope a migration pilot/);
  assert.match(sheet, /<a class="h-button h-button-secondary" href="install-with-agent\.html" data-analytics-event="cta_click" data-analytics-label="home_start" data-analytics-destination="install-with-agent\.html">Install with an agent/);
  assert.match(sheet, /<a href="demos\.html" data-analytics-event="cta_click" data-analytics-label="home_try_live" data-analytics-destination="demos\.html">Try it live/);
});

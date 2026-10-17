import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const strip = html.match(/<div class="h-protocol-strip">[\s\S]*?<\/div><\/div>/)?.[0];

test('Homepage strip represents spatial services, data formats, and modern APIs', () => {
  assert.ok(strip, 'The homepage standards strip is present');
  assert.ok(strip.includes('STANDARDS, APIs &amp; DATA FORMATS'));
  for (const family of ['GeoServices REST', 'OGC APIs &amp; web services', 'STAC', 'OData', 'gRPC', 'MCP', 'Cloud-native formats']) {
    assert.ok(strip.includes(family), `Missing representative family: ${family}`);
  }
  assert.ok(!strip.includes('CONNECT WHAT YOU ALREADY USE'));
});

test('The representative strip links to the complete capabilities page', () => {
  assert.match(strip, /href="capabilities\.html">Explore capabilities/);
  assert.ok(html.includes('href="install-with-agent.html"'));
  assert.ok(html.includes('href="https://docs.honua.io/"'));
  assert.match(html, /The AI-native<br><span>spatial platform\.<\/span>/);
});

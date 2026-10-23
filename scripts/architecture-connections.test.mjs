import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const page = read('architecture.html');
const providers = JSON.parse(read('data/capability-navigation.v1.json')).providers;
const interfaces = ['GeoServices REST', 'OGC APIs', 'OGC web services', 'OData', 'STAC', 'Tiles', 'gRPC', 'MCP'];
const article = name => {
  const match = page.match(new RegExp('<article class="arch-layer-card ' + name + '">[\\s\\S]*?<\\/article>'));
  assert.ok(match, name);
  return match[0];
};
const labels = source => [...source.matchAll(/<span>([^<]+)<\/span>/g)].map(m => m[1]);

test('The named desktop client is confined to the existing-tools card', () => {
  const clients = article('arch-layer-clients');
  assert.deepEqual(labels(clients), ['ArcGIS Pro', 'QGIS', 'Web apps', 'SDKs', 'MCP agents']);
  assert.equal(page.match(/ArcGIS Pro/g)?.length, 1);
  assert.doesNotMatch(clients, /Desktop GIS clients/);
});

test('Both architecture views give unrelated interfaces independent boxes', () => {
  assert.deepEqual(labels(article('arch-layer-runtime')), interfaces);
  const conceptual = page.match(/<div class="h-protocols">([\s\S]*?)<\/div>/);
  assert.ok(conceptual);
  assert.deepEqual(labels(conceptual[1]), interfaces);
  assert.doesNotMatch(page, /gRPC\s*[/·]\s*MCP|MCP\s*[/·]\s*gRPC|OData\s*[/·]\s*STAC/);
});

test('Database choices match the capability catalog and preserve access and maturity', () => {
  const data = article('arch-layer-data');
  const shown = [...data.matchAll(/data-database-provider="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(shown.slice().sort(), providers.map(p => p.title).sort());
  const groups = [...data.matchAll(/<section class="arch-source-group"[^>]*>([\s\S]*?)<\/section>/g)].map(m => m[1]);
  assert.equal(groups.length, 3);
  for (const provider of providers) {
    const group = groups.find(g => g.includes(`data-database-provider="${provider.title}"`));
    assert.ok(group, provider.title);
    assert.equal(group.includes('<small>Experimental</small>'), provider.status === 'Experimental');
    assert.equal(group.includes('<h4>Full read/write</h4>'), provider.access === 'Full read/write');
  }
  assert.match(data, /existing table without copying its data/);
  assert.match(data, /href="capabilities.html#databases"/);
  assert.ok(data.indexOf('arch-supporting-state') > data.lastIndexOf('data-database-provider'));
});

test('Database choices stay visible and supporting infrastructure stays separate', () => {
  const data = article('arch-layer-data');
  assert.doesNotMatch(data, /<(?:select|details)\b/);
  const supporting = data.match(/<div class="arch-supporting-state">([\s\S]*)/);
  assert.ok(supporting);
  assert.deepEqual(labels(supporting[1]), ['Object storage', 'Redis · multi-node', 'OpenTelemetry backend']);
  assert.doesNotMatch(supporting[1], /data-database-provider/);
  const css = read('assets/architecture-explorer.css');
  assert.match(css, /#overview \.arch-layer-data\s*\{\s*grid-column: 1 \/ -1;/);
  assert.match(css, /@media \(max-width: 760px\)\s*\{\s*#overview \.arch-runtime-grid, #overview \.arch-source-groups\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/);
});

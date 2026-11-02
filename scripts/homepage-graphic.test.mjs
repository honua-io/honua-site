import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const homepage = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const graphic = homepage.match(/<figure class="h-net" data-control-net[\s\S]*?<\/figure>/)?.[0];

test('Homepage graphic is the control network, labelled for assistive technology', () => {
  assert.ok(graphic, 'Homepage control network must remain present');
  assert.match(graphic, /<svg[^>]*role="group" aria-label="Five kinds of client, each connected to Honua Server[^"]*"/);
  assert.match(graphic, /<figcaption class="h-net-head" id="net-caption">/);
  assert.match(graphic, /<p class="h-net-readout" data-net-readout aria-live="polite">/);
  assert.doesNotMatch(graphic, /Conceptual illustration|class="h-figure-note"/);
});

test('Every station names a client in use today and links to evidence that exists', () => {
  const stations = [...graphic.matchAll(/<a class="h-station" href="([^"]+)"[^>]*data-label="([^"]+)"[^>]*data-protocol="([^"]+)"[^>]*data-status="([^"]+)"[^>]*data-evidence="([^"]+)"/g)];
  assert.equal(stations.length, 5, 'five stations tie into the monument');
  for (const [, href, label, protocol, status, evidence] of stations) {
    assert.ok(label && protocol && status, `station ${label} carries protocol and status`);
    for (const target of [href, evidence]) assert.ok(existsSync(new URL(`../${target}`, import.meta.url)), `${label}: ${target} must exist`);
  }
  const labels = stations.map(s => s[2]);
  for (const client of ['Desktop GIS clients', 'QGIS', 'Power BI', 'AI agents', 'Honua SDKs']) assert.ok(labels.some(l => l.includes(client)), `station for ${client}`);
  assert.equal([...graphic.matchAll(/<line class="h-tie /g)].length, 5, 'one baseline per station');
  assert.match(graphic, /<g class="h-monument"[^>]*>[\s\S]*Honua Server/);
});

test('No station names an Esri product; compatibility is stated as the GeoServices REST protocol', () => {
  assert.doesNotMatch(graphic, /ArcGIS|Esri|Field Maps/);
  assert.match(graphic, /data-label="Desktop GIS clients"[^>]*data-protocol="GeoServices REST"/);
});

test('Station status words come from the capability registry, never invented maturity labels', () => {
  const statuses = [...graphic.matchAll(/data-status="([^"]+)"/g)].map(m => m[1]);
  for (const status of statuses) assert.ok(['source-backed', 'partial', 'live demo', 'documented'].includes(status), status);
  assert.doesNotMatch(graphic, /\bGA\b|General availability/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('Company page identifies the entity and provides founder-owned fields', () => {
  const html = read('about.html');
  assert.match(html, /<title>About Honua \| Honua<\/title>/);
  assert.match(html, /<h1>About Honua<\/h1>/);
  assert.match(html, /Honua Geo Inc\./);
  for (const field of ['Jurisdiction', 'Postal address', 'Team', 'Backing']) {
    assert.match(html, new RegExp(`<dt>${field}</dt><dd>[^<]+</dd>`), field);
  }
  assert.match(html, /<dt>Jurisdiction<\/dt><dd>Delaware corporation<\/dd>/);
  assert.match(html, /<dt>Team<\/dt><dd>Founded by Mike McDougall\.<\/dd>/);
  assert.match(html, /id="release-readiness"/);
  assert.match(html, /href="blog-2026-1-release-candidate.html"/);
});

test('Company continuity statement follows the current repository licence', () => {
  const html = read('about.html');
  assert.match(html, /Fair Core License \(FCL-1\.0-ALv2\)/);
  assert.match(html, /second anniversary/);
  assert.match(html, /license key/);
  assert.match(html, /href="https:\/\/github.com\/honua-io\/honua-server\/blob\/trunk\/LICENSE"/);
});

test('Privacy notice names the controller, postal address and contact route', () => {
  const html = read('privacy.html');
  assert.match(html, /<section id="controller">/);
  assert.match(html, /Honua Geo Inc\. is the data controller/);
  assert.match(html, /Postal address: [^<]+<\/p>/);
  assert.match(html, /href="#controller"/);
  assert.match(html, /mailto:info@honua.io\?subject=Privacy%20request/);
});

test('Primary marketing and company navigation exposes About without JavaScript', () => {
  for (const name of readdirSync(new URL('../', import.meta.url)).filter(name => name.endsWith('.html'))) {
    const html = read(name);
    if (!/<body\b[^>]*class="[^"]*\bh-site\b/.test(html) || !html.includes('id="primary-navigation"')) continue;
    const nav = html.match(/<nav\b[^>]*id="primary-navigation"[^>]*>[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav?.includes('href="about.html"'), name);
  }
});

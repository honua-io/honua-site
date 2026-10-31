import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePage } from './prepare-marketing-pages.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const title = 'The AI-native geospatial platform | Honua';

test('Homepage headline, positioning and page/social titles use geospatial consistently', () => {
  assert.match(html, /<h1 id="hero-title">Every client you run, <em>tied to one server\.<\/em><\/h1>/);
  assert.ok(html.includes('<dt>Designation</dt><dd>The AI-native geospatial platform</dd>'));
  assert.ok(html.includes(`<title>${title}</title>`));
  assert.ok(html.includes(`<meta property="og:title" content="${title}" />`));
  assert.ok(html.includes(`<meta name="twitter:title" content="${title}" />`));
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.doesNotMatch(html, /The AI-native spatial platform/);
  assert.equal(normalizePage('index.html', html), html);
});

test('Headline terminology does not rewrite supporting copy or the diagram', () => {
  assert.ok(html.includes('Automate migration. Create with AI.'));
  assert.ok(html.includes('Scale with demand. Operate with confidence.'));
  assert.ok(html.includes('Bring services, data, and code forward. Build maps and spatial applications.'));
  assert.ok(html.includes('Control network</b> · datum: Honua Server'));
  assert.ok(html.includes('aria-label="Seven clients drawn as survey stations'));
  assert.ok(html.includes('href="install-with-agent.html"'));
  assert.ok(html.includes('href="https://docs.honua.io/"'));
});

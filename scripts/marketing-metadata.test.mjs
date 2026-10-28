import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { homeCspHash, homeJsonLd, marketingPages, normalizePage, prepare, pricingRedirect } from './prepare-marketing-pages.mjs';

const input = '<!doctype html><html lang="en"><head><title>Honua &amp; spatial work</title></head><body class="h-site"><a class="h-skip" href="#main-content">Skip</a><main id="main-content"><h1>Spatial work</h1></main></body></html>';

test('Marketing metadata is deterministic, accessible, and complete', () => {
  for (const name of marketingPages) {
    const html = normalizePage(name, input);
    assert.equal(normalizePage(name, html), html, `${name}: not idempotent`);
    assert.match(html, /class="skip-link"/);
    assert.match(html, /href="assets\/fonts\/geist-latin.woff2"/);
    assert.match(html, /href="assets\/fonts\/geist-mono-latin.woff2"/);
    const description = html.match(/name="description" content="([^"]+)" \/>/)[1];
    assert.ok(description.length <= 160);
    const canonical = name === 'index.html' ? 'https://honua.io/' : `https://honua.io/${name}`;
    assert.ok(html.includes(`rel="canonical" href="${canonical}" />`));
    for (const key of ['og:title','og:description','og:image','og:image:alt','og:image:width','og:image:height','twitter:card','twitter:title','twitter:description','twitter:image','twitter:image:alt']) assert.ok(html.includes(`="${key}"`), key);
    assert.doesNotMatch(html, /frame-ancestors|fonts\.googleapis/);
    assert.match(html, /form-action 'self' https:\/\/formsubmit.co/);
  }
});

test('Home structured data stays bound to the existing edge CSP', () => {
  assert.equal(homeCspHash, 'sha256-/kCiB6T7nGhDqQWa4JxjIEm6YhpFufWdxiQYQ4sZQHc=');
  assert.equal(JSON.parse(homeJsonLd)['@graph'][0].name, 'Honua');
  const html = normalizePage('index.html', input);
  const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  assert.ok(html.includes(`'sha256-${createHash('sha256').update(json).digest('base64')}'`));
  assert.ok(html.includes('property="og:url" content="https://honua.io" />'));
});

test('Only explicitly remodeled routes can be normalized', () => {
  assert.throws(() => normalizePage('capabilities.html', input), /Not a marketing route/);
  assert.throws(() => normalizePage('index.html', '<main></main>'), /missing title/);
});

test('Pricing transition is noindex and preserves the old comparison fragment', () => {
  const html = pricingRedirect();
  assert.match(html, /noindex,follow/);
  assert.match(html, /0;url=editions.html/);
  assert.match(html, /id="pricing-table"/);
  assert.match(html, /id="main-content"/);
  assert.doesNotMatch(html, /\$\d/);
});

test('Preparation preserves other pages, regenerates sitemap, and fails closed on CSP mismatch', () => {
  const root = mkdtempSync(join(tmpdir(), 'honua-metadata-'));
  try {
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, '_headers'), `script-src 'self' '${homeCspHash}';`);
    writeFileSync(join(root, 'assets/remodel.css'), '.h-site .h-skip{color:inherit}');
    for (const name of marketingPages) writeFileSync(join(root, name), input);
    writeFileSync(join(root, 'pricing.html'), '<main>old pricing</main>');
    writeFileSync(join(root, 'docs.html'), '<main id="main-content">Existing documentation</main>');
    writeFileSync(join(root, 'thanks.html'), '<meta name="robots" content="noindex"><main>Thanks</main>');
    writeFileSync(join(root, 'demo-test.html'), '<main>Demo</main>');
    assert.throws(() => prepare(root, true), /Prepare marketing metadata first/);
    assert.ok(prepare(root).length > 0);
    assert.deepEqual(prepare(root), []);
    assert.deepEqual(prepare(root, true), []);
    const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
    assert.ok(sitemap.includes('https://honua.io/editions.html'));
    assert.ok(sitemap.includes('https://honua.io/docs.html'));
    assert.doesNotMatch(sitemap, /pricing.html|thanks.html|demo-test.html/);
    assert.equal(readFileSync(join(root, 'docs.html'), 'utf8'), '<main id="main-content">Existing documentation</main>');
    assert.equal(readFileSync(join(root, 'assets/remodel.css'), 'utf8'), '.h-site .skip-link{color:inherit}');
    writeFileSync(join(root, '_headers'), "script-src 'self';");
    assert.throws(() => prepare(root), /edge CSP/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// Value: protects=launch + RC announcement routes stay registered articles whose committed heads are the normalizer output;
// fails_when=an entry leaves marketingPages, og:type is not article, or a head/description is hand-edited without re-running prepare;
// why_new=the existing loop iterates whatever marketingPages holds over synthetic input, so a dropped entry or stale committed head passes;
// seam=none; no_claim=sitemap membership (prepare --check, validate-site-claims) and prose accuracy are checked elsewhere
test('Launch and release-candidate announcements are registered article routes with prepared heads', () => {
  for (const name of ['blog-honua-launch.html', 'blog-2026-1-release-candidate.html']) {
    assert.ok(marketingPages.includes(name), `${name}: missing from marketingPages`);
    const page = readFileSync(new URL('../' + name, import.meta.url), 'utf8');
    assert.equal(normalizePage(name, page), page, `${name}: committed head is not the prepared head`);
    assert.ok(page.includes('<meta property="og:type" content="article" />'), `${name}: og:type must be article`);
    assert.ok(page.includes(`<link rel="canonical" href="https://honua.io/${name}" />`), `${name}: canonical`);
  }
});

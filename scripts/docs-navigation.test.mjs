import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { marketingPages, normalizePage } from './prepare-marketing-pages.mjs';

const root = new URL('../', import.meta.url);
const destination = 'https://docs.honua.io/';

test('Every built marketing navigation links directly to docs.honua.io', () => {
  for (const name of marketingPages) {
    const html = normalizePage(name, readFileSync(new URL(name, root), 'utf8'));
    const primary = html.match(/<nav\b[^>]*\bid="primary-navigation"[^>]*>[\s\S]*?<\/nav>/i)?.[0];
    assert.ok(primary, `${name}: primary navigation exists`);
    assert.ok(primary.includes(`<a href="${destination}">Docs</a>`), `${name}: external Docs link`);
    assert.doesNotMatch(primary, /href="docs\.html"/);
    assert.equal(normalizePage(name, html), html, `${name}: preparation stays idempotent`);
  }
});

test('Changing Docs preserves quickstarts, contextual links, copy, and form targets', () => {
  const body = '<body><nav><a href="docs.html">Docs</a></nav>' +
    '<main id="main-content"><h1>The AI-native spatial platform</h1>' +
    '<a href="docs.html#quickstart">Start building</a>' +
    '<a href="docs.html">Explore migration documentation</a>' +
    '<form action="https://formsubmit.co/info@honua.io" method="POST"></form></main></body>';
  const html = normalizePage('index.html', '<!doctype html><html><head><title>Honua</title></head>' + body + '</html>');
  assert.equal(html.match(/<body>[\s\S]*<\/body>/)[0],
    body.replace('<a href="docs.html">Docs</a>', `<a href="${destination}">Docs</a>`));
});

test('Legacy navigation uses the same Docs destination without changing the contact action', () => {
  function element() {
    const attributes = new Map();
    return {
      dataset: {}, children: [], classList: { add() {}, remove() {}, contains() { return false; } },
      setAttribute(key, value) { attributes.set(key, value); },
      getAttribute(key) { return attributes.get(key); },
      appendChild(child) { this.children.push(child); },
      replaceChildren(fragment) { this.children = [...fragment.children]; },
      addEventListener() {}, focus() {},
    };
  }
  const toggle = element();
  const nav = element();
  const document = {
    readyState: 'complete', documentElement: element(), body: element(),
    querySelector(selector) { return selector === '.nav-toggle' ? toggle : nav; },
    createDocumentFragment: element, createElement: element, addEventListener() {},
  };
  vm.runInNewContext(readFileSync(new URL('assets/nav.js', root), 'utf8'), {
    document, window: { location: { pathname: '/docs.html' }, addEventListener() {} },
  });
  const docs = nav.children.find(link => link.textContent === 'Docs');
  assert.equal(docs.href, destination);
  assert.equal(docs.getAttribute('aria-current'), undefined);
  const contact = nav.children.find(link => link.textContent === 'Talk to us');
  assert.equal(contact.href, 'index.html#contact');
  assert.equal(contact.dataset.analyticsDestination, 'index.html#contact');
  assert.equal(toggle.getAttribute('aria-controls'), 'primary-navigation');
});

test('Primary navigation offers Demos and Samples right after How it works', () => {
  const expected = '<a href="architecture.html">How it works</a><a href="demos.html">Demos</a>' +
    '<a href="https://samples.honua.io/">Samples</a><a href="editions.html"';
  for (const name of marketingPages) {
    const html = readFileSync(new URL(name, root), 'utf8');
    const primary = html.match(/<nav\b[^>]*\bid="primary-navigation"[^>]*>[\s\S]*?<\/nav>/i)?.[0];
    assert.ok(primary.includes(expected), `${name}: Demos and Samples follow How it works`);
  }
});

test('Legacy navigation renders Demos and Samples and marks Demos current on demos.html', () => {
  function element() {
    const attributes = new Map();
    return {
      dataset: {}, children: [], classList: { add() {}, remove() {}, contains() { return false; } },
      setAttribute(key, value) { attributes.set(key, value); },
      getAttribute(key) { return attributes.get(key); },
      appendChild(child) { this.children.push(child); },
      replaceChildren(fragment) { this.children = [...fragment.children]; },
      addEventListener() {}, focus() {},
    };
  }
  const toggle = element();
  const nav = element();
  const document = {
    readyState: 'complete', documentElement: element(), body: element(),
    querySelector(selector) { return selector === '.nav-toggle' ? toggle : nav; },
    createDocumentFragment: element, createElement: element, addEventListener() {},
  };
  vm.runInNewContext(readFileSync(new URL('assets/nav.js', root), 'utf8'), {
    document, window: { location: { pathname: '/demos.html' }, addEventListener() {} },
  });
  assert.deepEqual(nav.children.slice(0, 3).map(link => link.textContent), ['How it works', 'Demos', 'Samples']);
  assert.equal(nav.children[1].getAttribute('aria-current'), 'page');
  assert.equal(nav.children[2].href, 'https://samples.honua.io/');
  assert.equal(nav.children[2].getAttribute('aria-current'), undefined);
});

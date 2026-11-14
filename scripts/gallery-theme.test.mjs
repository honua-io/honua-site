import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { read } from './palette-tokens.mjs';

function gallery(saved, blocked = false) {
  const root = { dataset: {} };
  const button = { hidden: true, attributes: {}, setAttribute(k, v) { this.attributes[k] = v; }, addEventListener(k, fn) { this[k] = fn; } };
  let ready;
  let stored = saved;
  const chrome = {};
  runInNewContext(read('assets/gallery-theme.js'), {
    document: { documentElement: root, addEventListener: (_, fn) => { ready = fn; }, querySelectorAll: () => [button], querySelector: () => chrome },
    localStorage: { getItem() { if (blocked) throw Error('Storage blocked'); return stored; }, setItem(_, value) { if (blocked) throw Error('Storage blocked'); stored = value; } },
    getComputedStyle: () => ({ getPropertyValue: () => root.dataset.theme === 'light' ? '#f7f9f8' : '#08131a' }),
  });
  ready();
  return { root, button, chrome, saved: () => stored };
}

test('gallery defaults to dark and restores only explicit saved themes', () => {
  for (const saved of [null, 'auto', '<invalid>', 'dark']) assert.equal(gallery(saved).root.dataset.theme, 'dark');
  const { root, button, chrome } = gallery('light');
  assert.equal(root.dataset.theme, 'light');
  assert.equal(button.hidden, false);
  assert.equal(button.attributes['aria-pressed'], 'false');
  assert.equal(chrome.content, '#f7f9f8');
});

test('gallery toggle updates the palette, accessible state, browser chrome and saved choice', () => {
  const { root, button, chrome, saved } = gallery(null);
  button.click();
  assert.equal(root.dataset.theme, 'light');
  assert.equal(button.textContent, 'Light mode');
  assert.equal(button.attributes['aria-pressed'], 'false');
  assert.equal(chrome.content, '#f7f9f8');
  assert.equal(saved(), 'light');
  button.click();
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(button.attributes['aria-pressed'], 'true');
  assert.equal(saved(), 'dark');
});

test('gallery remains usable with blocked browser storage', () => {
  const { root, button } = gallery(null, true);
  assert.equal(root.dataset.theme, 'dark');
  button.click();
  assert.equal(root.dataset.theme, 'light');
});

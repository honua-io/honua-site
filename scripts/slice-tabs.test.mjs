import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/slice-tabs.js', import.meta.url), 'utf8');

function element(attributes) {
  const values = new Map(Object.entries(attributes));
  const listeners = new Map();
  return {
    getAttribute: name => values.get(name),
    setAttribute: (name, value) => values.set(name, value),
    addEventListener: (name, handler) => listeners.set(name, handler),
    fire: name => listeners.get(name)?.(),
    hasListener: name => listeners.has(name),
    querySelector: () => null,
    scrollIntoView() {},
  };
}

function fixture(hash) {
  const groups = ['setup', 'use'].map(name => {
    const tabs = ['first', 'second'].map(value => element({
      'data-tab-value': value, 'aria-selected': String(value === 'first'),
    }));
    const panels = ['first', 'second'].map(value => element({ 'data-tab-value': value }));
    const root = element({ 'data-tab-group': name });
    root.querySelectorAll = selector => selector === '[role="tab"]' ? tabs : panels;
    return { root, tabs };
  });
  const copy = element({});
  const listeners = new Map();
  const window = {
    location: { hash },
    localStorage: { getItem: () => null, setItem() {} },
    addEventListener: (name, handler) => listeners.set(name, handler),
  };
  const document = {
    readyState: 'complete',
    querySelectorAll: selector => selector === '[data-tab-group]' ? groups.map(group => group.root) : [copy],
  };
  return { groups, copy, listeners, window, document };
}

for (const hash of ['#setup=%', '#setup=%E0%A4%A', '#use=%', '#use=%E0%A4%A']) {
  test(`Malformed initial fragment ${hash} preserves all controls`, () => {
    const page = fixture(hash);
    assert.doesNotThrow(() => vm.runInNewContext(source, page));
    assert.ok(page.copy.hasListener('click'));
    for (const group of page.groups) {
      group.tabs[1].fire('click');
      assert.equal(group.tabs[1].getAttribute('aria-selected'), 'true');
      assert.equal(group.tabs[0].getAttribute('aria-selected'), 'false');
    }
  });
}

for (const hash of ['#use=%', '#use=%E0%A4%A']) {
  test(`Malformed hashchange ${hash} preserves selection and subsequent navigation`, () => {
    const page = fixture('');
    vm.runInNewContext(source, page);
    page.window.location.hash = hash;
    assert.doesNotThrow(() => page.listeners.get('hashchange')());
    assert.equal(page.groups[1].tabs[0].getAttribute('aria-selected'), 'true');
    page.window.location.hash = '#use=%73econd';
    page.listeners.get('hashchange')();
    assert.equal(page.groups[1].tabs[1].getAttribute('aria-selected'), 'true');
  });
}

for (const hash of ['#use=%73econd', '#second']) {
  test(`Valid fragment ${hash} selects its target`, () => {
    const page = fixture(hash);
    vm.runInNewContext(source, page);
    assert.equal(page.groups[1].tabs[1].getAttribute('aria-selected'), 'true');
    assert.ok(page.copy.hasListener('click'));
  });
}

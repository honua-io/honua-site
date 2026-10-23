import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const theme = read('assets/theme.css');
const tokens = Object.fromEntries([...theme.matchAll(/(--honua-[a-z0-9-]+):\s*(#[0-9a-f]{6});/g)].map(m => [m[1], m[2]]));
const luminance = hex => {
  const channels = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

test('Focused skip links use a dark foreground on the shared accent backgrounds', () => {
  assert.match(theme, /body \.skip-link\s*\{\s*color: var\(--honua-on-accent\);\s*\}/);
  for (const background of ['--honua-amber-bright', '--honua-teal', '--honua-teal-bright']) {
    assert.ok(contrast(tokens['--honua-on-accent'], tokens[background]) >= 4.5, background);
  }
  const audit = read('scripts/capture-palette-review.mjs');
  assert.ok(audit.includes('Focused skip-link contrast'));
  assert.ok(audit.includes('docs/geoprocessing/index.html'));
});

test('The infrastructure band uses print-aware text and an explicit paper background', () => {
  assert.match(theme, /@media print\s*\{[\s\S]*\.h-site \.h-control\s*\{\s*background: #fff; color: var\(--h-ink\);\s*\}/);
  assert.match(theme, /\.h-site \.h-control h2 em\s*\{\s*color: var\(--h-ink\);\s*\}/);
  assert.match(theme, /\.h-site \.h-control-bottom > p\s*\{\s*color: var\(--h-muted\);\s*\}/);
  assert.match(read('assets/remodel.css'), /@media print\{\.h-site\{[^}]*--h-muted:#444[^}]*--h-ink:#111/);
  assert.ok(read('scripts/capture-palette-review.mjs').includes('Print foreground contrast'));
});

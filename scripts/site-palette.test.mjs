import test from 'node:test';
import assert from 'node:assert/strict';
import { read, palette } from './palette-tokens.mjs';
const { tokensCss, theme, resolve } = palette('dark');
const tokens = new Proxy({}, { get: (_, name) => resolve(name) });
const luminance=h=>{const c=h.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
test('All site design systems load one shared AI GIS palette',()=>{
  assert.match(tokensCss, /\/\* dark \*\/\s*:root,\s*:root\[data-theme="dark"\]/);
  assert.match(tokensCss, /\/\* light \*\/\s*:root\[data-theme="light"\]/);
  assert.doesNotMatch(theme, /--[a-z0-9-]+\s*:\s*#/);
  const dark={
    '--honua-bg':'#08131a','--honua-surface':'#0e1e27','--honua-surface-2':'#162a34','--honua-surface-3':'#1f3a47',
    '--honua-line':'#22343f','--honua-line-soft':'#172730','--honua-text':'#e6efee','--honua-muted':'#8ea7a6','--honua-faint':'#8ea7a6',
    '--honua-teal':'#3aa088','--honua-teal-bright':'#5fc4a6','--honua-blue':'#5fa1cc','--honua-blue-bright':'#85c9f4','--honua-blue-deep':'#3a7aa0',
    '--honua-amber':'#d9824a','--honua-amber-bright':'#f2aa78','--honua-cream':'#e6efee','--honua-danger':'#f29c95','--honua-on-accent':'#04151a'
  };
  for(const [name,hex] of Object.entries(dark)) assert.equal(tokens[name],hex,name);
  assert.equal(resolve('--c-border-strong'),'#5f7a87');assert.equal(resolve('--c-link'),'#5fc4a6');assert.equal(resolve('--c-focus'),'#5fc4a6');
  assert.equal(resolve('--c-accent-hover'),'#7fd3b9');assert.equal(resolve('--radius-sm'),'4px');assert.match(resolve('--font-sans'),/^"Geist"/);
  assert.equal(palette('light').resolve('--c-bg'), '#f7f9f8');
  assert.notEqual(palette('light').resolve('--c-bg'), tokens['--honua-bg']);
  for(const [file,path] of [['styles.css','assets/theme.css'],['assets/remodel.css','theme.css'],['assets/learning-hub.css','theme.css']]) assert.ok(read(file).startsWith(`@import url("${path}");`),file);
  assert.match(theme,/--bed-bg: var\(--honua-bg\)/);
  assert.match(read('assets/remodel.css'),/--h-bg:var\(--honua-bg\)/);
  assert.match(read('assets/learning-hub.css'),/--paper: var\(--honua-bg\)/);
});
test('Primary and muted text, links and solid actions retain readable contrast',()=>{
  for(const surface of ['bg','surface','surface-2']) {
    for(const text of ['text','muted','teal-bright','blue','amber-bright']) assert.ok(contrast(tokens['--honua-'+text],tokens['--honua-'+surface])>=4.5,`${text} on ${surface}`);
  }
  assert.ok(contrast(tokens['--honua-on-accent'],tokens['--honua-teal'])>=4.5);
  assert.ok(contrast(tokens['--honua-teal'],tokens['--honua-bg'])>=3);
});
test('Product styling no longer has lime or forest surface overrides',()=>{
  for(const file of ['assets/remodel.css','assets/capability-hub.css','assets/architecture-explorer.css','assets/learning-hub.css','assets/editions.css']) assert.doesNotMatch(read(file),/#(?:c4ee9d|d6f4bb|c4e1bd|b7e36f|0c1b1b|f1f3eb)\b/i,file);
  assert.match(read('assets/editions.css'),/color:var\(--honua-on-accent\)/);
  assert.match(read('assets/capability-hub.css'),/\.hub-db\{[^}]*background:var\(--honua-bg\)/);
});
test('Learning-page browser chrome and reusable browser audit match the theme',()=>{
  for(const path of ['docs.html','demos.html']) assert.ok(read(path).includes('name="theme-color" content="#08131a"'),path);
  assert.ok(read('scripts/slice-template.mjs').includes('name="theme-color" content="#08131a"'));
  assert.ok(read('scripts/capture-palette-review.mjs').includes('action.ratio>=4.5'));
});

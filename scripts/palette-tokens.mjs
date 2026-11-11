import { readFileSync } from 'node:fs';

export const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

function declarations(body) {
  return [...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]);
}

function block(css, marker) {
  const at = css.indexOf(marker);
  if (at < 0) throw new Error(`missing ${marker}`);
  const start = css.indexOf('{', at);
  const end = css.indexOf('}', start);
  return css.slice(start + 1, end);
}

export function palette(mode) {
  const tokensCss = read('assets/tokens.css');
  const theme = read('assets/theme.css');
  const map = new Map();
  for (const layer of [block(tokensCss, '/* shared */'), block(tokensCss, mode === 'light' ? '/* light */' : '/* dark */'), block(theme, '/* aliases */')]) {
    for (const [name, value] of declarations(layer)) map.set(name, value);
  }
  const resolve = name => {
    let value = map.get(name);
    for (let hop = 0; hop < 8 && value?.startsWith('var(--'); hop++) value = map.get(value.slice(4, value.indexOf(')')));
    return value;
  };
  return { tokensCss, theme, resolve };
}

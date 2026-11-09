import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const theme=read('assets/theme.css');
const semantic=read('assets/tokens.css');
const declarations=Object.fromEntries([...(semantic+theme).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(m=>[m[1],m[2].trim()]));
const resolve=(name,seen=new Set())=>{
  assert.ok(!seen.has(name), `Token cycle: ${name}`);
  seen.add(name);
  const value=declarations[name];
  assert.ok(value, `Missing token: ${name}`);
  const alias=/^var\((--[a-z0-9-]+)\)$/.exec(value);
  return alias?resolve(alias[1],seen):value;
};
export const tokens=Object.fromEntries(Object.keys(declarations).map(name=>[name,resolve(name)]));

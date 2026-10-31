import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { components, renderPlatformComponents } from './platform-components.mjs';
import { renderHub } from './capability-hub-render.mjs';
import { normalizePage } from './prepare-marketing-pages.mjs';
const read = name => readFileSync(new URL('../'+name, import.meta.url),'utf8');
const snapshot=JSON.parse(read('data/capabilities.v1.json'));
test('Capabilities presents six platform components independently of runtime entitlements',()=>{
  assert.deepEqual(components.map(c=>c.id),['server','console','sdks','agents','mobile','collect']);
  const before=JSON.stringify(snapshot), html=renderHub(snapshot);
  assert.ok(html.includes(renderPlatformComponents()));
  assert.equal(JSON.stringify(snapshot),before);
  assert.ok(html.indexOf('id="components"')<html.indexOf('id="workflows"'));
  assert.equal((html.match(/data-platform-component=/g)||[]).length,6);
  assert.doesNotMatch(renderPlatformComponents(),/data-capability-key|named.user fee|\$\d|licensing disabled/);
  for(const name of ['JavaScript / TypeScript','.NET','Python','Console &amp; Studio','Mobile SDK','Honua Collect']) assert.ok(html.includes(name),name);
});
test('Mobile SDK and Collect have distinct roles and explicit experimental status',()=>{
  for(const id of ['mobile','collect']) assert.equal(components.find(c=>c.id===id).status,'Experimental');
  assert.match(components.find(c=>c.id==='mobile').description,/libraries/);
  assert.match(components.find(c=>c.id==='collect').description,/app built on the Mobile SDK/);
  assert.match(components.find(c=>c.id==='collect').note,/not a GA field app/);
  assert.match(components.find(c=>c.id==='console').note,/part of Console/);
});
test('Component search joins existing workflows, protocols, providers, and formats',()=>{
  const js=read('assets/capability-hub.js');
  for(const id of ['components','workflows','standards','databases','formats']) assert.ok(js.includes('#'+id+' [data-hub-card]'),id);
  assert.match(renderHub(snapshot),/href="#components">Platform/);
  assert.match(renderHub(snapshot),/Search components, functionality/);
});
test('How it works leads with four workflows and preserves the technical explorer',()=>{
  const html=read('architecture.html');
  assert.equal((html.match(/data-platform-journey=/g)||[]).length,4);
  assert.ok(html.indexOf('id="platform-workflows"')<html.indexOf('class="arch-tabs"'));
  for(const id of ['concept','overview','deployment','esri','ops','aws','azure']) assert.ok(html.includes('id="'+id+'"'),id);
  for(const token of ['data-trace-request','data-stepper','data-runtime-option','PostGIS','Mobile SDK','Collect','SDKs','Preflight']) assert.ok(html.includes(token),token);
  assert.doesNotMatch(html,/https:\/\/docs\.honua\.io\/server\/concepts\/architecture-diagrams/);
  assert.ok(html.includes('https://github.com/honua-io/honua-server/blob/trunk/docs/concepts/architecture-diagrams.md'));
  assert.equal(normalizePage('architecture.html',html),html);
  for(const page of ['architecture.html','capabilities.html']) assert.ok(read(page).includes('assets/platform-guide.css'));
});
test('Homepage pairs less operations work with visible safety and retained controls',()=>{
  const html=read('index.html'), ops=html.match(/<article class="h-promise" id="operate">[\s\S]*?<\/article>/)[0];
  for(const text of ['Spend less time<br>on server operations.','Make changes with confidence.','Review and approve supported changes','preflight and recovery checks','Git-backed history','rollback where supported','schema compatibility']) assert.ok(ops.includes(text),text);
  assert.ok(html.includes('<h1 id="hero-title">The AI-native<br><em>geospatial platform.</em></h1>'));
  assert.ok(html.includes('use AI to reduce the day-to-day work of running your GIS'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assignGroups, scopeLabel, renderHub, presentation } from './capability-hub-render.mjs';
import { normalizePage } from './prepare-marketing-pages.mjs';
const read = name => readFileSync(new URL('../'+name, import.meta.url),'utf8');
const snapshot = JSON.parse(read('data/capabilities.v1.json'));
test('Hub navigation groups canonical capabilities without changing assignments', () => {
  const before=JSON.stringify(snapshot); const groups=assignGroups(snapshot);
  const keys=groups.flatMap(g=>g.capabilities.map(c=>c.key));
  assert.equal(keys.length, new Set(keys).size);
  assert.ok(keys.length>90); assert.equal(JSON.stringify(snapshot),before);
  assert.throws(()=>assignGroups({capabilities:[...snapshot.capabilities,snapshot.capabilities[0]]}), /duplicate/);
  const hub=renderHub(snapshot); assert.ok(hub.includes('Standards &amp; interfaces.'));
  assert.doesNotMatch(hub, /serving-unit bands|licensing disabled|\$[0-9]/);
});
test('Database cards distinguish access and experimental scope with source provenance', () => {
  assert.equal(presentation.providers.length,8);
  assert.equal(presentation.providers.filter(p=>p.access==='Full read/write').length,1);
  for(const name of ['Oracle','Amazon Redshift','Snowflake','Databricks']) assert.equal(presentation.providers.find(p=>p.title===name).status,'Experimental');
  for(const p of presentation.providers) assert.match(p.source,/blob\/[a-f0-9]{40}\//);
});
test('Evidence labels do not silently promote release maturity', () => {
  assert.equal(scopeLabel({key:'test',status:'source-backed'}),'');
  assert.equal(scopeLabel({key:'test',status:'proof-pending'}),'');
  assert.equal(scopeLabel({key:'test',releaseStatus:'experimental'}),'Experimental');
  assert.equal(scopeLabel({key:'test',scopeNote:'Experimental in 2026.1'}),'Experimental');
  assert.equal(scopeLabel({key:'test',status:'preview'}),'Preview');
});
test('Complete detailed catalog, historical anchors, and restyled evidence are retained', () => {
  const detail=read('capability-details.html'); const hub=read('capabilities.html');
  for(const c of snapshot.capabilities){
    const id='cap-'+c.key.replaceAll('.','-');
    assert.ok(detail.includes(`id="${id}"`),c.key); assert.ok(hub.includes(`id="${id}"`),c.key);
    const evidence=read('evidence-'+c.key.replaceAll('.','-')+'.html');
    assert.match(evidence,/class="h-site"/); assert.match(evidence,/assets\/remodel.css/);
    assert.doesNotMatch(evidence,/2026\.1 ships with licensing disabled/);
  }
  assert.doesNotMatch(read('assets/capability-filter.js'),/var PRICE|formatPrice|6000|15000|39000/);
});
test('Architecture keeps original interactions and the new deployment selector', () => {
  const page=normalizePage('architecture.html',read('architecture.html'));
  for(const token of ['data-trace-request','data-stepper','data-topologies','architecture-tab-aws','architecture-tab-azure','assets/architecture.js','assets/architecture-explorer.css'])assert.ok(page.includes(token),token);
  const visible=page.replace(/<[^>]+>/g,' ');
  assert.doesNotMatch(visible,/ArcGIS|complete .*ecosystem replacement|952 \/ 952/);
});
test('Agent install CTA and prompt refer to official instructions without exposing secrets',()=>{
  assert.match(read('index.html'),/href="install-with-agent.html"/);
  const prompt=read('data/agent-install-prompt.txt');
  assert.match(prompt,/docs.honua.io\/server\/get-started\/quickstart/);
  assert.match(prompt,/loopback/);assert.match(prompt,/never print secrets/);
  const install=read('install-with-agent.html');
  assert.match(install,/data-copy-install/);
  const embedded=install.match(/<code id="agent-install-prompt">([\s\S]*?)<\/code>/)[1].replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&#x27;',"'").replaceAll('&quot;','"');
  assert.equal(embedded.trim(),prompt.trim());
});

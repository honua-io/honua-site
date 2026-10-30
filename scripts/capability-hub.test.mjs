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
  for (const section of ['workflows','standards']) {
    const sectionKeys=groups.filter(g=>g.section===section).flatMap(g=>g.capabilities.map(c=>c.key));
    assert.equal(sectionKeys.length,new Set(sectionKeys).size,section);
  }
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
test('Architecture keeps request and operations interactions with unified deployment', () => {
  const page=normalizePage('architecture.html',read('architecture.html'));
  for(const token of ['data-trace-request','data-stepper','data-runtime-option','id="aws"','id="azure"','assets/architecture.js','assets/architecture-explorer.css'])assert.ok(page.includes(token),token);
  const visible=page.replace('<span>ArcGIS Pro</span>','').replace(/<[^>]+>/g,' ');
  assert.doesNotMatch(visible,/ArcGIS|complete .*ecosystem replacement|952 \/ 952/);
});
test('Agent install CTA and prompt refer to official instructions without exposing secrets',()=>{
  assert.match(read('index.html'),/href="install-with-agent.html"/);
  const prompt=read('data/agent-install-prompt.txt');
  assert.match(prompt,/honua\.gitbook\.io\/honuaio\/start-here\/quickstart/);
  assert.match(prompt,/start-here\/quickstart\/local-preview-artifact/);
  assert.match(prompt,/immutable preview image digest/);
  assert.match(prompt,/loopback/);assert.match(prompt,/never print secrets/);
  const install=read('install-with-agent.html');
  assert.match(install,/data-copy-install/);
  const embedded=install.match(/<code id="agent-install-prompt">([\s\S]*?)<\/code>/)[1].replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&#x27;',"'").replaceAll('&quot;','"');
  assert.equal(embedded.trim(),prompt.trim());
});

test('Capability pages include complete canonical and social metadata', () => {
  for (const name of ['capabilities.html','capability-details.html','install-with-agent.html']) {
    const page = read(name);
    assert.ok(page.includes(`<link rel="canonical" href="https://honua.io/${name}" />`));
    assert.ok(page.includes(`<meta property="og:url" content="https://honua.io/${name}" />`));
    for (const key of ['og:description','og:image:alt','og:image:width','og:image:height']) assert.ok(page.includes(`property="${key}"`));
    for (const key of ['twitter:title','twitter:description','twitter:image','twitter:image:alt']) assert.ok(page.includes(`name="${key}"`));
    assert.ok(page.includes('property="og:image:width" content="1200"'));
    assert.ok(page.includes('property="og:image:height" content="630"'));
  }
});

import { normalizeCapabilityMetadata } from './capability-page-shell.mjs';
test('Capability metadata normalization remains idempotent', () => {
  for (const name of ['capabilities.html','capability-details.html','install-with-agent.html']) {
    const once=normalizeCapabilityMetadata(read(name));
    assert.equal(normalizeCapabilityMetadata(once),once);
  }
});

test('Installation entry points preserve consent-aware CTA attribution', () => {
  for(const name of ['index.html','capabilities.html','architecture.html']) {
    const tags=[...read(name).matchAll(/<a\b[^>]*href="install-with-agent.html"[^>]*>/g)];
    assert.ok(tags.length>0);
    for(const [tag] of tags) {
      assert.match(tag,/data-analytics-event="cta_click"/);
      assert.match(tag,/data-analytics-label="[^"]+"/);
      assert.match(tag,/data-analytics-destination="install-with-agent.html"/);
    }
  }
});

test('GeoServices REST names every service family without collapsing the list', () => {
  const group=assignGroups(snapshot).find(g=>g.id==='geoservices-rest');
  const html=renderHub(snapshot).match(/<article[^>]*id="group-geoservices-rest"[\s\S]*?<\/article>/)[0];
  for(const name of ['FeatureServer','MapServer','ImageServer','GPServer','GeometryServer','GeocodeServer','VectorTileServer','NAServer','VersionManagementServer','SceneServer']) assert.ok(html.includes(name),name);
  assert.equal(group.capabilities.length,13);
  assert.doesNotMatch(html,/<details/);
  assert.match(html,/ImageServer[\s\S]*?Preview/);
  assert.match(html,/VersionManagementServer[\s\S]*?Preview/);
  assert.match(html,/SceneServer[\s\S]*?Experimental/);
});
test('Functionality is a separate complete browsing lens, not leftovers after protocols', () => {
  const groups=assignGroups(snapshot);const functions=groups.filter(g=>g.section==='workflows');
  assert.equal(functions.length,12);
  for(const key of ['process.geoprocessing','routing.solve','serve.geoservices-featureserver','editing.featureserver-edits','editing.branch-versioning','ai.mcp-discovery']) {
    assert.ok(functions.some(g=>g.capabilities.some(c=>c.key===key)),key);
  }
  const html=renderHub(snapshot);
  assert.ok(html.indexOf('id="workflows"')<html.indexOf('id="standards"'));
  assert.ok(groups.find(g=>g.id==='service-apis').capabilities.every(c=>!c.key.startsWith('serve.geoservices-')));
  assert.ok(groups.find(g=>g.id==='imagery').capabilities.every(c=>c.key!=='format.geoarrow'&&c.key!=='raster.terrain-rgb'));
  assert.ok(functions.find(g=>g.id==='terrain-scenes').capabilities.some(c=>c.key==='raster.terrain-rgb'));
});
test('Format groups disclose documented roles and pin the source of every family', () => {
  assert.equal(presentation.formatGroups.length,6);
  const items=presentation.formatGroups.flatMap(g=>g.items);
  for(const name of ['GeoParquet','GeoArrow / Arrow IPC','FlatGeobuf','COG / GeoTIFF','PMTiles','Zarr v2 / v3','NetCDF4 / HDF5','GRIB / GRIB2','GeoJSON','GeoPackage','Shapefile (ZIP)','CSV','GPX','KML / KMZ','WKT','File Geodatabase (.gdb.zip)']) assert.ok(items.some(i=>i.title===name),name);
  assert.doesNotMatch(items.find(i=>i.title==='GeoArrow / Arrow IPC').role,/import/i);
  for(const name of ['NetCDF4 / HDF5','GRIB / GRIB2']) assert.match(items.find(i=>i.title===name).role,/URL registration.*conversion/);
  for(const group of presentation.formatGroups) {
    assert.match(group.source,/blob\/[a-f0-9]{40}\//);
    for(const item of group.items) { assert.ok(item.role);assert.equal(new URL(item.href).origin,'https://docs.honua.io'); }
  }
  assert.doesNotMatch(renderHub(snapshot),/Registration and catalog paths; serving scope/);
});
test('Search covers functions, protocols, providers and formats', () => {
  const js=read('assets/capability-hub.js');
  for(const id of ['workflows','standards','databases','formats']) assert.ok(js.includes('#'+id+' [data-hub-card]'));
  assert.match(renderHub(snapshot),/data-search="gpserver/);
  assert.match(renderHub(snapshot),/data-search="geoparquet/);
});

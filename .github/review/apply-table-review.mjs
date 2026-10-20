import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const read=p=>readFileSync(p,'utf8');
function replaceOne(text,before,after){assert.equal(text.split(before).length-1,1,'Expected reviewed source: '+before.slice(0,100));return text.replace(before,after);}
const navText=read('data/capability-navigation.v1.json');
assert.equal(createHash('sha1').update('blob '+Buffer.byteLength(navText)+'\0').update(navText).digest('hex'),'7756ebdbd744145e941c2ffea9d55949805135a6');
const nav=JSON.parse(navText),group=nav.groups.find(g=>g.id==='bring-data');
assert.equal(group.title,'Import & publish');assert.equal(group.extras,undefined);
group.title='Connect, import & publish';
group.summary='Create layers from existing database tables without copying data, or import files and services.';
group.extras=[{title:'Create a layer from an existing table',scope:'Connect to a supported database, discover spatial tables, and publish a live layer without copying the data.',href:'https://github.com/honua-io/honua-server/blob/trunk/docs/guides/publish/serve-existing-databases.md',source:'https://github.com/honua-io/honua-server/blob/4ff2e7c8c207955320ed7845a80e14c038085d21/docs/guides/publish/serve-existing-databases.md'}];
writeFileSync('data/capability-navigation.v1.json',JSON.stringify(nav,null,2)+'\n');
const renderer='scripts/capability-hub-render.mjs';
writeFileSync(renderer,replaceOne(read(renderer),'Use PostGIS for the full read/write platform, or serve existing data through a read-only connection. Each provider links to its supported operations.','Publish existing database tables as live layers without copying their data. PostGIS supports full read/write workflows; other providers have read-only or experimental scope, as shown below.'));
let architecture=read('architecture.html');
const oldPanel=architecture.match(/<section\b[^>]*id="esri"[^>]*>[\s\S]*?<\/section>/)?.[0];
assert.ok(oldPanel);
assert.equal(createHash('sha256').update(oldPanel).digest('hex'),'3ea4f7096a251c37563a1c0d2df06d3c1ecc5d9b0549cb60b8891a7d86fe3b6c');
architecture=architecture.replace(oldPanel,read('.github/review/migration-panel.html').trim());
architecture=replaceOne(architecture,'data-architecture-tab>Service migration</button>','data-architecture-tab>Migration</button>');
writeFileSync('architecture.html',architecture);
const additions=`  // Existing-table publishing and code migration are first-class paths.
  await load('capabilities.html');
  await search('existing table');
  assert.equal(await evaluate('document.getElementById("group-bring-data").hidden'),false);
  assert.equal(await evaluate('document.querySelector("#group-bring-data [data-hub-item]").hidden'),false);
  await search('');
  await sectionCapture('group-bring-data','existing-table-publishing-desktop');
  await load('architecture.html#migration');
  assert.equal(await evaluate('document.getElementById("esri").hidden'),false);
  assert.equal(await evaluate('document.getElementById("architecture-tab-esri").textContent.trim()'),'Migration');
  assert.equal(await evaluate('document.querySelectorAll("#esri [data-migration-track]").length'),3);
  await sectionCapture('esri','migration-app-code-desktop');
  await evaluate('document.getElementById("migration-step-tab-import").click()');
  assert.equal(await evaluate('document.getElementById("migration-step-import").hidden'),false);
  assert.ok((await evaluate('document.getElementById("migration-step-import").textContent')).includes('JavaScript/TypeScript'));
  await evaluate('const b=document.getElementById("migration-step-tab-import"); b.focus(); b.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));');
  assert.equal(await evaluate('document.getElementById("migration-step-validate").hidden'),false);
  assert.equal(await evaluate('document.activeElement.id'),'migration-step-tab-validate');
  for (const width of [1024,768,390,320]) {
    await load('architecture.html#esri',width,1600);
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);
    assert.equal(await evaluate('document.getElementById("esri").hidden'),false);
  }
  await load('architecture.html#esri',390,1600);
  await sectionCapture('esri','migration-app-code-mobile');
  await load('capabilities.html',390,1600);
  await sectionCapture('group-bring-data','existing-table-publishing-mobile');

`;
writeFileSync('scripts/capture-design-review.mjs',replaceOne(read('scripts/capture-design-review.mjs'),"  await load('install-with-agent.html'); await capture('agent-install');",additions+"  await load('install-with-agent.html'); await capture('agent-install');"));

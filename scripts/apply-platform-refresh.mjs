// One-time, guarded application of the approved platform presentation refresh.
import { readFileSync as read, writeFileSync as write } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const expected={
 'index.html':'026a77babcf048053fd473d24afff88c77edd7d9',
 'architecture.html':'105d751dd16aee99168063db51cf929caefe0741',
 'scripts/capability-hub-render.mjs':'b425cb2deb116fca03cba937fd637f8fc5477a41',
 'assets/capability-hub.js':'a1aa20a142f315d7412f50b4e5d283ddb1af3f6a',
};
for(const [file,sha] of Object.entries(expected)){
 const b=read(file);assert.equal(createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex'),sha,`Reconcile changed source: ${file}`);
}
const replace=(s,a,b)=>{assert.equal(s.split(a).length-1,1,`Expected one occurrence: ${a}`);return s.replace(a,b);};
let home=read('index.html','utf8');
home=replace(home,'<h3>Spend less time<br>on server operations.</h3>','<h3>Spend less time<br>on server operations.</h3><p><strong>Make changes with confidence.</strong></p>');
home=replace(home,'Review and approve supported changes with Git-backed history and recovery checks.','Review and approve supported changes with preflight and recovery checks, Git-backed history, and rollback where supported.');
write('index.html',home);
const reference='https://github.com/honua-io/honua-server/blob/trunk/docs/concepts/architecture-diagrams.md';
let arch=read('architecture.html','utf8');
const hero=`<section class="h-wrap h-page-hero arch-hero h-platform-hero"><span class="h-kicker">HOW HONUA WORKS</span><h1>From your data<br><span>to maps, apps, and analysis.</span></h1><p class="h-lede">Honua combines a geospatial server, SDKs, Console, and AI tools. Bring in data, build applications, run analysis, and spend less time operating the services behind them.</p><div class="h-actions"><a class="h-button" href="install-with-agent.html" data-analytics-event="cta_click" data-analytics-label="architecture_agent_install" data-analytics-destination="install-with-agent.html">Install with an agent ↗</a><a class="h-text-link" href="#deployment">Explore deployment options ↓</a></div><p class="platform-components-link"><a href="capabilities.html#components">Meet the platform components ↗</a> · Server, Console &amp; Studio, developer SDKs, and agent tools. Mobile SDK and Collect are experimental.</p></section>`;
assert.equal((arch.match(/<section class="h-wrap h-page-hero arch-hero">[\s\S]*?<\/section>/g)||[]).length,1);
arch=arch.replace(/<section class="h-wrap h-page-hero arch-hero">[\s\S]*?<\/section>/,hero);
const journeys=`<section class="h-wrap journey-section" id="platform-workflows" aria-labelledby="platform-workflows-title"><header class="journey-heading"><div><span class="h-kicker">FOLLOW THE WORK</span><h2 id="platform-workflows-title">What happens after you connect.</h2></div><p>Four ways the platform fits together, from the first dataset to everyday operations.</p></header><div class="journey-grid">
<article class="journey-card" data-platform-journey="publish"><span class="h-kicker">IMPORT &amp; PUBLISH</span><h3>Bring a dataset into use.</h3><p>Connect a database, upload a file, or import an existing service. Publish through Honua Server, then use the same data from GIS clients, web applications, and SDKs.</p><ol class="journey-flow" aria-label="Import and publishing flow"><li>Connect data</li><li>Import or register</li><li>Publish services</li><li>Connect clients</li></ol><a class="h-text-link" href="#esri">Follow a service import ↓</a></article>
<article class="journey-card" data-platform-journey="create"><span class="h-kicker">MAPS &amp; APPLICATIONS</span><h3>Go from a question to a map.</h3><p>Work with the shared AI conversation and Studio’s realtime editor in Console. Discover layers, refine the map, and save the composition. Use SDKs to build it into an application.</p><ol class="journey-flow" aria-label="Mapmaking flow"><li>Describe</li><li>Discover layers</li><li>Compose &amp; refine</li><li>Save</li></ol><p class="journey-scope">Console and Studio are Preview. Direct editing of source feature data stays outside the AI interface.</p><a class="h-text-link" href="blog-ai-mapmaking.html">Inside AI mapmaking ↗</a></article>
<article class="journey-card" data-platform-journey="process"><span class="h-kicker">GEOPROCESSING &amp; BATCH</span><h3>Give analysis its own compute.</h3><p>Submit a supported process through an API or SDK. Honua tracks the job while a worker or batch backend runs it. Retrieve the result without sizing the serving tier for the entire analysis.</p><ol class="journey-flow" aria-label="Geoprocessing flow"><li>Submit a job</li><li>Durable coordination</li><li>Worker or batch</li><li>Retrieve results</li></ol><a class="h-text-link" href="#deployment">See the compute topology ↓</a></article>
<article class="journey-card" data-platform-journey="operate"><span class="h-kicker">AI-ASSISTED OPERATIONS</span><h3>Less routine work. Safer changes.</h3><p>AI helps gather operational context, investigate a finding, and propose a supported change. Preflight checks, an authorized approval, and post-change verification protect the rollout.</p><ol class="journey-flow" aria-label="Protected operations flow"><li>Health &amp; evidence</li><li>AI proposal</li><li>Approval</li><li>Change &amp; verify</li></ol><p class="journey-scope">Git-backed history and a verified recovery path support rollback where the operation allows it.</p><a class="h-text-link" href="#ops">Follow a protected change ↓</a></article>
</div><div class="platform-compute" aria-label="Separate compute, shared durable state"><div><strong>Serving follows traffic.</strong><p>Handle map and feature requests with independently sized serving capacity.</p></div><div><strong>Processing follows the job.</strong><p>Place supported long-running work on separate workers or batch compute.</p></div><div><strong>State outlives compute.</strong><p>PostGIS, object storage, and durable coordination keep data and job state outside disposable serving instances.</p></div></div></section>
<section class="h-wrap explorer-intro" id="technical-explorer"><span class="h-kicker">UNDER THE HOOD</span><h2>Explore the architecture behind each workflow.</h2><p>Trace a request, walk through migration and operations, or inspect the container, cluster, AWS, and Azure deployment patterns.</p><a class="h-text-link" href="${reference}">Architecture diagrams &amp; technical reference ↗</a></section>`;
arch=replace(arch,'<div class="arch-nav-wrap h-wrap">',journeys+'<div class="arch-nav-wrap h-wrap">');
arch=arch.replaceAll('https://docs.honua.io/server/concepts/architecture-diagrams',reference);
arch=replace(arch,'<span class="h-kicker">CONCEPTUAL VIEW</span><h2>One spatial foundation.<br/>Several ways to work.</h2><p>The server, SDKs, Studio, and operations tools work with shared spatial capabilities, data, and policy.</p>','<span class="h-kicker">PLATFORM STRUCTURE</span><h2>The pieces behind the workflows.</h2><p>Console and Studio provide the workspace; SDKs connect applications and data pipelines; agents work through explicit tools. Server provides shared data, services, policy, and execution.</p>');
write('architecture.html',arch);
let prepare=read('scripts/prepare-marketing-pages.mjs','utf8');
prepare=replace(prepare,"'  <script defer src=\"assets/architecture.js\"></script>'","'  <link rel=\"stylesheet\" href=\"assets/platform-guide.css\" />', '  <script defer src=\"assets/architecture.js\"></script>'");
prepare=replace(prepare,'See how Honua fits together, runs on containers and clusters, scales batch processing, and handles service changes.','See how Honua’s server, SDKs, Console, and AI tools connect data, maps, processing, and safe operations to independently scalable compute.');
write('scripts/prepare-marketing-pages.mjs',prepare);
let renderer=read('scripts/capability-hub-render.mjs','utf8');
renderer="import { renderPlatformComponents } from './platform-components.mjs';\n"+renderer;
renderer=replace(renderer,'Explore what<br><span>you can build on.</span>','Build across<br><span>the whole platform.</span>');
renderer=replace(renderer,'Find the standards, data connections, and spatial workflows that fit your stack.','Server, SDKs, Console, and AI tools for geospatial applications and operations—with experimental mobile and field collection.');
renderer=replace(renderer,'aria-label="Capability sections"><a href="#workflows">','aria-label="Capability sections"><a href="#components">Platform</a><a href="#workflows">');
renderer=replace(renderer,'Search functionality, services, databases &amp; formats','Search components, functionality, services, databases &amp; formats');
renderer=replace(renderer,'Try GPServer, geocoding, GeoParquet, or SQL Server…','Try SDKs, Collect, GPServer, GeoParquet, or SQL Server…');
renderer=replace(renderer,'<section class="h-wrap hub-section hub-workflows" id="workflows">','${renderPlatformComponents()}\n<section class="h-wrap hub-section hub-workflows" id="workflows">');
write('scripts/capability-hub-render.mjs',renderer);
let search=read('assets/capability-hub.js','utf8');
search=replace(search,"querySelectorAll('#workflows [data-hub-card]","querySelectorAll('#components [data-hub-card], #workflows [data-hub-card]");
search=replace(search,"['workflows','standards','databases','formats']","['components','workflows','standards','databases','formats']");
write('assets/capability-hub.js',search);
let cap=read('capabilities.html','utf8');
cap=replace(cap,'</head>','<link rel="stylesheet" href="assets/platform-guide.css" /></head>');
cap=cap.replaceAll('Explore Honua standards, databases, spatial analysis, AI workflows, and operations. Find documentation and evidence by capability.','Explore Honua Server, Console, SDKs, AI tools, and experimental Mobile and Collect, alongside geospatial services, standards, databases, and formats.');
write('capabilities.html',cap);
console.log('Applied platform refresh without changing capability data, editions, or runtime behavior.');

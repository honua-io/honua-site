import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('architecture.html');

test('Architecture uses one Deployment tab instead of parallel Compute and cloud tabs', () => {
  const tabs = [...html.matchAll(/<button\b[^>]*data-architecture-tab[^>]*>([^<]+)<\/button>/g)].map(m => m[1]);
  assert.deepEqual(tabs, ['Overview', 'Request path', 'Deployment', 'Service migration', 'Operations']);
  assert.equal((html.match(/data-architecture-panel=/g) || []).length, 5);
  assert.doesNotMatch(html, /<select\b|topology-choice|data-topology=/);
  const options = [...html.matchAll(/data-runtime-option="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(options, ['single', 'serverless', 'cluster']);
  for (const id of ['topology-single','topology-serverless','topology-cluster']) {
    const tag = html.match(new RegExp('<article[^>]*id="' + id + '"[^>]*>'))?.[0];
    assert.ok(tag, id); assert.doesNotMatch(tag, /\bhidden\b/);
  }
});
test('Deployment shows workload separation and a semantic cloud comparison', () => {
  for (const text of ['MAPS &amp; QUERIES', 'GP &amp; BATCH', 'Durable coordination', 'Keep state outside disposable compute.']) assert.ok(html.includes(text), text);
  assert.match(html, /<table class="deployment-table">/);
  for (const name of ['AWS','Azure','ECS / Fargate','Container Apps','EKS + Helm','AKS + Helm','AWS Batch','Azure Batch','PostGIS','Redis']) assert.ok(html.includes(name),name);
  assert.match(html, /<th scope="col">AWS<\/th>/);
  assert.match(html, /<th scope="row">Heavy processing<\/th>/);
});
test('Full cloud references and historical deep links remain available', () => {
  for (const id of ['aws','azure']) {
    assert.ok(html.includes('<details class="deployment-reference" id="'+id+'">'));
    assert.ok(read('assets/architecture.js').includes(id+': "deployment"'));
  }
  assert.equal((html.match(/class="arch-deployment"/g) || []).length, 2);
  assert.ok(read('assets/architecture.js').includes('detail.open = true'));
  assert.ok(read('assets/architecture.js').includes('revealHashTarget(false)'));
  assert.doesNotMatch(read('assets/remodel.js'), /initTopologies|topology-choice/);
  assert.match(html,/Pilot access/);
  assert.match(html,/Not yet/);
  for (const token of ['data-trace-request','data-stepper','data-platform-journey']) assert.ok(html.includes(token));
});
test('Capabilities navigation drops only the redundant GeoServices jump link', () => {
  const page=read('capabilities.html');
  const nav=page.match(/<nav[^>]*aria-label="Capability sections"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav);
  assert.doesNotMatch(nav, /href="#group-geoservices-rest"/);
  for (const id of ['components','workflows','standards','databases','formats']) assert.ok(nav.includes('href="#'+id+'"'),id);
  assert.ok(nav.includes('href="compare-editions.html"'));
  assert.ok(page.includes('id="group-geoservices-rest"'));
  for (const name of ['FeatureServer','MapServer','ImageServer','GPServer']) assert.ok(page.includes(name));
});
test('Large headings use neutral text without removing actionable green accents', () => {
  const css=read('assets/remodel.css');
  assert.ok(css.includes('.h-hero h1>span,.h-page-hero h1>span{color:inherit}'));
  assert.ok(css.includes('.h-control h2 em{font-style:normal;color:inherit}'));
  assert.ok(css.includes('--h-accent:#c4ee9d'));
  assert.ok(read('assets/architecture-explorer.css').includes('.arch-page .teal { color: inherit; }'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('architecture.html');

test('Architecture uses one Deployment tab instead of parallel Compute and cloud tabs', () => {
  const tabs = [...html.matchAll(/<button\b[^>]*data-architecture-tab[^>]*>([^<]+)<\/button>/g)].map(m => m[1]);
  assert.deepEqual(tabs, ['Overview', 'Request path', 'Deployment', 'Migration', 'Operations']);
  assert.equal((html.match(/data-architecture-panel=/g) || []).length, 5);
  assert.doesNotMatch(html, /<select\b|topology-choice|data-topology=/);
  const options = [...html.matchAll(/data-runtime-option="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(options, ['edge', 'compute', 'state']);
  for (const id of ['topology-edge','topology-compute','topology-state']) {
    const tag = html.match(new RegExp('<article[^>]*id="' + id + '"[^>]*>'))?.[0];
    assert.ok(tag, id); assert.doesNotMatch(tag, /\bhidden\b/);
  }
});
test('Deployment shows the release architecture and a semantic service table', () => {
  for (const text of ['MAPS &amp; QUERIES', 'JOBS &amp; IMPORTS', 'Job recorded in PostGIS', 'State lives in two places.']) assert.ok(html.includes(text), text);
  assert.match(html, /<table class="deployment-table">/);
  assert.ok(html.includes('<caption class="h-sr-only">'));
  for (const name of ['CloudFront','Application Load Balancer','ECS on Fargate','RDS for PostgreSQL with PostGIS','S3']) assert.ok(html.includes(name),name);
  assert.ok(html.includes('AWS Batch'));
  for (const name of ['Redis','Azure','EKS','Lambda']) assert.ok(!html.includes(name),name);
  assert.match(html, /<th scope="col">AWS service<\/th>/);
  assert.match(html, /<th scope="row">Database<\/th>/);
});
test('Historical cloud deep links open the Deployment tab', () => {
  for (const id of ['aws','azure']) {
    assert.ok(read('assets/architecture.js').includes(id+': "deployment"'));
  }
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
test('Heading emphasis and actions use the shared ocean palette', () => {
  const css=read('assets/remodel.css');
  assert.ok(css.includes('.h-page-hero h1>span,.h-net-copy h1>span{color:var(--h-blue)}'));
  assert.ok(css.includes('.h-control h2 em{font-style:normal;color:var(--h-accent)}'));
  assert.ok(css.includes('--h-accent:var(--honua-teal-bright)'));
  assert.ok(css.includes('--h-blue:var(--honua-blue-bright)'));
  assert.ok(read('assets/architecture-explorer.css').includes('.arch-page .teal { color: var(--honua-teal); }'));
});

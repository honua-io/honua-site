import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderHub, presentation } from './capability-hub-render.mjs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const snapshot = JSON.parse(read('data/capabilities.v1.json'));
const page = read('architecture.html');
const panel = page.match(/<section\b[^>]*id="esri"[^>]*>[\s\S]*?<\/section>/)?.[0];

test('Existing-table publishing is visible alongside file and service imports', () => {
  const before = JSON.stringify(snapshot);
  const group = presentation.groups.find(g => g.id === 'bring-data');
  assert.equal(group.title, 'Connect, import & publish');
  const extra = group.extras.find(x => x.title === 'Create a layer from an existing table');
  assert.ok(extra);
  assert.match(extra.scope, /without copying/);
  assert.match(extra.source, /blob\/[a-f0-9]{40}\/docs\/guides\/publish\/serve-existing-databases\.md$/);
  const html = renderHub(snapshot).match(/<article[^>]*id="group-bring-data"[\s\S]*?<\/article>/)[0];
  assert.match(html, /Create a layer from an existing table/);
  assert.match(html, /without copying/);
  for (const key of ['import.file', 'import.geoservices', 'import.geoserver']) assert.ok(html.includes(`data-capability-key="${key}"`));
  assert.doesNotMatch(html, /<details/);
  assert.equal(JSON.stringify(snapshot), before);
});
test('Capabilities is regenerated and existing table search terms remain available', () => {
  const committed = read('capabilities.html');
  assert.ok(committed.includes(renderHub(snapshot)));
  assert.match(committed, /data-search="create a layer from an existing table/);
  assert.match(committed, /Publish existing database tables as live layers without copying their data/);
  assert.match(committed, /read-only or experimental scope/);
});
test('Migration explains data, web app conversion and Python translation before the stepper', () => {
  assert.ok(panel);
  assert.match(page, /id="architecture-tab-esri"[^>]*>Migration<\/button>/);
  assert.match(panel, /Bring your services, apps, and code/);
  for (const track of ['data', 'web', 'python']) assert.ok(panel.indexOf(`data-migration-track="${track}"`) < panel.indexOf('data-stepper='));
  assert.match(panel, /automated code conversion/);
  assert.match(panel, /JavaScript\/TypeScript/);
  assert.match(panel, /MapLibre-native/);
  assert.match(panel, /Python scripts, toolboxes/);
  assert.match(panel, /manual review, and unsupported/);
  assert.match(panel, /\.NET and MAUI[\s\S]*Not yet[\s\S]*automated source rewriting/);
  assert.doesNotMatch(panel.replace(/<[^>]+>/g, ' '), /ArcGIS|all code automatically|complete replacement/);
});
test('Migration retains all five accessible step targets and review/recovery boundaries', () => {
  for (const id of ['assess', 'review', 'import', 'validate', 'repoint']) {
    for (const attr of [`id="migration-step-tab-${id}"`,`aria-controls="migration-step-${id}"`,`id="migration-step-${id}"`,`aria-labelledby="migration-step-tab-${id}"`,`data-step="migration-${id}"`]) assert.ok(panel.includes(attr));
  }
  assert.match(panel, /<span>03<\/span> Convert/);
  assert.match(panel, /<span>05<\/span> Cut over/);
  assert.match(panel, /inspect its diff and report/);
  assert.match(panel, /Build the application\. Run the workflow\./);
  assert.match(panel, /previous application version and services available for recovery/);
  assert.match(panel, /Not yet[\s\S]*Estate-wide behavioral comparison reporting/);
});
test('New guide links use verified repository documents, not invented docs routes', () => {
  for (const link of [
    'https://github.com/honua-io/honua-server/blob/trunk/docs/guides/publish/serve-existing-databases.md',
    'https://github.com/honua-io/honua-sdk-js/blob/trunk/docs/migration-honua-maplibre.md',
    'https://github.com/honua-io/honua-sdk-python/blob/trunk/docs/honua-gp/codemod-translation-coverage.md',
  ]) assert.ok(panel.includes(`href="${link}"`));
});

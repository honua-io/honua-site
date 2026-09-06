import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { importRelease, project, render } from './release-compatibility.mjs';

const table = `# SDK and server compatibility

Lock completeness: **unqualified — incomplete draft; not a certified release lock.**

| SDK / protocol | Locked artifact | Minimum server | Qualification |
| --- | --- | --- | --- |
| honua-sdk-js | example-sdk 2.0.0 | 1.2.0 | declared floor; pairing unqualified |

## UPGRADE EDGES

| From | To | Application rollback | Database rollback | Restore backup required |
| --- | --- | --- | --- | --- |
| A | B | unqualified | unqualified | unqualified |

Restoring a verified pre-upgrade backup is required when neither rollback path is proven.
`;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'honua-release-table-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'release');
  mkdirSync(join(repo, 'docs'), { recursive: true });
  mkdirSync(join(root, 'data'));
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Mike McDougall');
  git('config', 'user.email', 'mike@honua.io');
  writeFileSync(join(repo, 'docs/SDK-SERVER-COMPATIBILITY.md'), table);
  writeFileSync(join(repo, 'docs/platform-lock.v1.draft.yaml'), 'lockVersion: platform-lock.v1\n');
  git('add', '.');
  git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'Record release table fixture');
  const revision = git('rev-parse', 'HEAD');
  writeFileSync(join(root, 'client-compatibility.html'), '<main><!-- GENERATED:release-compatibility START --><!-- GENERATED:release-compatibility END --></main>');
  importRelease(repo, revision, root);
  return { root, repo, revision };
}

test('imports immutable Git bytes, renders expected values and retains unqualified rollback', t => {
  const { root, repo, revision } = fixture(t);
  const record = JSON.parse(readFileSync(join(root, 'data/release-compatibility-source.v1.json')));
  assert.equal(record.revision, revision);
  assert.equal(record.table.sha256, createHash('sha256').update(table).digest('hex'));
  const page = readFileSync(join(root, 'client-compatibility.html'), 'utf8');
  assert.match(page, /<td>example-sdk 2.0.0<\/td><td>1.2.0<\/td>/);
  assert.match(page, /<strong>unqualified — incomplete draft; not a certified release lock\.<\/strong>/);
  assert.match(page, /<td>A<\/td><td>B<\/td><td>unqualified<\/td><td>unqualified<\/td><td>unqualified<\/td>/);
  assert.match(page, /Restoring a verified pre-upgrade backup is required/);
  writeFileSync(join(repo, 'docs/SDK-SERVER-COMPATIBILITY.md'), 'uncommitted forgery');
  importRelease(repo, revision, root);
  assert.equal(readFileSync(join(root, 'data/release-compatibility.md'), 'utf8'), table);
  project(root, true);
});

for (const file of ['release-compatibility.md', 'release-compatibility-lock.yaml']) {
  test(`rejects altered ${file} bytes`, t => {
    const { root } = fixture(t);
    writeFileSync(join(root, 'data', file), 'forged content');
    assert.throws(() => project(root, true), /bytes disagree/);
  });
}

test('rejects stale rendered values', t => {
  const { root } = fixture(t);
  const path = join(root, 'client-compatibility.html');
  writeFileSync(path, readFileSync(path, 'utf8').replace('<td>1.2.0</td>', '<td>0.1.0</td>'));
  assert.throws(() => project(root, true), /stale/);
});

test('renders source markup as text and rejects missing upgrade evidence section', t => {
  const { root } = fixture(t);
  const record = JSON.parse(readFileSync(join(root, 'data/release-compatibility-source.v1.json')));
  const html = render(table.replace('example-sdk', '<script>alert(1)</script>'), record);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.throws(() => render(table.replace('## UPGRADE EDGES', '## OTHER'), record), /Missing/);
  assert.throws(() => render(table, { ...record, revision: 'trunk' }), /immutable/);
});

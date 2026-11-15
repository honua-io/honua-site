import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MANIFEST_FILE, RECORD_FILE, checkPublication, publicationRefusals, publish,
} from './publish-customer-install-manifest.mjs';

const COMMIT = 'a'.repeat(40);
const manifest = fields => Buffer.from(`${JSON.stringify({ schemaVersion: 1, status: 'release-candidate', exactCandidateQualification: true, ...fields }, null, 2)}\n`);
const site = () => {
  const root = mkdtempSync(join(tmpdir(), 'site-manifest-'));
  mkdirSync(join(root, 'data'));
  return root;
};

test('A pre-cut rehearsal or unqualified manifest is refused', () => {
  assert.deepEqual(publicationRefusals(manifest({})), []);
  assert.match(publicationRefusals(manifest({ status: 'pre-cut-rehearsal' })).join(), /pre-cut-rehearsal/);
  assert.match(publicationRefusals(manifest({ exactCandidateQualification: false })).join(), /exactCandidateQualification/);
  assert.match(publicationRefusals(manifest({ schemaVersion: 2 })).join(), /schemaVersion/);
  assert.match(publicationRefusals(Buffer.from('{')).join(), /not valid JSON/);
  const root = site();
  assert.throws(() => publish({ siteRoot: root, releaseCommit: COMMIT, bytes: manifest({ status: 'pre-cut-rehearsal' }) }), /refusing/);
  assert.deepEqual(checkPublication(root), [], 'a refused publish writes nothing');
});

test('Only a full commit SHA is accepted as the source', () => {
  for (const ref of [undefined, 'trunk', 'abc1234', 'A'.repeat(40)]) {
    assert.throws(() => publish({ siteRoot: site(), releaseCommit: ref, bytes: manifest({}) }), /40-character/);
  }
});

test('A qualified manifest is copied byte for byte with its source record', () => {
  const root = site();
  const bytes = manifest({ verifiedAt: '2026-11-20' });
  const record = publish({ siteRoot: root, releaseCommit: COMMIT, bytes });
  assert.deepEqual(readFileSync(join(root, MANIFEST_FILE)), bytes);
  assert.deepEqual(JSON.parse(readFileSync(join(root, RECORD_FILE), 'utf8')), record);
  assert.equal(record.sourceCommit, COMMIT);
  assert.deepEqual(checkPublication(root), []);
});

test('The check catches an edited copy or a missing record', () => {
  const root = site();
  publish({ siteRoot: root, releaseCommit: COMMIT, bytes: manifest({}) });
  writeFileSync(join(root, MANIFEST_FILE), manifest({ verifiedAt: 'edited' }));
  assert.match(checkPublication(root).join(), /sha256 differs/);
  const bare = site();
  writeFileSync(join(bare, MANIFEST_FILE), manifest({}));
  assert.match(checkPublication(bare).join(), /has no/);
});

test('The site does not yet serve the rehearsal manifest', () => {
  assert.deepEqual(checkPublication(new URL('..', import.meta.url).pathname), []);
});

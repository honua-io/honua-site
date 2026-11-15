#!/usr/bin/env node
// Release-day copy of honua-release customer-install-manifest.json to
// https://honua.io/data/customer-install-manifest.json (honua-site#166).
//
// honua-release docs/CUSTOMER-INSTALL.md requires the site to serve the file
// byte for byte from an immutable honua-release commit whose validate check
// passed, and to record that commit and the file SHA-256. The repository copy
// is a pre-cut rehearsal until a certified mint; this script refuses to
// publish a rehearsal or any file without exact candidate qualification.
//
//   node scripts/publish-customer-install-manifest.mjs --release-commit <40-hex sha>
//   node scripts/publish-customer-install-manifest.mjs --check
//
// --source <file> reads the bytes from a local file instead of GitHub (tests,
// or an offline copy taken with `git show <sha>:customer-install-manifest.json`).

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCE_REPOSITORY = 'honua-io/honua-release';
export const SOURCE_PATH = 'customer-install-manifest.json';
export const MANIFEST_FILE = 'data/customer-install-manifest.json';
export const RECORD_FILE = 'data/customer-install-manifest.publication.json';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Returns a list of reasons the manifest must not be published; empty means publishable.
export function publicationRefusals(bytes) {
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    return [`not valid JSON: ${error.message}`];
  }
  const refusals = [];
  if (manifest?.schemaVersion !== 1) refusals.push(`schemaVersion is ${JSON.stringify(manifest?.schemaVersion)}, expected 1`);
  if (manifest?.status === 'pre-cut-rehearsal') refusals.push('status is pre-cut-rehearsal');
  if (manifest?.exactCandidateQualification !== true) refusals.push('exactCandidateQualification is not true');
  return refusals;
}

export function publish({ siteRoot, releaseCommit, bytes }) {
  if (!/^[0-9a-f]{40}$/.test(releaseCommit ?? '')) {
    throw new Error('--release-commit must be a full 40-character lowercase commit SHA');
  }
  const refusals = publicationRefusals(bytes);
  if (refusals.length > 0) {
    throw new Error(`refusing to publish ${SOURCE_REPOSITORY}@${releaseCommit}:${SOURCE_PATH}: ${refusals.join('; ')}`);
  }
  const record = {
    sourceRepository: SOURCE_REPOSITORY,
    sourceCommit: releaseCommit,
    sourcePath: SOURCE_PATH,
    sha256: sha256(bytes),
    publicUrl: 'https://honua.io/data/customer-install-manifest.json',
  };
  writeFileSync(join(siteRoot, MANIFEST_FILE), bytes);
  writeFileSync(join(siteRoot, RECORD_FILE), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

// Returns problems with an existing publication; an absent manifest is not a problem.
export function checkPublication(siteRoot) {
  const manifestPath = join(siteRoot, MANIFEST_FILE);
  const recordPath = join(siteRoot, RECORD_FILE);
  if (!existsSync(manifestPath)) {
    return existsSync(recordPath) ? [`${RECORD_FILE} exists without ${MANIFEST_FILE}`] : [];
  }
  if (!existsSync(recordPath)) return [`${MANIFEST_FILE} has no ${RECORD_FILE}`];
  const bytes = readFileSync(manifestPath);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  const problems = publicationRefusals(bytes);
  if (record.sha256 !== sha256(bytes)) problems.push(`${MANIFEST_FILE} sha256 differs from ${RECORD_FILE}`);
  if (!/^[0-9a-f]{40}$/.test(record.sourceCommit ?? '')) problems.push(`${RECORD_FILE} sourceCommit is not a full commit SHA`);
  return problems;
}

function readFromGitHub(releaseCommit) {
  return execFileSync('gh', [
    'api', '-H', 'Accept: application/vnd.github.raw',
    `repos/${SOURCE_REPOSITORY}/contents/${SOURCE_PATH}?ref=${releaseCommit}`,
  ], { maxBuffer: 16 * 1024 * 1024 });
}

function main(argv) {
  const siteRoot = fileURLToPath(new URL('..', import.meta.url));
  const option = name => {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
  };
  if (argv.includes('--check')) {
    const problems = checkPublication(siteRoot);
    for (const problem of problems) console.error(`customer-install manifest: ${problem}`);
    process.exit(problems.length === 0 ? 0 : 1);
  }
  const releaseCommit = option('--release-commit');
  const source = option('--source');
  const bytes = source ? readFileSync(source) : readFromGitHub(releaseCommit);
  const record = publish({ siteRoot, releaseCommit, bytes });
  console.log(`Published ${MANIFEST_FILE} sha256 ${record.sha256} from ${SOURCE_REPOSITORY}@${releaseCommit}`);
  console.log(`After the Pages deploy: curl -fsS ${record.publicUrl} | sha256sum`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

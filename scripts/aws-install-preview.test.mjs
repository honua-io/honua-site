import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('installer is excluded from default builds and enabled only in preview artifacts', () => {
  const build = readFileSync(new URL('./build-dist.sh', import.meta.url), 'utf8');
  assert.match(build, /if \[\[ "\$\{HONUA_AWS_INSTALL_PREVIEW:-0\}" == "1" \]\]; then\s+node "\$\{repo_root\}\/scripts\/aws-install-preview.mjs"/);
  const partners = readFileSync(new URL('../design-partners.html', import.meta.url), 'utf8');
  assert.doesNotMatch(partners, /href="install-aws.html"/);
  const target = mkdtempSync(join(tmpdir(), 'honua-install-preview-'));
  try {
    writeFileSync(join(target, 'design-partners.html'), partners);
    execFileSync(process.execPath, [new URL('./aws-install-preview.mjs', import.meta.url).pathname, target]);
    assert.match(readFileSync(join(target, 'design-partners.html'), 'utf8'), /href="install-aws.html"/);
    const installer = readFileSync(join(target, 'install-aws.html'), 'utf8');
    assert.match(installer, /disabled aria-describedby="install-status"/);
    assert.doesNotMatch(installer, /href="https:\/\/[^\"]*cloudformation/);
    assert.match(installer, /noindex, nofollow/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

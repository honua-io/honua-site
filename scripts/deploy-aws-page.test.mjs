import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&#39;', "'");
const page = read('install-with-agent.html');

test('The install page embeds both prompts exactly as their plain-text twins', () => {
  for (const [id, file] of [['agent-install-prompt', 'data/agent-install-prompt.txt'], ['agent-deploy-aws-prompt', 'data/agent-deploy-aws-prompt.txt']]) {
    const embedded = decode(page.match(new RegExp(`<code id="${id}">([\\s\\S]*?)</code>`))[1]).trim();
    assert.equal(embedded, read(file).trim(), `${id} matches ${file}`);
    assert.ok(page.includes(`href="${file}"`), `${file} is linked`);
    assert.ok(page.includes(`data-copy-install="${id}"`), `${id} has a copy button`);
  }
});

test('The AWS prompt stays on the qualified target and keeps the apply gate', () => {
  const prompt = read('data/agent-deploy-aws-prompt.txt');
  for (const phrase of ['provision_infrastructure', 'verify_install_handoff', 'ECS/Fargate', 'Apply nothing until I approve that exact plan', 'Never create IAM users or long-lived access keys', 'Never print secrets']) {
    assert.ok(prompt.includes(phrase), `prompt keeps: ${phrase}`);
  }
});

test('Both paths are reachable from the homepage datasheet', () => {
  const home = read('index.html');
  assert.match(home, /href="install-with-agent\.html"[^>]*>Local preview with your agent/);
  assert.match(home, /href="install-with-agent\.html#aws"[^>]*>AWS with your agent/);
  assert.match(page, /id="local"/);
  assert.match(page, /id="aws"/);
});

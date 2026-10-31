import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&#39;', "'");

test('The AWS deploy page embeds the same prompt it offers as plain text', () => {
  const page = read('deploy-on-aws-with-agent.html');
  const prompt = read('data/agent-deploy-aws-prompt.txt').trim();
  const embedded = decode(page.match(/<code id="agent-install-prompt">([\s\S]*?)<\/code>/)[1]).trim();
  assert.equal(embedded, prompt);
  assert.match(page, /href="data\/agent-deploy-aws-prompt\.txt"/);
});

test('The AWS deploy prompt stays on the qualified target and keeps the apply gate', () => {
  const prompt = read('data/agent-deploy-aws-prompt.txt');
  for (const phrase of ['provision_infrastructure', 'verify_install_handoff', 'ECS/Fargate', 'Apply nothing until I approve that exact plan', 'Never create IAM users or long-lived access keys', 'Never print secrets']) {
    assert.ok(prompt.includes(phrase), `prompt keeps: ${phrase}`);
  }
  assert.doesNotMatch(prompt, /Azure Container Apps|EKS cluster/);
});

test('The agent paths are reachable from the homepage and from each other', () => {
  assert.match(read('index.html'), /href="deploy-on-aws-with-agent\.html"/);
  assert.match(read('index.html'), /href="install-with-agent\.html"/);
  assert.match(read('install-with-agent.html'), /href="deploy-on-aws-with-agent\.html"/);
  assert.match(read('deploy-on-aws-with-agent.html'), /href="install-with-agent\.html"/);
});

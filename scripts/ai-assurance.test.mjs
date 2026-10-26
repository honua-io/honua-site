import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { validate, render, verifyEvidence } from './ai-assurance.mjs';
const baseline = JSON.parse(readFileSync(new URL('../data/ai-assurance.v1.json', import.meta.url)));
const today = new Date('2026-10-25T12:00:00Z');
const fixture = () => structuredClone(baseline);
test('baseline projects every framework with source-only evidence', () => {
  const data = validate(fixture(), today);
  const html = render(data);
  for (const f of data.frameworks) assert(html.includes(f.title));
  assert(html.includes('No installed release is qualified'));
});
test('private fields and private repo URLs are rejected', () => {
  let data = fixture(); data.controls[0].gap = 'private finding';
  assert.throws(() => validate(data, today));
  data = fixture(); data.evidence[0].url = data.evidence[0].url.replace('honua-server', 'honua-compliance');
  assert.throws(() => validate(data, today));
});
test('false compliance, certification and runtime claims are rejected', () => {
  for (const mutate of [d => d.status = 'aligned', d => d.certified = true, d => d.qualified_release = '2026.1', d => d.controls[0].verification = 'verified']) {
    const data = fixture(); mutate(data); assert.throws(() => validate(data, today));
  }
});
test('expired or malformed assessment dates fail publication', () => {
  assert.throws(() => validate(fixture(), new Date('2027-01-24T00:00:00Z')));
  const data = fixture(); data.review_due = '2026-02-30'; assert.throws(() => validate(data, today));
});
test('missing framework coverage and dangling evidence fail', () => {
  let data = fixture(); data.controls.forEach(c => c.mappings.owasp = []); assert.throws(() => validate(data, today));
  data = fixture(); data.controls[0].evidence = ['missing']; assert.throws(() => validate(data, today));
});
test('render escapes markup', () => {
  const data = fixture(); data.controls[0].summary = '<script>alert(1)</script>';
  assert(!render(data).includes('<script>'));
});
test('cached page visibly downgrades after due date', () => {
  const status = { textContent: '' };
  const script = readFileSync(new URL('../assets/ai-assurance.js', import.meta.url), 'utf8');
  runInNewContext(script, { document: { getElementById: id => id === 'ai-review-due' ? { dateTime: '2027-01-23' } : status }, Date: { now: () => Date.parse('2027-01-24'), parse: Date.parse } });
  assert.match(status.textContent, /Review overdue/);
});

test('public evidence verification rejects unavailable links without credentials', async () => {
  await assert.rejects(() => verifyEvidence(fixture(), async (_url, options) => {
    assert.equal(options.headers, undefined);
    assert.equal(options.redirect, 'error');
    return { status: 404 };
  }));
});
test('public evidence verification checks every source', async () => {
  const visited = [];
  await verifyEvidence(fixture(), async url => { visited.push(url); return { status: 200 }; });
  assert.equal(visited.length, baseline.evidence.length);
});

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const counts = { 'ai-rmf': 4, gai: 12, agents: 5, owasp: 10, iso: 1, '800-53': 20 };
const repos = new Set(['honua-server', 'honua-studio', 'honua-console', 'honua-sdk-js']);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const keys = (obj, expected) => assert.deepEqual(Object.keys(obj).sort(), expected.split(' ').sort(), 'Unexpected or missing public fields');
const text = value => assert(typeof value === 'string' && value.trim().length > 0);
const date = value => {
  assert(/^\d{4}-\d{2}-\d{2}$/.test(value));
  const parsed = new Date(`${value}T00:00:00Z`);
  assert(!Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value);
  return parsed;
};

export function validate(data, today = new Date()) {
  keys(data, 'schema_version assessment_date review_due status scope exclusions qualified_release certified mapping_basis frameworks controls evidence');
  assert.equal(data.schema_version, 1);
  assert.equal(data.status, 'in-progress', 'Completed alignment needs a separately reviewed evidence contract');
  assert.equal(data.certified, false);
  assert.equal(data.mapping_basis, "Thematic draft mapping of functions, risk categories, focus areas and control families. No framework equivalence or clause-level conformance is asserted.");
  assert.equal(data.qualified_release, null);
  const start = date(data.assessment_date), due = date(data.review_due);
  assert(start <= today && due > start && due - start <= 90 * 86400000);
  assert(today <= new Date(`${data.review_due}T23:59:59Z`), 'AI assessment overdue: review before publishing');
  for (const values of [data.scope, data.exclusions]) { assert(values.length > 0); values.forEach(text); }
  assert.equal(data.frameworks.length, 6);
  assert.deepEqual(data.frameworks.map(f => f.id).sort(), Object.keys(counts).sort());
  const coverage = new Map();
  for (const f of data.frameworks) {
    keys(f, 'id title version source topics status');
    [f.title, f.version].forEach(text);
    assert.equal(f.status, 'in-progress');
    assert.equal(f.topics.length, counts[f.id]);
    assert.equal(new Set(f.topics).size, counts[f.id]);
    const u = new URL(f.source);
    assert.equal(u.protocol, 'https:');
    assert(['airc.nist.gov','nvlpubs.nist.gov','www.nccoe.nist.gov','genai.owasp.org','www.iso.org','csrc.nist.gov'].includes(u.hostname));
    coverage.set(f.id, new Set());
  }
  const evidenceIds = new Set(data.evidence.map(e => e.id));
  assert.equal(evidenceIds.size, data.evidence.length);
  const controlIds = new Set(data.controls.map(c => c.id));
  assert.equal(controlIds.size, data.controls.length);
  assert(controlIds.size > 0);
  for (const e of data.evidence) {
    keys(e, 'id kind title url commit controls observed limitations');
    assert.equal(e.kind, 'source-inspection');
    [e.title, e.limitations].forEach(text);
    date(e.observed);
    assert(date(e.observed) <= start);
    assert(/^[a-f0-9]{40}$/.test(e.commit));
    const u = new URL(e.url), parts = u.pathname.split('/');
    assert(u.protocol === 'https:' && u.hostname === 'github.com' && !u.username && !u.password && !u.search && !u.hash);
    assert(parts[1] === 'honua-io' && repos.has(parts[2]) && parts[3] === 'blob' && parts[4] === e.commit && parts.length > 5);
    assert(e.controls.length > 0 && e.controls.every(id => controlIds.has(id)));
  }
  for (const c of data.controls) {
    keys(c, 'id summary verification mappings evidence');
    assert(/^AI-\d{2}$/.test(c.id));
    text(c.summary);
    assert.equal(c.verification, 'pending');
    assert(c.evidence.every(id => evidenceIds.has(id)));
    assert.deepEqual(Object.keys(c.mappings).sort(), Object.keys(counts).sort());
    for (const f of data.frameworks) {
      for (const topic of c.mappings[f.id]) {
        assert(f.topics.includes(topic));
        coverage.get(f.id).add(topic);
      }
    }
  }
  for (const f of data.frameworks) assert.equal(coverage.get(f.id).size, counts[f.id], `Missing ${f.id} mapping`);
  return data;
}

export async function verifyEvidence(data, fetcher = fetch) {
  // No token: a public evidence link must work for an anonymous reader.
  for (const evidence of data.evidence) {
    const response = await fetcher(evidence.url, {
      method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200, `Public evidence unavailable: ${evidence.id}`);
  }
}

export function render(data) {
  const frameworks = data.frameworks.map(f => `<tr><th scope="row"><a href="${escape(f.source)}">${escape(f.title)}</a></th><td>${escape(f.version)}</td><td>Assessment in progress</td><td>${f.topics.length} assessment ${f.topics.length === 1 ? 'topic' : 'topics'} mapped; verification pending</td></tr>`).join('\n');
  const controls = data.controls.map(c => `<tr><th scope="row">${escape(c.id)}</th><td>${escape(c.summary)}</td><td>Pending</td><td>${c.evidence.length ? c.evidence.map(id => `<a href="#evidence-${escape(id)}">Source: ${escape(id)}</a>`).join('; ') : 'Evidence collection pending'}</td></tr>`).join('\n');
  const evidence = data.evidence.map(e => `<li id="evidence-${escape(e.id)}"><a href="${escape(e.url)}">${escape(e.title)}</a> — ${escape(e.observed)}. ${escape(e.limitations)}.</li>`).join('\n');
  return `<p class="mono page-updated">Assessment recorded: ${escape(data.assessment_date)} · Review due: <time id="ai-review-due" datetime="${escape(data.review_due)}">${escape(data.review_due)}</time></p>
<p id="ai-review-status" role="status">Assessment in progress. No installed release is qualified by this assessment. This dated snapshot must be reviewed after the due date.</p>
<h2 id="scope">Assessment scope</h2>
<p>${data.scope.map(escape).join('; ')}. We assess agent permissions and access boundaries within supported deployments. </p>
<p>Excluded: ${data.exclusions.map(escape).join('; ')}.</p>
<p>Customer-managed deployments require operator evidence for identity configuration, provider terms, network restrictions, secrets, retention and recovery. Any Honua-managed deployment requires its own operational evidence.</p>
<h2 id="frameworks">Framework alignment status</h2>
<p>Honua is assessing its AI capabilities against the frameworks below. These mappings identify work to verify; they do not establish framework equivalence, full compliance, or certification. Honua does not claim ISO/IEC 42001 certification or FedRAMP authorization.</p>
<table><caption>Frameworks and assessment status</caption><thead><tr><th scope="col">Framework</th><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Coverage</th></tr></thead><tbody>${frameworks}</tbody></table>
<p>The NIST agent identity concept paper is a draft with five focus areas: identification, authorization, delegation, logging and data flows. It is distinct from the broader AI Agent Standards Initiative. ISO clause-level assessment awaits authorized standard text; SP 800-53 individual controls and enhancements require tailoring.</p>
<p>${escape(data.mapping_basis)}</p>
<h2 id="controls">Control assessment</h2>
<table><caption>AI controls and evidence collection</caption><thead><tr><th scope="col">Control</th><th scope="col">Area</th><th scope="col">Verification</th><th scope="col">Evidence</th></tr></thead><tbody>${controls}</tbody></table>
<h2 id="evidence">Public evidence</h2>
<p>The following links pin inspected source versions. They demonstrate inspectable implementation locations, not successful model evaluations or installed deployment behavior. Runtime qualification, model evaluations, operational exercises and independent review remain pending. No qualification receipts are available from this assessment yet.</p>
<ul>${evidence}</ul>
<p><a href="data/ai-assurance.v1.json" download>Download the assessment mapping (JSON)</a>. The download includes framework topics, control mappings, dates and the same public source references.</p>
<h2 id="limitations">What remains to verify</h2>
<p>Provider disclosure policies, delegated authority, protected actions, untrusted context, execution limits, audit records, supply-chain integrity, recovery and geospatial correctness require scoped verification. Management-system approval, training and independent assessment evidence are also pending.</p>
<p>Enabling external models can send prompts, supplied context, report summaries or imagery to the configured provider. Operators must approve the destination and data handling for each enabled use case.</p>
<p>Material changes to models, tools, policies or deployment configuration require reassessment. Missing, skipped, stale and inconclusive results do not count as passes.</p>
<p>Request restricted assessment material through <a href="mailto:security@honua.io">security@honua.io</a>. Availability depends on completion and disclosure review.</p>`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = validate(JSON.parse(readFileSync(path.join(root, 'data/ai-assurance.v1.json'), 'utf8')));
  if (process.argv.includes('--verify-evidence')) await verifyEvidence(data);
  const target = path.join(root, 'ai-assurance.html');
  const source = readFileSync(target, 'utf8');
  const marker = /<!-- AI-ASSURANCE:START -->[\s\S]*?<!-- AI-ASSURANCE:END -->/;
  assert(marker.test(source), 'Missing AI assurance projection markers');
  const output = source.replace(marker, `<!-- AI-ASSURANCE:START -->\n${render(data)}\n<!-- AI-ASSURANCE:END -->`);
  if (process.argv.includes('--check')) assert.equal(source, output, 'AI assurance page is stale; regenerate');
  else writeFileSync(target, output);
  console.log('AI assurance public projection valid');
}

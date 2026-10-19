import assert from "node:assert/strict";
import test from "node:test";

import { buildBundle, readAuthoredDocs } from "./gen-slice-pages.mjs";
import { checkRuntimeRefs, compareWithServer, readRuntimeRefs } from "./runtime-doc-refs.mjs";

const refs = readRuntimeRefs();
const bundle = buildBundle();

test("every runtime docs URL the server emits resolves, or is honestly pending", () => {
  assert.deepEqual(checkRuntimeRefs(refs, bundle), []);
});

test("the list covers all 23 runtime values: 3 remediationRefs, 1 documentationUri, 19 runbook_urls", () => {
  const count = (kind) =>
    refs.references.filter((ref) => ref.kind === kind).reduce((sum, ref) => sum + (ref.alerts?.length ?? 1), 0);
  assert.equal(count("remediationRef"), 3);
  assert.equal(count("documentationUri"), 1);
  assert.equal(count("runbook_url"), 19);
});

test("a pending entry whose page exists is caught, and so is an authored one whose page does not", () => {
  const authored = refs.references.find((ref) => ref.status === "authored");
  const flipped = { references: [{ ...authored, status: "pending" }] };
  assert.match(checkRuntimeRefs(flipped, bundle).join("\n"), /marked pending, but docs\/.* is in the bundle/);

  const missing = { references: [{ url: "https://honua.io/docs/guides/deploy/nowhere/#x", status: "authored" }] };
  assert.match(checkRuntimeRefs(missing, bundle).join("\n"), /marked authored, but the bundle has no docs\/guides\/deploy\/nowhere/);
});

test("a fragment must name exactly one element on the page", () => {
  // Repeated "Operator response" headings all slugged to one id on the earlier
  // runbook drafts (#261, #262), so a runbook_url resolved to the first of them.
  const files = new Map([["guides/x/index.html", '<h3 id="dup">a</h3><h3 id="dup">b</h3>']]);
  const dup = { references: [{ url: "https://honua.io/docs/guides/x/#dup", status: "authored" }] };
  assert.match(checkRuntimeRefs(dup, files).join("\n"), /#dup is 2 element ids/);
  const gone = { references: [{ url: "https://honua.io/docs/guides/x/#gone", status: "authored" }] };
  assert.match(checkRuntimeRefs(gone, files).join("\n"), /#gone is 0 element ids/);
});

test("a URL without the phase-A trailing slash is rejected", () => {
  const bare = { references: [{ url: "https://honua.io/docs/guides/deploy/docker-compose#redis-is-optional-postgis-is-not", status: "authored" }] };
  assert.match(checkRuntimeRefs(bare, bundle).join("\n"), /end its path with a slash/);
});

test("the server comparison reports both directions", () => {
  const server = { references: [{ url: "https://honua.io/docs/a/" }, { url: "https://honua.io/docs/b/" }] };
  const ours = { references: [{ url: "https://honua.io/docs/b/" }, { url: "https://honua.io/docs/c/" }] };
  assert.deepEqual(compareWithServer(ours, server), { missing: ["https://honua.io/docs/a/"], extra: ["https://honua.io/docs/c/"] });
});

test("no authored runbook or reference page repeats an element id", () => {
  for (const page of readAuthoredDocs()) {
    const html = bundle.get(`${page.path}/index.html`);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    const repeated = ids.filter((id, index) => ids.indexOf(id) !== index);
    assert.deepEqual(repeated, [], `${page.path} repeats ${repeated.join(", ")}`);
  }
});

test("every authored step that acts on a deployment says it is unvalidated", () => {
  // The honesty rule for these pages (#214): an operator action not exercised
  // against a running server is labelled, not asserted. A command block is the
  // action, so each section holding one must carry the label.
  for (const page of readAuthoredDocs()) {
    const body = page.markdown.split(/^---$/m).slice(2).join("---");
    for (const section of body.split(/^##+ /m).slice(1)) {
      if (!/^```(bash|sh|shell|powershell)\b/m.test(section)) continue;
      assert.match(section, /Unvalidated — verify against your deployment\./, `${page.path}: "${section.split("\n")[0]}" runs a command without the label`);
    }
  }
});

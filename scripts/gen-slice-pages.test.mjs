import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildBundle, readManifests, readPlaybooks } from "./gen-slice-pages.mjs";
import { CONCEPT_EPOCH, conceptTimestamp, gapSentence, parseConcept } from "./slice-concept.mjs";
import { renderConceptPage } from "./slice-template.mjs";
import { checkFrontmatter, checkLinks } from "./validate-slice-concepts.mjs";
import { scanHtml } from "./validate-slice-voice.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs");

/** A slice that exercises every surface state the schema allows. */
const everySurface = {
  schemaVersion: "honua.slice/v1",
  slug: "sample-slice",
  title: "Publish a dataset",
  variant: "map",
  label: "preview",
  capabilityKeys: ["process.ogc-api-processes"],
  sample: { id: "gp-runner", runtimeKind: "server" },
  setup: {
    console: { state: "available", route: "/operate/publish" },
    cli: { state: "available", command: "honua publish ./roads.gpkg" },
    adminApi: { state: "partial", issue: "https://github.com/honua-io/honua-server/issues/3275", snippet: "POST /admin/datasets" },
  },
  use: {
    js: { state: "available", snippet: "await client.datasets().publish(source);" },
    python: { state: "partial", issue: "https://github.com/honua-io/honua-sdk-python/issues/196", snippet: "client.datasets().publish(source)" },
    dotnet: { state: "absent", issue: "https://github.com/honua-io/honua-sdk-dotnet/issues/293" },
    mobile: { state: "absent", issue: "https://github.com/honua-io/honua-server/issues/2448" },
  },
  ask: { mcp: { state: "available", tools: ["publish_dataset", "list_datasets"] } },
  underneath: { protocols: ["OGC API - Features"], evidencePage: "evidence-process-ogc-api-processes.html" },
  related: ["reference-slice"],
};

/** The reference-shaped variant: no honest hero map, so no sample. */
const referenceShaped = {
  schemaVersion: "honua.slice/v1",
  slug: "reference-slice",
  title: "Operate a deployment",
  variant: "reference",
  capabilityKeys: ["process.ogc-api-processes"],
  setup: {
    console: { state: "absent", issue: "https://github.com/honua-io/honua-site/issues/219" },
    cli: { state: "available", command: "honua status" },
    adminApi: { state: "absent", issue: "https://github.com/honua-io/honua-server/issues/3275" },
  },
  use: {
    js: { state: "available", snippet: "await client.health().ready();" },
    python: { state: "absent", issue: "https://github.com/honua-io/honua-sdk-python/issues/196" },
    dotnet: { state: "absent", issue: "https://github.com/honua-io/honua-sdk-dotnet/issues/293" },
    mobile: { state: "absent", issue: "https://github.com/honua-io/honua-server/issues/2448" },
  },
  ask: { mcp: { state: "absent", issue: "https://github.com/honua-io/honua-server/issues/3269" } },
  underneath: { protocols: ["OGC API - Processes"] },
  related: [],
};

const fixtureBundle = () => buildBundle({ manifests: [everySurface, referenceShaped] });

const committed = () => {
  const files = new Map();
  for (const name of ["index.md", "index.html"]) files.set(name, fs.readFileSync(path.join(DOCS, name), "utf8"));
  for (const manifest of readManifests()) {
    for (const name of ["index.md", "index.html"]) {
      files.set(`${manifest.slug}/${name}`, fs.readFileSync(path.join(DOCS, manifest.slug, name), "utf8"));
    }
  }
  for (const playbook of readPlaybooks()) {
    for (const name of ["index.md", "index.html"]) {
      files.set(`playbooks/${playbook.slug}/${name}`, fs.readFileSync(path.join(DOCS, "playbooks", playbook.slug, name), "utf8"));
    }
  }
  return files;
};

/** One authored playbook, in the shape readPlaybooks() hands the generator. */
const samplePlaybook = {
  slug: "sample-playbook",
  title: "Do the thing end to end",
  description: "Bring it up, check it, and know what the refusal means.",
  markdown: [
    "---",
    "type: playbook",
    'title: "Do the thing end to end"',
    'description: "Bring it up, check it, and know what the refusal means."',
    'resource: "https://honua.io/docs/playbooks/sample-playbook/"',
    'tags: ["shape:playbook", "task:sample-playbook", "capability:ops.health"]',
    'timestamp: "2026-08-28"',
    "---",
    "",
    "# Do the thing end to end",
    "",
    "Bring it up, check it, and know what the refusal means.",
    "",
    "## Bring it up",
    "",
    "```bash",
    "docker compose up -d",
    "```",
    "",
    "## Next",
    "",
    "- [Publish a dataset](../../sample-slice/index.md)",
    "",
  ].join("\n"),
};

// --- determinism -------------------------------------------------------------

test("the same inputs produce the same bytes", () => {
  assert.deepEqual([...fixtureBundle().entries()], [...fixtureBundle().entries()]);
  assert.deepEqual([...buildBundle().entries()], [...buildBundle().entries()]);
});

test("the committed bundle is what the manifests produce", () => {
  const sorted = (files) => [...files.entries()].sort(([a], [b]) => a.localeCompare(b));
  assert.deepEqual(sorted(buildBundle()), sorted(committed()));
});

test("the concept timestamp is pinned, never read off the clock", () => {
  assert.equal(conceptTimestamp({}), CONCEPT_EPOCH);
  assert.equal(conceptTimestamp({ SOURCE_DATE_EPOCH: "0" }), "1970-01-01T00:00:00Z");
  const concept = fixtureBundle().get("sample-slice/index.md");
  assert.match(concept, /^timestamp: "2026-08-27"$/m);
  // A wall-clock build time would make every regeneration a diff, so the pinned
  // epoch has to be the only date anywhere in the emitted concept.
  assert.deepEqual(concept.match(/\d{4}-\d{2}-\d{2}/g), [CONCEPT_EPOCH]);
});

// --- OKF-first: the concept is canonical, the page is its projection ---------

test("every emitted concept is a valid OKF concept", () => {
  for (const [name, contents] of fixtureBundle()) {
    if (!name.endsWith(".md")) continue;
    assert.deepEqual(checkFrontmatter(contents), [], `${name} is not a valid concept`);
  }
  for (const [name, contents] of buildBundle()) {
    if (!name.endsWith(".md")) continue;
    assert.deepEqual(checkFrontmatter(contents), [], `${name} is not a valid concept`);
  }
});

test("the page is a pure function of the concept alone", () => {
  for (const [name, contents] of fixtureBundle()) {
    if (!name.endsWith(".md")) continue;
    const page = fixtureBundle().get(name.replace(/\.md$/, ".html"));
    assert.equal(renderConceptPage(contents), page, `${name} does not reproduce its page`);
  }
});

test("the concept carries the frontmatter the amendment asks for", () => {
  const fields = parseConcept(fixtureBundle().get("sample-slice/index.md")).fields;
  assert.equal(fields.type, "slice");
  assert.equal(fields.title, "Publish a dataset");
  assert.equal(fields.resource, "https://honua.io/docs/sample-slice/");
  assert.ok(fields.description.startsWith("Publish a dataset — "));
  assert.ok(fields.tags.includes("shape:map"));
  assert.ok(fields.tags.includes("label:preview"));
  assert.ok(fields.tags.includes("protocol:ogc-api-features"));
  assert.ok(fields.tags.includes("capability:process.ogc-api-processes"));
  assert.ok(fields.tags.includes("sdk:python"), "a partial SDK is still a reachable facet");
  assert.ok(!fields.tags.includes("sdk:mobile"), "an absent SDK is not a facet");
});

test("related slices and capability keys are relative markdown links", () => {
  const concept = fixtureBundle().get("sample-slice/index.md");
  assert.ok(concept.includes("- [reference-slice](../reference-slice/index.md)"));
  assert.ok(concept.includes("[process.ogc-api-processes](../../evidence-process-ogc-api-processes.html)"));
  const index = fixtureBundle().get("index.md");
  assert.ok(index.includes("](sample-slice/index.md)"));
  assert.ok(index.includes("](reference-slice/index.md)"));
});

test("the committed bundle's relative edges and anchors all resolve", () => {
  assert.deepEqual(checkLinks([DOCS]).broken, []);
});

test("a concept edge becomes a page edge in the HTML projection", () => {
  const page = fixtureBundle().get("sample-slice/index.html");
  assert.ok(page.includes('href="../reference-slice/"'), "index.md edges resolve to the page directory");
  assert.ok(!page.includes("index.md\""), "no raw concept path leaks into the page");
});

// --- the honest-gap component ------------------------------------------------

test("an absent or partial surface renders one sentence and its issue link", () => {
  const page = fixtureBundle().get("sample-slice/index.html");
  const gaps = [...page.matchAll(/<p class="slice-gap">(.*?)<\/p>/g)].map((match) => match[1]);
  assert.equal(gaps.length, 4, "one gap per absent/partial surface, and no others");
  assert.ok(gaps.some((gap) => /Partly there in the Admin API/.test(gap)));
  assert.ok(gaps.some((gap) => /Partly there in the Python SDK/.test(gap)));
  assert.ok(gaps.some((gap) => /Not in the \.NET SDK yet/.test(gap)));
  assert.ok(gaps.some((gap) => /Not in the mobile SDKs yet/.test(gap)));
  for (const gap of gaps) {
    assert.match(gap, /href="https:\/\/github\.com\/honua-io\/[a-z-]+\/issues\/\d+"/, "every gap links its issue");
  }
});

test("an available surface renders its payload and no gap", () => {
  const page = fixtureBundle().get("sample-slice/index.html");
  const js = page.slice(page.indexOf('id="use-javascript-panel"'), page.indexOf('id="use-python-panel"'));
  assert.ok(js.includes("await client.datasets().publish(source);"));
  assert.ok(!js.includes("slice-gap"), "an available surface never renders a gap sentence");
  assert.ok(page.includes("<code>publish_dataset</code>"), "MCP tools render where MCP is available");
});

test("the gap sentence stays inside the voice budget", () => {
  for (const state of ["absent", "partial"]) {
    const sentence = gapSentence("python", state, "https://github.com/honua-io/honua-sdk-python/issues/196");
    const words = sentence.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").split(/\s+/).length;
    assert.ok(words <= 20, `the honest-gap sentence is ${words} words`);
  }
});

test("no tab is ever empty: every tab panel carries a payload or a gap", () => {
  for (const name of ["sample-slice/index.html", "reference-slice/index.html"]) {
    const page = fixtureBundle().get(name);
    for (const panel of page.matchAll(/<div role="tabpanel"[^>]*>([\s\S]*?)(?=<div role="tabpanel"|<\/div><\/div><\/section>)/g)) {
      const body = panel[1];
      assert.ok(/slice-gap|code-card|<p>/.test(body), `an empty tab rendered in ${name}`);
    }
  }
});

// --- the template ------------------------------------------------------------

test("both variants render from the same template family", () => {
  const map = fixtureBundle().get("sample-slice/index.html");
  const reference = fixtureBundle().get("reference-slice/index.html");
  assert.ok(map.includes("slice-shape-map"));
  assert.ok(reference.includes("slice-shape-reference"));
  assert.ok(map.includes('id="see-it-run"'), "the map-shaped variant leads with the sample");
  assert.ok(!reference.includes('id="see-it-run"'), "the reference-shaped variant has no honest hero map");
  for (const page of [map, reference]) {
    for (const panel of ['id="what-it-is"', 'id="set-it-up"', 'id="use-it"', 'id="ask-it"', 'id="underneath"']) {
      assert.ok(page.includes(panel), `${panel} is missing from a variant`);
    }
    assert.ok(page.includes('data-tab-group="setup"') && page.includes('data-tab-group="use"'));
  }
});

test("the two tab groups are visibly different controls", () => {
  const page = fixtureBundle().get("sample-slice/index.html");
  assert.ok(page.includes('class="slice-tabs tabs-pill" data-tab-group="setup"'));
  assert.ok(page.includes('class="slice-tabs tabs-rule" data-tab-group="use"'));
});

test("tabs are keyboard-operable and deep-linkable", () => {
  const page = fixtureBundle().get("sample-slice/index.html");
  assert.equal((page.match(/role="tablist"/g) ?? []).length, 2);
  assert.equal((page.match(/aria-selected="true"/g) ?? []).length, 2, "exactly one selected tab per group");
  assert.equal((page.match(/aria-hidden="false"/g) ?? []).length, 2, "exactly one visible panel per group");
  assert.equal((page.match(/tabindex="0" data-tab-value/g) ?? []).length, 2, "only the selected tab is in the tab order");
  // The deep-link value and the concept's heading anchor are the same slug, so
  // `#python` from a markdown edge and `#use=python` from the tab strip agree.
  const concept = fixtureBundle().get("sample-slice/index.md");
  for (const heading of concept.matchAll(/^### (.+)$/gm)) {
    const slug = heading[1].toLowerCase().replace(/[.]/g, "").replace(/\s/g, "-");
    assert.ok(page.includes(`data-tab-value="${slug}"`) || page.includes(`id="${slug}"`), `no anchor for ${heading[1]}`);
  }
});

test("the Console tab is a route, a paragraph and a way across to the other tabs", () => {
  const page = fixtureBundle().get("sample-slice/index.html");
  const consolePanel = page.slice(page.indexOf('id="setup-console-panel"'), page.indexOf('id="setup-cli-panel"'));
  assert.ok(consolePanel.includes("<code>/operate/publish</code>"));
  assert.ok(consolePanel.includes('href="#cli"') && consolePanel.includes('href="#admin-api"'));
  assert.ok(!consolePanel.includes("<img"), "v1 reserves no screenshot slot (the harness is #219)");
});

test("a preview label is rendered by the template, never hand-written", () => {
  assert.ok(fixtureBundle().get("sample-slice/index.html").includes('<p class="slice-label">preview</p>'));
  assert.ok(!fixtureBundle().get("reference-slice/index.html").includes("slice-label"));
});

test("a code block is a first-class object", () => {
  const page = fixtureBundle().get("sample-slice/index.html");
  assert.ok(page.includes('<button type="button" class="code-copy" data-code-copy>Copy</button>'));
  assert.ok(page.includes('<pre tabindex="0">'), "long snippets scroll inside their own box");
  assert.ok(page.includes('<code class="language-python">'));
});

test("the editable line is marked when a snippet has one, and not invented when it does not", () => {
  const withHost = buildBundle({
    manifests: [{ ...referenceShaped, use: { ...referenceShaped.use, js: { state: "available", snippet: "const client = honua('https://your-server.example');\nawait client.health().ready();" } } }],
  }).get("reference-slice/index.html");
  assert.ok(withHost.includes('<span class="code-editable">'));
  assert.ok(!fixtureBundle().get("sample-slice/index.html").includes("code-editable"));
});

// --- the gates ---------------------------------------------------------------

test("rendered pages are clean against the voice banlist", () => {
  for (const [name, contents] of fixtureBundle()) {
    if (name.endsWith(".html")) assert.deepEqual(scanHtml(contents), [], `${name} fails the banlist`);
  }
  for (const [name, contents] of buildBundle()) {
    if (name.endsWith(".html")) assert.deepEqual(scanHtml(contents), [], `${name} fails the banlist`);
  }
});

test("pages carry no inline script or style, so the site CSP holds", () => {
  for (const [name, contents] of buildBundle()) {
    if (!name.endsWith(".html")) continue;
    assert.ok(!/<script(?![^>]*\bsrc=)/.test(contents), `${name} has an inline script`);
    assert.ok(!/<style\b/.test(contents), `${name} has an inline style`);
  }
});

test("the bundle index is the entry point, and lists every slice", () => {
  const index = fixtureBundle().get("index.md");
  assert.match(index, /^type: index$/m);
  assert.match(index, /^resource: "https:\/\/honua\.io\/docs\/"$/m);
  assert.equal(checkFrontmatter(index).length, 0);
  assert.ok(index.includes("[Publish a dataset](sample-slice/index.md)"));
  assert.ok(index.includes("[Operate a deployment](reference-slice/index.md)"));
});

// --- authored playbooks join the same bundle (WS4) ---------------------------

const playbookBundle = () =>
  buildBundle({ manifests: [everySurface, referenceShaped], playbooks: [samplePlaybook] });

test("a playbook's bytes are carried into the bundle unchanged", () => {
  // Slices are built; playbooks are authored. The generator must not reformat,
  // re-derive or re-order anything in one — the file on disk is the concept.
  assert.equal(playbookBundle().get("playbooks/sample-playbook/index.md"), samplePlaybook.markdown);
});

test("a playbook page is a projection of its concept, like every other page", () => {
  const concept = playbookBundle().get("playbooks/sample-playbook/index.md");
  assert.equal(playbookBundle().get("playbooks/sample-playbook/index.html"), renderConceptPage(concept));
});

test("the bundle root lists the playbooks, so one fetch is still the whole map", () => {
  const index = playbookBundle().get("index.md");
  assert.ok(index.includes("## Playbooks"));
  assert.ok(
    index.includes(
      "- [Do the thing end to end](playbooks/sample-playbook/index.md) — Bring it up, check it, and know what the refusal means."
    )
  );
  // Built from the authored frontmatter, which is what puts the authored half
  // behind the same `--check` drift gate as the generated half.
  assert.equal(checkFrontmatter(index).length, 0);
});

test("a bundle with no playbooks has no Playbooks section", () => {
  assert.ok(!buildBundle({ manifests: [everySurface], playbooks: [] }).get("index.md").includes("## Playbooks"));
});

test("the hero names a playbook a playbook, and the playbook index Playbooks", () => {
  assert.ok(playbookBundle().get("playbooks/sample-playbook/index.html").includes('<p class="kicker">Playbook</p>'));
  assert.ok(playbookBundle().get("sample-slice/index.html").includes('<p class="kicker">Capability slice</p>'));
  assert.ok(playbookBundle().get("index.html").includes('<p class="kicker">Capability slices</p>'));
});

test("a playbook page resolves its assets from three levels down", () => {
  const page = playbookBundle().get("playbooks/sample-playbook/index.html");
  assert.ok(page.includes('href="../../../assets/slice.css"'), "read off the concept's own resource URL");
  assert.ok(page.includes('href="../../sample-slice/"'), "a concept edge still becomes a page edge");
});

test("the committed playbooks are the ones the bundle ships", () => {
  const slugs = readPlaybooks().map((playbook) => playbook.slug);
  assert.deepEqual(slugs, ["install-with-docker", "publish-a-service", "run-a-bounded-gp-job"]);
  for (const slug of slugs) {
    assert.ok(fs.existsSync(path.join(DOCS, "playbooks", slug, "index.html")), `${slug} has no rendered page`);
  }
});

test("every capability facet on a committed concept resolves in the capability catalog", () => {
  // The one rule that keeps an authored `capability:` tag from becoming a
  // pointer at nothing. An id the catalog does not carry — `jobs.runner` is
  // today's example — belongs in the prose with its gap sentence, not in the
  // facet list where the finder would offer it as a filter.
  const keys = new Set(
    JSON.parse(fs.readFileSync(path.join(ROOT, "data", "capabilities.v1.json"), "utf8")).capabilities.map(
      (capability) => capability.key
    )
  );
  for (const [name, contents] of buildBundle()) {
    if (!name.endsWith(".md")) continue;
    for (const tag of parseConcept(contents).fields.tags ?? []) {
      if (!tag.startsWith("capability:")) continue;
      assert.ok(keys.has(tag.slice("capability:".length)), `${name}: ${tag} resolves in no capability key`);
    }
  }
});

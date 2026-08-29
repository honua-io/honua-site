import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CONCEPT_TYPES,
  checkFrontmatter,
  checkLinks,
  headingAnchors,
  isRealCalendarDate,
  linksOutsideFences,
  parseFrontmatter,
  slugify,
  stripHtmlTags,
} from "./validate-slice-concepts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VALID = path.join(ROOT, "scripts", "test", "concepts", "valid");
const BROKEN = path.join(ROOT, "scripts", "test", "concepts", "broken");

const read = (dir, name) => fs.readFileSync(path.join(dir, name), "utf8");

test("the documented concept type set is the three live types plus the reserved three", () => {
  assert.deepEqual(CONCEPT_TYPES, ["slice", "index", "capability", "tool", "error", "playbook"]);
  for (const type of ["slice", "index", "playbook"]) {
    assert.deepEqual(checkFrontmatter(`---\ntype: ${type}\n---\n`), [], `${type} should be live`);
  }
});

test("a playbook is validated like any other concept, not waved through", () => {
  const playbook = read(VALID, "playbook.md");
  assert.deepEqual(checkFrontmatter(playbook), []);
  const fields = parseFrontmatter(playbook).fields;
  assert.equal(fields.type, "playbook");
  assert.ok(fields.tags.includes("shape:playbook"));
  // The optional-field rules are type-independent, so a playbook that gets one
  // wrong fails exactly the way a slice would.
  assert.ok(
    checkFrontmatter('---\ntype: playbook\nresource: "/docs/playbooks/x/"\n---\n').some((problem) =>
      /`resource` must be an absolute http\(s\) URL/.test(problem)
    )
  );
  assert.ok(
    checkFrontmatter("---\ntype: playbook\ntimestamp: last Tuesday\n---\n").some((problem) =>
      /`timestamp` must be an ISO-8601/.test(problem)
    )
  );
});

test("accepts a well-formed OKF concept", () => {
  assert.deepEqual(checkFrontmatter(read(VALID, "geoprocessing.md")), []);
  assert.deepEqual(checkFrontmatter(read(VALID, "first-map.md")), []);
  const parsed = parseFrontmatter(read(VALID, "geoprocessing.md"));
  assert.equal(parsed.fields.type, "slice");
  assert.equal(parsed.fields.resource, "https://docs.honua.io/geoprocessing/");
  assert.deepEqual(parsed.fields.tags, ["geoprocessing", "ogc-api-processes"]);
  assert.deepEqual(parseFrontmatter(read(VALID, "first-map.md")).fields.tags, ["first-map", "maplibre"]);
});

test("rejects a concept with no type and a concept with an unknown type", () => {
  assert.ok(checkFrontmatter(read(BROKEN, "missing-type.md")).some((problem) => /no `type`/.test(problem)));
  assert.ok(checkFrontmatter(read(BROKEN, "unknown-type.md")).some((problem) => /unknown `type` "runbook"/.test(problem)));
  assert.ok(checkFrontmatter("# no frontmatter at all\n").some((problem) => /missing OKF frontmatter/.test(problem)));
  assert.ok(checkFrontmatter("---\ntype: slice\n").some((problem) => /never closed/.test(problem)));
});

test("rejects a reserved type until its concepts are actually emitted", () => {
  assert.ok(checkFrontmatter("---\ntype: capability\n---\n").some((problem) => /reserved and not emitted/.test(problem)));
});

test("rejects malformed optional frontmatter", () => {
  const problems = checkFrontmatter(read(BROKEN, "malformed-frontmatter.md"));
  assert.ok(problems.some((problem) => /`resource` must be an absolute http\(s\) URL/.test(problem)));
  assert.ok(problems.some((problem) => /`timestamp` must be an ISO-8601/.test(problem)));
  assert.ok(checkFrontmatter("---\ntype: slice\ntitle: \n---\n").some((problem) => /`title` must be a non-empty string/.test(problem)));
  assert.ok(checkFrontmatter("---\ntype: slice\ntags: []\n---\n").some((problem) => /`tags` must be a non-empty list/.test(problem)));
});

// --- the check_links.py port -------------------------------------------------

test("stripHtmlTags agrees with check_links.py's HTML_TAG_RE substitution", () => {
  // Expected values produced by the Python original's HTML_TAG_RE.sub("", …)
  // over `<[^>]+>`, including the cases where that pattern deliberately does
  // not match: unclosed `<`, bare `<>`, and the nested `<a<b>` that it eats
  // whole. Pinned rather than recomputed here so the test is a reference
  // table, not a second copy of a tag-stripping regex.
  assert.deepEqual(
    [
      "<em>HTML</em> in a heading",
      "plain heading",
      "unclosed <a heading",
      "bare <> angle brackets",
      "nested <a<b> tags",
      "a<b<c>d",
      "<>",
      "<",
      ">",
      "trailing <",
      "<a href='x'>link</a> and <br/>",
    ].map(stripHtmlTags),
    [
      "HTML in a heading",
      "plain heading",
      "unclosed <a heading",
      "bare <> angle brackets",
      "nested  tags",
      "ad",
      "<>",
      "<",
      ">",
      "trailing <",
      "link and ",
    ]
  );
});

test("slugify matches the GitHub slug algorithm the Python original implements", () => {
  // Expected values produced by geospatial-mcp tools/check_links.py slugify().
  assert.deepEqual(
    [
      "Set it up",
      "Use it — JS, Python, .NET",
      "Ask it: MCP",
      "Underneath (the fine print)",
      "What's new in 2026.1?",
      "OGC API - Processes",
      "`code` in a heading",
      "<em>HTML</em> in a heading",
      "Foo_bar-baz 123",
      "Ünïcödé heading",
      "Em—dash and en–dash",
      "Curly “quotes” and ‘apostrophes’",
      "A/B testing & C+D",
      "100% coverage",
    ].map(slugify),
    [
      "set-it-up",
      "use-it--js-python-net",
      "ask-it-mcp",
      "underneath-the-fine-print",
      "whats-new-in-20261",
      "ogc-api---processes",
      "code-in-a-heading",
      "html-in-a-heading",
      "foo_bar-baz-123",
      "ünïcödé-heading",
      "emdash-and-endash",
      "curly-quotes-and-apostrophes",
      "ab-testing--cd",
      "100-coverage",
    ]
  );
});

test("headingAnchors appends GitHub's -1/-2 duplicate suffixes and skips fenced code", () => {
  const markdown = [
    "# Use it",
    "## Use it",
    "### Use it",
    "```",
    "# Not a heading",
    "```",
    "~~~",
    "## Also not a heading",
    "~~~",
    "## ###",
    "#### Trailing hashes ###",
  ].join("\n");
  assert.deepEqual(
    [...headingAnchors(markdown)].sort(),
    ["trailing-hashes", "use-it", "use-it-1", "use-it-2"]
  );
});

test("resolves relative links, same-file anchors, and duplicate-heading anchors", () => {
  const { broken, checked } = checkLinks([VALID]);
  assert.deepEqual(broken, []);
  // Every relative link across the three valid fixtures, playbook included —
  // the link half of the check knows nothing about a concept's `type`.
  assert.equal(checked, 6);
});

test("rejects a dangling relative link and a dead anchor", () => {
  const { broken } = checkLinks([BROKEN]);
  assert.ok(broken.some((entry) => /no-such-slice\.md \(file not found\)/.test(entry)), broken.join("\n"));
  assert.ok(broken.some((entry) => /anchor '#ask-it' is not a heading/.test(entry)), broken.join("\n"));
});

test("skips external, mail, tel, data and honua:// targets", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "scripts", "test", "concepts", ".tmp-"));
  try {
    fs.writeFileSync(
      path.join(dir, "external.md"),
      [
        "---",
        "type: slice",
        "---",
        "",
        "# External only",
        "",
        "[https](https://example.com/x.md#nope) [mail](mailto:info@honua.io)",
        "[tel](tel:+1808) [data](data:text/plain,x) [resource](honua://dataset/x)",
        '[titled](external.md "a link title")',
      ].join("\n")
    );
    const { broken, checked } = checkLinks([dir]);
    assert.deepEqual(broken, []);
    assert.equal(checked, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a link inside a fenced example is not an edge", () => {
  // The one deliberate divergence from check_links.py. A document showing what
  // a broken link looks like must not fail the gate for saying so, and the two
  // halves of this file must agree about what a fence is.
  const dir = fs.mkdtempSync(path.join(ROOT, "scripts", "test", "concepts", ".tmp-"));
  try {
    fs.writeFileSync(
      path.join(dir, "fenced.md"),
      [
        "---",
        "type: slice",
        "---",
        "",
        "# Fenced examples",
        "",
        "```markdown",
        "[example](missing.md)",
        "[dead anchor](#never-a-heading)",
        "```",
        "",
        "~~~",
        "[tilde fence too](also-missing.md)",
        "~~~",
        "",
        "But [this one](#fenced-examples) is real.",
      ].join("\n")
    );
    const { broken, checked } = checkLinks([dir]);
    assert.deepEqual(broken, [], "nothing inside a fence is an edge");
    assert.equal(checked, 1, "only the prose link is checked");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a fenced link is still not an edge when the fence holds a heading", () => {
  // headingAnchors() and the link scan share one walk, so a fence that opens
  // with a `#` line cannot desynchronise them.
  const markdown = ["# Real", "", "```", "# Fake heading", "[x](nope.md)", "```", ""].join("\n");
  assert.deepEqual([...headingAnchors(markdown)], ["real"]);
  assert.deepEqual([...linksOutsideFences(markdown)], []);
});

test("rejects a date that parses only by rolling over into the next month", () => {
  for (const bad of ["2026-02-30", "2026-04-31", "2026-02-29", "2026-00-10", "2026-06-31T12:00:00Z"]) {
    assert.ok(
      checkFrontmatter(`---\ntype: slice\ntimestamp: "${bad}"\n---\n`).some((problem) => /`timestamp` must be an ISO-8601/.test(problem)),
      `${bad} names no real day and must be rejected`
    );
    assert.equal(isRealCalendarDate(bad), false, bad);
  }
  for (const good of ["2026-08-27", "2024-02-29", "2026-12-31", "2026-01-01T00:00:00Z"]) {
    assert.deepEqual(checkFrontmatter(`---\ntype: slice\ntimestamp: "${good}"\n---\n`), [], good);
    assert.equal(isRealCalendarDate(good), true, good);
  }
});

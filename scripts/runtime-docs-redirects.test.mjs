import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

import { loadRedirects, renderRedirectPage, uncoveredReferences, writeRedirects } from "./gen-runtime-docs-redirects.mjs";

const root = new URL("../", import.meta.url);

function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), "runtime-docs-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("Committed data loads and every page points off-site at its target", () => {
  const data = loadRedirects();
  withTemp((dir) => {
    writeRedirects(dir, data);
    for (const { path, target } of data.redirects) {
      const html = readFileSync(join(dir, path, "index.html"), "utf8");
      assert.ok(html.includes(`<link rel="canonical" href="${target}">`), `${path}: canonical`);
      assert.ok(html.includes(`content="0; url=${target}"`), `${path}: meta refresh`);
      assert.ok(html.includes('<meta name="robots" content="noindex">'), `${path}: noindex`);
    }
  });
});

test("No runtime path collides with a slice or playbook page", () => {
  const slugs = new Set([
    ...readdirSync(new URL("slices/", root)).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5)),
    "playbooks",
  ]);
  for (const { path } of loadRedirects().redirects) {
    assert.ok(!slugs.has(path.split("/")[0]), `${path} shadows a generated docs page`);
  }
});

test("Writing refuses to replace a page another generator produced", () => {
  withTemp((dir) => {
    const [first] = loadRedirects().redirects;
    mkdirSync(join(dir, first.path), { recursive: true });
    writeFileSync(join(dir, first.path, "index.html"), "slice page");
    assert.throws(() => writeRedirects(dir), /already exists/);
    assert.equal(readFileSync(join(dir, first.path, "index.html"), "utf8"), "slice page");
  });
});

test("The redirect script carries the fragment to the target", () => {
  const source = readFileSync(new URL("assets/docs-redirect.js", root), "utf8");
  let replaced;
  vm.runInNewContext(source, {
    document: { querySelector: (selector) => (selector === 'link[rel="canonical"]' ? { href: "https://example.test/page" } : null) },
    location: { hash: "#redis-is-optional-postgis-is-not", replace: (url) => { replaced = url; } },
  });
  assert.equal(replaced, "https://example.test/page#redis-is-optional-postgis-is-not");
});

test("Rendered pages escape the target and load the script from self", () => {
  const html = renderRedirectPage('https://example.test/a"b<c');
  assert.ok(html.includes('href="https://example.test/a&quot;b&lt;c"'));
  assert.ok(html.includes('<script src="/assets/docs-redirect.js"></script>'));
  assert.doesNotMatch(html, /<script>/, "no inline script for the strict CSP to block");
});

test("Coverage check names server paths and anchors the data does not cover", () => {
  const data = {
    redirects: [{ path: "guides/deploy/docker-compose/", target: "https://example.test/x", anchors: ["known"] }],
  };
  const registry = {
    references: [
      { url: "https://honua.io/docs/guides/deploy/docker-compose/#known" },
      { url: "https://honua.io/docs/guides/deploy/docker-compose/" },
      { url: "https://honua.io/docs/guides/deploy/docker-compose/#renamed" },
      { url: "https://honua.io/docs/guides/deploy/troubleshooting/#imports" },
      { url: "https://docs.honua.io/guides/deploy/troubleshooting/" },
    ],
  };
  assert.deepEqual(uncoveredReferences(registry, data), [
    "https://honua.io/docs/guides/deploy/docker-compose/#renamed: anchor renamed not listed for guides/deploy/docker-compose/",
    "https://honua.io/docs/guides/deploy/troubleshooting/#imports: no redirect for guides/deploy/troubleshooting/",
    "https://docs.honua.io/guides/deploy/troubleshooting/: not under https://honua.io/docs/",
  ]);
});

test("Malformed entries are rejected", () => {
  withTemp((dir) => {
    const file = join(dir, "data.json");
    const base = { format: "honua.site.runtime-docs-redirects.v1", schemaVersion: 1 };
    const cases = [
      [{ path: "guides/x", target: "https://example.test/x", anchors: [] }, /ending in a slash/],
      [{ path: "guides/x/", target: "http://example.test/x", anchors: [] }, /must be https/],
      [{ path: "guides/x/", target: "https://example.test/x#h", anchors: [] }, /no query or fragment/],
      [{ path: "guides/x/", target: "https://honua.io/docs/guides/x/", anchors: [] }, /back at honua.io/],
      [{ path: "guides/x/", target: "https://example.test/x", anchors: ["#h"] }, /heading ids/],
    ];
    for (const [entry, pattern] of cases) {
      writeFileSync(file, JSON.stringify({ ...base, redirects: [entry] }));
      assert.throws(() => loadRedirects(file), pattern);
    }
  });
});

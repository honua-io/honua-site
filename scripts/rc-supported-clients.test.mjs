import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../client-compatibility.html", import.meta.url), "utf8");

test("2026.1 RC supported clients stay distinct from the registry latest", () => {
  const start = html.indexOf('id="rc-clients"');
  assert.ok(start > 0, "missing RC supported-clients section");
  const section = html.slice(start, html.indexOf("<h2>", start));
  assert.match(section, /ghcr\.io\/honua-io\/honua-server/);
  assert.match(section, /2026\.1-rc/);
  assert.match(section, /@honua\/sdk-js/);
  assert.match(section, /0\.2\.10/);
  assert.match(section, /honua-sdk/);
  assert.match(section, /0\.1\.19/);
  assert.match(section, /Honua\.Sdk/);
  assert.match(section, /1\.12\.0/);
  assert.match(section, /Preview/);
  assert.match(section, /single-tenant/);
  assert.doesNotMatch(section, /0\.1\.9-beta\.0/);
  assert.match(html, /dotnet add package Honua\.Sdk --version 1\.13\.1/);
  assert.doesNotMatch(html, /0\.1\.9-beta\.0/);
});

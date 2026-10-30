import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../deploy-operations-2026-1.html", import.meta.url), "utf8");
const operations = fs.readFileSync(new URL("../operations.html", import.meta.url), "utf8");

test("the customer envelope page names the RC pins", () => {
  assert.match(html, /ghcr\.io\/honua-io\/honua-server:2026\.1-rc/);
  assert.match(html, /@honua\/sdk-js/);
  assert.match(html, /0\.2\.10/);
  assert.match(html, /honua-sdk/);
  assert.match(html, /0\.1\.19/);
  assert.match(html, /Honua\.Sdk/);
  assert.match(html, /1\.12\.0/);
  assert.match(html, /Honua Studio/);
  assert.match(html, /single-tenant only/);
  assert.match(html, /18d4301f82897ddaabd96b9e4e9314e8aefac311/);
  assert.match(html, /30 seconds/);
  assert.match(html, /No long-running jobs or GP workers in the serving function/);
  assert.match(html, /512 MB/);
  assert.match(html, /Cold starts/);
  assert.match(html, /Reserved concurrency/);
  assert.match(html, /qualification pending/);
  assert.doesNotMatch(html, /0\.1\.9-beta\.0/);
  assert.doesNotMatch(html, /not yet cut/);
  assert.doesNotMatch(html, /Whole BuiltInProcessCatalog GA/);
  assert.match(operations, /deploy-operations-2026-1\.html/);
});

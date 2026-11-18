import assert from "node:assert/strict";
import test from "node:test";

import { buildBundle } from "./gen-slice-pages.mjs";

const routeLimits =
  /feature, map and image queries and feature-item reads above 600[,;] edits above 120[,;] sign-in above 120[,;] and geoprocessing above 60/;

test("troubleshooting says a web ACL block is a 403 and names the route limits", () => {
  const html = buildBundle().get("guides/deploy/troubleshooting/index.html");
  assert.equal(typeof html, "string");
  const section = html.slice(html.indexOf('id="rate-limiting"'));
  assert.match(section, /A web ACL block is a 403/);
  assert.match(section, routeLimits);
  assert.match(section, /challenged above 1,000 in that window, which is not a 403/);
});

test("launch stack guide names the fixed web ACL route limits", () => {
  const html = buildBundle().get("guides/deploy/aws-launch-stack/index.html");
  assert.equal(typeof html, "string");
  assert.match(html, /own web ACL blocks every request above 2,000/);
  assert.match(html, routeLimits);
  assert.match(html, /challenges browser page loads above 1,000/);
  assert.match(html, /waf\.yaml/);
});

import assert from "node:assert/strict";
import test from "node:test";

import { buildBundle } from "./gen-slice-pages.mjs";

test("launch stack guide defers deletion protection until the install exists", () => {
  const html = buildBundle().get("guides/deploy/aws-launch-stack/index.html");
  assert.equal(typeof html, "string");
  assert.match(html, /only after every other resource exists/);
  assert.match(html, /A failed first create is not blocked by deletion protection/);
  assert.match(html, /turn deletion protection off on that database and on that load balancer/);
  assert.doesNotMatch(html, /from the first create/);
});

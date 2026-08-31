import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = path.join(
  ROOT,
  "assets/sdk-samples/0.1.9-beta.0/c99e711/realtime-incident-dashboard/assets/index-BxcRvU-T.js",
);

test("incident SSE named-event listener ignores native connection errors and remains disposable", () => {
  const bundle = readFileSync(bundlePath, "utf8");

  assert.match(
    bundle,
    /let e=e=>\{typeof e\.data==`string`&&o\(e\.data\)\};r\.addEventListener\(t,e\),a\.push\(\[t,e\]\)/,
  );
  assert.doesNotMatch(bundle, /let e=e=>o\(e\.data\);r\.addEventListener\(t,e\)/);
});

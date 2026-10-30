import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const docs = fs.readFileSync(new URL("../docs.html", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../windows-quickstart.html", import.meta.url), "utf8");
const nightly = "273b4c616e806b8ac2809946659986960a1803e55bda79d99db5f3955b6c30b9";

test("the Windows quickstart and docs fast lane pin the RC image", () => {
  for (const html of [docs, page]) {
    assert.match(html, /ghcr\.io\/honua-io\/honua-server:2026\.1-rc/);
    assert.doesNotMatch(html, /CANDIDATE_SERVER_IMAGE/);
    assert.doesNotMatch(html, /not yet cut/);
    assert.doesNotMatch(html, new RegExp(nightly));
  }
  assert.match(docs, /windows-quickstart\.html/);
  assert.match(page, /docker compose -f compose\.yaml up -d --wait/);
  assert.match(page, /docker compose -f compose\.yaml down -v/);
  assert.match(page, /127\.0\.0\.1:8080:8080/);
});

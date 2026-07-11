import assert from "node:assert/strict";
import test from "node:test";

import HEADER_RULES from "./header-rules.json" with { type: "json" };
import worker, { applySecurityHeaders, selectHeaders } from "./worker.js";

const requiredHeaders = [
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "strict-transport-security",
];

test("catch-all rules carry the complete response-header contract", () => {
  const headers = new Headers(selectHeaders("/security.html"));
  for (const name of requiredHeaders) {
    assert.ok(headers.has(name), `missing ${name}`);
  }
  assert.match(headers.get("content-security-policy"), /frame-ancestors 'none'/);
});

test("the most specific path rule wins", () => {
  const headers = new Headers(selectHeaders("/demo.html"));
  assert.match(headers.get("content-security-policy"), /demotiles\.maplibre\.org/);
});

test("every path rule carries HSTS and response hardening", () => {
  for (const rule of HEADER_RULES) {
    const headers = new Headers(rule.headers);
    assert.ok(headers.has("strict-transport-security"), `${rule.match} missing HSTS`);
    assert.ok(headers.has("content-security-policy"), `${rule.match} missing CSP`);
    assert.ok(headers.has("x-content-type-options"), `${rule.match} missing nosniff`);
    assert.ok(headers.has("referrer-policy"), `${rule.match} missing referrer policy`);
    assert.ok(headers.has("permissions-policy"), `${rule.match} missing permissions policy`);
  }
});

test("security headers overwrite untrusted origin values without changing the body", async () => {
  const response = applySecurityHeaders(
    new Response("origin body", { headers: { "X-Frame-Options": "SAMEORIGIN" } }),
    "/security.html",
  );

  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(await response.text(), "origin body");
});

test("Worker-generated redirects also carry security headers", async () => {
  const response = await worker.fetch(new Request("https://honua.io/index.html"));

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "https://honua.io/");
  for (const name of requiredHeaders) {
    assert.ok(response.headers.has(name), `redirect missing ${name}`);
  }
});

test("origin responses retain status and gain security headers", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response("not found", { status: 404 });

  const response = await worker.fetch(new Request("https://honua.io/missing.html"));
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(await response.text(), "not found");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const bootstrap = readFileSync(new URL("../assets/demos/csp-bootstrap.js", import.meta.url), "utf8");
const canonicalPolicy = "default-src 'self'; connect-src 'self' https://demo.honua.io; img-src 'self'";

function runBootstrap(apiBase) {
  const appended = [];
  const meta = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
  const window = {
    location: { search: `?apiBase=${encodeURIComponent(apiBase)}` },
    console: { warn() {} },
  };
  const document = {
    querySelector: () => ({ textContent: `<meta http-equiv="Content-Security-Policy" content="${canonicalPolicy}">` }),
    createElement: () => meta,
    head: { appendChild: (node) => appended.push(node) },
  };
  vm.runInNewContext(bootstrap, { window, document });
  assert.equal(appended.length, 1, "the bootstrap always installs exactly one policy");
  return { origin: window.HONUA_DEMO_BACKEND_ORIGIN, policy: window.HONUA_DEMO_CSP };
}

test("demo.honua.io and other honua.io hosts stay accepted as a backend override", () => {
  for (const base of ["https://demo.honua.io", "https://demo.honua.io/", "https://candidate.demo.honua.io:8443"]) {
    const { origin, policy } = runBootstrap(base);
    assert.equal(origin, base.replace(/\/$/, ""));
    assert.match(policy, /connect-src [^;]*https:\/\/demo\.honua\.io/);
  }
});

test("gate.demo.honua.io and every name under it are refused and never widen the policy", () => {
  const gateHosts = [
    "https://gate.demo.honua.io",
    "https://gate.demo.honua.io/",
    "https://GATE.demo.honua.io:443",
    "https://stack-1.gate.demo.honua.io",
    "https://a.b.gate.demo.honua.io/",
  ];
  for (const base of gateHosts) {
    const { origin, policy } = runBootstrap(base);
    assert.equal(origin, null, `${base} must be refused`);
    assert.equal(policy, canonicalPolicy, `${base} must leave the canonical policy unchanged`);
  }
});

test("look-alike names that are not under the gate zone are unaffected", () => {
  for (const base of ["https://notgate.demo.honua.io", "https://gate-demo.honua.io"]) {
    assert.equal(runBootstrap(base).origin, base);
  }
});

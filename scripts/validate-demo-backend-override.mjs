#!/usr/bin/env node
/*
 * Guards the demo pages' CSP bootstrap.
 *
 * honua.io is served by GitHub Pages, which cannot set response headers, so each demo page's own
 * <meta http-equiv="Content-Security-Policy"> is the ONLY policy it has. That policy is emitted by
 * an INLINE bootstrap (assets/demos/csp-bootstrap.js, copied verbatim into each page) rather than
 * hardcoded, because a <meta> CSP cannot be relaxed once the parser reads it and the opt-in backend
 * override has to be able to widen it. Inline, not external, because an external script can fail to
 * load and a public page must never end up with no policy at all.
 *
 * That design only holds while the copies stay identical and the moving parts stay in the right
 * order, so this asserts, for every page that carries the bootstrap:
 *
 *   1. there is exactly one <noscript data-honua-csp> holding a real CSP <meta> (the scripting-off
 *      policy, and the canonical text the bootstrap re-emits);
 *   2. the page's inline bootstrap matches assets/demos/csp-bootstrap.js byte for byte;
 *   3. the inline bootstrap is INLINE (no src=) and classic (no defer/async/type=module) — anything
 *      else reintroduces the "policy depends on a fetch" failure mode;
 *   4. nothing that can issue a request — script, link, img, iframe — is parsed before it;
 *   5. the external assets/demos/backend-override.js, which is NOT load-bearing, comes after it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CANONICAL_PATH = "assets/demos/csp-bootstrap.js";
const OVERRIDE_PATH = "assets/demos/backend-override.js";
const canonical = readFileSync(join(ROOT, CANONICAL_PATH), "utf8").trim();

const failures = [];
const checked = [];

function baseUrlOf(href) {
  return new URL(href).searchParams.get("baseUrl");
}

/* Run backend-override.js against a fake window. The script rewrites location only when an
 * override resolved, and a validated override replaces a disagreeing baseUrl. */
function runOverride({ origin, search }) {
  const href = `https://honua.io/demo-analyst-workbench.html${search || ""}`;
  const replacements = [];
  const sandbox = {
    URL,
    window: {
      HONUA_DEMO_BACKEND_ORIGIN: origin,
      HONUA_DEMO_CSP: "default-src 'self'",
      location: { href },
      history: {
        state: { kept: true },
        replaceState(state, _title, next) {
          replacements.push({ state, next });
        },
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(ROOT, OVERRIDE_PATH), "utf8"), sandbox, { filename: OVERRIDE_PATH });
  const next = replacements.length ? replacements[replacements.length - 1].next : href;
  return {
    replacements,
    base: sandbox.window.HonuaDemoBackend ? sandbox.window.HonuaDemoBackend.base : undefined,
    baseUrl: baseUrlOf(next),
  };
}

function loadCauseHelpers(source) {
  const start = "/* honua-override-cause:start */";
  const end = "/* honua-override-cause:end */";
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end);
  if (startAt < 0 || endAt < startAt) {
    throw new Error("editing app is missing the override-cause helpers");
  }
  const body = source.slice(startAt + start.length, endAt);
  return new Function(
    `${body}\nreturn { classifyBackendFailure, describeOverrideFailure, editingStatusText, editingDataChipText, editingProbeText, editingOfflineNote, hostFromBase };`,
  )();
}

function assertOverrideCause(failures) {
  const overrideSrc = readFileSync(join(ROOT, OVERRIDE_PATH), "utf8");
  const editingSrc = readFileSync(join(ROOT, "assets/demos/editing/app.js"), "utf8");
  const editingPage = readFileSync(join(ROOT, "demo-editing.html"), "utf8");
  const workbenchPage = readFileSync(join(ROOT, "demo-analyst-workbench.html"), "utf8");

  if (!overrideSrc.includes("A validated ?apiBase= overwrites baseUrl.")) {
    failures.push(`${OVERRIDE_PATH}: does not document that a validated ?apiBase= overwrites baseUrl`);
  }
  if (/searchParams\.has\("baseUrl"\)\) return/.test(overrideSrc)) {
    failures.push(`${OVERRIDE_PATH}: a pre-existing baseUrl still wins over the validated override`);
  }

  const idle = runOverride({ origin: null, search: "" });
  if (idle.replacements.length !== 0 || idle.base !== null || idle.baseUrl !== null) {
    failures.push("default lane rewrote the workbench URL with no override");
  }
  const staleOnly = runOverride({ origin: null, search: "?baseUrl=http://localhost:9" });
  if (staleOnly.replacements.length !== 0 || staleOnly.baseUrl !== "http://localhost:9") {
    failures.push("default lane rewrote a hand-written baseUrl when no override resolved");
  }
  const fresh = runOverride({ origin: "http://localhost:8080", search: "?apiBase=http://localhost:8080" });
  if (fresh.base !== "http://localhost:8080" || fresh.baseUrl !== "http://localhost:8080") {
    failures.push("a validated apiBase did not become the workbench baseUrl");
  }
  const disagree = runOverride({
    origin: "http://localhost:8080",
    search: "?apiBase=http://localhost:8080&baseUrl=https://demo.honua.io",
  });
  if (disagree.baseUrl !== "http://localhost:8080" || disagree.baseUrl === "https://demo.honua.io") {
    failures.push("a validated apiBase did not overwrite a disagreeing baseUrl");
  }
  const already = runOverride({
    origin: "http://localhost:8080",
    search: "?apiBase=http://localhost:8080&baseUrl=http://localhost:8080",
  });
  if (already.replacements.length !== 0 || already.baseUrl !== "http://localhost:8080") {
    failures.push("an apiBase that already matches baseUrl should leave that URL alone");
  }

  let helpers;
  try {
    helpers = loadCauseHelpers(editingSrc);
  } catch (error) {
    failures.push(String(error && error.message ? error.message : error));
    return;
  }

  const http = new Error("odata layers HTTP 503");
  http.httpStatus = 503;
  const timeout = new Error("The operation was aborted");
  timeout.name = "AbortError";
  timeout.honuaTimeoutMs = 6000;
  const cors = new TypeError("Failed to fetch");
  if (helpers.classifyBackendFailure(http, 6000).kind !== "http" || helpers.classifyBackendFailure(http, 6000).status !== "503") {
    failures.push("a 503 probe failure did not classify as HTTP 503");
  }
  const timed = helpers.classifyBackendFailure(timeout, 6000);
  if (timed.kind !== "timeout" || timed.timeoutMs !== 6000) {
    failures.push("an aborted probe did not classify as a timeout with its limit");
  }
  if (helpers.classifyBackendFailure(cors, 6000).kind !== "network") {
    failures.push("a fetch TypeError did not classify as a network or CORS refusal");
  }
  const tagged = new TypeError("Load failed");
  tagged.honuaNetwork = true;
  if (helpers.classifyBackendFailure(tagged, 6000).kind !== "network") {
    failures.push("a fetch TypeError tagged at the fetch boundary did not classify as a network or CORS refusal");
  }
  const structural = new TypeError("body.value.forEach is not a function");
  const structuralFailure = helpers.classifyBackendFailure(structural, 6000);
  if (structuralFailure.kind !== "other") {
    failures.push(`a response-processing TypeError classified as ${structuralFailure.kind}`);
  }
  const structuralText = helpers.editingStatusText("fixture", false, 4, "localhost:8080", structuralFailure, true);
  if (structuralText !== "body.value.forEach is not a function from localhost:8080 — sample fixture, not live") {
    failures.push(`a response-processing TypeError was reported as ${JSON.stringify(structuralText)}`);
  }
  if (!editingSrc.includes("error.honuaNetwork = true")) {
    failures.push("a TypeError caught from fetch is not tagged as a network failure");
  }
  if (editingSrc.includes('error.name === "TypeError") return { kind: "network" }')) {
    failures.push("every TypeError is still classified as a network failure");
  }

  const httpText = helpers.editingStatusText("fixture", false, 4, "localhost:8080", { kind: "http", status: "503" }, true);
  const timeoutText = helpers.editingStatusText("fixture", false, 4, "localhost:8080", { kind: "timeout", timeoutMs: 6000 }, true);
  const corsText = helpers.editingStatusText("fixture", false, 4, "localhost:8080", { kind: "network" }, true);
  if (httpText !== "503 from localhost:8080 — sample fixture, not live") {
    failures.push(`override 503 status text was ${JSON.stringify(httpText)}`);
  }
  if (timeoutText !== "timed out after 6000ms contacting localhost:8080 — sample fixture, not live") {
    failures.push(`override timeout status text was ${JSON.stringify(timeoutText)}`);
  }
  if (corsText !== "network or CORS refusal from localhost:8080 — sample fixture, not live") {
    failures.push(`override CORS status text was ${JSON.stringify(corsText)}`);
  }
  for (const text of [httpText, timeoutText, corsText]) {
    if (text.startsWith("data: live")) failures.push(`override failure text labels the fixture as live: ${text}`);
  }

  const httpChip = helpers.editingDataChipText("fixture", 4, "localhost:8080", { kind: "http", status: "503" }, true);
  if (httpChip !== "data: sample fixture · 4 inspections · 503 from localhost:8080" || httpChip.startsWith("data: live")) {
    failures.push(`override fixture chip was ${JSON.stringify(httpChip)}`);
  }
  const liveOverride = helpers.editingStatusText("live", true, 2, "localhost:8080", null, true);
  if (liveOverride !== "localhost:8080 · 2 inspections · live editing over OData") {
    failures.push(`override live status was ${JSON.stringify(liveOverride)}`);
  }

  if (helpers.editingStatusText("live", true, 4, "demo.honua.io", null, false) !== "demo.honua.io · 4 inspections · live editing over OData") {
    failures.push("default live status text changed");
  }
  if (
    helpers.editingStatusText("live", false, 4, "demo.honua.io", null, false) !==
    "demo.honua.io · 4 inspections · edits apply locally · live writes need Pro (Community server)"
  ) {
    failures.push("default local-edit status text changed");
  }
  if (helpers.editingStatusText("fixture", false, 4, "demo.honua.io", null, false) !== "demo server unreachable — sample inspections, edits stay local") {
    failures.push("default offline status text changed");
  }
  if (helpers.editingDataChipText("live", 4, "demo.honua.io", null, false) !== "data: live · 4 inspections") {
    failures.push("default live data chip changed");
  }
  if (helpers.editingDataChipText("fixture", 4, "demo.honua.io", null, false) !== "data: sample fixture · 4 inspections") {
    failures.push("default fixture data chip changed");
  }
  if (helpers.hostFromBase(null) !== "demo.honua.io" || helpers.hostFromBase("http://localhost:8080") !== "localhost:8080") {
    failures.push("override host was not taken from the validated origin");
  }
  if (helpers.editingProbeText("demo.honua.io") !== "checking demo.honua.io…") {
    failures.push("default probe text changed");
  }
  if (helpers.editingOfflineNote(false, null, "demo.honua.io") !== "// (offline right now — showing the bundled synthetic fixture instead)") {
    failures.push("default offline code-strip note changed");
  }

  const pillAt = editingSrc.indexOf("function renderStatusPill");
  const pill = editingSrc.slice(pillAt, editingSrc.indexOf("function bootstrap", pillAt));
  if (
    !/function renderStatusPill\(\) \{\s*setStatus\(\s*S\.dataLane === "live" \? "live" : "offline",\s*editingStatusText\(S\.dataLane, S\.writesLive, S\.features\.length, backendHost\(\), S\.backendFailure, overrideActive\(\)\),\s*\);\s*\}/.test(
      pill,
    )
  ) {
    failures.push("renderStatusPill must delegate to editingStatusText");
  }
  const chipsAt = editingSrc.indexOf("function renderLaneChips");
  const chips = editingSrc.slice(chipsAt, pillAt);
  if (!chips.includes("editingDataChipText(")) {
    failures.push("renderLaneChips must take the data chip from editingDataChipText");
  }
  if (!editingSrc.includes('rememberBackendFailure(error, S.config.odata.probeTimeoutMs)')) {
    failures.push("the editing probe failure is not recorded");
  }
  if (!editingSrc.includes("rememberBackendFailure(error, 15000)")) {
    failures.push("the editing read failure is not recorded");
  }
  if (!editingPage.includes("backend-override.js") || !workbenchPage.includes("backend-override.js")) {
    failures.push("editing and analyst-workbench pages no longer share the backend override script");
  }
}

function dedent(block) {
  const lines = block.replace(/^\n/, "").replace(/\s+$/, "").split("\n");
  const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^[ ]*/)[0].length);
  const strip = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(strip)).join("\n").trim();
}

for (const filename of readdirSync(ROOT).filter((name) => name.endsWith(".html")).sort()) {
  const html = readFileSync(join(ROOT, filename), "utf8");
  const noscript = [...html.matchAll(/<noscript\b[^>]*\bdata-honua-csp\b[^>]*>([\s\S]*?)<\/noscript>/gi)];
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => match[2].includes("data-honua-csp"));

  if (noscript.length === 0 && inline.length === 0) continue; // not a demo page: nothing to guard
  checked.push(filename);

  if (noscript.length !== 1) {
    failures.push(`${filename}: expected exactly one <noscript data-honua-csp>, found ${noscript.length}`);
    continue;
  }
  if (!/<meta[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*\bcontent\s*=\s*"[^"]+"/i.test(noscript[0][1])) {
    failures.push(`${filename}: <noscript data-honua-csp> does not hold a CSP <meta> with a content attribute`);
  }
  if (inline.length !== 1) {
    failures.push(`${filename}: expected exactly one inline CSP bootstrap, found ${inline.length}`);
    continue;
  }

  const [attrs, body] = [inline[0][1], inline[0][2]];
  if (/\b(defer|async)\b/i.test(attrs) || /type\s*=\s*["']module["']/i.test(attrs)) {
    failures.push(`${filename}: the CSP bootstrap must be a classic, parser-blocking script (no defer/async/module)`);
  }
  if (dedent(body) !== canonical) {
    failures.push(`${filename}: inline CSP bootstrap has drifted from ${CANONICAL_PATH}`);
  }

  // Ordering: nothing that can fetch may be parsed before the policy is installed.
  const bootstrapAt = inline[0].index;
  const head = html.slice(0, bootstrapAt);
  const early = [...head.matchAll(/<(script|link|img|iframe)\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => !/^<link\b[^>]*\brel\s*=\s*["'](?:canonical|icon|manifest|alternate)["']/i.test(tag));
  if (early.length > 0) {
    failures.push(`${filename}: ${early.length} fetching element(s) parsed before the CSP bootstrap, first: ${early[0].slice(0, 80)}`);
  }

  const overrideAt = html.indexOf(OVERRIDE_PATH);
  if (overrideAt !== -1 && overrideAt < bootstrapAt) {
    failures.push(`${filename}: ${OVERRIDE_PATH} is loaded before the inline CSP bootstrap`);
  }
}

if (checked.length === 0) failures.push("no demo page carries the CSP bootstrap — the guard is not guarding anything");

assertOverrideCause(failures);

if (failures.length > 0) {
  console.error("demo backend-override validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`validate-demo-backend-override: ${checked.length} demo pages carry an identical inline CSP bootstrap (${checked.join(", ")})`);

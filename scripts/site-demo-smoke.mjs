#!/usr/bin/env node
/*
 * Offline/static validation for the task-first SDK journey gallery.
 * This validates the site curation layer. The separately generated publication
 * manifest verifies SDK-owned artifacts and evidence consumed from SDK #401.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fails = [];
const oks = [];
const ok = (message) => oks.push(message);
const fail = (message) => fails.push(message);

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function fileExists(relativePath) {
  const path = join(ROOT, relativePath);
  return existsSync(path) && statSync(path).isFile();
}

function nonEmpty(relativePath) {
  return fileExists(relativePath) && statSync(join(ROOT, relativePath)).size > 0;
}

function parseJson(relativePath) {
  try {
    const value = JSON.parse(read(relativePath));
    ok(`${relativePath} parses`);
    return value;
  } catch (error) {
    fail(`${relativePath} does not parse: ${error.message}`);
    return null;
  }
}

function validateHref(href, label, localPages) {
  if (typeof href !== "string" || href.length === 0) {
    fail(`${label} has no href`);
    return;
  }
  if (/^https:\/\//.test(href)) {
    ok(`${label} -> external source`);
    return;
  }
  if (!href.endsWith(".html")) fail(`${label} href is not a root .html page: ${href}`);
  if (href.includes("/")) fail(`${label} href is not at repo root: ${href}`);
  if (!nonEmpty(href)) fail(`${label} href is missing/empty: ${href}`);
  else {
    ok(`${label} -> ${href}`);
    localPages.add(href);
  }
}

const manifest = parseJson("assets/samples/manifest.json");
const audit = parseJson("assets/samples/audit.json");
const sdkPublication = parseJson("assets/samples/sdk-publication.v1.json");
const siteExceptions = parseJson("assets/samples/site-exceptions.v1.json");
const localPages = new Set();

if (manifest) {
  if (manifest.version !== 2 || manifest.kind !== "honua-site-capability-journeys") {
    fail("manifest must be the version 2 site capability-journey contract");
  }
  if (manifest.projection?.producer !== "honua-io/honua-sdk-js#401") {
    fail("manifest must identify SDK #401 as the catalog producer");
  }
  if (manifest.projection?.publication !== "assets/samples/sdk-publication.v1.json") {
    fail("manifest must link the verified SDK publication");
  }
  if (manifest.projection?.siteExceptions !== "assets/samples/site-exceptions.v1.json") {
    fail("manifest must link the verified site-exception publication");
  }
  if (manifest.projection?.evidenceStaleAfterHours !== 168) {
    fail("manifest must retain the reviewed seven-day evidence freshness window");
  }
  if (!manifest.currentArtifact?.version || !manifest.currentArtifact?.integrity) {
    fail("manifest must disclose current SDK artifact version and integrity state");
  }

  const states = Array.isArray(manifest.executionStates) ? manifest.executionStates : [];
  const stateIds = new Set(states.map((state) => state.id));
  for (const required of ["fixture", "public-live", "demo-live", "authenticated", "degraded", "unavailable", "stale"]) {
    if (!stateIds.has(required)) fail(`manifest missing execution state: ${required}`);
  }
  if (stateIds.size !== states.length) fail("manifest has duplicate execution-state ids");

  const journeys = Array.isArray(manifest.journeys) ? manifest.journeys : [];
  const recipes = Array.isArray(manifest.recipes) ? manifest.recipes : [];
  const sdkById = new Map((sdkPublication?.samples ?? []).map((sample) => [sample.id, sample]));
  const exceptionById = new Map((siteExceptions?.samples ?? []).map((sample) => [sample.id, sample]));
  const resolveContract = (reference) => {
    const [kind, id, extra] = String(reference ?? "").split(":");
    if (extra || !id) return null;
    return kind === "sdk" ? sdkById.get(id) : kind === "site" ? exceptionById.get(id) : null;
  };
  if (journeys.length < 7) fail("manifest needs all seven required capability journeys");
  if (journeys.filter((journey) => resolveContract(journey.contractRef)?.supportStatus !== "experimental").length < 5) {
    fail("manifest needs at least five runnable non-experimental flagships");
  }
  const requiredGoals = new Set(["connect", "build", "analyze", "operate", "visualize", "migrate", "automate"]);
  const journeyIds = new Set();
  const goals = new Set();
  for (const journey of journeys) {
    const tag = journey.id || JSON.stringify(journey);
    if (!journey.id || journeyIds.has(journey.id)) fail(`missing/duplicate journey id: ${tag}`);
    journeyIds.add(journey.id);
    goals.add(journey.goal);
    for (const field of ["title", "userProblem", "outcome", "duration"]) {
      if (!journey[field]) fail(`journey ${tag} missing ${field}`);
    }
    const contract = resolveContract(journey.contractRef);
    if (!contract) fail(`journey ${tag} has no admitted contract record: ${journey.contractRef}`);
    else {
      if (![contract.route, ...(contract.aliases ?? [])].includes(journey.href)) {
        fail(`journey ${tag} route does not match ${journey.contractRef}`);
      }
      for (const field of ["protocols", "renderers"]) {
        if (!Array.isArray(contract[field]) || contract[field].length === 0) fail(`${journey.contractRef} missing ${field}[]`);
      }
    }
    for (const field of ["sdkConcepts", "differentiators"]) {
      if (!Array.isArray(journey[field]) || journey[field].length === 0) fail(`journey ${tag} missing ${field}[]`);
    }
    if (!stateIds.has(journey.execution?.mode)) fail(`journey ${tag} has unknown execution mode`);
    if (journey.execution?.fallback && !stateIds.has(journey.execution.fallback)) fail(`journey ${tag} has unknown fallback`);
    if (!journey.execution?.auth || !journey.execution?.runtimeState) fail(`journey ${tag} missing auth/runtime state`);
    validateHref(journey.href, `journey ${tag}`, localPages);
    if (journey.next?.href) validateHref(journey.next.href, `journey ${tag} next step`, localPages);
  }
  for (const goal of requiredGoals) {
    if (!goals.has(goal)) fail(`manifest missing required journey goal: ${goal}`);
  }
  const operations = journeys.find((journey) => journey.goal === "operate");
  if (!operations?.execution?.realtime || !operations?.execution?.liveByDefault || operations.execution.mode !== "demo-live") {
    fail("operations journey must remain realtime and demo-live by default");
  } else {
    ok("operations journey is realtime + live by default");
  }
  const analysis = journeys.find((journey) => journey.goal === "analyze");
  if (
    analysis?.href !== "demo-overture.html" ||
    analysis.execution?.mode !== "fixture" ||
    analysis.execution?.liveMode !== "public-live" ||
    analysis.execution?.liveOptIn !== true ||
    analysis.contractRef !== "sdk:overture-geoparquet"
  ) {
    fail("analysis journey must publish the fixture-default, opt-in public-live Overture flagship");
  } else {
    ok("analysis journey maps fixture + opt-in public-live Overture execution");
  }
  const automation = journeys.find((journey) => journey.goal === "automate");
  if (
    automation?.href !== "demo-safe-agent.html" ||
    automation.execution?.mode !== "fixture" ||
    automation.contractRef !== "sdk:ai-spatial-app-builder" ||
    sdkById.get("ai-spatial-app-builder")?.producer?.gitCommit !== "ec58b44045b8979a4fc2ed0d5368505505505b4c"
  ) {
    fail("automation journey must publish the commit-pinned Safe Agent fixture flagship");
  } else {
    ok("automation journey maps the commit-pinned Safe Agent fixture + host-mediated live boundary");
  }

  const recipeIds = new Set();
  for (const recipe of recipes) {
    const tag = recipe.id || JSON.stringify(recipe);
    if (!recipe.id || recipeIds.has(recipe.id)) fail(`missing/duplicate recipe id: ${tag}`);
    recipeIds.add(recipe.id);
    if (!journeyIds.has(recipe.journey)) fail(`recipe ${tag} references unknown journey: ${recipe.journey}`);
    if (!recipe.title || !recipe.blurb) fail(`recipe ${tag} missing narrative metadata`);
    const contract = resolveContract(recipe.contractRef);
    if (!contract) fail(`recipe ${tag} has no admitted contract record: ${recipe.contractRef}`);
    else if (![contract.route, ...(contract.aliases ?? [])].includes(recipe.href)) {
      fail(`recipe ${tag} route does not match ${recipe.contractRef}`);
    }
    if (!stateIds.has(recipe.execution?.mode)) fail(`recipe ${tag} has unknown execution mode`);
    if (recipe.execution?.fallback && !stateIds.has(recipe.execution.fallback)) fail(`recipe ${tag} has unknown fallback`);
    validateHref(recipe.href, `recipe ${tag}`, localPages);
  }
  ok(`manifest covers ${journeys.length} journeys and ${recipes.length} recipes`);
}

if (audit) {
  const allowed = new Set(["keep", "rework", "merge", "replace", "retire"]);
  const entries = Array.isArray(audit.entries) ? audit.entries : [];
  const byInventory = { "honua-site": [], "honua-sdk-js": [] };
  const unique = new Set();
  for (const entry of entries) {
    const key = `${entry.inventory}:${entry.id}`;
    if (unique.has(key)) fail(`audit has duplicate entry: ${key}`);
    unique.add(key);
    if (!(entry.inventory in byInventory)) fail(`audit entry ${key} has unknown inventory`);
    else byInventory[entry.inventory].push(entry);
    if (!allowed.has(entry.disposition)) fail(`audit entry ${key} has invalid disposition`);
    if (!entry.target || !entry.owner || !entry.rationale) fail(`audit entry ${key} missing target/owner/rationale`);
  }
  if (byInventory["honua-site"].length !== 21) fail(`audit must cover 21 site samples, got ${byInventory["honua-site"].length}`);
  if (byInventory["honua-sdk-js"].length !== 27) fail(`audit must cover 27 SDK examples, got ${byInventory["honua-sdk-js"].length}`);
  if (manifest) {
    const catalogSiteIds = new Set([
      ...manifest.journeys.map((journey) => journey.legacyId).filter(Boolean),
      ...manifest.recipes.map((recipe) => recipe.id).filter((id) => id !== "standalone-public-map")
    ]);
    const auditedSiteIds = new Set(byInventory["honua-site"].map((entry) => entry.id));
    for (const id of auditedSiteIds) if (!catalogSiteIds.has(id)) fail(`audited site sample is absent from journey/recipe mapping: ${id}`);
    for (const id of catalogSiteIds) if (!auditedSiteIds.has(id)) fail(`journey/recipe legacy id is absent from audit: ${id}`);
  }
  ok(`audit covers ${byInventory["honua-site"].length} site samples + ${byInventory["honua-sdk-js"].length} SDK examples`);
}

if (!nonEmpty("samples.html")) {
  fail("samples.html missing");
} else {
  const html = read("samples.html");
  for (const id of ["starters", "ownership-heading"]) {
    if (!html.includes(`id="${id}"`)) fail(`samples.html missing learning surface #${id}`);
  }
  for (const label of ["Recommended starts", "Go straight to a facet", "Clear ownership"]) {
    if (!html.includes(label)) fail(`samples.html missing curated learning section: ${label}`);
  }
  for (const owner of ["honua-samples / samples.honua.io", "honua-demo-infra / demo.honua.io", "honua-site / demos"]) {
    if (!html.includes(owner)) fail(`samples.html missing ownership boundary: ${owner}`);
  }
  const sampleHrefs = new Set([...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]));
  if (!sampleHrefs.has("https://samples.honua.io/")) fail("samples.html does not link to the canonical gallery");
  else ok("samples.html curates starts and separates learning, infrastructure, and product ownership");
}

if (!nonEmpty("assets/samples/gallery.js")) fail("gallery.js missing");
else {
  const gallery = read("assets/samples/gallery.js");
  if (!gallery.includes("assets/samples/manifest.json")) fail("gallery.js does not fetch the manifest");
  if (!gallery.includes("manifest.projection.publication") || !gallery.includes("manifest.projection.siteExceptions")) {
    fail("gallery.js does not consume both admitted publication contracts");
  }
  for (const field of ["SDK", "Support", "Data", "Health", "Provenance", "Freshness", "Attribution", "Evidence"] ) {
    if (!gallery.includes(`\"${field}`)) fail(`gallery.js does not render ${field.toLowerCase()} metadata`);
  }
  if (!gallery.includes("evidenceStaleAfterHours") || !gallery.includes("Date.now()")) {
    fail("gallery.js does not render time-based stale evidence state");
  }
  if (!gallery.includes('setAttribute("aria-pressed"')) fail("gallery goal filter does not expose pressed state");
  if (gallery.includes("innerHTML = '<") || gallery.includes('innerHTML = "<')) fail("gallery renders dynamic HTML strings instead of DOM text nodes");
  ok("gallery.js uses manifest + accessible goal filtering");
}

if (!nonEmpty("demos.html")) {
  fail("demos.html missing");
} else {
  const demos = read("demos.html");
  if (!demos.includes('id="workflows"')) fail("demos.html missing curated workflow surface");
  if (!demos.includes("Demo center / real GIS tasks")) fail("demos.html missing workflow-first contract");
  if (!demos.includes("Try the same job with your data")) fail("demos.html missing workflow next step");
  if (!demos.includes('class="hub-button primary" href="demo-two-protocols.html"')) {
    fail("demos.html primary CTA does not open the working compatibility demo");
  }
  const demoHrefs = new Set([...demos.matchAll(/href="([^"]+)"/g)].map((match) => match[1]));
  if (!demoHrefs.has("demo-two-protocols.html")) fail("demos.html does not expose the compatibility workflow");
  if (!demoHrefs.has("https://samples.honua.io/")) fail("demos.html does not return evaluators to reproducible samples");
  else ok("demos.html opens the compatibility workflow and returns evaluators to reproducible samples");
}

if (!nonEmpty("demo.html")) {
  fail("demo.html missing");
} else {
  const demo = read("demo.html");
  const endpointControl = demo.match(/<select id="endpoint-url"[\s\S]*?<\/select>/)?.[0];
  const approvedEndpoints = [
    "/__honua-quickstart__/rest/services/honolulu-operations/FeatureServer/0",
    "https://demo.honua.io/rest/services/maui-parcels/FeatureServer/1",
  ];
  if (!endpointControl) fail("demo.html endpoint control must be a fixed select allowlist");
  else {
    const values = [...endpointControl.matchAll(/<option\b[^>]*\bvalue="([^"]+)"/g)].map((match) => match[1]);
    if (JSON.stringify(values) !== JSON.stringify(approvedEndpoints)) {
      fail(`demo.html endpoint allowlist drifted: ${values.join(", ")}`);
    } else {
      ok("demo.html offers only the bundled fixture and Honua demo service");
    }
  }
  if (!demo.includes("connect-src 'self' https://demo.honua.io https://demotiles.maplibre.org")) {
    fail("demo.html CSP does not admit its Honua endpoint allowlist");
  }
  if (!demo.includes('src="/assets/demo-endpoint-allowlist.js"')) {
    fail("demo.html does not normalize its same-origin fixture selection");
  }
  const endpointAllowlist = read("assets/demo-endpoint-allowlist.js");
  if (!endpointAllowlist.includes('new URL(fixture.getAttribute("value"), window.location.origin).href')) {
    fail("demo.html fixture option is not normalized to the runtime origin");
  }
}

for (const pagePath of localPages) {
  let page;
  try {
    page = read(pagePath);
  } catch {
    continue;
  }
  const references = [...page.matchAll(/(?:src|href)="(\/?assets\/[^"#?]+)"/g)].map((match) =>
    match[1].replace(/^\//, ""),
  );
  const missing = [...new Set(references)].filter((reference) => !fileExists(reference));
  if (missing.length) fail(`${pagePath} references missing assets: ${missing.join(", ")}`);
  else ok(`${pagePath} assets resolve (${new Set(references).size})`);
}

console.log(`site-demo-smoke: ${oks.length} checks passed`);
for (const message of oks) console.log(`  ok   ${message}`);
if (fails.length) {
  console.error(`\nsite-demo-smoke: ${fails.length} FAILURE(S)`);
  for (const message of fails) console.error(`  FAIL ${message}`);
  process.exit(1);
}
console.log("site-demo-smoke: OK");

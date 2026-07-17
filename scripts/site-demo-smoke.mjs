#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { loadAndValidateSdkGallery } from "./sdk-gallery-consumer.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const checks = [];

function check(condition, message) {
  if (condition) checks.push(message);
  else failures.push(message);
}

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function filesBelow(path) {
  const root = join(ROOT, path);
  const found = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) found.push(relative(root, child).split(sep).join("/"));
    }
  }
  visit(root);
  return found.sort();
}

let bundle;
try {
  bundle = loadAndValidateSdkGallery();
  checks.push("exact SDK consumer handoff validates");
} catch (error) {
  failures.push(`SDK consumer handoff: ${error.message}`);
}

for (const obsolete of [
  "assets/samples/manifest.json",
  "assets/samples/audit.json",
  "assets/samples/gallery.js",
]) {
  check(!existsSync(join(ROOT, obsolete)), `${obsolete} manual inventory is retired`);
}

check(existsSync(join(ROOT, "assets/samples/sdk-publication.v1.json")), "commit-pinned flagship publication remains available");
check(existsSync(join(ROOT, "data/sdk-gallery/source.v1.json")), "SDK gallery source pin exists");
check(existsSync(join(ROOT, "docs/sdk-gallery-consumer.md")), "SDK gallery consumer contract is documented");
check(existsSync(join(ROOT, "assets/sdk-gallery.js")), "SDK gallery browser controller exists");
check(existsSync(join(ROOT, "assets/sdk-gallery.css")), "SDK gallery responsive styles exist");

const samplesRedirect = read("samples.html");
check(
  samplesRedirect.includes('rel="canonical" href="https://honua.io/samples/index.html"') &&
    samplesRedirect.includes('http-equiv="refresh" content="0; url=samples/index.html"'),
  "legacy samples.html resolves directly to the canonical generated gallery",
);
check(!samplesRedirect.includes("assets/samples/gallery.js"), "legacy samples route no longer loads the manual gallery");

const demosRedirect = read("demos.html");
check(
  demosRedirect.includes('rel="canonical" href="https://honua.io/samples/index.html"') &&
    demosRedirect.includes('http-equiv="refresh" content="0; url=samples/index.html"'),
  "legacy demos.html resolves directly to the canonical generated gallery",
);

const producerFiles = filesBelow("data/sdk-gallery");
check(
  producerFiles.every((path) => path.endsWith(".json")),
  "SDK gallery import contains contracts and schemas only",
);

if (bundle) {
  check(bundle.handoff.ownership.sourceImplementationDuplicated === false, "SDK executable source remains producer-owned");
  check(bundle.handoff.counts.cards === 32, "handoff publishes 32 cards");
  check(bundle.handoff.counts.qualifiedJourneys === 0, "zero qualification remains an honest supported state");
  check(bundle.handoff.counts.legacyRoutes === 20, "handoff resolves all 20 legacy routes");
  const incident = bundle.handoff.cards.find((card) => card.id === "realtime-incident-dashboard");
  check(
    incident?.tasks.includes("realtime") &&
      [incident?.evidence.live.mode, incident?.evidence.live.targetMode].includes("demo-live") &&
      incident?.expectedDegradation.toLowerCase().includes("replay"),
    "Incident Operations remains realtime/live-first with explicit replay degradation",
  );
}

console.log(`site-demo-smoke: ${checks.length} checks passed`);
for (const message of checks) console.log(`  ok   ${message}`);
if (failures.length > 0) {
  console.error(`\nsite-demo-smoke: ${failures.length} FAILURE(S)`);
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}
console.log("site-demo-smoke: OK");

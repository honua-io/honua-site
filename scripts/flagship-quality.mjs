#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ROOT,
  budgetFor,
  catalogRuntimeCommits,
  loadJson,
  sanitizeDiagnostic,
  validateEvidence,
  validateMatrix,
} from "./flagship-quality-lib.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const config = loadJson("config/flagship-quality.v1.json");
const manifest = loadJson(config.catalog);
const matrixErrors = validateMatrix(config, manifest);
if (matrixErrors.length) {
  console.error(matrixErrors.join("\n"));
  process.exit(1);
}
if (process.argv.includes("--check")) {
  console.log(`flagship-quality: canonical matrix covers ${manifest.journeys.length} routes x 2 viewports`);
  process.exit(0);
}

const baseUrl = new URL(option("--base-url", "http://127.0.0.1:4173"));
const output = resolve(ROOT, option("--output", "artifacts/flagship-quality.local.v1.json"));
const mode = option("--mode", baseUrl.hostname === "127.0.0.1" || baseUrl.hostname === "localhost" ? "local" : "deployed");
if (!["local", "deployed"].includes(mode)) throw new Error("--mode must be local or deployed");
const expectedCommit = option("--site-commit", execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim());
let revisionError = null;
try {
  const revisionResponse = await fetch(new URL("data/site-revision.v1.json", baseUrl), { cache: "no-store", credentials: "omit" });
  if (!revisionResponse.ok) throw new Error(`site revision marker returned HTTP ${revisionResponse.status}`);
  const deployedRevision = await revisionResponse.json();
  if (deployedRevision?.version !== 1 || deployedRevision?.kind !== "honua-site-revision" || deployedRevision?.siteCommit !== expectedCommit) {
    throw new Error(`tested site revision does not match expected commit ${expectedCommit}`);
  }
} catch (error) {
  revisionError = error instanceof Error ? error.message : String(error);
}
const { chromium } = await import("playwright");
const axeSource = readFileSync(resolve(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
const browser = await chromium.launch({ headless: true });
const startedAt = new Date().toISOString();
const runs = [];

function urlAllowed(url) {
  const parsed = new URL(url);
  return parsed.origin === baseUrl.origin || config.global.allowedHosts.includes(parsed.hostname);
}

for (const journey of manifest.journeys) {
  const routeConfig = config.routes[journey.id];
  for (const [viewportName, viewport] of Object.entries(config.viewports)) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block", bypassCSP: true });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    const diagnostics = [];
    let transferredBytes = 0;
    let renderedAssets = 0;
    const runStartedAt = new Date().toISOString();
    const runStart = performance.now();
    page.on("console", (message) => {
      const allowedPatterns = [...config.global.allowedConsoleErrorPatterns, ...(mode === "local" ? config.global.allowedLocalConsoleErrorPatterns : [])];
      if (message.type() === "error" && !allowedPatterns.some((pattern) => message.text().includes(pattern))) {
        diagnostics.push(sanitizeDiagnostic("console-error", message.text()));
      }
    });
    page.on("pageerror", (error) => diagnostics.push(sanitizeDiagnostic("page-error", error.message)));
    page.on("request", (request) => {
      if (!urlAllowed(request.url())) diagnostics.push(sanitizeDiagnostic("network-not-allowlisted", new URL(request.url()).origin));
    });
    page.on("requestfailed", (request) => {
      if (!config.global.allowedFailedUrlPrefixes.some((prefix) => request.url().startsWith(prefix))) {
        diagnostics.push(sanitizeDiagnostic("network-failed", `${request.method()} ${new URL(request.url()).origin}${new URL(request.url()).pathname}`));
      }
    });
    page.on("response", async (response) => {
      renderedAssets += 1;
      if (response.status() >= 400 && !config.global.allowedFailedUrlPrefixes.some((prefix) => response.url().startsWith(prefix))) {
        diagnostics.push(sanitizeDiagnostic("http-error", `${response.status()} ${new URL(response.url()).origin}${new URL(response.url()).pathname}`));
      }
    });
    cdp.on("Network.loadingFinished", ({ encodedDataLength }) => {
      if (Number.isFinite(encodedDataLength) && encodedDataLength > 0) transferredBytes += Math.ceil(encodedDataLength);
    });
    let navigationMs = 0;
    let readinessMs = 0;
    let finalUrl = new URL(journey.href, baseUrl).href;
    let runtimeState = null;
    try {
      if (revisionError) throw new Error(revisionError);
      const navStart = performance.now();
      await page.goto(finalUrl, { waitUntil: "domcontentloaded", timeout: budgetFor(config, routeConfig, "navigationMs", mode) });
      navigationMs = performance.now() - navStart;
      for (const step of routeConfig.beforeReadiness ?? []) {
        if (step.action === "click") await page.locator(step.selector).click();
      }
      const readyStart = performance.now();
      const readiness = routeConfig.readiness;
      await page.waitForFunction(
        ({ readiness }) => {
          const element = document.querySelector(readiness.selector);
          if (!element) return false;
          if (readiness.attribute) return readiness.accepted.includes(element.getAttribute(readiness.attribute));
          return readiness.text.some((text) => element.textContent?.includes(text));
        },
        { readiness },
        { timeout: budgetFor(config, routeConfig, "readinessMs", mode) },
      );
      readinessMs = performance.now() - readyStart;
      finalUrl = page.url();
      if (routeConfig.captureState) {
        runtimeState = await page.locator(routeConfig.captureState.selector).getAttribute(routeConfig.captureState.attribute);
      }
      const dimensions = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
      if (dimensions.documentWidth > dimensions.viewportWidth + 1) diagnostics.push(sanitizeDiagnostic("horizontal-clipping", `${dimensions.documentWidth}px document exceeds ${dimensions.viewportWidth}px viewport`));
      for (const selector of routeConfig.primaryActions) {
        const action = page.locator(selector).first();
        if ((await action.count()) !== 1 || !(await action.isVisible()) || !(await action.isEnabled())) diagnostics.push(sanitizeDiagnostic("primary-action-inaccessible", selector));
        else {
          await action.focus();
          if (!(await action.evaluate((node) => node === document.activeElement))) diagnostics.push(sanitizeDiagnostic("primary-action-unfocusable", selector));
        }
      }
      let priorFocus = null;
      let stagnant = 0;
      for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press("Tab");
        const focus = await page.evaluate(() => {
          const element = document.activeElement;
          const focusable = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')];
          return element ? `${focusable.indexOf(element)}:${element.tagName}#${element.id}.${element.className}`.slice(0, 200) : "none";
        });
        if (focus === priorFocus) stagnant += 1;
        else stagnant = 0;
        priorFocus = focus;
        if (stagnant >= 5) {
          diagnostics.push(sanitizeDiagnostic("keyboard-trap", focus));
          break;
        }
      }
      await page.addScriptTag({ content: axeSource });
      const violations = await page.evaluate(async () => (await globalThis.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations);
      for (const violation of violations.filter(({ impact }) => impact === "serious" || impact === "critical")) {
        diagnostics.push(sanitizeDiagnostic(`a11y-${violation.impact}`, `${violation.id}: ${violation.help} (${violation.nodes.length} nodes)`));
      }
      if (navigationMs > budgetFor(config, routeConfig, "navigationMs", mode)) diagnostics.push(sanitizeDiagnostic("navigation-budget", `${navigationMs.toFixed(1)}ms`));
      if (readinessMs > budgetFor(config, routeConfig, "readinessMs", mode)) diagnostics.push(sanitizeDiagnostic("readiness-budget", `${readinessMs.toFixed(1)}ms`));
      if (transferredBytes > budgetFor(config, routeConfig, "transferredBytes", mode)) diagnostics.push(sanitizeDiagnostic("byte-budget", `${transferredBytes} bytes`));
      if (renderedAssets > budgetFor(config, routeConfig, "renderedAssets", mode)) diagnostics.push(sanitizeDiagnostic("asset-budget", `${renderedAssets} assets`));
      runs.push({ journeyId: journey.id, route: journey.href, viewport: viewportName, finalUrl, startedAt: runStartedAt, completedAt: new Date().toISOString(), outcome: diagnostics.length ? "failed" : "passed", runtimeState, measurements: { navigationMs, readinessMs, transferredBytes, renderedAssets, ...dimensions }, diagnostics });
    } catch (error) {
      diagnostics.push(sanitizeDiagnostic("runner-error", error instanceof Error ? error.message : error));
      const dimensions = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth })).catch(() => ({ documentWidth: 0, viewportWidth: viewport.width }));
      runs.push({ journeyId: journey.id, route: journey.href, viewport: viewportName, finalUrl: page.url() || finalUrl, startedAt: runStartedAt, completedAt: new Date().toISOString(), outcome: "failed", runtimeState, measurements: { navigationMs, readinessMs: readinessMs || performance.now() - runStart, transferredBytes, renderedAssets, ...dimensions }, diagnostics });
    } finally {
      await context.close();
    }
  }
}
await browser.close();
const evidence = {
  version: 1,
  kind: "honua-flagship-quality-evidence",
  siteCommit: expectedCommit,
  sdkArtifact: { package: manifest.currentArtifact.package, version: manifest.currentArtifact.version, runtimeCommits: catalogRuntimeCommits(manifest) },
  mode,
  baseUrl: baseUrl.href,
  startedAt,
  completedAt: new Date().toISOString(),
  outcome: runs.every(({ outcome }) => outcome === "passed") ? "passed" : "failed",
  runs,
};
const evidenceErrors = validateEvidence(evidence, manifest, expectedCommit);
if (evidenceErrors.length) throw new Error(`invalid generated evidence:\n${evidenceErrors.join("\n")}`);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`flagship-quality: ${evidence.outcome} · ${runs.length} runs · ${output}`);
if (evidence.outcome !== "passed") process.exitCode = 1;

export { pathToFileURL };

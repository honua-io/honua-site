// Run against a local preview with an installed Playwright module:
// node scripts/check-consent-browser.mjs http://localhost:8000 /path/to/playwright/index.mjs
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const [baseUrl, playwrightModule] = process.argv.slice(2);
if (!baseUrl || !playwrightModule) throw new Error("Provide a preview URL and Playwright module path");
const { chromium } = await import(pathToFileURL(playwrightModule).href);
const browser = await chromium.launch({ headless: true });
const routes = ["demo-editing.html", "demo-maui-3d.html", "demo-leaflet-geoservices.html"];

async function checkBounds(page, height) {
  const bounds = await page.evaluate(() => {
    const banner = document.querySelector("#honua-cookie-banner").getBoundingClientRect();
    const shell = document.querySelector("main > section").getBoundingClientRect();
    return { bannerBottom: banner.bottom, top: shell.top, bottom: shell.bottom,
      overflow: document.documentElement.scrollWidth > innerWidth,
      scrollable: getComputedStyle(document.body).overflowY === "auto" };
  });
  assert.ok(bounds.bannerBottom <= bounds.top, JSON.stringify(bounds));
  assert.equal(bounds.overflow, false);
  if (height >= 900) assert.ok(bounds.bottom <= height, JSON.stringify(bounds));
  else {
    assert.equal(bounds.scrollable, true);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const bottom = await page.locator("main > section").evaluate((node) => node.getBoundingClientRect().bottom);
    assert.ok(bottom <= height + 1, `Short viewport cannot reach map bottom: ${bottom}`);
  }
}

async function checkConsent(route, viewport) {
  const page = await browser.newPage({ viewport });
  await page.route("**/www.googletagmanager.com/**", (route) => route.fulfill({ body: "" }));
  await page.goto(new URL(route, baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.locator("#honua-cookie-banner").waitFor();
  await checkBounds(page, viewport.height);
  await page.locator("[data-cookie-decline]").click();
  await page.reload();
  assert.equal(await page.locator("#honua-cookie-banner").count(), 0);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator("[data-cookie-accept]").click();
  await page.goto(new URL("privacy.html", baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.goBack({ waitUntil: "domcontentloaded" });
  assert.equal(await page.locator("#honua-cookie-banner").count(), 0);
  console.log(`PASS ${route} ${viewport.width}x${viewport.height}: bounds, scrolling, consent and back navigation`);
  await page.close();
}

try {
  for (const viewport of [{ width: 390, height: 900 }, { width: 1440, height: 900 }, { width: 740, height: 400 }]) {
    for (const route of routes) await checkConsent(route, viewport);
  }
} finally {
  await browser.close();
}

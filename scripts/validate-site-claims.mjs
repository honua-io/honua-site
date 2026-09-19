#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { forbiddenClaims } from "./forbidden-claims.mjs";
import { claimedPackages, proseVersionFailures, reconcilePackageClaim } from "./registry-claims.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const indexableUrls = new Map();
const corePages = readdirSync(root)
  .filter((name) => name.endsWith(".html"))
  .filter((name) => !/^(?:sample-.*|samples\.html|demo-.*|demo\.html|demos\.html)$/.test(name));
const claimTargetConfig = JSON.parse(readFileSync(join(root, "data", "forbidden-claim-targets.json"), "utf8"));

function requireCondition(condition, message) {
  if (!condition) failures.push(message);
}

for (const page of corePages) {
  const html = readFileSync(join(root, page), "utf8");
  for (const [pattern, description] of forbiddenClaims) {
    requireCondition(!pattern.test(html), `${page}: ${description}`);
  }

  const description = html.match(/<meta\s+name="description"\s+content="([^"]*)"\s*\/>/i)?.[1];
  if (description) {
    requireCondition(description.length <= 160, `${page}: meta description is ${description.length} characters`);
  }

  if (/<main\b/i.test(html)) {
    requireCondition(/class="skip-link"/.test(html), `${page}: missing skip link`);
    requireCondition(/<main\b[^>]*\bid="main-content"/.test(html), `${page}: main lacks id=main-content`);

    const tableCount = [...html.matchAll(/<table\b/gi)].length;
    const captionCount = [...html.matchAll(/<caption\b/gi)].length;
    requireCondition(tableCount === captionCount, `${page}: ${tableCount} tables but ${captionCount} captions`);
    requireCondition(!/<th\b(?![^>]*\bscope=)[^>]*>/i.test(html), `${page}: table header missing scope`);
    requireCondition([...html.matchAll(/<h1\b/gi)].length === 1, `${page}: expected exactly one h1`);
    requireCondition(!/<img\b(?![^>]*\balt=)[^>]*>/i.test(html), `${page}: image missing alt attribute`);
    requireCondition(!/<pre\b(?![^>]*\btabindex=)[^>]*>/i.test(html), `${page}: scrollable pre missing tabindex`);
    requireCondition(/href="\/?assets\/fonts\/geist-latin\.woff2"/.test(html), `${page}: missing local Geist preload`);
    requireCondition(/href="\/?assets\/fonts\/geist-mono-latin\.woff2"/.test(html), `${page}: missing local Geist Mono preload`);
    requireCondition(
      !/<(?:div|section)\b(?=[^>]*class=["'][^"']*\b(?:term-body|code-body)\b)(?![^>]*\btabindex=)[^>]*>/i.test(html),
      `${page}: scrollable terminal/code body missing tabindex`
    );
    requireCondition(
      !/<a\b(?=[^>]*\btarget=["']_blank["'])(?![^>]*\brel=["'][^"']*noopener)[^>]*>/i.test(html),
      `${page}: target=_blank link missing rel=noopener`
    );

    if (!/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) {
      const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"\s*\/>/i)?.[1];
      const expectedUrl = page === "index.html" ? "https://honua.io/" : `https://honua.io/${page}`;
      requireCondition(canonical === expectedUrl, `${page}: canonical URL must be ${expectedUrl}`);
      indexableUrls.set(page, expectedUrl);

      for (const marker of [
        'property="og:title"',
        'property="og:description"',
        'property="og:url"',
        'property="og:image"',
        'property="og:image:alt"',
        'property="og:image:width"',
        'property="og:image:height"',
        'name="twitter:card"',
        'name="twitter:title"',
        'name="twitter:description"',
        'name="twitter:image"',
        'name="twitter:image:alt"',
      ]) {
        requireCondition(html.includes(marker), `${page}: missing ${marker}`);
      }

      const ogUrl = html.match(/<meta\s+property="og:url"\s+content="([^"]+)"\s*\/>/i)?.[1];
      const expectedOgUrl = page === "index.html" ? "https://honua.io" : expectedUrl;
      requireCondition(ogUrl === expectedOgUrl, `${page}: og:url must be ${expectedOgUrl}`);
    }
  }
}

for (const target of claimTargetConfig.externalTargets) {
  const targetPath = join(root, target);
  if (!existsSync(targetPath)) continue;
  const content = readFileSync(targetPath, "utf8");
  for (const [pattern, description] of forbiddenClaims) {
    requireCondition(!pattern.test(content), `${target}: ${description}`);
  }
}

const ogImage = readFileSync(join(root, "assets", "og-image.png"));
requireCondition(ogImage.subarray(1, 4).toString("ascii") === "PNG", "og-image.png is not a PNG");
const ogWidth = ogImage.readUInt32BE(16);
const ogHeight = ogImage.readUInt32BE(20);
for (const page of indexableUrls.keys()) {
  const html = readFileSync(join(root, page), "utf8");
  requireCondition(html.includes(`property="og:image:width" content="${ogWidth}"`), `${page}: wrong og:image width`);
  requireCondition(html.includes(`property="og:image:height" content="${ogHeight}"`), `${page}: wrong og:image height`);
}

const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const jsonLd = indexHtml.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/i)?.[1];
requireCondition(Boolean(jsonLd), "index.html: missing JSON-LD");
if (jsonLd) {
  try {
    JSON.parse(jsonLd);
  } catch (error) {
    failures.push(`index.html: invalid JSON-LD (${error.message})`);
  }
  const hash = `sha256-${createHash("sha256").update(jsonLd).digest("base64")}`;
  requireCondition(indexHtml.includes(`'${hash}'`), "index.html: JSON-LD CSP hash is stale");
  requireCondition(readFileSync(join(root, "_headers"), "utf8").includes(`'${hash}'`), "_headers: JSON-LD CSP hash is stale");
}

const sitemap = readFileSync(join(root, "sitemap.xml"), "utf8");
const sitemapUrls = new Set([...sitemap.matchAll(/<loc>(https:\/\/honua\.io\/[^<]*)<\/loc>/g)].map((match) => match[1]));
const expectedSitemapUrls = new Set(indexableUrls.values());
for (const url of expectedSitemapUrls) requireCondition(sitemapUrls.has(url), `sitemap.xml: missing ${url}`);
for (const url of sitemapUrls) requireCondition(expectedSitemapUrls.has(url), `sitemap.xml: unexpected or noindex URL ${url}`);
requireCondition(
  readFileSync(join(root, "robots.txt"), "utf8").includes("Sitemap: https://honua.io/sitemap.xml"),
  "robots.txt: missing sitemap declaration"
);

const policy = JSON.parse(readFileSync(join(root, "data", "sdk-availability.v1.json"), "utf8"));
requireCondition(policy.server.compatibilityEndpoint === "/api/v1/admin/capabilities", "SDK data: wrong compatibility endpoint");
requireCondition(policy.server.publicVersionMatrix === false, "SDK data: must not claim a public version matrix yet");

// The generated table is regenerated from the snapshot, but prose is hand
// written and drifts silently; claims.html was still naming a superseded
// @honua/sdk-js version when #281 was filed. Any page that prints a package
// name next to a version has to print the claimed one.
const claims = claimedPackages(policy);
for (const page of corePages) {
  for (const failure of proseVersionFailures(page, readFileSync(join(root, page), "utf8"), claims)) {
    failures.push(failure);
  }
}

async function fetchWithRetry(url, extraHeaders = {}) {
  let lastError;
  let lastResponse;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const headers = { "user-agent": "honua-site-claims-validator/1.0", ...extraHeaders };
      if (url.startsWith("https://api.github.com/") && process.env.GITHUB_TOKEN) {
        headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        headers.accept = "application/vnd.github+json";
      }
      const response = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers,
      });
      if (response.status !== 429 && response.status < 500) return response;
      lastResponse = response;
      await response.body?.cancel();
      lastError = new Error(`${url} returned transient status ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  if (lastResponse) return lastResponse;
  throw lastError;
}

try {
  // Every claimed package is reconciled against its registry by one rule
  // (scripts/registry-claims.mjs): the version a reader gets by following the
  // site's install command must be the version the site advertises, and a
  // package the site calls unpublished must still be absent. Each reader below
  // narrows its registry's answer to the candidate versions that resolution
  // could pick; npm and PyPI report their own resolution, NuGet does not, so
  // its index is handed over whole and the winner is computed.
  const registryReaders = {
    npm: async (packageName) => {
      // The abbreviated packument is the small document npm's own installer
      // reads; it still carries dist-tags, unlike the /latest shorthand, which
      // answers 404 both for a missing package and for a missing tag.
      const response = await fetchWithRetry(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
        accept: "application/vnd.npm.install-v1+json",
      });
      if (response.status === 404) return { present: false, versions: [] };
      if (!response.ok) throw new Error(`npm registry returned ${response.status} for ${packageName}`);
      const packument = await response.json();
      // A bare `npm install` follows the `latest` dist-tag, which a maintainer
      // can point at any published version, so the tag is the claimable
      // version rather than the highest one in the packument.
      const latest = packument["dist-tags"]?.latest;
      if (typeof latest !== "string") throw new Error(`npm published no latest dist-tag for ${packageName}`);
      return { present: true, versions: [latest] };
    },
    nuget: async (packageName) => {
      // The flat container is the only nuget.org endpoint with no indexing lag;
      // it lists every version including unlisted ones, so an unlisting would
      // surface here as a claim mismatch rather than pass unnoticed.
      const response = await fetchWithRetry(
        `https://api.nuget.org/v3-flatcontainer/${encodeURIComponent(packageName.toLowerCase())}/index.json`
      );
      if (response.status === 404) return { present: false, versions: [] };
      if (!response.ok) throw new Error(`nuget.org returned ${response.status} for ${packageName}`);
      const index = await response.json();
      return { present: true, versions: index.versions ?? [] };
    },
    pypi: async (packageName) => {
      const response = await fetchWithRetry(`https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`);
      if (response.status === 404) return { present: false, versions: [] };
      if (!response.ok) throw new Error(`PyPI returned ${response.status} for ${packageName}`);
      const project = await response.json();
      // info.version is the release `pip install <name>` resolves to.
      const version = project.info?.version;
      if (typeof version !== "string") throw new Error(`PyPI published no version for ${packageName}`);
      return { present: true, versions: [version] };
    },
  };

  for (const claim of claims) {
    const read = registryReaders[claim.registryKind];
    if (!read) {
      failures.push(`${claim.packageName}: no reader for registry "${claim.registryKind}"`);
      continue;
    }
    for (const failure of reconcilePackageClaim({ ...claim, registry: await read(claim.packageName) })) {
      failures.push(failure);
    }
  }

  const publicEvidence = [
    "https://api.github.com/repos/honua-io/honua-server",
    "https://api.github.com/repos/honua-io/geobench",
    "https://api.github.com/repos/honua-io/honua-sdk-dotnet",
    "https://api.github.com/repos/honua-io/honua-sdk-python",
    "https://honua.gitbook.io/honuaio/reference/compatibility/geoservices-parity",
    "https://honua.gitbook.io/honuaio/reference/compatibility/clients",
    "https://demo.honua.io/stac",
  ];
  for (const url of publicEvidence) {
    const response = await fetchWithRetry(url);
    requireCondition(response.ok, `public evidence ${url} returned ${response.status}`);
  }
} catch (error) {
  failures.push(`registry/evidence validation failed: ${error.message}`);
}

if (failures.length) {
  console.error("Site claim validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Site claim validation passed for ${corePages.length} non-sample pages.`);

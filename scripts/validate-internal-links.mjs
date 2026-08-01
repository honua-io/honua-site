#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const pages = readdirSync(root)
  .filter((name) => name.endsWith(".html"))
  .filter((name) => !/^(?:sample-.*|samples\.html|demo-.*|demo\.html|demos\.html)$/.test(name));

function decode(value, page, href) {
  try {
    return decodeURIComponent(value);
  } catch {
    failures.push(`${page}: malformed URL encoding in ${href}`);
    return value;
  }
}

function resolveTarget(page, rawPath) {
  if (!rawPath) return join(root, page);

  const path = decode(rawPath.replace(/^\//, ""), page, rawPath);
  const candidate = normalize(join(root, path));
  const fromRoot = relative(root, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) return null;
  if (existsSync(candidate) && statSync(candidate).isDirectory()) return join(candidate, "index.html");
  if (!extname(candidate)) return `${candidate}.html`;
  return candidate;
}

for (const page of pages) {
  const html = readFileSync(join(root, page), "utf8");
  const hrefs = [...html.matchAll(/\bhref\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2].trim());

  for (const href of hrefs) {
    if (
      !href ||
      /^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(href) ||
      /^\{\{HONUA_SDK_(?:DOCS_URL|RELEASE_DOCS_URL)\}\}$/.test(href)
    )
      continue;

    const [withoutHash, rawFragment = ""] = href.split("#", 2);
    const rawPath = withoutHash.split("?", 1)[0];
    const target = resolveTarget(page, rawPath);
    if (!target || !existsSync(target)) {
      failures.push(`${page}: missing internal target ${href}`);
      continue;
    }

    if (!rawFragment || !target.endsWith(".html")) continue;
    const fragment = decode(rawFragment, page, href);
    const targetHtml = readFileSync(target, "utf8");
    const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const anchor = new RegExp(`\\b(?:id|name)=["']${escaped}["']`, "i");
    if (!anchor.test(targetHtml)) failures.push(`${page}: missing fragment target ${href}`);
  }
}

if (failures.length) {
  console.error("Internal link validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Internal link validation passed for ${pages.length} non-sample pages.`);

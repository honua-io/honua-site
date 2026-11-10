#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Pages whose source stays in the repository while the published site serves a
// short notice in their place. Nothing may link to them and the sitemap omits them.
export const pausedPages = ['cloud.html', 'install-with-agent.html'];

export function pausedNotice() {
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,follow" />
  <title>Not available yet | Honua</title>
  <meta name="description" content="This page is paused until the next Honua release candidate." />
  <link rel="canonical" href="https://honua.io/design-partners.html" />
  <link rel="preload" href="assets/fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="assets/fonts/geist-mono-latin.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="assets/remodel.css" />
</head><body class="h-site"><a class="skip-link" href="#main-content">Skip to content</a>
<main id="main-content" class="h-wrap h-page-hero" tabindex="-1"><h1>Not available yet</h1>
<p class="h-lede">Installing and evaluating Honua yourself is paused until the next release candidate. In the meantime, <a href="design-partners.html">send one service URL</a> and we will show you a copy of it running on Honua, or go back to the <a href="index.html">home page</a>.</p></main></body></html>
`;
}

export function writePausedNotices(directory) {
  for (const name of pausedPages) writeFileSync(join(directory, name), pausedNotice());
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[process.argv.indexOf('--into') + 1];
  if (!process.argv.includes('--into') || !target) { console.error('Usage: paused-pages.mjs --into <directory>'); process.exitCode = 1; }
  else { writePausedNotices(target); console.log(`Paused notices written for ${pausedPages.join(', ')}.`); }
}

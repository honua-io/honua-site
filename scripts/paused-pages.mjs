#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Pages whose source stays in the repository while the published site serves a
// short notice in their place. Nothing may link to them and the sitemap omits them.
export const pausedPages = ['belief.html', 'cloud.html', 'install-with-agent.html', 'windows-quickstart.html'];

// Sections that stay in a page's source while the published page carries a short
// notice under the same id. Links inside a paused section are not published.
export const pausedSections = [{ page: 'docs.html', id: 'quickstart' }];

function pausedSectionNotice(id) {
  return `<section id="${id}" class="night-band"><div class="hub-section"><div class="section-head"><div><h2>The local quickstart is paused.</h2></div><p>Installing Honua yourself is paused until the next release candidate. To see Honua on your own data now, <a href="design-partners.html">send one service URL</a>, or <a href="connect.html">connect a client to the live demo</a>.</p></div></div></section>`;
}

export function withoutPausedSections(name, html) {
  let result = html;
  for (const { page, id } of pausedSections) {
    if (page !== name) continue;
    const start = result.indexOf(`<section id="${id}"`);
    if (start < 0) throw new Error(`${page}: paused section #${id} not found`);
    const end = result.indexOf('</section>', start) + '</section>'.length;
    if (result.slice(start + 1, end).includes('<section')) throw new Error(`${page}: paused section #${id} must not nest sections`);
    result = result.slice(0, start) + pausedSectionNotice(id) + result.slice(end);
  }
  return result;
}

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
  for (const { page } of pausedSections) {
    const target = join(directory, page);
    if (existsSync(target)) writeFileSync(target, withoutPausedSections(page, readFileSync(target, 'utf8')));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[process.argv.indexOf('--into') + 1];
  if (!process.argv.includes('--into') || !target) { console.error('Usage: paused-pages.mjs --into <directory>'); process.exitCode = 1; }
  else { writePausedNotices(target); console.log(`Paused notices written for ${pausedPages.join(', ')}; paused sections replaced in ${pausedSections.map(s => s.page).join(', ')}.`); }
}

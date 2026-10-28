#!/usr/bin/env node
/** Deterministic metadata preparation for the remodeled static marketing routes. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const marketingPages = [
  'index.html', 'architecture.html', 'editions.html', 'compare-editions.html', 'blog.html',
  'blog-platform-vision.html', 'blog-ai-mapmaking.html',
  'blog-geoprocessing.html', 'blog-safe-operations.html', 'blog-2026-1-release-candidate.html',
  'blog-honua-launch.html',
];
// Preserve the approved organization/server structured data and its existing edge CSP hash.
export const homeJsonLd = `
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://honua.io/#organization",
      "name": "Honua",
      "url": "https://honua.io/",
      "logo": "https://honua.io/assets/honua-logo.svg",
      "sameAs": ["https://github.com/honua-io"]
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://honua.io/#software",
      "name": "Honua Server",
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "Linux, containers, Kubernetes",
      "description": "A source-available GIS server for PostGIS with Apache-2.0 SDKs and documented GeoServices REST, OGC, OData, STAC, tile, gRPC, and MCP surfaces.",
      "license": "https://github.com/honua-io/honua-server/blob/trunk/LICENSE",
      "isAccessibleForFree": true,
      "publisher": { "@id": "https://honua.io/#organization" }
    }
  ]
}
    `;
export const homeCspHash = `sha256-${createHash('sha256').update(homeJsonLd).digest('base64')}`;
const imageAlt = 'Honua social preview: Open geospatial infrastructure. One server. Open standards. Your cloud.';
const descriptions = {
  'index.html': 'Automate migration, create spatial applications with AI, scale compute with demand, and make operations routine and reversible.',
  'architecture.html': 'See how Honua’s server, SDKs, Console, and AI tools connect data, maps, processing, and safe operations to independently scalable compute.',
  'editions.html': 'Compare Community, Pro, and Enterprise feature highlights, source licenses, and Honua’s scale-based pricing direction.',
  'compare-editions.html': 'Search Honua capabilities by edition and category, with links to documentation, release details, and evidence.',
  'blog.html': 'How AI mapmaking, spatial processing, and platform operations work in Honua, and why we’ve built them this way.',
  'blog-platform-vision.html': 'Build maps and applications with AI, bring existing GIS work with you, and spend less time managing the infrastructure.',
  'blog-ai-mapmaking.html': 'How Studio turns a request into map changes and a spatial application you can save and reopen.',
  'blog-geoprocessing.html': 'How Honua separates map requests, job coordination, and processing so a long-running analysis can scale independently.',
  'blog-2026-1-release-candidate.html': 'The Honua 2026.1 Release Candidate: release tiers, supported SDK versions, known issues and upgrade notes. GA follows FOSS4G NA.',
  'blog-honua-launch.html': 'Honua is launching: a self-hosted geospatial platform over PostGIS for people and AI agents. The 2026.1 Release Candidate is available today.',
  'blog-safe-operations.html': 'Use the Ops Inbox to understand a problem, review a proposed fix, and check that the affected workflow works after the change.',
};
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const decode = value => value.replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
function meta(key, value, property = false) {
  return `  <meta ${property ? 'property' : 'name'}="${key}" content="${escape(value)}" />`;
}
export function normalizePage(name, html) {
  if (!marketingPages.includes(name)) throw new Error(`Not a marketing route: ${name}`);
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!titleMatch || !/<head>[\s\S]*?<\/head>/i.test(html)) throw new Error(`${name}: missing title/head`);
  const title = decode(titleMatch[1].trim());
  const canonical = name === 'index.html' ? 'https://honua.io/' : `https://honua.io/${name}`;
  const description = descriptions[name];
  if (description.length > 160) throw new Error(`${name}: description exceeds 160 characters`);
  const scriptSource = `'self'${name === 'index.html' ? ` '${homeCspHash}'` : ''} https://www.googletagmanager.com https://www.google-analytics.com`;
  const csp = `default-src 'self'; base-uri 'self'; object-src 'none'; script-src ${scriptSource}; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https://www.google-analytics.com https://honua.io; form-action 'self' https://formsubmit.co; upgrade-insecure-requests`;
  const head = [
    '<head>', '  <meta charset="utf-8" />', '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${escape(title)}</title>`, meta('description', description),
    `  <link rel="canonical" href="${canonical}" />`,
    meta('og:type', name.startsWith('blog-') ? 'article' : 'website', true),
    meta('og:title', title, true), meta('og:description', description, true),
    meta('og:url', name === 'index.html' ? 'https://honua.io' : canonical, true),
    meta('og:site_name', 'Honua', true), meta('og:image', 'https://honua.io/assets/og-image.png', true),
    meta('og:image:alt', imageAlt, true), meta('og:image:width', '1200', true), meta('og:image:height', '630', true),
    meta('twitter:card', 'summary_large_image'), meta('twitter:title', title), meta('twitter:description', description),
    meta('twitter:image', 'https://honua.io/assets/og-image.png'), meta('twitter:image:alt', imageAlt),
    `  <meta http-equiv="Content-Security-Policy" content="${escape(csp)}" />`,
    '  <link rel="icon" href="assets/favicon-32.png" type="image/png" />',
    '  <link rel="preload" href="assets/fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin />',
    '  <link rel="preload" href="assets/fonts/geist-mono-latin.woff2" as="font" type="font/woff2" crossorigin />',
    '  <link rel="stylesheet" href="assets/remodel.css" />',
    ...(name === 'editions.html' ? ['  <link rel="stylesheet" href="assets/editions.css" />'] : []),
    ...(name === 'architecture.html' ? ['  <link rel="stylesheet" href="assets/architecture-explorer.css" />', '  <link rel="stylesheet" href="assets/platform-guide.css" />', '  <script defer src="assets/architecture.js"></script>'] : []),
    ...(name === 'index.html' ? [`  <script type="application/ld+json">${homeJsonLd}</script>`] : []),
    '  <script defer src="assets/analytics.js"></script>',
    '  <script defer src="assets/nav.js"></script>',
    '  <script defer src="assets/remodel.js"></script>', '</head>',
  ].join('\n');
  // The general Docs destination is external; local quickstarts and contextual links stay intact.
  return html.replace(/<head>[\s\S]*?<\/head>/i, head)
    .replaceAll('class="h-skip"', 'class="skip-link"')
    .replaceAll('<a href="docs.html">Docs</a>', '<a href="https://docs.honua.io/">Docs</a>');
}
export function pricingRedirect() {
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,follow" />
  <title>Editions and commercial model | Honua</title>
  <meta name="description" content="Honua editions, licensing, and scale-based commercial direction." />
  <link rel="canonical" href="https://honua.io/editions.html" />
  <meta http-equiv="refresh" content="0;url=editions.html" />
  <link rel="preload" href="assets/fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="assets/fonts/geist-mono-latin.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="assets/remodel.css" />
</head><body class="h-site"><a class="skip-link" href="#main-content">Skip to content</a>
<main id="main-content" class="h-wrap h-page-hero" tabindex="-1"><h1>Editions and commercial model</h1>
<p id="pricing-table">Pricing and licensing information has moved to <a href="editions.html">Editions</a>. Final billing units and rates are still being developed.</p></main></body></html>
`;
}
export function prepare(root, check = false) {
  const headers = readFileSync(join(root, '_headers'), 'utf8');
  if (!headers.includes(`'${homeCspHash}'`)) throw new Error('Approved homepage JSON-LD no longer matches the edge CSP. Review both contracts before changing them.');
  const changes = new Map();
  for (const name of marketingPages) changes.set(name, normalizePage(name, readFileSync(join(root, name), 'utf8')));
  changes.set('pricing.html', pricingRedirect());
  const css = readFileSync(join(root, 'assets/remodel.css'), 'utf8');
  changes.set('assets/remodel.css', css.replaceAll('.h-skip', '.skip-link'));
  const urls = [];
  for (const name of readdirSync(root).filter(n => n.endsWith('.html')).sort()) {
    if (/^(?:sample-.*|samples\.html|demo-.*|demo\.html|demos\.html)$/.test(name)) continue;
    const html = changes.get(name) ?? readFileSync(join(root, name), 'utf8');
    if (!/<main\b/i.test(html) || /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) continue;
    const expected = name === 'index.html' ? 'https://honua.io/' : `https://honua.io/${name}`;
    urls.push(expected);
  }
  changes.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`);
  const changed = [];
  for (const [name, value] of changes) {
    let current;
    try { current = readFileSync(join(root, name), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (current === value) continue;
    changed.push(name);
    if (!check) writeFileSync(join(root, name), value);
  }
  if (check && changed.length) throw new Error(`Prepare marketing metadata first: ${changed.join(', ')}`);
  return changed;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const changed = prepare(root, process.argv.includes('--check'));
    console.log(`Marketing metadata prepared (${changed.length} files changed).`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

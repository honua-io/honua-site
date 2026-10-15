#!/usr/bin/env node
/** Edition-card highlights are selections of canonical keys, never another entitlement list. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const highlights = {
  community: ['serve.geoservices-featureserver', 'serve.ogc-api-features', 'serve.wms', 'serve.wfs', 'process.geoprocessing', 'import.file', 'geocoding.forward', 'ai.mcp-discovery'],
  pro: ['ai.agent-operations', 'editing.featureserver-edits', 'analytics.spatial-join', 'analytics.clustering', 'analytics.h3', 'caching.redis', 'identity.oidc', 'routing.solve'],
  enterprise: ['ai.approval-workflows', 'identity.oidc-multi-provider', 'identity.saml', 'identity.scim', 'import.geoservices', 'import.geoserver', 'geocoding.batch', 'plugin.sdk'],
};
const intro = {
  community: ['Community', 'Explore, build, and self-host.', 'Selected Community capabilities'],
  pro: ['Pro', 'More tools for spatial work and automation.', 'Community capabilities, plus'],
  enterprise: ['Enterprise', 'Governance and integration across teams.', 'Pro capabilities, plus'],
};
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const start = '<!-- GENERATED:edition-cards START -->';
const end = '<!-- GENERATED:edition-cards END -->';
export function renderEditionCards(snapshot) {
  if (!Array.isArray(snapshot?.capabilities)) throw new Error('Missing capability registry');
  const byKey = new Map();
  for (const c of snapshot.capabilities) {
    if (byKey.has(c.key)) throw new Error(`Duplicate capability: ${c.key}`);
    byKey.set(c.key, c);
  }
  const cards = Object.entries(highlights).map(([edition, keys]) => {
    const [name, description, includes] = intro[edition];
    const features = keys.map(key => {
      const c = byKey.get(key);
      if (!c || c.category === 'Internal' || c.edition?.toLowerCase() !== edition || !c.displayName) {
        throw new Error(`Edition highlight ${key} does not match canonical ${edition} assignment`);
      }
      // Evidence labels are not maturity. Only explicit release posture earns a badge.
      const posture = typeof c.releaseStatus === 'string' ? c.releaseStatus : /^(preview|experimental)$/i.test(c.status || '') ? c.status : '';
      const badge = /^(preview|experimental)$/i.test(posture) ? ` <span class="h-badge">${esc(posture[0].toUpperCase() + posture.slice(1))}</span>` : '';
      const href = `compare-editions.html?edition=${edition}&amp;q=${encodeURIComponent(key)}#capability-comparison`;
      return `  <li data-capability-key="${esc(key)}"><a href="${href}">${esc(c.displayName)}</a>${badge}</li>`;
    }).join('\n');
    return `<article class="h-edition${edition === 'pro' ? ' h-edition-featured' : ''}">
<h2>${name}</h2><p class="h-edition-description">${description}</p>
<p class="h-edition-includes">${includes}</p>
<ul class="h-edition-features" aria-label="${name} feature highlights">\n${features}\n</ul>
<a class="h-text-link" href="compare-editions.html?edition=${edition}#capability-comparison">All ${name} capabilities ↗</a>
</article>`;
  });
  return `${start}\n<div class="h-edition-grid h-edition-overview">\n${cards.join('\n')}\n</div>\n${end}`;
}
export function updateEditionCards(html, snapshot) {
  const a = html.indexOf(start), b = html.indexOf(end);
  if (a < 0 || b < a || html.indexOf(start, a + 1) >= 0 || html.indexOf(end, b + 1) >= 0) throw new Error('Missing or duplicate edition-card markers');
  return html.slice(0, a) + renderEditionCards(snapshot) + html.slice(b + end.length);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const file = join(root, 'editions.html');
  try {
    const before = readFileSync(file, 'utf8');
    const after = updateEditionCards(before, JSON.parse(readFileSync(join(root, 'data/capabilities.v1.json'), 'utf8')));
    if (process.argv.includes('--check') && before !== after) throw new Error('Edition cards are stale: run node scripts/gen-edition-cards.mjs');
    if (!process.argv.includes('--check') && before !== after) writeFileSync(file, after);
    console.log('Edition highlights match the capability registry.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

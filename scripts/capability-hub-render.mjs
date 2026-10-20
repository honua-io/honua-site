import { renderPlatformComponents } from './platform-components.mjs';
import { readFileSync } from 'node:fs';
import { documentPage, escapeHtml as e } from './capability-page-shell.mjs';
export const presentation = JSON.parse(readFileSync(new URL('../data/capability-navigation.v1.json', import.meta.url), 'utf8'));
const docRoot = 'https://docs.honua.io/';
const slug = s => s.replaceAll('.', '-');
const detailedLink = cap => `capability-details.html#cap-${slug(cap.key)}`;
export function scopeLabel(cap) {
  const stated = cap.releaseStatus || (/^(experimental|preview)$/i.test(cap.status || '') ? cap.status : '');
  if (/experimental/i.test(stated) || /experimental in 2026\.1/i.test(cap.scopeNote || '')) return 'Experimental';
  if (/preview/i.test(stated)) return 'Preview';
  return presentation.supplementalScope[cap.key] || '';
}
const badge = text => text ? `<span class="hub-badge">${e(text)}</span>` : '';
function label(cap, group = {}) { return group.labels?.[cap.key] || cap.displayName.replace(/^ArcGIS Portal /, 'Portal '); }
export function assignGroups(snapshot) {
  if (!Array.isArray(snapshot.capabilities)) throw new Error('Missing capability list');
  const seen = new Set();
  for (const c of snapshot.capabilities) {
    if (!c.key || seen.has(c.key)) throw new Error(`Missing/duplicate capability key: ${c.key}`);
    seen.add(c.key);
  }
  for (const group of presentation.groups) {
    for (const key of group.keys || []) if (!seen.has(key)) throw new Error(`Unknown presentation key ${key}`);
  }
  // Functionality and protocols are independent views. A capability can appear
  // in both, but only once within each view; neither view owns entitlements.
  const assignedBySection = new Map();
  return presentation.groups.map(group => {
    const assigned = assignedBySection.get(group.section) || new Set();
    assignedBySection.set(group.section, assigned);
    const selected = snapshot.capabilities.filter(cap => {
      const matches = (group.keys || []).includes(cap.key) || (group.categories || []).includes(cap.category) || (group.prefixes || []).some(p => cap.key.startsWith(p));
      if (matches && !(group.excludeKeys || []).includes(cap.key) && !assigned.has(cap.key) && cap.category !== 'Internal') { assigned.add(cap.key); return true; }
      return false;
    });
    const rank = key => { const i = (group.keys || []).indexOf(key); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
    selected.sort((a, b) => rank(a.key) - rank(b.key));
    return { ...group, capabilities: selected };
  });
}
function capabilityItem(cap, group) {
  const name = label(cap, group);
  return `<li data-hub-item data-capability-key="${e(cap.key)}" data-search="${e([name,cap.displayName,cap.key,cap.summary].join(' ').toLowerCase())}"><a href="${e(detailedLink(cap))}">${e(name)}<span aria-hidden="true">↗</span></a>${badge(scopeLabel(cap))}</li>`;
}
function card(group, index) {
  const all = group.capabilities.map(cap => capabilityItem(cap, group));
  for (const x of group.extras || []) all.unshift(`<li data-hub-item data-search="${e((x.title+' '+x.scope).toLowerCase())}"><a href="${e(x.href)}">${e(x.title)}<span aria-hidden="true">↗</span></a>${badge(x.status)}</li>`);
  const limit = group.showAll ? all.length : 6;
  const more = all.length > limit ? `<details class="hub-more"><summary>Show ${all.length-limit} more</summary><ul class="hub-feature-list">${all.slice(limit).join('')}</ul></details>` : '';
  return `<article class="hub-card${group.featured ? ' hub-card-featured' : ''}" id="group-${e(group.id)}" data-hub-card><div class="hub-card-top"><span class="h-kicker">${String(index+1).padStart(2,'0')}</span><span class="hub-count">${all.length} ${e(group.countLabel || 'capabilities')}</span></div><h3>${e(group.title)}</h3><p>${e(group.summary)}</p><ul class="hub-feature-list">${all.slice(0,limit).join('')}</ul>${more}${group.href ? `<a class="hub-reference-link" href="${e(group.href)}">Service reference ↗</a>` : ''}</article>`;
}
function formatCard(group) {
  const items = group.items.map(item => `<li data-hub-item data-search="${e((item.title+' '+item.role).toLowerCase())}"><a href="${e(item.href)}">${e(item.title)} <span aria-hidden="true">↗</span></a><span class="hub-format-role">${e(item.role)}</span>${badge(item.status)}</li>`).join('');
  return `<article class="hub-format" id="format-${e(group.id)}" data-hub-card><h3>${e(group.title)}</h3><p>${e(group.summary)}</p><ul class="hub-format-list">${items}</ul>${group.note ? `<p class="hub-footnote">${e(group.note)}</p>` : ''}</article>`;
}
export function renderHub(snapshot) {
  const groups = assignGroups(snapshot);
  const standards = groups.filter(g => g.section === 'standards');
  const workflows = groups.filter(g => g.section === 'workflows');
  const providers = presentation.providers.map(p => `<article class="hub-db" data-hub-card><div class="hub-db-head"><h3><a href="${e(p.href)}">${e(p.title)} ↗</a></h3>${badge(p.status)}</div><span class="hub-access">${e(p.access)}</span><p>${e(p.description)}</p></article>`).join('');
  return `<!-- GENERATED:capability-catalog START -->
<section class="h-wrap h-page-hero hub-hero"><span class="h-kicker">PLATFORM CAPABILITIES</span><h1>Build across<br><span>the whole platform.</span></h1><p class="h-lede">Server, SDKs, Console, and AI tools for geospatial applications and operations—with experimental mobile and field collection.</p><div class="h-actions"><a class="h-button" href="install-with-agent.html" data-analytics-event="cta_click" data-analytics-label="capabilities_agent_install" data-analytics-destination="install-with-agent.html">Install with an agent ↗</a><a class="h-button h-button-secondary" href="capability-details.html">Detailed catalog ↗</a></div></section>
<div class="hub-navigation"><nav class="h-wrap hub-jumps" aria-label="Capability sections"><a href="#components">Platform</a><a href="#workflows">Functionality</a><a href="#standards">Standards &amp; APIs</a><a href="#databases">Databases</a><a href="#formats">Formats &amp; files</a><a href="compare-editions.html">Compare editions ↗</a></nav></div>
<div class="h-wrap hub-find"><label class="hub-search" for="hub-search">Search components, functionality, services, databases &amp; formats<input id="hub-search" type="search" placeholder="Try SDKs, Collect, GPServer, GeoParquet, or SQL Server…" disabled></label><p id="hub-search-status" class="hub-footnote" role="status" aria-live="polite"></p></div>
${renderPlatformComponents()}
<section class="h-wrap hub-section hub-workflows" id="workflows"><header class="hub-heading"><div><span class="h-kicker">DO THE SPATIAL WORK</span><h2>What you can do with Honua.</h2></div><p>Start with the work: publish data, build maps, analyze, automate, and operate.</p></header><div class="hub-grid">${workflows.map(card).join('')}</div><p class="hub-footnote">Preview and experimental functionality is labeled where stated in the referenced scope. <a href="https://github.com/honua-io/honua-server/releases">Release notes ↗</a></p></section>
<section class="h-wrap hub-section" id="standards"><header class="hub-heading"><div><span class="h-kicker">CONNECT YOUR TOOLS</span><h2>Standards &amp; interfaces.</h2></div><p>Work with spatial data from desktop GIS, web applications, backend services, and AI agents.</p></header><div class="hub-grid hub-standards">${standards.map(card).join('')}</div></section>
<section class="h-light" id="databases"><div class="h-wrap hub-section"><header class="hub-heading"><div><span class="h-kicker">WORK WITH YOUR DATA</span><h2>Databases &amp; warehouses.</h2></div><p>Use PostGIS for the full read/write platform, or serve existing data through a read-only connection. Each provider links to its supported operations.</p></header><div class="hub-db-grid">${providers}</div><p class="hub-footnote">Experimental providers are separate from the supported read/query paths. <a href="${docRoot}server/reference/configuration/data-sources">Provider reference ↗</a></p></div></section>
<section class="h-wrap hub-section" id="formats"><header class="hub-heading"><div><span class="h-kicker">FILES, STREAMS &amp; OBJECT STORAGE</span><h2>Cloud-native formats. Familiar files.</h2></div><p>See which formats you can import, register in place, produce, or request as query output.</p></header><div class="hub-format-grid">${presentation.formatGroups.map(formatCard).join('')}</div><p class="hub-footnote"><a href="${docRoot}server/reference/data-formats">Complete import and output matrix ↗</a> · <a href="${docRoot}server/reference/protocols/cloud-native-formats">Cloud-native workflows ↗</a></p></section>
<section class="hub-bottom"><div class="h-wrap"><div><span class="h-kicker">THE DETAILS ARE HERE TOO</span><h2>Go deeper when you need to.</h2><p>Search individual operations, review evidence, or build a shareable checklist for your evaluation.</p></div><div class="hub-bottom-links"><a href="capability-details.html">Full capability catalog ↗</a><a href="compare-editions.html">Compare editions ↗</a><a href="${docRoot}">Documentation ↗</a><a href="architecture.html">Explore the architecture ↗</a></div></div></section>
<div class="hub-legacy sr-only" aria-label="Legacy capability links">${snapshot.capabilities.map(c => `<a id="cap-${e(slug(c.key))}" href="${e(detailedLink(c))}">${e(c.displayName)}</a>`).join('')}${[...new Set(snapshot.capabilities.map(c => c.category))].map(c => `<a id="cat-${e(c.toLowerCase().replace(/[^a-z0-9]+/g,'-'))}" href="capability-details.html#cat-${e(c.toLowerCase().replace(/[^a-z0-9]+/g,'-'))}">${e(c)}</a>`).join('')}</div>
<!-- GENERATED:capability-catalog END -->`;
}
export function renderDetailsPage(snapshot, catalog) {
  const table = catalog.replaceAll(' form="cap-intake-form"', '').replaceAll('2026.2 edition intent','Minimum edition').replaceAll('Generated from the current Honua Server capability matrix','Committed capability snapshot').replaceAll('class="btn btn-ghost"','class="h-button h-button-secondary"');
  return documentPage('Detailed capability catalog','capability-details.html', `<section class="h-wrap h-page-hero"><a class="h-back" href="capabilities.html">← Browse capability groups</a><span class="h-kicker">CAPABILITY REFERENCE</span><h1>Find the exact capability.</h1><p class="h-lede">Scope, documentation, and source evidence for each entry. Select capabilities to share a checklist.</p><div class="h-actions"><a class="h-button h-button-secondary" href="compare-editions.html">Compare editions ↗</a><a class="h-text-link" href="https://github.com/honua-io/honua-server/releases">Release notes ↗</a></div></section><section class="h-wrap hub-detail"><div class="hub-checklist"><label for="detail-search">Search the catalog<input id="detail-search" type="search" placeholder="Name, protocol, or capability key" disabled></label><div><button type="button" id="cap-copy-selection" class="h-button" disabled>Copy selected link</button><button type="button" id="cap-clear-selection" class="h-button h-button-secondary" disabled>Clear selection</button></div><p id="cap-selection-status" role="status" aria-live="polite"></p><input id="cap-share-url" type="url" aria-label="Shareable capability link" readonly hidden></div><p id="cap-filter-banner" hidden>Showing a shared selection. <a href="capability-details.html">View all capabilities ↗</a></p>${table}</section>`, '<script defer src="assets/capability-filter.js"></script>');
}
export function modernizeEvidence(original, snapshot, cap) {
  let main = original.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  if (!main) throw new Error('Evidence page missing main');
  main = main.replace(/<section\b[^>]*aria-label="2026\.1 licensing"[\s\S]*?<\/section>/i, '');
  main = main.replaceAll('2026.2 edition intent:', 'Minimum edition:').replaceAll('capabilities.html#cap-', 'capability-details.html#cap-');
  main = main.replace(/<span class="eyebrow">([\s\S]*?)<\/span>/, '<span class="h-kicker">CAPABILITY EVIDENCE</span>');
  const scope = scopeLabel(cap);
  main = main.replace(/(<h1>[\s\S]*?<\/h1>)/, `$1${scope ? `<p>${badge(scope)}</p>` : ''}`);
  return documentPage(`Evidence: ${cap.displayName}`, `evidence-${slug(cap.key)}.html`, `<article class="h-wrap hub-evidence">${main}<p class="hub-footnote"><a href="https://github.com/honua-io/honua-server/releases">Release notes</a> · <a href="editions.html">Editions and licensing</a></p></article>`, '<meta name="robots" content="noindex,follow">');
}

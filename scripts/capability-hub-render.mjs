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
function label(cap) { return cap.displayName.replace(/^ArcGIS Portal /, 'Portal '); }
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
  const assigned = new Set();
  return presentation.groups.map(group => ({ ...group, capabilities: snapshot.capabilities.filter(cap => {
    const matches = (group.keys || []).includes(cap.key) || (group.categories || []).includes(cap.category) || (group.prefixes || []).some(p => cap.key.startsWith(p));
    if (matches && !assigned.has(cap.key) && cap.category !== 'Internal') { assigned.add(cap.key); return true; }
    return false;
  })}));
}
function capabilityItem(cap) {
  return `<li data-hub-item data-search="${e([cap.displayName,cap.key,cap.summary].join(' ').toLowerCase())}"><a href="${e(detailedLink(cap))}">${e(label(cap))}<span aria-hidden="true">↗</span></a>${badge(scopeLabel(cap))}</li>`;
}
function card(group, index) {
  const all = group.capabilities.map(capabilityItem);
  for (const x of group.extras || []) all.unshift(`<li data-hub-item data-search="${e((x.title+' '+x.scope).toLowerCase())}"><a href="${e(x.href)}">${e(x.title)}<span aria-hidden="true">↗</span></a>${badge(x.status)}</li>`);
  const limit = group.section === 'standards' ? 8 : 6;
  const more = all.length > limit ? `<details class="hub-more"><summary>Show ${all.length-limit} more</summary><ul class="hub-feature-list">${all.slice(limit).join('')}</ul></details>` : '';
  return `<article class="hub-card" id="group-${e(group.id)}" data-hub-card><div class="hub-card-top"><span class="h-kicker">${String(index+1).padStart(2,'0')}</span><span class="hub-count">${all.length} capabilities</span></div><h3>${e(group.title)}</h3><p>${e(group.summary)}</p><ul class="hub-feature-list">${all.slice(0,limit).join('')}</ul>${more}</article>`;
}
export function renderHub(snapshot) {
  const groups = assignGroups(snapshot);
  const standards = groups.filter(g => g.section === 'standards');
  const workflows = groups.filter(g => g.section === 'workflows');
  const providers = presentation.providers.map(p => `<article class="hub-db" data-hub-card><div class="hub-db-head"><h3><a href="${e(p.href)}">${e(p.title)} ↗</a></h3>${badge(p.status)}</div><span class="hub-access">${e(p.access)}</span><p>${e(p.description)}</p></article>`).join('');
  return `<!-- GENERATED:capability-catalog START -->
<section class="h-wrap h-page-hero hub-hero"><span class="h-kicker">PLATFORM CAPABILITIES</span><h1>Explore what<br><span>you can build on.</span></h1><p class="h-lede">Find the standards, data connections, and spatial workflows that fit your stack.</p><div class="h-actions"><a class="h-button" href="install-with-agent.html" data-analytics-event="cta_click" data-analytics-label="capabilities_agent_install" data-analytics-destination="install-with-agent.html">Install with an agent ↗</a><a class="h-button h-button-secondary" href="capability-details.html">Detailed catalog ↗</a></div></section>
<div class="hub-navigation"><nav class="h-wrap hub-jumps" aria-label="Capability sections"><a href="#standards">Standards &amp; APIs</a><a href="#databases">Databases</a><a href="#formats">File formats</a><a href="#workflows">Workflows</a><a href="compare-editions.html">Compare editions ↗</a></nav></div>
<section class="h-wrap hub-section" id="standards"><header class="hub-heading"><div><span class="h-kicker">CONNECT YOUR TOOLS</span><h2>Standards &amp; interfaces.</h2></div><p>Work with spatial data from desktop GIS, web applications, backend services, and AI agents.</p></header><div class="hub-grid hub-standards">${standards.map(card).join('')}</div></section>
<section class="h-light" id="databases"><div class="h-wrap hub-section"><header class="hub-heading"><div><span class="h-kicker">WORK WITH YOUR DATA</span><h2>Databases &amp; warehouses.</h2></div><p>Use PostGIS for the full read/write platform, or serve existing data through a read-only connection. Each provider links to its supported operations.</p></header><div class="hub-db-grid">${providers}</div><p class="hub-footnote">Experimental providers are separate from the supported read/query paths. <a href="${docRoot}server/reference/configuration/data-sources">Provider reference ↗</a></p></div></section>
<section class="h-wrap hub-section" id="formats"><header class="hub-heading"><div><span class="h-kicker">FILES &amp; OBJECT STORAGE</span><h2>Cloud-native and familiar formats.</h2></div><p>Import a file, publish a tile archive, or connect a cloud-hosted asset. The format reference explains which paths apply.</p></header><div class="hub-format-grid"><article class="hub-format"><h3>Features &amp; tables</h3><p>GeoParquet · GeoArrow · FlatGeobuf · GeoJSON · GeoPackage · Shapefile</p><a href="${docRoot}server/guides/publish/import-files">Import formats ↗</a></article><article class="hub-format"><h3>Tiles &amp; imagery</h3><p>PMTiles · MVT · TileJSON · Cloud-Optimized GeoTIFF</p><a href="${docRoot}server/reference/protocols/cloud-native-formats">Cloud-native formats ↗</a></article><article class="hub-format"><h3>Multidimensional data</h3><p>Zarr · NetCDF4 · HDF5</p><p class="hub-footnote">Registration and catalog paths; serving scope is documented separately.</p><a href="${docRoot}server/reference/protocols/cloud-native-formats">Read the format scope ↗</a></article></div></section>
<section class="h-wrap hub-section hub-workflows" id="workflows"><header class="hub-heading"><div><span class="h-kicker">DO THE SPATIAL WORK</span><h2>Capabilities that work together.</h2></div><div><label class="hub-search" for="hub-search">Find a workflow capability<input id="hub-search" type="search" placeholder="Try geoprocessing, identity, or maps…" disabled></label><p id="hub-search-status" class="hub-footnote" role="status" aria-live="polite"></p></div></header><div class="hub-grid">${workflows.map(card).join('')}</div><p class="hub-footnote">Preview and experimental functionality is labeled where stated in the referenced scope. <a href="https://github.com/honua-io/honua-server/releases">Release notes ↗</a></p></section>
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

/* Progressive UI only. All core copy and architecture panels are static HTML. */
(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const safeUrl = (value) => {
    if (typeof value !== 'string' || !value) return null;
    try {
      const url = new URL(value, document.baseURI);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  };
  function initTabs(root) {
    const tablist = root.querySelector('[role="tablist"]');
    if (!tablist) return;
    const tabs = Array.from(tablist.querySelectorAll('[data-tab]'));
    const panels = Array.from(root.querySelectorAll('[data-panel]'));
    if (!tabs.length || !panels.length) return;
    const aliases = { overview: 'platform', esri: 'platform', aws: 'deployment', azure: 'deployment', ops: 'operations' };
    function activate(id, updateUrl) {
      const selected = tabs.find(t => t.dataset.tab === id) || tabs[0];
      tabs.forEach(t => {
        const active = t === selected;
        t.setAttribute('aria-selected', String(active));
        t.tabIndex = active ? 0 : -1;
      });
      panels.forEach(p => {
        p.hidden = p.id !== selected.dataset.tab;
        p.setAttribute('role', 'tabpanel');
        p.setAttribute('aria-labelledby', 'tab-' + p.id);
        p.tabIndex = 0;
      });
      if (updateUrl) window.history.replaceState(null, '', '#' + selected.dataset.tab);
    }
    function fromHash() {
      const id = window.location.hash.slice(1);
      activate(aliases[id] || id, false);
    }
    tabs.forEach(t => t.addEventListener('click', () => activate(t.dataset.tab, true)));
    tablist.addEventListener('keydown', event => {
      const index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      let target;
      if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') target = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = tabs.length - 1;
      if (target === undefined) return;
      event.preventDefault();
      activate(tabs[target].dataset.tab, true);
      tabs[target].focus();
    });
    tablist.hidden = false;
    fromHash();
    window.addEventListener('hashchange', fromHash);
  }
  async function initRegistry() {
    if (!document.querySelector('[data-capability-registry]')) return;
    const search = byId('capability-search');
    const edition = byId('capability-edition');
    const category = byId('capability-category');
    const count = byId('capability-count');
    const source = byId('capability-source');
    const tbody = byId('capability-rows');
    const rank = { community: 0, pro: 1, enterprise: 2 };
    const params = new URLSearchParams(window.location.search);
    const requestedEdition = params.get('edition');
    let pendingEdition = Object.hasOwn(rank, requestedEdition) ? requestedEdition : null;
    const requestedQuery = params.get('q');
    if (requestedQuery) search.value = requestedQuery.slice(0, 256);
    document.querySelectorAll('[data-edition-link]').forEach(link => {
      link.addEventListener('click', () => {
        pendingEdition = link.dataset.editionLink;
        if (!edition.disabled) {
          edition.value = pendingEdition;
          edition.dispatchEvent(new Event('change'));
          search.focus({ preventScroll: true });
        }
      });
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('data/capabilities.v1.json', { signal: controller.signal, credentials: 'same-origin' });
      if (!response.ok) throw new Error('Snapshot unavailable');
      const snapshot = await response.json();
      if (!Array.isArray(snapshot.capabilities) || !snapshot.capabilities.length) throw new Error('No capability records');
      const rows = snapshot.capabilities.filter(c => c && typeof c.key === 'string' && typeof c.displayName === 'string' && c.category !== 'Internal');
      if (!rows.length) throw new Error('No public capability records');
      const categories = [...new Set(rows.map(c => c.category).filter(c => typeof c === 'string'))].sort();
      for (const name of categories) {
        const option = document.createElement('option'); option.value = name; option.textContent = name; category.append(option);
      }
      source.textContent = 'Committed snapshot: ' + (snapshot.generatedAt || 'date not declared') + '. ';
      const sourceMatch = typeof snapshot.source === 'string' ? snapshot.source.match(/https?:\/\/[^\s)]+/) : null;
      const sourceHref = sourceMatch && safeUrl(sourceMatch[0]);
      if (sourceHref) {
        const link = document.createElement('a'); link.href = sourceHref; link.textContent = 'Inspect source revision ↗'; source.append(link);
      } else { source.append(document.createTextNode('Source revision not declared in this snapshot.')); }
      function addLink(cell, value, label) {
        const href = safeUrl(value);
        if (!href) return;
        const link = document.createElement('a'); link.href = href; link.textContent = label; cell.append(link);
      }
      function render() {
        const query = search.value.trim().toLowerCase();
        const selected = rows.filter(c => {
          const tier = String(c.edition || '').toLowerCase();
          const included = edition.value === 'all' || (rank[tier] !== undefined && rank[tier] <= rank[edition.value]);
          return included && (category.value === 'all' || c.category === category.value) && (!query || [c.displayName, c.key, c.summary, c.category].filter(x => typeof x === 'string').join(' ').toLowerCase().includes(query));
        }).sort((a, b) => a.displayName.localeCompare(b.displayName));
        tbody.replaceChildren();
        const fragment = document.createDocumentFragment();
        for (const c of selected) {
          const tr = document.createElement('tr');
          const identity = document.createElement('td');
          const title = document.createElement('strong'); title.textContent = c.displayName;
          const key = document.createElement('small'); key.textContent = c.key;
          identity.append(title, key);
          if (typeof c.summary === 'string') { const summary = document.createElement('small'); summary.textContent = c.summary; identity.append(summary); }
          const tier = document.createElement('td');
          const lower = String(c.edition || '').toLowerCase(); tier.textContent = rank[lower] === undefined ? 'Not declared' : lower[0].toUpperCase() + lower.slice(1);
          const detail = document.createElement('td');
          const status = document.createElement('span'); status.className = 'h-registry-status';
          const label = snapshot.statusVocabulary?.[c.status]?.label;
          status.textContent = 'Evidence: ' + (typeof label === 'string' ? label : c.status || 'Not declared');
          detail.append(status);
          const maturity = document.createElement('small');
          maturity.textContent = typeof c.releaseStatus === 'string' ? 'Release: ' + c.releaseStatus : 'Release maturity: see documentation';
          detail.append(maturity);
          addLink(detail, c.links?.docs || 'docs.html', 'Docs');
          addLink(detail, c.links?.evidence || 'capabilities.html', 'Evidence');
          tr.append(identity, tier, detail); fragment.append(tr);
        }
        if (!selected.length) {
          const tr = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 3; cell.textContent = 'No capabilities match these filters. Try another term or reset the edition and category.'; tr.append(cell); fragment.append(tr);
        }
        tbody.append(fragment);
        count.textContent = selected.length + ' of ' + rows.length + ' capabilities. Edition inclusion is cumulative; the table shows each capability’s minimum edition.';
      }
      [search, edition, category].forEach(el => { el.disabled = false; el.addEventListener(el === search ? 'input' : 'change', render); });
      if (pendingEdition) edition.value = pendingEdition;
      render();
    } catch {
      count.textContent = 'The capability snapshot could not be loaded. No edition assignments have been guessed.';
      source.replaceChildren();
      const link = document.createElement('a'); link.href = 'capabilities.html'; link.textContent = 'Open the static capability and evidence catalog ↗'; source.append(link);
      const tr = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 3; cell.textContent = 'Use the catalog link above, or reload this page to try again.'; tr.append(cell); tbody.replaceChildren(tr);
    } finally { clearTimeout(timeout); }
  }
  function init() {
    document.querySelectorAll('[data-tabs]').forEach(initTabs);
    initRegistry();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

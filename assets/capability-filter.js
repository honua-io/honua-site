/* Shareable capability checklist; no prices, billing estimates, or network requests. */
(function () {
  'use strict';
  function init() {
    const rows = Array.from(document.querySelectorAll('tr[data-cap-key]'));
    if (!rows.length) return;
    const groups = Array.from(document.querySelectorAll('.cap-category'));
    const byKey = new Map(rows.map(row => [row.dataset.capKey, row]));
    const search = document.getElementById('detail-search');
    const status = document.getElementById('cap-selection-status');
    const share = document.getElementById('cap-share-url');
    const copy = document.getElementById('cap-copy-selection');
    const clear = document.getElementById('cap-clear-selection');
    const requested = new URLSearchParams(location.search).get('caps');
    let sharedKeys = requested === null ? null : new Set(requested.split(',').filter(key => byKey.has(key)));
    rows.forEach(row => { row.querySelector('.cap-check').checked = Boolean(sharedKeys?.has(row.dataset.capKey)); });
    const selected = () => rows.filter(row => row.querySelector('.cap-check').checked).map(row => row.dataset.capKey);
    function updateSelection() {
      const keys = selected();
      const url = new URL('capability-details.html', location.href);
      if (keys.length) url.searchParams.set('caps', keys.join(','));
      share.value = url.href;
      copy.disabled = !keys.length;
      status.textContent = `${keys.length} capabilities selected.`;
    }
    function filter() {
      const query = search.value.trim().toLowerCase();
      rows.forEach(row => { row.hidden = Boolean(sharedKeys && !sharedKeys.has(row.dataset.capKey)) || Boolean(query && !(row.dataset.capKey+' '+row.textContent).toLowerCase().includes(query)); });
      groups.forEach(group => {
        group.hidden = !Array.from(group.querySelectorAll('tr[data-cap-key]')).some(row => !row.hidden);
        if (query || sharedKeys) group.open = !group.hidden;
      });
      const visible = rows.filter(row => !row.hidden).length;
      status.textContent = `${selected().length} selected · ${visible} of ${rows.length} capabilities match.`;
      document.getElementById('cap-filter-banner').hidden = sharedKeys === null;
    }
    function openHash() {
      let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
      const target = document.getElementById(id);
      if (!target) return;
      const group = target.closest('details'); if (group) { group.hidden = false; group.open = true; }
      if (target.tagName === 'DETAILS') target.open = true;
      if (target.matches('tr[data-cap-key]')) target.hidden = false;
      requestAnimationFrame(() => target.scrollIntoView({ block: 'center', behavior: 'instant' }));
    }
    [search, clear].forEach(el => { el.disabled = false; });
    document.getElementById('cap-cat-controls').hidden = false;
    search.addEventListener('input', filter);
    rows.forEach(row => row.querySelector('.cap-check').addEventListener('change', updateSelection));
    clear.addEventListener('click', () => { rows.forEach(row => { row.querySelector('.cap-check').checked = false; }); sharedKeys = null; search.value = ''; updateSelection(); filter(); });
    copy.addEventListener('click', async () => {
      updateSelection(); share.hidden = false;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('No clipboard');
        await navigator.clipboard.writeText(share.value); status.textContent = 'Selection link copied.';
      } catch { share.focus(); share.select(); status.textContent = 'Copy the selected link above.'; }
    });
    document.getElementById('cap-expand-all').addEventListener('click', () => groups.forEach(g => { if (!g.hidden) g.open = true; }));
    document.getElementById('cap-collapse-all').addEventListener('click', () => groups.forEach(g => { g.open = false; }));
    window.addEventListener('hashchange', openHash);
    updateSelection(); filter(); openHash();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

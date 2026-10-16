/* Progressive enhancement: static cards and the install prompt work without JavaScript. */
(function () {
  'use strict';
  function init() {
    if (document.getElementById('standards') && (/^#(?:cap-|cat-)/.test(location.hash) || new URLSearchParams(location.search).has('caps'))) {
      const target = new URL('capability-details.html', location.href);
      target.search = location.search; target.hash = location.hash;
      location.replace(target.href); return;
    }
    const search = document.getElementById('hub-search');
    if (search) {
      search.disabled = false;
      const cards = Array.from(document.querySelectorAll('#workflows .hub-card'));
      const status = document.getElementById('hub-search-status');
      search.addEventListener('input', function () {
        const query = search.value.trim().toLowerCase();
        let count = 0;
        cards.forEach(card => {
          const headingMatches = card.querySelector('h3').textContent.toLowerCase().includes(query);
          let matches = 0;
          card.querySelectorAll('[data-hub-item]').forEach(item => {
            item.hidden = Boolean(query) && !headingMatches && !item.dataset.search.includes(query);
            if (!item.hidden) matches++;
          });
          card.hidden = matches === 0;
          if (!card.hidden) count++;
          card.querySelectorAll('details').forEach(detail => { detail.open = Boolean(query); });
        });
        status.textContent = query ? (count ? `${count} matching groups.` : 'No matches. Try another term or open the detailed catalog.') : '';
      });
    }
    const copy = document.querySelector('[data-copy-install]');
    if (copy) copy.addEventListener('click', async function () {
      const text = document.getElementById('agent-install-prompt');
      const status = document.querySelector('[data-copy-status]');
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(text.textContent);
        status.textContent = 'Copied. Paste the instructions into your agent.';
      } catch {
        const range = document.createRange(); range.selectNodeContents(text);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        status.textContent = 'The prompt is selected. Copy it manually, or open the plain-text version.';
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

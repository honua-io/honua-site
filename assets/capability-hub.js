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
      const cards = Array.from(document.querySelectorAll('#components [data-hub-card], #workflows [data-hub-card], #standards [data-hub-card], #databases [data-hub-card], #formats [data-hub-card]'));
      const status = document.getElementById('hub-search-status');
      search.addEventListener('input', function () {
        const query = search.value.trim().toLowerCase();
        let count = 0;
        cards.forEach(card => {
          const headingMatches = card.querySelector('h3').textContent.toLowerCase().includes(query);
          const items = card.querySelectorAll('[data-hub-item]');
          let matches = items.length ? 0 : Number(card.textContent.toLowerCase().includes(query));
          items.forEach(item => {
            item.hidden = Boolean(query) && !headingMatches && !item.dataset.search.includes(query);
            if (!item.hidden) matches++;
          });
          card.hidden = matches === 0;
          if (!card.hidden) count++;
          card.querySelectorAll('details').forEach(detail => { detail.open = Boolean(query); });
        });
        for (const id of ['components','workflows','standards','databases','formats']) {
          const section = document.getElementById(id);
          section.hidden = Boolean(query) && !Array.from(section.querySelectorAll('[data-hub-card]')).some(card => !card.hidden);
        }
        status.textContent = query ? (count ? `${count} matching groups.` : 'No matches. Try another term or open the detailed catalog.') : '';
      });
    }
    document.querySelectorAll('[data-copy-install]').forEach(copy => copy.addEventListener('click', async function () {
      const id = copy.dataset.copyInstall || 'agent-install-prompt';
      const text = document.getElementById(id);
      const status = document.querySelector(`[data-copy-status="${id}"]`) || document.querySelector('[data-copy-status]');
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(text.textContent);
        status.textContent = 'Copied. Paste the instructions into your agent.';
      } catch {
        const range = document.createRange(); range.selectNodeContents(text);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        status.textContent = 'The prompt is selected. Copy it manually, or open the plain-text version.';
      }
    }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

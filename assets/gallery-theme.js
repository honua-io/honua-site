/* Match the product's saved theme, with the marketing site's dark default.
   Run before styles load so a saved choice is applied before first paint. */
(() => {
  const root = document.documentElement;
  let saved;
  try { saved = localStorage.getItem('honua-theme'); } catch { /* Storage is optional. */ }
  root.dataset.theme = saved === 'light' ? 'light' : 'dark';

  document.addEventListener('DOMContentLoaded', () => {
    const toggles = document.querySelectorAll('[data-theme-toggle]');
    function render() {
      const dark = root.dataset.theme === 'dark';
      for (const toggle of toggles) {
        toggle.hidden = false;
        toggle.setAttribute('aria-pressed', String(dark));
        toggle.textContent = dark ? 'Dark mode' : 'Light mode';
      }
      const chrome = document.querySelector('meta[name="theme-color"]');
      if (chrome) chrome.content = getComputedStyle(root).getPropertyValue('--c-bg').trim();
    }
    for (const toggle of toggles) {
      toggle.addEventListener('click', () => {
        root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem('honua-theme', root.dataset.theme); } catch { /* Storage is optional. */ }
        render();
      });
    }
    render();
  });
})();

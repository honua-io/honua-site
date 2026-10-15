(function () {
  'use strict';
  function init() {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.querySelector('.nav-groups');
    if (!toggle || !nav) return;
    document.documentElement.classList.add('h-nav-enhanced');
    // Core pages have these links in HTML. Normalize only older page navigation.
    if (!document.body.classList.contains('h-site')) {
      var links = [
        ['architecture.html', 'How it works'], ['editions.html', 'Editions'],
        ['blog.html', 'Blog'], ['docs.html', 'Docs'],
        ['https://github.com/honua-io', 'GitHub'], ['index.html#contact', 'Talk to us']
      ];
      var fragment = document.createDocumentFragment();
      var path = window.location.pathname.split('/').pop() || 'index.html';
      links.forEach(function (item, index) {
        var a = document.createElement('a'); a.href = item[0]; a.textContent = item[1];
        if (item[0] === path) a.setAttribute('aria-current', 'page');
        if (index === links.length - 1) {
          a.className = 'nav-cta'; a.dataset.analyticsEvent = 'cta_click';
          a.dataset.analyticsLabel = 'nav_contact'; a.dataset.analyticsDestination = 'index.html#contact';
        }
        fragment.appendChild(a);
      });
      nav.replaceChildren(fragment);
    }
    if (!nav.id) nav.id = 'primary-navigation';
    toggle.setAttribute('aria-controls', nav.id);
    toggle.setAttribute('type', 'button');
    function closeNav(returnFocus) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Close navigation');
      nav.classList.remove('nav-open');
      if (returnFocus) toggle.focus();
    }
    toggle.addEventListener('click', function () {
      if (toggle.getAttribute('aria-expanded') === 'true') { closeNav(false); return; }
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close navigation');
      nav.classList.add('nav-open');
      var first = nav.querySelector('a'); if (first) first.focus();
    });
    nav.addEventListener('click', function (event) { if (event.target.closest('a')) closeNav(false); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nav.classList.contains('nav-open')) closeNav(true);
    });
    document.addEventListener('click', function (event) {
      if (nav.classList.contains('nav-open') && !event.target.closest('.bed-nav')) closeNav(false);
    });
    window.addEventListener('resize', function () {
      var breakpoint = document.body.classList.contains('h-site') ? 900 : 1080;
      if (window.innerWidth > breakpoint) closeNav(false);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

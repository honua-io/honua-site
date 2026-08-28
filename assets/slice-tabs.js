/* Capability-slice page behaviour (honua-site#218): tab groups and code copy.
 *
 * Three rules from the design brief drive everything here.
 *
 *   1. Both tab groups are keyboard-operable — arrows move, Home/End jump, and
 *      only the selected tab is in the tab order (the WAI-ARIA tabs pattern).
 *   2. Both deep-link. `#use=python` selects the Python tab of the Use it group
 *      and scrolls to it; a bare `#python` (the heading anchor a concept link
 *      points at) selects it too, so a markdown edge and a page edge behave the
 *      same way.
 *   3. The language choice persists across slices for the session, because a
 *      Python developer should not re-pick Python on every page.
 *
 * Panel visibility is CSS (one shared grid cell, `visibility` toggled through
 * aria-hidden), so switching a tab cannot reflow the page and this file never
 * measures or sets a height.
 */
(function () {
  "use strict";

  var STORE_PREFIX = "honua.slice.tab.";
  /* Only the language axis is worth remembering across pages; which setup
   * surface someone read is page-specific. */
  var PERSISTED_GROUPS = { use: true };

  function readStored(group) {
    if (!PERSISTED_GROUPS[group]) return null;
    try {
      return window.localStorage.getItem(STORE_PREFIX + group);
    } catch (error) {
      return null;
    }
  }

  function writeStored(group, value) {
    if (!PERSISTED_GROUPS[group]) return;
    try {
      window.localStorage.setItem(STORE_PREFIX + group, value);
    } catch (error) {
      /* Private mode, or storage disabled. The tabs still work. */
    }
  }

  function tabsOf(root) {
    return Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
  }

  function panelsOf(root) {
    return Array.prototype.slice.call(root.querySelectorAll('[role="tabpanel"]'));
  }

  function select(root, value, options) {
    var opts = options || {};
    var tabs = tabsOf(root);
    var panels = panelsOf(root);
    var match = -1;
    for (var i = 0; i < tabs.length; i += 1) {
      if (tabs[i].getAttribute("data-tab-value") === value) match = i;
    }
    if (match === -1) return false;

    for (var j = 0; j < tabs.length; j += 1) {
      var on = j === match;
      tabs[j].setAttribute("aria-selected", on ? "true" : "false");
      tabs[j].setAttribute("tabindex", on ? "0" : "-1");
    }
    for (var k = 0; k < panels.length; k += 1) {
      var visible = panels[k].getAttribute("data-tab-value") === value;
      panels[k].setAttribute("aria-hidden", visible ? "false" : "true");
    }
    if (opts.focus) tabs[match].focus();
    if (opts.remember !== false) writeStored(root.getAttribute("data-tab-group"), value);
    return true;
  }

  /* `#use=python`, or a bare `#python` heading anchor. */
  function fromHash(root, hash) {
    var group = root.getAttribute("data-tab-group");
    var raw = String(hash || "").replace(/^#/, "");
    if (!raw) return null;
    var eq = raw.indexOf("=");
    if (eq !== -1) return raw.slice(0, eq) === group ? decodeURIComponent(raw.slice(eq + 1)) : null;
    var tabs = tabsOf(root);
    for (var i = 0; i < tabs.length; i += 1) {
      if (tabs[i].getAttribute("data-tab-value") === raw) return raw;
    }
    return null;
  }

  function wire(root) {
    var group = root.getAttribute("data-tab-group");
    var tabs = tabsOf(root);
    if (!tabs.length) return;

    tabs.forEach(function (tab, index) {
      tab.addEventListener("click", function () {
        select(root, tab.getAttribute("data-tab-value"));
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, "", "#" + group + "=" + tab.getAttribute("data-tab-value"));
        }
      });
      tab.addEventListener("keydown", function (event) {
        var next = null;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        if (next === null) return;
        event.preventDefault();
        select(root, tabs[next].getAttribute("data-tab-value"), { focus: true });
      });
    });

    var wanted = fromHash(root, window.location.hash) || readStored(group);
    if (wanted) select(root, wanted, { remember: false });
  }

  function wireCopy() {
    var buttons = document.querySelectorAll("[data-code-copy]");
    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener("click", function () {
        var card = button.closest(".code-card");
        var code = card && card.querySelector("code");
        if (!code || !navigator.clipboard) return;
        navigator.clipboard.writeText(code.textContent).then(
          function () {
            var original = button.textContent;
            button.textContent = "Copied";
            window.setTimeout(function () {
              button.textContent = original;
            }, 1600);
          },
          function () {
            /* Clipboard refused; the block is still selectable. */
          }
        );
      });
    });
  }

  function start() {
    var groups = Array.prototype.slice.call(document.querySelectorAll("[data-tab-group]"));
    groups.forEach(wire);
    window.addEventListener("hashchange", function () {
      groups.forEach(function (root) {
        var value = fromHash(root, window.location.hash);
        if (value) select(root, value);
      });
    });
    wireCopy();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

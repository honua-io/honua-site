(function () {
  "use strict";

  var filterIds = {
    task: "task-filter",
    capability: "capability-filter",
    protocol: "protocol-filter",
    renderer: "renderer-filter",
    dataMode: "data-mode-filter",
    authMode: "auth-mode-filter",
    supportTier: "support-tier-filter",
    lifecycleState: "lifecycle-state-filter",
    qualificationState: "qualification-state-filter"
  };

  var datasetNames = {
    task: "tasks",
    capability: "capabilities",
    protocol: "protocols",
    renderer: "renderers",
    dataMode: "dataMode",
    authMode: "authMode",
    supportTier: "supportTier",
    lifecycleState: "lifecycleState",
    qualificationState: "qualificationState"
  };

  function byId(id) {
    var element = document.getElementById(id);
    if (!element) throw new Error("Missing SDK gallery element #" + id);
    return element;
  }

  function normalize(value) {
    return String(value || "").normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
  }

  function selectedFilters() {
    var filters = { text: byId("task-search").value };
    Object.keys(filterIds).forEach(function (name) {
      filters[name] = byId(filterIds[name]).value;
    });
    return filters;
  }

  function exactMatch(card, name, expected) {
    if (!expected) return true;
    var actual = card.dataset[datasetNames[name]] || "";
    return actual.split("|").indexOf(expected) !== -1;
  }

  function updateLocation(filters) {
    if (!window.history || !window.history.replaceState) return;
    var url = new URL(window.location.href);
    url.search = "";
    if (filters.text) url.searchParams.set("q", filters.text);
    Object.keys(filterIds).forEach(function (name) {
      if (filters[name]) url.searchParams.set(name, filters[name]);
    });
    if (window.location.search.indexOf("__smoke=1") !== -1) url.searchParams.set("__smoke", "1");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  function applyFilters(options) {
    var filters = selectedFilters();
    var terms = normalize(filters.text).split(" ").filter(Boolean);
    var cards = Array.prototype.slice.call(document.querySelectorAll(".sdk-sample-card"));
    var visible = 0;
    cards.forEach(function (card) {
      var search = normalize(card.dataset.search);
      var matchesText = terms.every(function (term) { return search.indexOf(term) !== -1; });
      var matchesFacets = Object.keys(filterIds).every(function (name) {
        return exactMatch(card, name, filters[name]);
      });
      card.hidden = !(matchesText && matchesFacets);
      if (!card.hidden) visible += 1;
    });
    byId("sample-results-status").textContent = visible + " of " + cards.length + " samples shown";
    byId("sdk-zero-results").hidden = visible !== 0;
    if (!options || options.updateLocation !== false) updateLocation(filters);
    return visible;
  }

  function clearFilters() {
    byId("task-search").value = "";
    Object.keys(filterIds).forEach(function (name) {
      byId(filterIds[name]).value = "";
    });
    applyFilters();
    byId("task-search").focus();
  }

  function restoreFromLocation() {
    var params = new URLSearchParams(window.location.search);
    byId("task-search").value = params.get("q") || "";
    Object.keys(filterIds).forEach(function (name) {
      var control = byId(filterIds[name]);
      var value = params.get(name) || "";
      if (Array.prototype.some.call(control.options, function (option) { return option.value === value; })) {
        control.value = value;
      }
    });
  }

  function assertSmoke(condition, message) {
    if (!condition) throw new Error(message);
  }

  function resetForSmoke() {
    byId("task-search").value = "";
    Object.keys(filterIds).forEach(function (name) { byId(filterIds[name]).value = ""; });
    return applyFilters({ updateLocation: false });
  }

  function runBrowserSmoke() {
    var marker = byId("sdk-gallery-smoke");
    try {
      assertSmoke(resetForSmoke() === 32, "initial card count");

      byId("task-filter").value = "agent-approval";
      assertSmoke(applyFilters({ updateLocation: false }) === 2, "task fixture");

      resetForSmoke();
      byId("capability-filter").value = "agent-tools-facade";
      assertSmoke(applyFilters({ updateLocation: false }) === 1, "capability fixture");

      resetForSmoke();
      byId("protocol-filter").value = "geoparquet";
      assertSmoke(applyFilters({ updateLocation: false }) === 1, "protocol fixture");

      resetForSmoke();
      byId("task-filter").value = "agent-approval";
      byId("capability-filter").value = "compatibility-gate-facade";
      byId("protocol-filter").value = "geoservices-feature-service";
      assertSmoke(applyFilters({ updateLocation: false }) === 1, "combined fixture");

      resetForSmoke();
      byId("task-search").value = "__no_sdk_sample_matches__";
      assertSmoke(applyFilters({ updateLocation: false }) === 0, "zero-result fixture");
      assertSmoke(!byId("sdk-zero-results").hidden, "zero-result message");

      resetForSmoke();
      byId("task-search").value = "ai-spatial-app-builder";
      byId("sdk-gallery-filters").requestSubmit();
      assertSmoke(document.querySelectorAll(".sdk-sample-card:not([hidden])").length === 1, "search submit activation");

      byId("clear-filters").click();
      assertSmoke(document.activeElement === byId("task-search"), "clear-focus contract");
      assertSmoke(document.querySelectorAll(".sdk-sample-card:not([hidden])").length === 32, "clear result count");

      var status = byId("sample-results-status");
      assertSmoke(status.getAttribute("role") === "status", "results status role");
      assertSmoke(status.getAttribute("aria-live") === "polite", "results live region");
      assertSmoke(status.getAttribute("aria-atomic") === "true", "results atomic region");
      assertSmoke(byId("sdk-gallery-filters").getAttribute("role") === "search", "filter search role");

      var expectedOrder = [
        "task-search",
        "capability-filter",
        "protocol-filter",
        "task-filter",
        "renderer-filter",
        "data-mode-filter",
        "auth-mode-filter",
        "support-tier-filter",
        "lifecycle-state-filter",
        "qualification-state-filter",
        "clear-filters"
      ];
      var actualOrder = Array.prototype.map.call(
        byId("sdk-gallery-filters").querySelectorAll("input, select, button"),
        function (control) { return control.id; }
      );
      assertSmoke(JSON.stringify(actualOrder) === JSON.stringify(expectedOrder), "native control order");
      expectedOrder.forEach(function (id) {
        byId(id).focus();
        assertSmoke(document.activeElement === byId(id), "focusable control " + id);
      });
      byId("task-search").focus();

      var controls = Array.prototype.slice.call(document.querySelectorAll("input, select, button, .sdk-card-link"));
      assertSmoke(controls.every(function (control) { return control.getBoundingClientRect().height >= 43.5; }), "44px controls");
      assertSmoke(document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1, "horizontal overflow");

      if (window.innerWidth <= 420) {
        var columns = getComputedStyle(byId("sdk-gallery-filters").querySelector(".sdk-filter-primary")).gridTemplateColumns;
        assertSmoke(columns.split(" ").filter(Boolean).length === 1, "mobile single-column filters");
      }

      marker.dataset.state = "passed";
      marker.value = "Browser smoke passed";
      marker.textContent = "Browser smoke passed";
    } catch (error) {
      marker.dataset.state = "failed";
      marker.value = "Browser smoke failed: " + error.message;
      marker.textContent = marker.value;
      document.documentElement.dataset.sdkGallerySmokeError = error.message;
    }
  }

  restoreFromLocation();
  [byId("task-search")].concat(Object.keys(filterIds).map(function (name) { return byId(filterIds[name]); }))
    .forEach(function (control) {
      control.addEventListener(control.tagName === "INPUT" ? "input" : "change", function () { applyFilters(); });
    });
  byId("sdk-gallery-filters").addEventListener("submit", function (event) {
    event.preventDefault();
    applyFilters();
  });
  byId("clear-filters").addEventListener("click", clearFilters);
  applyFilters({ updateLocation: false });

  if (new URLSearchParams(window.location.search).get("__smoke") === "1") {
    window.setTimeout(runBrowserSmoke, 0);
  }
})();

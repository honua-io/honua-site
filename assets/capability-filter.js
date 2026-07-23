(function () {
  // Progressive-enhancement checklist + ?caps= filtered view for capabilities.html.
  // Dependency-free, self-hosted (CSP script-src 'self'). The catalog table and
  // the intake form both work with this script absent: rows are visible and the
  // checkboxes still submit natively through form="cap-intake-form".
  //
  // Capacity bands and edition prices are read from published pricing.html
  // figures (Starter/Team/Scale annual prices per edition). Update this table
  // if pricing.html changes.
  var PRICE = {
    pro: { starter: 6000, team: 15000, scale: 30000 },
    enterprise: { starter: 15000, team: 24000, scale: 39000 }
  };
  var EDITION_RANK = { community: 0, pro: 1, enterprise: 2 };
  var EDITION_LABEL = { community: "Community", pro: "Pro", enterprise: "Enterprise" };
  var BAND_LABEL = { starter: "Starter (≤3 units)", team: "Team (≤10 units)", scale: "Scale (≤25 units)", beyond: "Beyond 25 units — private offer" };

  function safe(fn) {
    try {
      return fn();
    } catch {
      return undefined;
    }
  }

  function rows() {
    return Array.prototype.slice.call(document.querySelectorAll("tr[data-cap-key]"));
  }

  function checkboxes() {
    return Array.prototype.slice.call(document.querySelectorAll(".cap-check"));
  }

  function rowByKey(key) {
    return document.querySelector('tr[data-cap-key="' + cssEscape(key) + '"]');
  }

  function cssEscape(value) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function selectedKeys() {
    return checkboxes()
      .filter(function (box) {
        return box.checked;
      })
      .map(function (box) {
        return box.value;
      });
  }

  function computeBand(units) {
    if (!units || units <= 0) return null;
    if (units <= 3) return "starter";
    if (units <= 10) return "team";
    if (units <= 25) return "scale";
    return "beyond";
  }

  function computeEdition(keys) {
    var highest = "community";
    keys.forEach(function (key) {
      var row = rowByKey(key);
      if (!row) return;
      var edition = row.getAttribute("data-cap-edition") || "community";
      if ((EDITION_RANK[edition] || 0) > (EDITION_RANK[highest] || 0)) highest = edition;
    });
    return highest;
  }

  function formatPrice(edition, band) {
    if (edition === "community") return "No charge (self-host, ELv2)";
    if (!band) return "Enter serving units for a price";
    if (band === "beyond") return "Private offer — contact us";
    var table = PRICE[edition];
    if (!table) return "Contact us";
    return "$" + table[band].toLocaleString("en-US") + " / yr";
  }

  function currentUrl(keys, units) {
    var url = new URL(window.location.href);
    url.search = "";
    if (keys.length) url.searchParams.set("caps", keys.join(","));
    if (units) url.searchParams.set("units", String(units));
    return url.toString();
  }

  function updateEstimate() {
    var keys = selectedKeys();
    var unitsInput = document.getElementById("cap-units-input");
    var units = unitsInput ? parseInt(unitsInput.value, 10) : NaN;
    if (isNaN(units)) units = 0;

    var summaryField = document.getElementById("cap-keys-summary");
    if (summaryField) summaryField.value = keys.join(",");
    var unitsField = document.getElementById("cap-units-hidden");
    if (unitsField) unitsField.value = units ? String(units) : "";

    var empty = document.getElementById("cap-estimate-empty");
    var result = document.getElementById("cap-estimate-result");
    var shareRow = document.getElementById("cap-share-row");

    if (!keys.length && !units) {
      if (empty) empty.hidden = false;
      if (result) result.hidden = true;
      if (shareRow) shareRow.hidden = true;
      return;
    }

    var edition = computeEdition(keys);
    var band = computeBand(units);

    if (empty) empty.hidden = true;
    if (result) result.hidden = false;
    if (shareRow) shareRow.hidden = false;

    var countEl = document.getElementById("est-count");
    var editionEl = document.getElementById("est-edition");
    var bandEl = document.getElementById("est-band");
    var priceEl = document.getElementById("est-price");
    if (countEl) countEl.textContent = String(keys.length);
    if (editionEl) editionEl.textContent = EDITION_LABEL[edition] || edition;
    if (bandEl) bandEl.textContent = band ? BAND_LABEL[band] : "Enter serving units";
    if (priceEl) priceEl.textContent = formatPrice(edition, band);

    var shareInput = document.getElementById("cap-share-url");
    if (shareInput) shareInput.value = currentUrl(keys, units);
  }

  function categories() {
    return Array.prototype.slice.call(document.querySelectorAll("details.cap-category"));
  }

  function applyFilter(keys) {
    var total = rows().length;
    var banner = document.getElementById("cap-filter-banner");
    var countEl = document.getElementById("cap-filter-count");
    var totalEl = document.getElementById("cap-filter-total");

    if (!keys) {
      rows().forEach(function (row) {
        row.hidden = false;
      });
      categories().forEach(function (category) {
        category.hidden = false;
      });
      if (banner) banner.hidden = true;
      return;
    }

    var keySet = {};
    keys.forEach(function (key) {
      keySet[key] = true;
    });

    var matched = 0;
    categories().forEach(function (category) {
      var visibleInCategory = 0;
      Array.prototype.slice.call(category.querySelectorAll("tr[data-cap-key]")).forEach(function (row) {
        var key = row.getAttribute("data-cap-key");
        var show = !!keySet[key];
        row.hidden = !show;
        if (show) {
          visibleInCategory += 1;
          matched += 1;
        }
      });
      category.hidden = visibleInCategory === 0;
      // A shared link should show its selection without extra clicks.
      if (visibleInCategory > 0) category.open = true;
    });

    if (banner) {
      banner.hidden = false;
      if (countEl) countEl.textContent = String(matched);
      if (totalEl) totalEl.textContent = String(total);
    }
  }

  function setAllCategories(open) {
    categories().forEach(function (category) {
      category.open = open;
    });
  }

  function bindCategoryControls() {
    var controls = document.getElementById("cap-cat-controls");
    if (controls) controls.hidden = false;
    var expand = document.getElementById("cap-expand-all");
    var collapse = document.getElementById("cap-collapse-all");
    if (expand) {
      expand.addEventListener("click", function () {
        setAllCategories(true);
      });
    }
    if (collapse) {
      collapse.addEventListener("click", function () {
        setAllCategories(false);
      });
    }
  }

  function revealHashTarget() {
    var hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    var target = safe(function () {
      return document.getElementById(decodeURIComponent(hash.slice(1)));
    });
    if (!target) return;
    var container = target.closest ? target.closest("details.cap-category") : null;
    if (container && !container.open) {
      container.open = true;
      safe(function () {
        target.scrollIntoView();
      });
    } else if (target.tagName === "DETAILS" && !target.open) {
      target.open = true;
    }
  }

  function readParams() {
    var params = new URLSearchParams(window.location.search);
    var capsParam = params.get("caps");
    var unitsParam = params.get("units");
    return {
      caps: capsParam ? capsParam.split(",").map(function (v) { return v.trim(); }).filter(Boolean) : null,
      units: unitsParam ? parseInt(unitsParam, 10) : null
    };
  }

  function bindCopyButton() {
    var button = document.getElementById("cap-share-copy");
    var status = document.getElementById("cap-share-status");
    if (!button) return;
    button.addEventListener("click", function () {
      var input = document.getElementById("cap-share-url");
      if (!input || !input.value) return;
      var done = function (ok) {
        if (status) status.textContent = ok ? "Copied!" : "Select and copy the link above.";
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(input.value)
          .then(function () {
            done(true);
          })
          .catch(function () {
            input.select();
            done(false);
          });
      } else {
        input.select();
        safe(function () {
          document.execCommand("copy");
        });
        done(true);
      }
    });
  }

  function init() {
    var params = safe(readParams) || { caps: null, units: null };

    if (params.units) {
      var unitsInput = document.getElementById("cap-units-input");
      if (unitsInput) unitsInput.value = String(params.units);
    }

    if (params.caps && params.caps.length) {
      checkboxes().forEach(function (box) {
        if (params.caps.indexOf(box.value) !== -1) box.checked = true;
      });
      safe(function () {
        applyFilter(params.caps);
      });
    }

    checkboxes().forEach(function (box) {
      box.addEventListener("change", function () {
        safe(updateEstimate);
      });
    });

    var unitsInputEl = document.getElementById("cap-units-input");
    if (unitsInputEl) {
      unitsInputEl.addEventListener("input", function () {
        safe(updateEstimate);
      });
    }

    bindCopyButton();
    bindCategoryControls();
    safe(revealHashTarget);
    window.addEventListener("hashchange", function () {
      safe(revealHashTarget);
    });
    safe(updateEstimate);
  }

  document.addEventListener("DOMContentLoaded", init);
})();

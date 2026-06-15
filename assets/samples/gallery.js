/*
 * Honua SDK samples gallery (epic honua-sdk-js#288).
 * Renders assets/samples/manifest.json into a Honua-native grouped index with
 * a sticky group rail and client-side text/tag filtering. Vanilla JS, no deps.
 */
(function () {
  "use strict";

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function byId(id) { return document.getElementById(id); }

  function cardFor(s) {
    var live = s.state === "live" && s.href;
    var node = live ? el("a", "sg-card") : el("div", "sg-card");
    if (live) { node.href = s.href; }
    if (s.state !== "live") node.classList.add("is-planned");
    if (s.featured) node.classList.add("is-featured");
    node.dataset.search = (
      s.title + " " + (s.blurb || "") + " " + (s.tags || []).join(" ") + " " + (s.capabilities || []).join(" ")
    ).toLowerCase();

    node.appendChild(el("h4", null, s.title));
    node.appendChild(el("p", null, s.blurb || ""));

    var meta = el("div", "meta");
    if (s.featured) meta.appendChild(el("span", "sg-pill flag", "flagship"));
    meta.appendChild(el("span", "sg-pill " + (live ? "live" : "planned"), live ? "live" : "planned"));
    var tag = (s.tags || [])[0];
    if (tag) meta.appendChild(el("span", "sg-tag", "#" + tag));
    node.appendChild(meta);
    return node;
  }

  function render(manifest) {
    var groupsRoot = byId("sg-groups");
    var navRoot = byId("sg-nav");
    groupsRoot.innerHTML = "";
    navRoot.innerHTML = "";

    var samplesByGroup = {};
    (manifest.samples || []).forEach(function (s) {
      (samplesByGroup[s.group] = samplesByGroup[s.group] || []).push(s);
    });

    var liveCount = 0, plannedCount = 0;
    (manifest.samples || []).forEach(function (s) { s.state === "live" ? liveCount++ : plannedCount++; });
    byId("sg-live-count").textContent = String(liveCount);
    byId("sg-planned-count").textContent = String(plannedCount);
    byId("sg-group-count").textContent = String((manifest.groups || []).length);

    (manifest.groups || []).forEach(function (g) {
      var items = samplesByGroup[g.id] || [];
      // featured first, then live, then planned
      items.sort(function (a, b) {
        var ra = (a.featured ? 0 : 1) * 10 + (a.state === "live" ? 0 : 1);
        var rb = (b.featured ? 0 : 1) * 10 + (b.state === "live" ? 0 : 1);
        return ra - rb;
      });

      var nav = el("a");
      nav.href = "#g-" + g.id;
      nav.appendChild(el("span", null, g.title));
      nav.appendChild(el("span", "n", String(items.length)));
      navRoot.appendChild(nav);

      var section = el("section", "sg-group");
      section.id = "g-" + g.id;
      section.appendChild(el("h3", null, g.title));
      if (g.blurb) section.appendChild(el("p", "blurb", g.blurb));
      var cards = el("div", "sg-cards");
      items.forEach(function (s) { cards.appendChild(cardFor(s)); });
      section.appendChild(cards);
      groupsRoot.appendChild(section);
    });

    wireFilter();
  }

  function wireFilter() {
    var input = byId("sg-filter");
    if (!input) return;
    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      document.querySelectorAll(".sg-group").forEach(function (section) {
        var any = false;
        section.querySelectorAll(".sg-card").forEach(function (card) {
          var hit = !q || (card.dataset.search || "").indexOf(q) !== -1;
          card.style.display = hit ? "" : "none";
          if (hit) any = true;
        });
        section.style.display = any ? "" : "none";
      });
    });
  }

  fetch("assets/samples/manifest.json", { headers: { Accept: "application/json" } })
    .then(function (r) { if (!r.ok) throw new Error("manifest " + r.status); return r.json(); })
    .then(render)
    .catch(function (e) {
      var root = byId("sg-groups");
      if (root) root.innerHTML = '<p class="sg-empty">Could not load samples (' + String(e.message || e) + ").</p>";
    });
})();

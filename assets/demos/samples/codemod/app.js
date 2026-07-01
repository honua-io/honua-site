/*
 * Sample: honua-migrate codemod (before/after) — "Migrate from Esri".
 * The differentiator: existing ArcGIS Maps SDK for JavaScript widget code
 * (FeatureLayer / Search / map.add) runs against Honua Server with minimal or
 * zero changes via the esri-compat shims, and the honua-migrate codemod can
 * rewrite it to native @honua/sdk-js. The before/after code panes are static
 * illustration in the page; THIS script is the live proof — it loads the same
 * maui-zoning FeatureLayer the "after" snippet references, using the OGC API
 * Features items endpoint (native GeoJSON), and renders it in <honua-map>.
 *
 * Load path mirrors the migrated FeatureLayer: instead of the ArcGIS
 * FeatureServer /query (405 on this server for f=geojson), it fetches the OGC
 * items collection — exactly what the esri-compat shim resolves to.
 *
 * Bundle: assets/vendor/honua-webcomponents.min.js (window.HonuaWC)
 */
(function () {
  "use strict";

  var BASE = "https://demo.honua.io";
  var COLLECTION = "maui-zoning";
  var MAUI_VIEW = { center: [-156.62, 20.86], zoom: 10.4 };
  var SRC = "zoning";
  var FIELDS = ["zone", "island", "area"];

  function el(id) { return document.getElementById(id); }
  function setStatus(state, text) {
    var n = el("s-status");
    if (n) { n.dataset.state = state; n.textContent = text; }
  }

  // Migrated FeatureLayer load: OGC API Features items -> GeoJSON.
  function loadZoningItems(limit) {
    var url = BASE + "/ogc/features/collections/" + COLLECTION +
      "/items?f=json&limit=" + (limit || 500);
    return fetch(url, { headers: { Accept: "application/geo+json, application/json" } })
      .then(function (r) { if (!r.ok) throw new Error(COLLECTION + " items " + r.status); return r.json(); });
  }

  function fetchBasemap() {
    return fetch("assets/demo/layers.json", { headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("layers.json " + r.status); return r.json(); })
      .then(function (cfg) {
        var bm = cfg && cfg.basemap;
        try {
          if (window.pmtiles && window.maplibregl) {
            var proto = new window.pmtiles.Protocol();
            window.maplibregl.addProtocol("pmtiles", proto.tile);
          }
        } catch (_) { return null; }
        if (!bm || !bm.proxyUrl || !bm.style || !bm.style.layers) return null;
        return { proxyUrl: bm.proxyUrl, attribution: bm.attribution, layers: bm.style.layers, glyphs: cfg.server && cfg.server.glyphs };
      })
      .catch(function () { return null; });
  }

  function firstProp(props, names) {
    for (var i = 0; i < names.length; i++) if (props[names[i]] != null) return props[names[i]];
    return null;
  }

  // Build the controller mapSpec: background/basemap + zoning fill+line.
  // `fc` may be null (live load failed) — we still render the basemap so the
  // page never appears broken.
  function buildController(fc, basemap) {
    var WC = window.HonuaWC;
    var collection = fc && fc.features ? fc : { type: "FeatureCollection", features: [] };

    var records = [];
    collection.features.forEach(function (f, i) {
      var props = f.properties || {};
      var zone = firstProp(props, ["zone", "zone_code", "zone_dist", "ZONE"]) || "Unclassified";
      var id = props.id != null ? props.id : props.OBJECTID != null ? props.OBJECTID : 5000 + i;
      records.push({
        id: id, sourceId: SRC, title: String(zone),
        attributes: { zone: zone, island: firstProp(props, ["island", "ISLAND"]), area: firstProp(props, ["gisacres", "cp_area", "area"]) },
        geometry: null,
      });
    });

    var sources = { "zoning": { type: "geojson", data: collection } };
    var baseLayers = [{ id: "backdrop", type: "background", metadata: { title: "Night", basemap: true }, paint: { "background-color": "#0a1520" } }];
    if (basemap) {
      sources.basemap = { type: "vector", url: "pmtiles://" + basemap.proxyUrl, attribution: basemap.attribution };
      baseLayers = baseLayers.concat(basemap.layers);
    }
    var dataLayers = [
      { id: "zoning-fill", source: "zoning", type: "fill", metadata: { title: "Maui zoning (migrated FeatureLayer)" }, paint: { "fill-color": "#34d399", "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.5, 0.26] } },
      { id: "zoning-line", source: "zoning", type: "line", metadata: { title: "Zoning outline" }, paint: { "line-color": "#6ee7b7", "line-width": 0.8, "line-opacity": 0.7 } },
    ];
    var spec = { version: 8, sources: sources, layers: baseLayers.concat(dataLayers) };
    if (basemap && basemap.glyphs) spec.glyphs = basemap.glyphs;

    var controller = WC.createHonuaWebComponentController({
      mapPackage: {
        mapPackageId: "codemod",
        format: "honua_map_package.v1",
        status: "Ready",
        initialView: MAUI_VIEW,
        legend: [{ label: "Migrated zoning", color: "#34d399" }],
        sourceBindings: [],
        mapSpec: spec,
      },
      featuresBySource: { "zoning": records },
      fieldsBySource: { "zoning": FIELDS },
      searchFields: ["zone", "island"],
    });
    return { controller: controller, count: records.length };
  }

  function render(fc, basemap) {
    var mapEl = el("s-map");
    if (!mapEl) throw new Error("missing honua-map");
    var built = buildController(fc, basemap);
    mapEl.controller = built.controller;
    return built.count;
  }

  function boot() {
    if (!window.HonuaWC || !window.maplibregl) { setStatus("error", "sample assets failed to load"); return; }
    window.HonuaWC.defineHonuaWebComponents();

    setStatus("boot", "loading migrated FeatureLayer from demo.honua.io…");
    fetchBasemap().then(function (basemap) {
      loadZoningItems()
        .then(function (fc) {
          var n = render(fc, basemap);
          if (n > 0) setStatus("ok", "demo.honua.io · migrated FeatureLayer live — " + n + " features");
          else setStatus("ok", "demo.honua.io · migrated FeatureLayer live (no features returned)");
        })
        .catch(function (e) {
          // Graceful degrade: still show basemap + code panes, clear status.
          try { render(null, basemap); } catch (_) {}
          setStatus("error", "live layer unavailable: " + String(e && e.message ? e.message : e) + " · code panes shown");
        });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

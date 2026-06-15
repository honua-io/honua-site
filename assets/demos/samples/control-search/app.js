/*
 * Sample: Search / typeahead, standalone (control-search).
 * One concept — a single <honua-search> over feature attributes. Live Maui
 * place names (GNIS) from demo.honua.io feed the controller's
 * featuresBySource + searchFields; selecting a result flies the map to it.
 *
 * Bundle: assets/vendor/honua-webcomponents.min.js (window.HonuaWC)
 */
(function () {
  "use strict";

  var BASE = "https://demo.honua.io";
  var PLACE_SVC = "maui-place-names";
  var MAUI_VIEW = { center: [-156.47, 20.83], zoom: 9.4 };

  function el(id) { return document.getElementById(id); }
  function setStatus(state, text) {
    var n = el("s-status");
    if (n) { n.dataset.state = state; n.textContent = text; }
  }

  function resolveLayerIndex(svc) {
    return fetch(BASE + "/rest/services/" + svc + "/FeatureServer?f=json", { headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error(svc + " meta " + r.status); return r.json(); })
      .then(function (m) {
        if (!m || m.error || !m.layers || !m.layers.length) throw new Error(svc + ": no layers");
        return m.layers[0].id;
      });
  }

  function queryGeoJson(svc, idx, count) {
    var p = [
      "where=" + encodeURIComponent("1=1"),
      "outFields=" + encodeURIComponent("name,feature_class"),
      "returnGeometry=true", "outSR=4326",
      "resultRecordCount=" + (count || 120), "f=geojson",
    ].join("&");
    return fetch(BASE + "/rest/services/" + svc + "/FeatureServer/" + idx + "/query?" + p, {
      headers: { Accept: "application/json" },
    }).then(function (r) { if (!r.ok) throw new Error(svc + " query " + r.status); return r.json(); });
  }

  function pointFrom(geom) {
    if (!geom) return null;
    if (geom.type === "Point") return geom.coordinates;
    if (geom.type === "MultiPoint" && geom.coordinates.length) return geom.coordinates[0];
    if (geom.type === "GeometryCollection" && geom.geometries && geom.geometries.length) return pointFrom(geom.geometries[0]);
    return null;
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

  function buildController(placeFc, basemap) {
    var WC = window.HonuaWC;
    var SRC = "place-names";
    var records = [];
    var features = [];
    (placeFc.features || []).forEach(function (f, i) {
      var c = pointFrom(f.geometry);
      if (!c) return;
      var props = f.properties || {};
      var id = props.id != null ? props.id : 1000 + i;
      records.push({ id: id, sourceId: SRC, title: props.name || "(unnamed)", attributes: { name: props.name, feature_class: props.feature_class }, geometry: { x: c[0], y: c[1] } });
      features.push({ type: "Feature", id: id, properties: { name: props.name, feature_class: props.feature_class }, geometry: { type: "Point", coordinates: c } });
    });

    var sources = { "place-names": { type: "geojson", data: { type: "FeatureCollection", features: features } } };
    var baseLayers = [{ id: "backdrop", type: "background", metadata: { title: "Night", basemap: true }, paint: { "background-color": "#08131a" } }];
    if (basemap) {
      sources.basemap = { type: "vector", url: "pmtiles://" + basemap.proxyUrl, attribution: basemap.attribution };
      baseLayers = baseLayers.concat(basemap.layers);
    }
    var dataLayers = [
      { id: "place-halos", source: "place-names", type: "circle", metadata: { title: "Place halos" }, paint: { "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 16, 9], "circle-color": "#38bdf8", "circle-opacity": 0.14 } },
      { id: "place-points", source: "place-names", type: "circle", metadata: { title: "Maui place names (live GNIS)" }, paint: { "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 8, 5], "circle-color": ["case", ["boolean", ["feature-state", "selected"], false], "#f97316", "#38bdf8"], "circle-stroke-color": "#0b1622", "circle-stroke-width": 1.4 } },
    ];
    var spec = { version: 8, sources: sources, layers: baseLayers.concat(dataLayers) };
    if (basemap && basemap.glyphs) spec.glyphs = basemap.glyphs;

    var controller = WC.createHonuaWebComponentController({
      mapPackage: {
        mapPackageId: "control-search",
        format: "honua_map_package.v1",
        status: "Ready",
        initialView: MAUI_VIEW,
        legend: [{ label: "Maui place name", color: "#38bdf8" }],
        sourceBindings: [],
        mapSpec: spec,
      },
      featuresBySource: { "place-names": records },
      fieldsBySource: { "place-names": ["name", "feature_class"] },
      searchFields: ["name", "feature_class"],
    });
    return { controller: controller, count: records.length };
  }

  function boot() {
    if (!window.HonuaWC || !window.maplibregl) { setStatus("error", "sample assets failed to load"); return; }
    window.HonuaWC.defineHonuaWebComponents();

    // Make selection visible: fly to the chosen feature (the controller sets
    // feature-state but does not move the camera).
    document.addEventListener("honua-selection-change", function () {
      var mapEl = el("s-map");
      if (!mapEl || !mapEl.map || !mapEl.controller) return;
      var sel = mapEl.controller.getState().selection;
      var g = sel && sel.feature && sel.feature.geometry;
      if (!g || typeof g.x !== "number") return;
      mapEl.map.flyTo({ center: [g.x, g.y], zoom: Math.max(mapEl.map.getZoom(), 12.5), duration: 900 });
    });

    setStatus("boot", "loading live Maui place names…");
    resolveLayerIndex(PLACE_SVC)
      .then(function (idx) { return Promise.all([queryGeoJson(PLACE_SVC, idx), fetchBasemap()]); })
      .then(function (out) {
        var built = buildController(out[0], out[1]);
        var mapEl = el("s-map");
        if (!mapEl) throw new Error("missing honua-map");
        mapEl.controller = built.controller;
        setStatus("ok", "demo.honua.io · search over " + built.count + " place names");
      })
      .catch(function (e) {
        setStatus("error", "live data unavailable: " + String(e && e.message ? e.message : e));
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

/*
 * Sample: Legend, standalone (control-legend).
 * One concept — a single <honua-legend> bound to a map's visible layers via a
 * shared HonuaWebComponentController. Live Maui zoning + flood from
 * demo.honua.io; the legend tracks the layers declared in the map package.
 *
 * Bundle: assets/vendor/honua-webcomponents.min.js (window.HonuaWC)
 */
(function () {
  "use strict";

  var BASE = "https://demo.honua.io";
  var MAUI_VIEW = { center: [-156.62, 20.86], zoom: 10.4 };
  var LAYERS = {
    "maui-zoning": { src: "zoning", kind: "fill", color: "#7c3aed", line: "#a78bfa", title: "Zoning" },
    "maui-flood-hazard": { src: "flood", kind: "fill", color: "#0ea5e9", line: "#38bdf8", title: "Flood hazard" },
    "maui-parcels": { src: "parcels", kind: "line", color: "#5eead4", title: "Parcels" },
  };

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
      "outFields=*", "returnGeometry=true", "outSR=4326",
      "resultRecordCount=" + (count || 300), "f=geojson",
    ].join("&");
    return fetch(BASE + "/rest/services/" + svc + "/FeatureServer/" + idx + "/query?" + p, {
      headers: { Accept: "application/json" },
    }).then(function (r) { if (!r.ok) throw new Error(svc + " query " + r.status); return r.json(); });
  }

  function loadSvc(svc) {
    return resolveLayerIndex(svc)
      .then(function (idx) { return queryGeoJson(svc, idx); })
      .catch(function () { return null; });
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

  function buildController(data, basemap) {
    var WC = window.HonuaWC;
    var sources = {};
    var dataLayers = [];

    var baseLayers = [
      { id: "backdrop", type: "background", metadata: { title: "Night", basemap: true }, paint: { "background-color": "#0a1520" } },
    ];
    if (basemap) {
      sources.basemap = { type: "vector", url: "pmtiles://" + basemap.proxyUrl, attribution: basemap.attribution };
      baseLayers = baseLayers.concat(basemap.layers);
    }

    var legend = [];
    Object.keys(LAYERS).forEach(function (svc) {
      var cfg = LAYERS[svc];
      var fc = data[svc];
      if (!fc || !fc.features) return;
      sources[cfg.src] = { type: "geojson", data: fc };
      if (cfg.kind === "fill") {
        dataLayers.push({ id: cfg.src + "-fill", source: cfg.src, type: "fill", metadata: { title: cfg.title }, paint: { "fill-color": cfg.color, "fill-opacity": 0.28 } });
        dataLayers.push({ id: cfg.src + "-line", source: cfg.src, type: "line", metadata: { title: cfg.title + " outline" }, paint: { "line-color": cfg.line || cfg.color, "line-width": 0.8 } });
      } else {
        dataLayers.push({ id: cfg.src + "-line", source: cfg.src, type: "line", metadata: { title: cfg.title }, paint: { "line-color": cfg.color, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.4, 16, 1.4], "line-opacity": 0.6 } });
      }
      legend.push({ label: cfg.title, color: cfg.color });
    });

    var spec = { version: 8, sources: sources, layers: baseLayers.concat(dataLayers) };
    if (basemap && basemap.glyphs) spec.glyphs = basemap.glyphs;

    return WC.createHonuaWebComponentController({
      mapPackage: {
        mapPackageId: "control-legend",
        format: "honua_map_package.v1",
        status: "Ready",
        initialView: MAUI_VIEW,
        legend: legend,
        sourceBindings: [],
        mapSpec: spec,
      },
    });
  }

  function boot() {
    if (!window.HonuaWC || !window.maplibregl) { setStatus("error", "sample assets failed to load"); return; }
    window.HonuaWC.defineHonuaWebComponents();
    setStatus("boot", "loading live Maui layers…");
    Promise.all([
      Promise.all(Object.keys(LAYERS).map(loadSvc)),
      fetchBasemap(),
    ]).then(function (out) {
      var fcs = out[0], basemap = out[1];
      var data = {};
      Object.keys(LAYERS).forEach(function (svc, i) { data[svc] = fcs[i]; });
      var live = Object.keys(LAYERS).filter(function (svc) { return data[svc] && data[svc].features; });
      if (!live.length) { setStatus("error", "demo server unreachable — layers unavailable"); return; }

      var controller = buildController(data, basemap);
      var mapEl = el("s-map");
      if (!mapEl) throw new Error("missing honua-map");
      mapEl.controller = controller;
      setStatus("ok", "demo.honua.io · legend bound to " + live.length + " layers");
    }).catch(function (e) {
      setStatus("error", "failed to start: " + String(e && e.message ? e.message : e));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

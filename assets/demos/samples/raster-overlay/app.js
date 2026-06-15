/*
 * Sample: Raster overlay (raster-overlay).
 * One concept — a raster lane (NAIP aerial imagery, served as PMTiles from
 * demo.honua.io) overlaid on the dark vector base, with a <honua-layer-list>
 * to toggle the overlay and a <honua-legend> describing the lanes. The same
 * MapPackage layer model that drives WMS/WMTS/ImageServer tiles in the SDK.
 *
 * Bundle: assets/vendor/honua-webcomponents.min.js (window.HonuaWC)
 */
(function () {
  "use strict";

  var MAUI_VIEW = { center: [-156.47, 20.83], zoom: 9.6 };

  function el(id) { return document.getElementById(id); }
  function setStatus(state, text) {
    var n = el("s-status");
    if (n) { n.dataset.state = state; n.textContent = text; }
  }

  function fetchConfig() {
    return fetch("assets/demo/layers.json", { headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("layers.json " + r.status); return r.json(); })
      .then(function (cfg) {
        try {
          if (window.pmtiles && window.maplibregl) {
            var proto = new window.pmtiles.Protocol();
            window.maplibregl.addProtocol("pmtiles", proto.tile);
          }
        } catch (_) { /* basemap/raster fall back gracefully */ }
        return cfg;
      });
  }

  function findBase(cfg, id) {
    return (cfg.bases || []).filter(function (b) { return b.id === id; })[0] || null;
  }

  function buildController(cfg) {
    var WC = window.HonuaWC;
    var bm = cfg && cfg.basemap;
    var imagery = findBase(cfg, "imagery");
    if (!imagery || !imagery.pmtiles || !imagery.pmtiles.proxyUrl) {
      throw new Error("imagery raster lane not available in demo contract");
    }

    var sources = {
      "imagery-base": { type: "raster", url: "pmtiles://" + imagery.pmtiles.proxyUrl, tileSize: 512, attribution: imagery.attribution || "" },
    };
    var baseLayers = [{ id: "backdrop", type: "background", metadata: { title: "Night", basemap: true }, paint: { "background-color": "#08131a" } }];
    if (bm && bm.proxyUrl && bm.style && bm.style.layers) {
      sources.basemap = { type: "vector", url: "pmtiles://" + bm.proxyUrl, attribution: bm.attribution };
      baseLayers = baseLayers.concat(bm.style.layers);
    }
    var overlayLayer = {
      id: "naip-overlay", source: "imagery-base", type: "raster",
      metadata: { title: "NAIP aerial imagery" },
      paint: imagery.paint || { "raster-opacity": 0.85 },
    };

    var spec = { version: 8, sources: sources, layers: baseLayers.concat([overlayLayer]) };
    if (cfg.server && cfg.server.glyphs) spec.glyphs = cfg.server.glyphs;

    return WC.createHonuaWebComponentController({
      mapPackage: {
        mapPackageId: "raster-overlay",
        format: "honua_map_package.v1",
        status: "Ready",
        initialView: MAUI_VIEW,
        legend: [
          { label: "NAIP aerial imagery", color: "#7dd3fc" },
          { label: "Vector base", color: "#16222e" },
        ],
        sourceBindings: [],
        mapSpec: spec,
      },
    });
  }

  function boot() {
    if (!window.HonuaWC || !window.maplibregl) { setStatus("error", "sample assets failed to load"); return; }
    window.HonuaWC.defineHonuaWebComponents();
    setStatus("boot", "loading raster lane from demo.honua.io…");
    fetchConfig()
      .then(function (cfg) {
        var controller = buildController(cfg);
        var mapEl = el("s-map");
        if (!mapEl) throw new Error("missing honua-map");
        mapEl.controller = controller;
        setStatus("ok", "demo.honua.io · NAIP raster overlay + vector base");
      })
      .catch(function (e) {
        setStatus("error", "raster overlay unavailable: " + String(e && e.message ? e.message : e));
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

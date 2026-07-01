/*
 * Sample: Load a MapPackage / webmap (hello-webmap).
 * The simplest get-started sample — show how few lines it takes to stand up a
 * Honua map. Load the shared Maui basemap (PMTiles vector basemap via the proxy)
 * from assets/demo/layers.json and render it in a single <honua-map> through a
 * MapPackage-shaped controller. No feature queries — just the "hello world".
 *
 * Bundle: assets/vendor/honua-webcomponents.min.js (window.HonuaWC)
 */
(function () {
  "use strict";

  var MAUI_VIEW = { center: [-156.47, 20.83], zoom: 9.4 };

  function el(id) { return document.getElementById(id); }
  function setStatus(state, text) {
    var n = el("s-status");
    if (n) { n.dataset.state = state; n.textContent = text; }
  }

  // Load the shared basemap contract + register the pmtiles protocol so the
  // vector basemap tiles can be range-read through the proxy. Returns null when
  // the basemap is unavailable so the caller can still boot the backdrop.
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

  // Minimal mapSpec: a dark background, plus the basemap source + layers when
  // present. That is the whole "webmap" — a background is always drawn so the
  // map is never blank even if the basemap fetch fails.
  function buildSpec(basemap) {
    var sources = {};
    var layers = [{ id: "backdrop", type: "background", metadata: { title: "Night", basemap: true }, paint: { "background-color": "#08131a" } }];
    if (basemap) {
      sources.basemap = { type: "vector", url: "pmtiles://" + basemap.proxyUrl, attribution: basemap.attribution };
      layers = layers.concat(basemap.layers);
    }
    var spec = { version: 8, sources: sources, layers: layers };
    if (basemap && basemap.glyphs) spec.glyphs = basemap.glyphs;
    return spec;
  }

  // The one call: wrap the mapSpec in a MapPackage and let the controller stand
  // up the map. Setting mapEl.controller is all it takes to render.
  function bootMap(basemap) {
    var spec = buildSpec(basemap);
    var controller = window.HonuaWC.createHonuaWebComponentController({
      mapPackage: {
        mapPackageId: "hello-webmap",
        format: "honua_map_package.v1",
        status: "Ready",
        initialView: MAUI_VIEW,
        sourceBindings: [],
        mapSpec: spec,
      },
    });
    var mapEl = el("s-map");
    if (!mapEl) throw new Error("missing honua-map");
    mapEl.controller = controller;
    return !!basemap;
  }

  function boot() {
    if (!window.HonuaWC || !window.maplibregl) { setStatus("error", "sample assets failed to load"); return; }
    window.HonuaWC.defineHonuaWebComponents();

    setStatus("boot", "booting MapPackage…");
    fetchBasemap()
      .then(function (basemap) {
        var hasBasemap;
        try {
          hasBasemap = bootMap(basemap);
        } catch (e) {
          setStatus("error", "map failed to boot: " + String(e && e.message ? e.message : e));
          return;
        }
        if (hasBasemap) setStatus("ok", "demo.honua.io · MapPackage booted");
        else setStatus("ok", "MapPackage booted · basemap offline (backdrop only)");
      })
      .catch(function (e) {
        // fetchBasemap already swallows its own errors; this guards the rest.
        try {
          bootMap(null);
          setStatus("ok", "MapPackage booted · basemap offline (backdrop only)");
        } catch (_) {
          setStatus("error", "map failed to boot: " + String(e && e.message ? e.message : e));
        }
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

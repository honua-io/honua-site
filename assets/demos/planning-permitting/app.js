/*
 * Planning & Permitting workbench — flagship aggregate demo (honua-sdk-js#289).
 * Composes the @honua/sdk-js web-components kit over the seeded Maui planning
 * layers (zoning + parcels + flood hazard + place names + inspections) from
 * demo.honua.io into one application: map + layer list + legend + search +
 * feature table + chart + editor + measure + sketch + print. Adapted from the
 * proven SDK Controls Gallery controller pattern.
 *
 * Bundle: assets/vendor/honua-webcomponents.min.js (window.HonuaWC)
 */
(function () {
  "use strict";

  var BASE = "https://demo.honua.io";
  var MAUI_VIEW = { center: [-156.62, 20.86], zoom: 11 };

  // svc key -> { kind, color } ; resolved layer index fetched at runtime.
  var LAYERS = {
    "maui-zoning": { src: "zoning", kind: "fill", color: "#7c3aed", line: "#a78bfa", title: "Zoning" },
    "maui-parcels": { src: "parcels", kind: "line", color: "#5eead4", title: "Parcels" },
    "maui-flood-hazard": { src: "flood", kind: "fill", color: "#0ea5e9", line: "#38bdf8", title: "Flood hazard" },
    "maui-place-names": { src: "places", kind: "circle", color: "#f59e0b", title: "Place names" },
  };

  function el(id) { return document.getElementById(id); }
  function setStatus(state, text) {
    var n = el("pp-status");
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
      "resultRecordCount=" + (count || 400), "f=geojson",
    ].join("&");
    return fetch(BASE + "/rest/services/" + svc + "/FeatureServer/" + idx + "/query?" + p, {
      headers: { Accept: "application/json" },
    }).then(function (r) { if (!r.ok) throw new Error(svc + " query " + r.status); return r.json(); });
  }

  // Load one service to a GeoJSON FeatureCollection; null on failure (graceful absence).
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

  function firstProp(props, names) {
    for (var i = 0; i < names.length; i++) if (props[names[i]] != null) return props[names[i]];
    return null;
  }

  function buildController(data, basemap) {
    var WC = window.HonuaWC;
    var sources = {};
    var dataLayers = [];
    var zoningRecords = [];
    var zoneCounts = {};

    // base layers (toggleable) + live vector basemap when reachable
    var baseLayers = [
      { id: "backdrop", type: "background", metadata: { title: "Night", basemap: true }, paint: { "background-color": "#0a1520" } },
      { id: "base-slate", type: "background", metadata: { title: "Slate", basemap: true }, layout: { visibility: "none" }, paint: { "background-color": "#16222e" } },
    ];
    if (basemap) {
      sources.basemap = { type: "vector", url: "pmtiles://" + basemap.proxyUrl, attribution: basemap.attribution };
      baseLayers = baseLayers.concat(basemap.layers);
    }

    Object.keys(LAYERS).forEach(function (svc) {
      var cfg = LAYERS[svc];
      var fc = data[svc];
      if (!fc || !fc.features) return;
      sources[cfg.src] = { type: "geojson", data: fc };
      if (cfg.kind === "fill") {
        dataLayers.push({ id: cfg.src + "-fill", source: cfg.src, type: "fill", metadata: { title: cfg.title }, paint: { "fill-color": cfg.color, "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.55, 0.22] } });
        dataLayers.push({ id: cfg.src + "-line", source: cfg.src, type: "line", metadata: { title: cfg.title + " outline" }, paint: { "line-color": cfg.line || cfg.color, "line-width": 0.8 } });
      } else if (cfg.kind === "line") {
        dataLayers.push({ id: cfg.src + "-line", source: cfg.src, type: "line", metadata: { title: cfg.title }, paint: { "line-color": cfg.color, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.4, 16, 1.4], "line-opacity": 0.6 } });
      } else {
        dataLayers.push({ id: cfg.src + "-pt", source: cfg.src, type: "circle", metadata: { title: cfg.title }, paint: { "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 7, 4], "circle-color": cfg.color, "circle-stroke-color": "#0b1622", "circle-stroke-width": 1.2 } });
      }
    });

    // zoning records drive the table + chart + search
    var zoningFc = data["maui-zoning"];
    if (zoningFc && zoningFc.features) {
      zoningFc.features.forEach(function (f, i) {
        var props = f.properties || {};
        var zone = firstProp(props, ["zone", "zone_code", "zone_dist", "ZONE"]) || "Unclassified";
        zoneCounts[zone] = (zoneCounts[zone] || 0) + 1;
        var id = props.id != null ? props.id : props.OBJECTID != null ? props.OBJECTID : 5000 + i;
        zoningRecords.push({
          id: id, sourceId: "zoning",
          title: String(zone),
          attributes: { zone: zone, island: firstProp(props, ["island", "ISLAND"]), area: firstProp(props, ["gisacres", "cp_area", "area"]) },
          geometry: null,
        });
      });
    }

    var chartData = Object.keys(zoneCounts).sort(function (a, b) { return zoneCounts[b] - zoneCounts[a]; })
      .slice(0, 7).map(function (k) { return { label: k, value: zoneCounts[k] }; });

    var legend = Object.keys(LAYERS)
      .filter(function (svc) { return data[svc] && data[svc].features; })
      .map(function (svc) { return { label: LAYERS[svc].title, color: LAYERS[svc].color }; });

    var spec = { version: 8, sources: sources, layers: baseLayers.concat(dataLayers) };
    if (basemap && basemap.glyphs) spec.glyphs = basemap.glyphs;

    var controller = WC.createHonuaWebComponentController({
      mapPackage: {
        mapPackageId: "planning-permitting",
        format: "honua_map_package.v1",
        status: "Ready",
        initialView: MAUI_VIEW,
        legend: legend,
        sourceBindings: [],
        mapSpec: spec,
      },
      featuresBySource: { "zoning": zoningRecords },
      fieldsBySource: { "zoning": ["zone", "island", "area"] },
      editor: {
        sourceId: "zoning", status: "idle",
        capabilities: { canCreate: false, canUpdate: false, canDelete: false, readOnly: true, reason: "Zoning is a reference layer; permit/inspection editing lands when the writable inspections lane is licensed (Pro)." },
      },
      chart: { id: "zoning-mix", title: "Zoning mix", kind: "bar", status: "ready", sourceId: "zoning", data: chartData },
      searchFields: ["zone", "island"],
    });

    return { controller: controller, zoneCount: zoningRecords.length };
  }

  function boot() {
    if (!window.HonuaWC || !window.maplibregl) { setStatus("error", "workbench assets failed to load"); return; }
    window.HonuaWC.defineHonuaWebComponents();
    setStatus("boot", "loading planning layers…");
    Promise.all([
      Promise.all(Object.keys(LAYERS).map(loadSvc)),
      fetchBasemap(),
    ]).then(function (out) {
      var fcs = out[0], basemap = out[1];
      var data = {};
      Object.keys(LAYERS).forEach(function (svc, i) { data[svc] = fcs[i]; });
      var liveLayers = Object.keys(LAYERS).filter(function (svc) { return data[svc] && data[svc].features; });
      if (!liveLayers.length) { setStatus("error", "demo server unreachable — planning layers unavailable"); return; }

      var built = buildController(data, basemap);
      var mapEl = el("pp-map");
      if (!mapEl) throw new Error("missing honua-map");
      mapEl.controller = built.controller;

      setStatus("ok", "demo.honua.io · " + liveLayers.length + " planning layers · " + built.zoneCount + " zoning records");
    }).catch(function (e) {
      setStatus("error", "failed to start: " + String(e && e.message ? e.message : e));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

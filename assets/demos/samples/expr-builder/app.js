/*
 * Sample: Query expressions (expr-builder).
 * One concept — type a protocol-neutral attribute predicate (a `where`
 * clause, the GeoServices spelling of CQL2) and run it against a live
 * FeatureServer. The matching features drive a <honua-feature-table> and
 * highlight on the map. Re-running rebuilds the controller with the new
 * result set, demonstrating query-expression -> source -> result.
 *
 * Bundle: assets/vendor/honua-webcomponents.min.js (window.HonuaWC)
 */
(function () {
  "use strict";

  var BASE = "https://demo.honua.io";
  var SVC = "maui-zoning";
  var MAUI_VIEW = { center: [-156.62, 20.86], zoom: 10.6 };
  var SRC = "zoning";
  var FIELDS = ["zone", "island", "area"];
  var layerIndex = null;
  var basemapDef = null;
  var mapEl = null;

  var PRESETS = [
    "1=1",
    "zone LIKE 'R%'",
    "island = 'Maui'",
  ];

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

  function queryGeoJson(svc, idx, where, count) {
    var p = [
      "where=" + encodeURIComponent(where || "1=1"),
      "outFields=*", "returnGeometry=true", "outSR=4326",
      "resultRecordCount=" + (count || 300), "f=geojson",
    ].join("&");
    return fetch(BASE + "/rest/services/" + svc + "/FeatureServer/" + idx + "/query?" + p, {
      headers: { Accept: "application/json" },
    }).then(function (r) { if (!r.ok) throw new Error(svc + " query " + r.status); return r.json(); });
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

  function buildController(fc, basemap) {
    var WC = window.HonuaWC;
    var records = [];
    (fc.features || []).forEach(function (f, i) {
      var props = f.properties || {};
      var zone = firstProp(props, ["zone", "zone_code", "zone_dist", "ZONE"]) || "Unclassified";
      var id = props.id != null ? props.id : props.OBJECTID != null ? props.OBJECTID : 5000 + i;
      records.push({
        id: id, sourceId: SRC, title: String(zone),
        attributes: { zone: zone, island: firstProp(props, ["island", "ISLAND"]), area: firstProp(props, ["gisacres", "cp_area", "area"]) },
        geometry: null,
      });
    });

    var sources = { "zoning": { type: "geojson", data: fc } };
    var baseLayers = [{ id: "backdrop", type: "background", metadata: { title: "Night", basemap: true }, paint: { "background-color": "#0a1520" } }];
    if (basemap) {
      sources.basemap = { type: "vector", url: "pmtiles://" + basemap.proxyUrl, attribution: basemap.attribution };
      baseLayers = baseLayers.concat(basemap.layers);
    }
    var dataLayers = [
      { id: "zoning-fill", source: "zoning", type: "fill", metadata: { title: "Zoning (matched)" }, paint: { "fill-color": "#7c3aed", "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.55, 0.3] } },
      { id: "zoning-line", source: "zoning", type: "line", metadata: { title: "Zoning outline" }, paint: { "line-color": "#a78bfa", "line-width": 0.8 } },
    ];
    var spec = { version: 8, sources: sources, layers: baseLayers.concat(dataLayers) };
    if (basemap && basemap.glyphs) spec.glyphs = basemap.glyphs;

    return {
      controller: WC.createHonuaWebComponentController({
        mapPackage: {
          mapPackageId: "expr-builder",
          format: "honua_map_package.v1",
          status: "Ready",
          initialView: MAUI_VIEW,
          legend: [{ label: "Matched zoning", color: "#7c3aed" }],
          sourceBindings: [],
          mapSpec: spec,
        },
        featuresBySource: { "zoning": records },
        fieldsBySource: { "zoning": FIELDS },
        searchFields: ["zone", "island"],
      }),
      count: records.length,
    };
  }

  function run(where) {
    if (layerIndex == null || !mapEl) return;
    setStatus("boot", "running where: " + where);
    queryGeoJson(SVC, layerIndex, where)
      .then(function (fc) {
        var built = buildController(fc, basemapDef);
        mapEl.controller = built.controller;
        setStatus("ok", "demo.honua.io · " + built.count + " features matched");
      })
      .catch(function (e) {
        setStatus("error", "query failed: " + String(e && e.message ? e.message : e));
      });
  }

  function wireForm() {
    var form = el("s-form");
    var input = el("s-where");
    if (form && input) {
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        run(input.value.trim() || "1=1");
      });
    }
    var presetRow = el("s-presets");
    if (presetRow) {
      PRESETS.forEach(function (p) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "s-preset";
        b.textContent = p;
        b.addEventListener("click", function () { if (input) input.value = p; run(p); });
        presetRow.appendChild(b);
      });
    }
  }

  function boot() {
    if (!window.HonuaWC || !window.maplibregl) { setStatus("error", "sample assets failed to load"); return; }
    window.HonuaWC.defineHonuaWebComponents();
    mapEl = el("s-map");
    wireForm();
    setStatus("boot", "connecting to demo.honua.io…");
    Promise.all([resolveLayerIndex(SVC), fetchBasemap()])
      .then(function (out) {
        layerIndex = out[0];
        basemapDef = out[1];
        run(el("s-where") ? (el("s-where").value.trim() || "1=1") : "1=1");
      })
      .catch(function (e) {
        setStatus("error", "could not reach service: " + String(e && e.message ? e.message : e));
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

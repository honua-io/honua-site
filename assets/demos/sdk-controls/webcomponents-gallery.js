/*
 * honua.io SDK Controls Gallery — the full @honua/sdk-js web-components kit
 * (~15 controller-driven custom elements) wired to LIVE Maui data from
 * demo.honua.io. No mocks: place names + roads are fetched from the seeded
 * FeatureServer (layer indices resolved at runtime), then handed to a single
 * HonuaWebComponentController that every control binds to via for="gallery-map".
 *
 * Bundle: assets/vendor/honua-webcomponents.min.js  (window.HonuaWC)
 */
(function () {
  "use strict";

  var BASE = "https://demo.honua.io";
  var PLACE_SVC = "maui-place-names";
  var ROAD_SVC = "maui-roads";
  var MAUI_VIEW = { center: [-156.47, 20.83], zoom: 9.2 };

  function el(id) { return document.getElementById(id); }
  function setStatus(state, text) {
    var n = el("gallery-status");
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

  function queryGeoJson(svc, idx, opts) {
    var p = [
      "where=" + encodeURIComponent(opts.where || "1=1"),
      "outFields=" + encodeURIComponent(opts.outFields || "*"),
      "returnGeometry=true",
      "outSR=4326",
      "resultRecordCount=" + (opts.count || 100),
      "f=geojson",
    ].join("&");
    return fetch(BASE + "/rest/services/" + svc + "/FeatureServer/" + idx + "/query?" + p, {
      headers: { Accept: "application/json" },
    }).then(function (r) { if (!r.ok) throw new Error(svc + " query " + r.status); return r.json(); });
  }

  function pointFrom(geom) {
    if (!geom) return null;
    if (geom.type === "Point") return geom.coordinates;
    if (geom.type === "MultiPoint" && geom.coordinates.length) return geom.coordinates[0];
    if (geom.type === "GeometryCollection" && geom.geometries.length) return pointFrom(geom.geometries[0]);
    return null;
  }

  var CLASS_COLORS = {
    Populated: "#2563eb", Civil: "#7c3aed", Beach: "#f59e0b", Canal: "#0891b2",
    Summit: "#dc2626", Valley: "#16a34a", Stream: "#0ea5e9", Census: "#64748b",
  };
  function colorFor(klass) {
    var key = String(klass || "").split(" ")[0];
    return CLASS_COLORS[key] || "#475569";
  }

  function buildController(placeFc, roadFc) {
    var WC = window.HonuaWC;
    var PLACE_SRC = "place-names";

    var records = [];
    var pointFeatures = [];
    var classCounts = {};
    (placeFc.features || []).forEach(function (f, i) {
      var c = pointFrom(f.geometry);
      if (!c) return;
      var props = f.properties || {};
      var klass = props.feature_class || "Other";
      classCounts[klass] = (classCounts[klass] || 0) + 1;
      var id = props.id != null ? props.id : 1000 + i;
      records.push({
        id: id, sourceId: PLACE_SRC, title: props.name || "(unnamed)",
        attributes: { name: props.name, feature_class: klass },
        geometry: { x: c[0], y: c[1] },
      });
      pointFeatures.push({ type: "Feature", id: id, properties: { name: props.name, feature_class: klass }, geometry: { type: "Point", coordinates: c } });
    });

    var chartData = Object.keys(classCounts).sort(function (a, b) { return classCounts[b] - classCounts[a]; })
      .slice(0, 6).map(function (k) { return { label: k, value: classCounts[k], color: colorFor(k) }; });

    var legend = [{ label: "Roads", color: "#94a3b8" }].concat(
      chartData.map(function (d) { return { label: d.label + " place", color: d.color }; })
    );

    var controller = WC.createHonuaWebComponentController({
      mapPackage: {
        mapPackageId: "sdk-controls-gallery",
        format: "honua_map_package.v1",
        status: "Ready",
        initialView: MAUI_VIEW,
        legend: legend,
        sourceBindings: [],
        mapSpec: {
          version: 8,
          sources: {
            "place-names": { type: "geojson", data: { type: "FeatureCollection", features: pointFeatures } },
            "roads": { type: "geojson", data: roadFc || { type: "FeatureCollection", features: [] } },
          },
          layers: [
            { id: "basemap-light", type: "background", metadata: { title: "Night", basemap: true }, paint: { "background-color": "#0b1622" } },
            { id: "basemap-slate", type: "background", metadata: { title: "Slate", basemap: true }, layout: { visibility: "none" }, paint: { "background-color": "#1e293b" } },
            { id: "roads", source: "roads", type: "line", metadata: { title: "Maui roads (live)" }, paint: { "line-color": "#94a3b8", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 13, 1.6], "line-opacity": 0.7 } },
            { id: "place-halos", source: "place-names", type: "circle", metadata: { title: "Place halos" }, paint: { "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 18, 11], "circle-color": "#38bdf8", "circle-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.32, 0.14] } },
            { id: "place-points", source: "place-names", type: "circle", metadata: { title: "Maui place names (live GNIS)" }, paint: { "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 8, 5], "circle-color": ["case", ["boolean", ["feature-state", "selected"], false], "#f97316", ["boolean", ["feature-state", "hover"], false], "#f8fafc", "#38bdf8"], "circle-stroke-color": "#0b1622", "circle-stroke-width": 1.5 } },
          ],
        },
      },
      featuresBySource: { "place-names": records },
      fieldsBySource: { "place-names": ["name", "feature_class"] },
      editor: {
        sourceId: "place-names", status: "idle",
        capabilities: { canCreate: false, canUpdate: false, canDelete: false, readOnly: true, reason: "GNIS place names are a read-only reference layer." },
      },
      chart: { id: "place-class", title: "Place names by class", kind: "bar", status: "ready", sourceId: "place-names", data: chartData },
      searchFields: ["name", "feature_class"],
    });

    return { controller: controller, placeCount: records.length, roadCount: (roadFc && roadFc.features ? roadFc.features.length : 0) };
  }

  function wireEventLog() {
    var log = el("gallery-event-log");
    var names = ["honua-map-ready", "honua-map-click", "honua-selection-change", "honua-layer-visibility-change",
      "honua-basemap-change", "honua-search", "honua-measure-change", "honua-sketch-change",
      "honua-bookmark-change", "honua-locate-change", "honua-export", "honua-action", "honua-filter-change"];
    names.forEach(function (n) {
      document.addEventListener(n, function (e) {
        if (!log) return;
        var d = e.detail || {};
        var bits = Object.keys(d).slice(0, 2).map(function (k) {
          var v = d[k], s;
          try { s = v && typeof v === "object" ? "[obj]" : String(v); } catch (_) { s = "?"; }
          return k + "=" + s;
        }).join(" ");
        log.textContent = n.replace("honua-", "") + (bits ? "  " + bits : "");
      });
    });
  }

  function boot() {
    if (!window.HonuaWC || !window.maplibregl) { setStatus("error", "gallery assets failed to load"); return; }
    window.HonuaWC.defineHonuaWebComponents();
    wireEventLog();
    setStatus("boot", "loading live Maui data from demo.honua.io…");

    Promise.all([resolveLayerIndex(PLACE_SVC), resolveLayerIndex(ROAD_SVC)])
      .then(function (idx) {
        return Promise.all([
          queryGeoJson(PLACE_SVC, idx[0], { count: 90, outFields: "name,feature_class" }),
          queryGeoJson(ROAD_SVC, idx[1], { count: 400, outFields: "id" }).catch(function () { return null; }),
        ]);
      })
      .then(function (res) {
        var built = buildController(res[0], res[1]);
        var map = document.querySelector("honua-map");
        if (!map) throw new Error("missing honua-map");
        map.controller = built.controller;
        setStatus("ok", "live: " + built.placeCount + " place names + " + built.roadCount + " road segments from demo.honua.io");
      })
      .catch(function (err) {
        setStatus("error", "live data unavailable: " + (err && err.message ? err.message : err));
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

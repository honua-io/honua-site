/*
 * Sample: Geocoding — forward / reverse / suggest (geocoding).
 * One concept — address(name)-to-point, point-to-name, and typeahead over a
 * live Maui gazetteer (GNIS place names) loaded from demo.honua.io. If the live
 * lane is unavailable the page degrades to a small bundled fixture and labels
 * the lane honestly in the status pill.
 *
 * Bundle: assets/vendor/honua-webcomponents.min.js (window.HonuaWC)
 */
(function () {
  "use strict";

  var BASE = "https://demo.honua.io";
  var PLACE_SVC = "maui-place-names";
  var MAUI_VIEW = { center: [-156.47, 20.83], zoom: 9.4 };
  var SRC = "places";

  // Graceful fallback gazetteer (subset of Maui GNIS) used when the live
  // FeatureServer is unreachable. Keeps the sample interactive offline.
  var FIXTURE = {
    type: "FeatureCollection",
    features: [
      ["Kahului", "ppl", -156.4729, 20.8893],
      ["Wailuku", "ppl", -156.5057, 20.8893],
      ["Lahaina", "ppl", -156.6789, 20.8783],
      ["Kīhei", "ppl", -156.4456, 20.7644],
      ["Pāʻia", "ppl", -156.3711, 20.9047],
      ["Makawao", "ppl", -156.3164, 20.8569],
      ["Hāna", "ppl", -155.9903, 20.7583],
      ["Haleakalā", "summit", -156.2533, 20.7097],
      ["Pukalani", "ppl", -156.3372, 20.8378],
      ["Kula", "ppl", -156.3258, 20.7900],
    ].map(function (r, i) {
      return { type: "Feature", id: i + 1, properties: { name: r[0], feature_class: r[1] }, geometry: { type: "Point", coordinates: [r[2], r[3]] } };
    }),
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
      "outFields=" + encodeURIComponent("name,feature_class"),
      "returnGeometry=true", "outSR=4326",
      "resultRecordCount=" + (count || 400), "f=geojson",
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

  // The in-memory gazetteer the three geocode operations run against.
  var GAZ = []; // [{ id, name, feature_class, lon, lat }]

  function loadGazetteer(fc) {
    GAZ = [];
    (fc.features || []).forEach(function (f, i) {
      var c = pointFrom(f.geometry);
      if (!c) return;
      var props = f.properties || {};
      GAZ.push({ id: props.id != null ? props.id : i + 1, name: props.name || "(unnamed)", feature_class: props.feature_class || "", lon: c[0], lat: c[1] });
    });
  }

  /* forward geocode / suggest — substring match, prefix-first ranking */
  function suggest(q, limit) {
    q = (q || "").trim().toLowerCase();
    if (!q) return [];
    var out = [];
    for (var i = 0; i < GAZ.length; i++) {
      var name = (GAZ[i].name || "").toLowerCase();
      var pos = name.indexOf(q);
      if (pos !== -1) out.push({ rec: GAZ[i], pos: pos });
    }
    out.sort(function (a, b) { return a.pos - b.pos || a.rec.name.length - b.rec.name.length; });
    return out.slice(0, limit || 8).map(function (o) { return o.rec; });
  }

  /* reverse geocode — nearest gazetteer entry to a lon/lat (haversine) */
  function reverse(lon, lat) {
    var best = null, bestD = Infinity;
    var toRad = Math.PI / 180;
    for (var i = 0; i < GAZ.length; i++) {
      var r = GAZ[i];
      var dLat = (r.lat - lat) * toRad;
      var dLon = (r.lon - lon) * toRad;
      var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat * toRad) * Math.cos(r.lat * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      var d = 12742 * Math.asin(Math.min(1, Math.sqrt(a))); // km
      if (d < bestD) { bestD = d; best = r; }
    }
    return best ? { rec: best, km: bestD } : null;
  }

  function buildController(basemap) {
    var WC = window.HonuaWC;
    var records = GAZ.map(function (r) {
      return { id: r.id, sourceId: SRC, title: r.name, attributes: { name: r.name, feature_class: r.feature_class }, geometry: { x: r.lon, y: r.lat } };
    });
    var features = GAZ.map(function (r) {
      return { type: "Feature", id: r.id, properties: { name: r.name, feature_class: r.feature_class }, geometry: { type: "Point", coordinates: [r.lon, r.lat] } };
    });

    var sources = {};
    sources[SRC] = { type: "geojson", data: { type: "FeatureCollection", features: features } };
    var baseLayers = [{ id: "backdrop", type: "background", metadata: { title: "Night", basemap: true }, paint: { "background-color": "#08131a" } }];
    if (basemap) {
      sources.basemap = { type: "vector", url: "pmtiles://" + basemap.proxyUrl, attribution: basemap.attribution };
      baseLayers = baseLayers.concat(basemap.layers);
    }
    var dataLayers = [
      { id: "place-halos", source: SRC, type: "circle", metadata: { title: "Match halo" }, paint: { "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 16, 8], "circle-color": "#38bdf8", "circle-opacity": 0.14 } },
      { id: "place-points", source: SRC, type: "circle", metadata: { title: "Maui gazetteer (live GNIS)" }, paint: { "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 8, 4.5], "circle-color": ["case", ["boolean", ["feature-state", "selected"], false], "#f97316", "#38bdf8"], "circle-stroke-color": "#0b1622", "circle-stroke-width": 1.4 } },
    ];
    var spec = { version: 8, sources: sources, layers: baseLayers.concat(dataLayers) };
    if (basemap && basemap.glyphs) spec.glyphs = basemap.glyphs;

    return WC.createHonuaWebComponentController({
      mapPackage: {
        mapPackageId: "geocoding",
        format: "honua_map_package.v1",
        status: "Ready",
        initialView: MAUI_VIEW,
        legend: [{ label: "Maui place name", color: "#38bdf8" }],
        sourceBindings: [],
        mapSpec: spec,
      },
      featuresBySource: (function () { var o = {}; o[SRC] = records; return o; })(),
      fieldsBySource: (function () { var o = {}; o[SRC] = ["name", "feature_class"]; return o; })(),
      searchFields: ["name", "feature_class"],
    });
  }

  function mapEl() { return el("s-map"); }

  function selectAndFly(rec) {
    var m = mapEl();
    if (!m || !m.map) return;
    m.map.flyTo({ center: [rec.lon, rec.lat], zoom: Math.max(m.map.getZoom(), 12.5), duration: 900 });
    if (m.controller && m.controller.selectFeatures) {
      try { m.controller.selectFeatures(SRC, [rec.id]); } catch (_) { /* selection is best-effort */ }
    }
  }

  function renderSuggest(items) {
    var ul = el("s-suggest");
    if (!ul) return;
    ul.innerHTML = "";
    if (!items.length) return;
    items.forEach(function (rec) {
      var li = document.createElement("li");
      li.setAttribute("role", "option");
      var name = document.createElement("span");
      name.textContent = rec.name;
      var cls = document.createElement("span");
      cls.className = "cls";
      cls.textContent = rec.feature_class || "place";
      li.appendChild(name);
      li.appendChild(cls);
      li.addEventListener("click", function () {
        el("s-q").value = rec.name;
        ul.innerHTML = "";
        selectAndFly(rec);
      });
      ul.appendChild(li);
    });
  }

  function renderReverse(lon, lat) {
    var box = el("s-reverse");
    if (!box) return;
    var hit = reverse(lon, lat);
    box.innerHTML = "";
    var coord = document.createElement("div");
    coord.className = "coord";
    coord.textContent = lat.toFixed(5) + ", " + lon.toFixed(5);
    box.appendChild(coord);
    if (hit) {
      var line = document.createElement("div");
      line.innerHTML = "Nearest: <strong></strong> <span class=\"muted\"></span>";
      line.querySelector("strong").textContent = hit.rec.name;
      line.querySelector(".muted").textContent = "(" + (hit.rec.feature_class || "place") + " · " + hit.km.toFixed(1) + " km)";
      box.appendChild(line);
      selectAndFly(hit.rec);
    } else {
      var none = document.createElement("div");
      none.className = "muted";
      none.textContent = "No named place found nearby.";
      box.appendChild(none);
    }
  }

  function wireInteractions() {
    var input = el("s-q");
    if (input) {
      input.addEventListener("input", function () { renderSuggest(suggest(input.value, 8)); });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          var first = suggest(input.value, 1)[0];
          if (first) { el("s-suggest").innerHTML = ""; selectAndFly(first); }
        }
      });
    }
    var m = mapEl();
    if (m && m.map) {
      m.map.on("click", function (e) { renderReverse(e.lngLat.lng, e.lngLat.lat); });
    }
  }

  function finish(lane, count, basemap) {
    var m = mapEl();
    if (!m) throw new Error("missing honua-map");
    m.controller = buildController(basemap);
    // honua-map sets up its maplibre instance on the next frame; wire click then.
    var tries = 0;
    (function waitForMap() {
      if (m.map) { wireInteractions(); return; }
      if (tries++ > 40) { wireInteractions(); return; }
      requestAnimationFrame(waitForMap);
    })();
    if (lane === "live") setStatus("ok", "demo.honua.io · geocode over " + count + " place names");
    else setStatus("fixture", "live gazetteer unavailable — using bundled fixture (" + count + ")");
  }

  function boot() {
    if (!window.HonuaWC || !window.maplibregl) { setStatus("error", "sample assets failed to load"); return; }
    window.HonuaWC.defineHonuaWebComponents();
    setStatus("boot", "loading live Maui gazetteer…");

    fetchBasemap().then(function (basemap) {
      resolveLayerIndex(PLACE_SVC)
        .then(function (idx) { return queryGeoJson(PLACE_SVC, idx); })
        .then(function (fc) {
          loadGazetteer(fc);
          if (!GAZ.length) throw new Error("empty gazetteer");
          finish("live", GAZ.length, basemap);
        })
        .catch(function () {
          loadGazetteer(FIXTURE);
          finish("fixture", GAZ.length, basemap);
        });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

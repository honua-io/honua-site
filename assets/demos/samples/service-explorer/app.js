/*
 * Sample: Universal service explorer (service-explorer).
 * The CONNECT headline — the SDK treats protocol as a field on a source
 * descriptor, so one client reaches every surface Honua exposes: GeoServices
 * FeatureServer / ImageServer, OGC API Features, STAC, OData v4, classic
 * WFS/WMS/WMTS, and MapLibre-native vector tiles. Each protocol row live-probes
 * demo.honua.io in parallel and renders a health badge (live · latency, or
 * unavailable). Selecting a row loads a representative Maui layer (zoning
 * districts via OGC API Features) into the <honua-map> on the right. The page
 * never blocks on any single probe — every row degrades independently.
 *
 * Bundle: assets/vendor/honua-webcomponents.min.js (window.HonuaWC)
 */
(function () {
  "use strict";

  var BASE = "https://demo.honua.io";
  var MAUI_VIEW = { center: [-156.47, 20.83], zoom: 9.4 };
  var ZONING_SRC = "maui-zoning";

  // Protocol surfaces. Each declares a light probe endpoint (returns 2xx on a
  // healthy server) plus SDK descriptor + capability note for the matrix. The
  // FeatureServer /query?f=geojson path is intentionally avoided (405 here);
  // features come from OGC API Features items instead.
  var PROTOCOLS = [
    { key: "featureserver", name: "GeoServices FeatureServer", tag: "esri-feature", cache: "",
      path: "/rest/services/maui-zoning/FeatureServer?f=json",
      note: "Esri JSON feature service · query + edit + metadata" },
    { key: "imageserver", name: "GeoServices ImageServer", tag: "esri-image", cache: "",
      path: "/rest/services/maui-hillshade/ImageServer?f=json",
      note: "Raster / image service · exportImage + identify" },
    { key: "ogc-features", name: "OGC API — Features", tag: "ogc-features", cache: "",
      path: "/ogc/features/collections?f=json",
      note: "GeoJSON collections · CQL2 filter + paging" },
    { key: "stac", name: "STAC", tag: "stac", cache: "",
      path: "/stac",
      note: "SpatioTemporal Asset Catalog · collections + item search" },
    { key: "odata", name: "OData v4", tag: "odata", cache: "",
      path: "/odata/",
      note: "$metadata · $filter with geo.* spatial functions" },
    { key: "wfs", name: "OGC WFS", tag: "ogc-classic", cache: "",
      path: "/wfs?service=WFS&request=GetCapabilities",
      note: "Classic OGC · GetFeature + Transaction" },
    { key: "wms", name: "OGC WMS", tag: "ogc-classic", cache: "",
      path: "/wms?service=WMS&request=GetCapabilities",
      note: "Classic OGC · GetMap + GetFeatureInfo" },
    { key: "wmts", name: "OGC WMTS", tag: "ogc-classic", cache: "cache-hinted",
      path: "/wmts?service=WMTS&request=GetCapabilities",
      note: "Classic OGC · tile-matrix, seedable + metatiled" },
    { key: "tiles", name: "MapLibre-native tiles", tag: "ogc-tiles", cache: "cache-hinted",
      path: "/ogc/tiles/collections/maui-zoning/tiles/WebMercatorQuad?f=json",
      note: "OGC Tiles / MVT · TileJSON, snapped gridset keys" },
  ];

  function el(id) { return document.getElementById(id); }
  function setStatus(state, text) {
    var n = el("s-status");
    if (n) { n.dataset.state = state; n.textContent = text; }
  }

  /* ---- basemap (shared pmtiles proxy) — same pattern as sibling samples ---- */
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

  /* ---- representative layer: Maui zoning districts via OGC API Features ---- */
  function fetchZoning(limit) {
    var url = BASE + "/ogc/features/collections/maui-zoning/items?f=json&limit=" + (limit || 400);
    return fetch(url, { headers: { Accept: "application/geo+json, application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("zoning items " + r.status); return r.json(); })
      .then(function (fc) {
        var feats = (fc && fc.features) || [];
        return { type: "FeatureCollection", features: feats };
      })
      .catch(function () { return { type: "FeatureCollection", features: [] }; });
  }

  function buildController(zoningFc, basemap) {
    var WC = window.HonuaWC;
    var sources = {};
    sources[ZONING_SRC] = { type: "geojson", data: zoningFc };
    var baseLayers = [{ id: "backdrop", type: "background", metadata: { title: "Night", basemap: true }, paint: { "background-color": "#08131a" } }];
    if (basemap) {
      sources.basemap = { type: "vector", url: "pmtiles://" + basemap.proxyUrl, attribution: basemap.attribution };
      baseLayers = baseLayers.concat(basemap.layers);
    }
    var dataLayers = [
      { id: "zoning-fill", source: ZONING_SRC, type: "fill", metadata: { title: "Maui zoning (live OGC API Features)" }, paint: { "fill-color": "#38bdf8", "fill-opacity": 0.14 } },
      { id: "zoning-line", source: ZONING_SRC, type: "line", metadata: { title: "Zoning boundaries" }, paint: { "line-color": "#38bdf8", "line-width": 0.8, "line-opacity": 0.7 } },
    ];
    var spec = { version: 8, sources: sources, layers: baseLayers.concat(dataLayers) };
    if (basemap && basemap.glyphs) spec.glyphs = basemap.glyphs;

    return WC.createHonuaWebComponentController({
      mapPackage: {
        mapPackageId: "service-explorer",
        format: "honua_map_package.v1",
        status: "Ready",
        initialView: MAUI_VIEW,
        legend: [{ label: "Maui zoning district", color: "#38bdf8" }],
        sourceBindings: [],
        mapSpec: spec,
      },
      featuresBySource: {},
      fieldsBySource: {},
    });
  }

  /* ---- probe one protocol row; resolve to a badge state, never rejects ---- */
  function probe(p) {
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    return fetch(BASE + p.path, { headers: { Accept: "*/*" } })
      .then(function (r) {
        var t1 = (window.performance && performance.now) ? performance.now() : Date.now();
        var ms = Math.max(1, Math.round(t1 - t0));
        return { key: p.key, ok: r.ok, ms: ms, status: r.status };
      })
      .catch(function () { return { key: p.key, ok: false, ms: 0, status: 0 }; });
  }

  function badgeFor(key) { return el("badge-" + key); }

  function paintBadge(res) {
    var b = badgeFor(res.key);
    if (!b) return;
    if (res.ok) { b.dataset.state = "live"; b.textContent = "live · " + res.ms + "ms"; }
    else { b.dataset.state = "down"; b.textContent = "unavailable"; }
  }

  /* ---- selecting a protocol row: highlight + frame the zoning layer ---- */
  function selectRow(rowEl) {
    var items = document.querySelectorAll(".s-proto");
    for (var i = 0; i < items.length; i++) items[i].setAttribute("aria-selected", items[i] === rowEl ? "true" : "false");
    var m = el("s-map");
    if (m && m.map) {
      try { m.map.flyTo({ center: MAUI_VIEW.center, zoom: MAUI_VIEW.zoom, duration: 700 }); } catch (_) { /* best-effort */ }
    }
  }

  function renderMatrix() {
    var ul = el("s-matrix");
    if (!ul) return;
    ul.innerHTML = "";
    PROTOCOLS.forEach(function (p) {
      var li = document.createElement("li");
      li.setAttribute("role", "option");

      var row = document.createElement("button");
      row.type = "button";
      row.className = "s-proto";
      row.setAttribute("aria-selected", "false");

      var name = document.createElement("span");
      name.className = "name";
      name.textContent = p.name;

      var badge = document.createElement("span");
      badge.className = "s-badge";
      badge.id = "badge-" + p.key;
      badge.dataset.state = "probe";
      badge.textContent = "probing…";

      var path = document.createElement("span");
      path.className = "path";
      path.textContent = p.path;

      var note = document.createElement("span");
      note.className = "note";
      note.textContent = p.note + (p.cache ? " · " + p.cache : "");

      row.appendChild(name);
      row.appendChild(badge);
      row.appendChild(path);
      row.appendChild(note);
      row.addEventListener("click", function () { selectRow(row); });

      li.appendChild(row);
      ul.appendChild(li);
    });
  }

  function boot() {
    if (!window.HonuaWC || !window.maplibregl) { setStatus("error", "sample assets failed to load"); return; }
    window.HonuaWC.defineHonuaWebComponents();
    renderMatrix();
    setStatus("boot", "probing " + PROTOCOLS.length + " protocol surfaces…");

    // Right pane: load the shared basemap + a representative zoning layer.
    Promise.all([fetchBasemap(), fetchZoning(400)]).then(function (out) {
      var basemap = out[0], zoning = out[1];
      var m = el("s-map");
      if (m) { try { m.controller = buildController(zoning, basemap); } catch (_) { /* map is optional */ } }
    });

    // Left pane: probe every protocol in parallel; each row updates independently.
    var pending = PROTOCOLS.length;
    var live = 0;
    PROTOCOLS.forEach(function (p) {
      probe(p).then(function (res) {
        paintBadge(res);
        if (res.ok) live++;
        pending--;
        if (pending <= 0) {
          if (live > 0) setStatus("ok", "demo.honua.io · " + live + "/" + PROTOCOLS.length + " protocols live");
          else setStatus("error", "demo.honua.io unreachable — all protocols unavailable");
        }
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

/*
 * honua.io "Maui Web Map" (demo-webmap-app.html): the controls people expect
 * from a web map app, every one of them an @honua/sdk-js 0.2.10 element or
 * function, on live Maui data from demo.honua.io.
 *
 *   <honua-map> + createHonuaWebComponentController   web-components kit
 *   <honua-layer-list>  visibility · opacity · order   web-components kit
 *   <honua-legend> derive mode                         controls kit
 *   <honua-basemap-control>                            web-components kit
 *   <honua-search> + HonuaGeocodingClient              geocoding
 *   identify popups: hitTestMap + preparePrimaryDetailModel   interactions
 *   <honua-swipe-control>                              controls kit
 *   <honua-measurement>                                web-components kit
 *   <honua-time-slider> + createTemporalPlayback       map
 *   filter builder: createFilterRegistry + connect().queryExtent   filter-registry + root
 *   share link: serializeFilterRegistry / parseFilterRegistry      filter-registry
 *   <honua-zoom> <honua-compass> <honua-home> <honua-fullscreen>
 *   <honua-scale-bar> <honua-attribution> <honua-bookmarks> <honua-print-export>
 *
 * Page-owned code places the elements, feeds them live data, and reacts to
 * their events. The only page-owned widgets are the tab strip and the cursor
 * coordinate readout. Nothing falls back to a fixture: a failed request is
 * reported in the status pill and the layer note.
 *
 * Bundle: assets/demos/webmap-app/sdk/honua-webmap.min.js (window.HonuaWebMap),
 * built from the published @honua/sdk-js 0.2.10 tarball; see sdk/README.md.
 */
(function () {
  "use strict";

  var BASE = "https://demo.honua.io";
  var LAYERS_CONFIG = "assets/demo/layers.json";
  var TILES = function (collection) {
    return BASE + "/ogc/tiles/collections/" + collection + "/tiles/WebMercatorQuad/{z}/{y}/{x}";
  };
  var ZONING_FS = BASE + "/rest/services/maui-zoning/FeatureServer/2";
  var INSPECTIONS_QUERY =
    BASE +
    "/rest/services/maui-inspections/FeatureServer/12/query?where=1%3D1&outFields=id,name,category,status,note,reported_at&returnGeometry=true&outSR=4326&f=geojson";
  var HOME = { center: [-156.36, 20.8], zoom: 9.4 };
  var MAUI_BIAS = "-156.40,20.82"; // proximity bias for the World geocoder
  var ATTRIBUTION = "County of Maui · Hawaiʻi Statewide GIS Program · FEMA NFHL · Overture Maps · USDA NAIP · USGS 3DEP · synthetic demo inspections";

  /* ── one category table, two consumers: the zoning paint and its legend ── */
  var ZONING = [
    { key: "0", label: "Residential", color: "#e8c862" },
    { key: "1", label: "Apartment / duplex", color: "#d99a4a" },
    { key: "2", label: "Hotel", color: "#e07f9a" },
    { key: "3", label: "Business", color: "#e0645c" },
    { key: "4", label: "Industrial / airport", color: "#a57ad1" },
    { key: "5", label: "Agriculture", color: "#7fbf5a" },
    { key: "6", label: "Rural", color: "#b9c96a" },
    { key: "7", label: "Project & special districts", color: "#5fa8d3" },
    { key: "8", label: "Open space", color: "#3aa088" },
    { key: "9", label: "Public, parks & roads", color: "#7d95a3" },
  ];
  var ZONING_OTHER = "#4a5a66";
  var FLOOD = [
    { key: "A", color: "#60a5fa" },
    { key: "AE", color: "#2563eb" },
    { key: "AO", color: "#22d3ee" },
    { key: "VE", color: "#c026d3" },
    { key: "X", color: "#94a3b8" },
  ];
  var STATUS = [
    { key: "urgent", color: "#f87171" },
    { key: "needs_attention", color: "#fbbf24" },
    { key: "ok", color: "#34d399" },
  ];

  var DATA_LAYERS = [
    { id: "zoning-fill", title: "Zoning (OGC API Tiles)", sourceId: "zoning", fields: ["zone_dist", "zone_code", "island", "cp_area"], titleField: "zone_dist" },
    { id: "slr-fill", title: "Sea level rise 3.2 ft (OGC API Tiles)", sourceId: "slr", fields: ["scenario_ft_32"], titleField: null },
    { id: "flood-fill", title: "Flood hazard (OGC API Tiles)", sourceId: "flood", fields: ["fld_zone", "zone_subty", "sfha_tf", "static_bfe"], titleField: "fld_zone" },
    { id: "buildings-fill", title: "Buildings, z14+ (OGC API Tiles)", sourceId: "buildings", fields: null, titleField: null },
    { id: "roads-line", title: "Roads (OGC API Tiles)", sourceId: "roads", fields: ["fullname", "ownership"], titleField: "fullname" },
    { id: "inspections-points", title: "Field inspections (FeatureServer)", sourceId: "inspections", fields: ["name", "category", "status", "reported_at", "note"], titleField: "name" },
  ];
  var DATA_IDS = DATA_LAYERS.map(function (layer) { return layer.id; });
  var BASEMAP_FILLS = ["basemap-earth", "basemap-water", "basemap-landuse"];

  var app = {
    controller: null,
    map: null,
    basemapLayerIds: [],
    activeBasemap: "bm-streets",
    registry: null,
    zoning: null,
    playback: null,
    timeActive: false,
    popup: null,
    failures: [],
    inspectionCount: 0,
  };

  function el(id) { return document.getElementById(id); }
  function W() { return window.HonuaWebMap; }

  function setStatus(state, text) {
    var node = el("wm-status");
    if (!node) return;
    node.dataset.state = state;
    node.textContent = text;
    node.title = text;
  }

  function toast(text) {
    var node = el("wm-toast");
    if (!node) return;
    node.textContent = text;
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { node.hidden = true; }, 4200);
  }

  function noteFailure(what, detail) {
    app.failures.push(what);
    var note = el("wm-layer-note");
    if (note) note.textContent = "Unavailable right now: " + app.failures.join(", ") + ". The rest of the map is live.";
    if (window.console) window.console.warn("[webmap-app] " + what + ":", detail);
    refreshStatus();
  }

  // One path for every source failure, before or after the map is ready, so an
  // initial layer that never loads stays visibly degraded.
  function recordSourceFailure(sourceId, error) {
    var def = DATA_LAYERS.filter(function (layer) { return layer.sourceId === sourceId; })[0];
    var label = def ? def.title : sourceId ? "source " + sourceId : null;
    if (label && app.failures.indexOf(label) < 0) noteFailure(label, error);
  }

  function watchMapErrors(map) {
    if (!map || map.__wmErrorsWatched) return;
    map.__wmErrorsWatched = true;
    map.on("error", function (event) {
      if (event && event.sourceId) recordSourceFailure(event.sourceId, event.error);
    });
  }

  function refreshStatus() {
    if (!app.map) return;
    if (app.failures.length) setStatus("degraded", "live, degraded: " + app.failures.join(", "));
    else setStatus("ok", "live · demo.honua.io · " + DATA_IDS.length + " layers · " + app.inspectionCount + " inspections");
  }

  /* ── the map package: basemaps + shared Protomaps style + six live layers ── */

  function zoningColor() {
    var X = W();
    // @honua/sdk-js/expr: typed builders for the MapLibre expression. The
    // first digit of the County zone code is the zoning family.
    var branches = ZONING.map(function (c) { return [c.key, c.color]; });
    return X.matchExpr.apply(null, [X.slice(X.coalesce(X.get("zone_code"), ""), 0, 1)].concat(branches, [ZONING_OTHER]));
  }

  function matchOn(field, table, fallback) {
    var X = W();
    var branches = table.map(function (c) { return [c.key, c.color]; });
    return X.matchExpr.apply(null, [X.get(field)].concat(branches, [fallback]));
  }

  function resolveExpression(value) {
    // Expr values serialise to plain MapLibre JSON arrays.
    return value && typeof value.toJSON === "function" ? value.toJSON() : value;
  }

  function buildMapPackage(cfg, inspections) {
    var basemap = cfg && cfg.basemap;
    var bases = (cfg && cfg.bases) || [];
    var imagery = bases.filter(function (b) { return b.id === "imagery"; })[0];
    var terrain = bases.filter(function (b) { return b.id === "terrain"; })[0];
    var sources = {
      zoning: { type: "vector", tiles: [TILES("maui-zoning")], maxzoom: 14, attribution: "County of Maui" },
      slr: { type: "vector", tiles: [TILES("maui-sea-level-rise")], maxzoom: 14, attribution: "Hawaiʻi Climate Commission" },
      flood: { type: "vector", tiles: [TILES("maui-flood-hazard")], maxzoom: 14, attribution: "FEMA NFHL" },
      buildings: { type: "vector", tiles: [TILES("maui-buildings")], minzoom: 14, maxzoom: 14, attribution: "Overture Maps Foundation" },
      roads: { type: "vector", tiles: [TILES("maui-roads")], maxzoom: 14, attribution: "County of Maui" },
      inspections: { type: "geojson", data: inspections, promoteId: "id" },
    };
    var layers = [
      { id: "bm-streets", type: "background", metadata: { title: "Streets", basemap: true }, paint: { "background-color": "#0a1a24" } },
    ];
    if (imagery && imagery.pmtiles) {
      sources.imagery = { type: "raster", url: "pmtiles://" + imagery.pmtiles.proxyUrl, tileSize: 256, attribution: "USDA NAIP" };
      layers.push({ id: "bm-imagery", type: "raster", source: "imagery", metadata: { title: "Imagery", basemap: true }, layout: { visibility: "none" } });
    }
    if (terrain && terrain.hillshade && terrain.hillshade.pmtiles) {
      sources.hillshade = { type: "raster", url: "pmtiles://" + terrain.hillshade.pmtiles.proxyUrl, tileSize: 256, attribution: "USGS 3DEP" };
      layers.push({ id: "bm-hillshade", type: "raster", source: "hillshade", metadata: { title: "Hillshade", basemap: true }, layout: { visibility: "none" } });
    }
    if (basemap && basemap.proxyUrl && basemap.style && basemap.style.layers) {
      sources.basemap = { type: "vector", url: "pmtiles://" + basemap.proxyUrl, attribution: basemap.attribution };
      basemap.style.layers.forEach(function (layer) {
        if (layer.type === "background") return; // the basemap control owns the backdrop
        app.basemapLayerIds.push(layer.id);
        layers.push(Object.assign({}, layer, { metadata: { title: "Basemap: " + layer.id.replace("basemap-", "") } }));
      });
    }
    layers.push(
      { id: "zoning-fill", type: "fill", source: "zoning", "source-layer": "layer", metadata: { title: DATA_LAYERS[0].title }, paint: { "fill-color": resolveExpression(zoningColor()), "fill-opacity": 0.55, "fill-outline-color": "rgba(8,18,28,0.6)" } },
      { id: "slr-fill", type: "fill", source: "slr", "source-layer": "layer", metadata: { title: DATA_LAYERS[1].title }, layout: { visibility: "none" }, paint: { "fill-color": "#f472b6", "fill-opacity": 0.5 } },
      { id: "flood-fill", type: "fill", source: "flood", "source-layer": "layer", metadata: { title: DATA_LAYERS[2].title }, paint: { "fill-color": resolveExpression(matchOn("fld_zone", FLOOD, "#64748b")), "fill-opacity": ["match", ["get", "fld_zone"], "X", 0.12, 0.5] } },
      { id: "buildings-fill", type: "fill", source: "buildings", "source-layer": "layer", minzoom: 14, metadata: { title: DATA_LAYERS[3].title }, paint: { "fill-color": "#cbd5e1", "fill-opacity": 0.75, "fill-outline-color": "#0b1622" } },
      { id: "roads-line", type: "line", source: "roads", "source-layer": "layer", minzoom: 11, metadata: { title: DATA_LAYERS[4].title }, paint: { "line-color": "#5eead4", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.5, 16, 2.5], "line-opacity": 0.8 } },
      { id: "inspections-points", type: "circle", source: "inspections", metadata: { title: DATA_LAYERS[5].title }, paint: { "circle-color": resolveExpression(matchOn("status", STATUS, "#94a3b8")), "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 14, 8], "circle-stroke-color": "#08121c", "circle-stroke-width": 1.5 } }
    );
    var spec = { version: 8, sources: sources, layers: layers };
    if (cfg && cfg.server && cfg.server.glyphs) spec.glyphs = cfg.server.glyphs;
    return {
      mapPackageId: "maui-web-map",
      format: "honua_map_package.v1",
      status: "Ready",
      initialView: HOME,
      legend: [],
      sourceBindings: [],
      mapSpec: spec,
    };
  }

  /* ── live data ── */

  function fetchJson(url) {
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (response) {
      if (!response.ok) throw new Error(url.replace(BASE, "") + " → HTTP " + response.status);
      return response.json();
    });
  }

  function loadInspections() {
    return fetchJson(INSPECTIONS_QUERY).then(function (fc) {
      (fc.features || []).forEach(function (feature) {
        var props = feature.properties || {};
        var t = Date.parse(props.reported_at);
        props.reported_ms = Number.isFinite(t) ? t : null; // numeric time for the playback filter
        feature.properties = props;
      });
      app.inspectionCount = (fc.features || []).length;
      return fc;
    });
  }

  /* ── share-link state: viewport + layers + basemap + filter registry ── */

  function readHashState() {
    var params = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
    var state = {};
    var map = (params.get("map") || "").split(",").map(Number);
    if (map.length === 3 && map.every(Number.isFinite)) state.viewport = { center: [map[0], map[1]], zoom: map[2] };
    if (params.has("layers")) state.layers = params.get("layers").split(",").filter(Boolean);
    if (params.get("basemap")) state.basemap = params.get("basemap");
    if (params.get("filters")) state.filters = W().parseFilterRegistry(params.get("filters"));
    return state;
  }

  function shareUrl() {
    var X = W();
    var state = app.controller.getState();
    var center = app.map.getCenter();
    var params = new URLSearchParams();
    params.set("map", [center.lng.toFixed(5), center.lat.toFixed(5), app.map.getZoom().toFixed(2)].join(","));
    params.set("layers", state.layers.filter(function (layer) { return DATA_IDS.indexOf(layer.id) >= 0 && layer.visible; }).map(function (layer) { return layer.id; }).join(","));
    params.set("basemap", app.activeBasemap);
    var filters = X.serializeFilterRegistry(app.registry.snapshot);
    if (app.registry.snapshot.clauses.length) params.set("filters", filters);
    return window.location.origin + window.location.pathname + "#" + params.toString();
  }

  /* ── controller + elements ── */

  function wireLayerList() {
    var list = el("wm-layers");
    function sync(state) {
      // Show only the operational layers; basemaps live in <honua-basemap-control>.
      list.layers = state.layers.filter(function (layer) { return DATA_IDS.indexOf(layer.id) >= 0; });
    }
    sync(app.controller.getState());
    app.controller.subscribe(sync);
  }

  function applyBasemap(basemapId) {
    app.activeBasemap = basemapId;
    var streets = basemapId === "bm-streets";
    app.basemapLayerIds.forEach(function (id) {
      // Over imagery/hillshade keep roads, boundaries and labels; drop the land/water fills.
      app.controller.setLayerVisibility(id, streets || BASEMAP_FILLS.indexOf(id) < 0);
    });
  }

  function wireLegends() {
    var zoning = el("wm-legend-zoning");
    zoning.entries = [{ title: "Zoning family (County zone code)", layer: "zoning-fill", entries: ZONING.map(function (c) { return { label: c.label, color: c.color, shape: "fill" }; }) }];
    var lines = el("wm-legend-lines");
    lines.entries = [
      { title: "Sea level rise 3.2 ft", layer: "slr-fill", entries: [{ label: "Exposure area", color: "#f472b6", shape: "fill" }] },
      { title: "Roads", layer: "roads-line", entries: [{ label: "Road centerline (z11+)", color: "#5eead4", shape: "line" }] },
      { title: "Buildings", layer: "buildings-fill", entries: [{ label: "Footprint (z14+)", color: "#cbd5e1", shape: "fill" }] },
    ];
  }

  function wireGeocoder() {
    var X = W();
    var search = el("wm-search");
    search.geocoder = new X.HonuaGeocodingClient({
      baseUrl: BASE,
      locatorName: "World",
      timeoutMs: 8000,
      // Bias suggestions toward Maui (GeoServices `location` parameter).
      fetchFn: function (url, init) {
        var biased = String(url) + (String(url).indexOf("?") >= 0 ? "&" : "?") + "location=" + MAUI_BIAS;
        return window.fetch(biased, init);
      },
    });
  }

  function wireChrome() {
    var map = app.map;
    // MapLibre's control CSS does not cross shadow DOM; adopt the vendored
    // stylesheet into the chrome elements that wrap MapLibre controls.
    fetch("assets/vendor/maplibre-gl.css").then(function (r) { return r.text(); }).then(function (css) {
      if (typeof CSSStyleSheet !== "function") return;
      var sheet = new CSSStyleSheet();
      sheet.replaceSync(css + "\nsection{display:block}.maplibregl-ctrl-scale{background:rgba(8,18,28,.6);color:#cbd5e1;border-color:#8aa0b6}.maplibregl-ctrl.maplibregl-ctrl-attrib{background:transparent!important;color:#8aa0b6;font:11px/1.3 'Geist Mono',monospace;padding:0}.maplibregl-ctrl-attrib a{color:#8aa0b6}");
      // <honua-map> itself: popups and markers need MapLibre's base CSS too.
      var mapRoot = el("wm-map").shadowRoot;
      if (mapRoot) {
        var base = new CSSStyleSheet();
        base.replaceSync(css);
        mapRoot.adoptedStyleSheets = [base].concat(mapRoot.adoptedStyleSheets);
      }
      ["wm-zoom", "wm-fullscreen", "wm-scale", "wm-attrib", "wm-compass", "wm-home"].forEach(function (id) {
        var node = el(id);
        if (node && node.shadowRoot) node.shadowRoot.adoptedStyleSheets = node.shadowRoot.adoptedStyleSheets.concat([sheet, chromeButtonSheet()]);
      });
    }).catch(function () { /* unstyled controls still work */ });
    el("wm-zoom").map = map;
    el("wm-fullscreen").map = map;
    el("wm-scale").map = map;
    var attrib = el("wm-attrib");
    attrib.attributions = [ATTRIBUTION];
    attrib.map = map;
    // <honua-compass> and <honua-home> drive a view (the esri-compat view
    // shape: rotation + goTo). This adapter maps that onto the MapLibre map.
    var view = {
      get rotation() { return map.getBearing(); },
      set rotation(value) { map.setBearing(value); },
      goTo: function (target) {
        if (typeof target.rotation === "number") return Promise.resolve(map.rotateTo(target.rotation, { duration: 500 }));
        map.flyTo({ center: target.center || map.getCenter(), zoom: typeof target.zoom === "number" ? target.zoom : map.getZoom(), duration: 900 });
        return Promise.resolve();
      },
    };
    el("wm-compass").view = view;
    var home = el("wm-home");
    home.view = view;
    home.viewpoint = HOME;
    var coords = el("wm-coords");
    map.on("mousemove", function (event) {
      coords.textContent = event.lngLat.lat.toFixed(5) + "°, " + event.lngLat.lng.toFixed(5) + "°  z" + map.getZoom().toFixed(1);
    });
  }

  function chromeButtonSheet() {
    if (chromeButtonSheet.sheet) return chromeButtonSheet.sheet;
    var sheet = new CSSStyleSheet();
    sheet.replaceSync(
      ".maplibregl-ctrl-compass,.maplibregl-ctrl-home{font:500 11px/1 'Geist Mono',monospace;min-height:29px;padding:0 9px;border-radius:4px;border:1px solid #26405a;background:#0f1d2d;color:#e2e8f0;cursor:pointer}" +
      ".maplibregl-ctrl-compass:hover,.maplibregl-ctrl-home:hover{border-color:#38bdf8}.maplibregl-ctrl-group{margin:0}"
    );
    chromeButtonSheet.sheet = sheet;
    return sheet;
  }

  var POPUP_CSS =
    ".wm-popup .maplibregl-popup-content{background:#0f1d2d;color:#e2e8f0;border:1px solid #1e3247;border-radius:10px;padding:10px 12px;min-width:220px;max-width:300px;font:12px/1.4 Geist,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.45)}" +
    ".wm-popup.maplibregl-popup-anchor-bottom .maplibregl-popup-tip{border-top-color:#0f1d2d}.wm-popup.maplibregl-popup-anchor-top .maplibregl-popup-tip{border-bottom-color:#0f1d2d}" +
    ".wm-popup .maplibregl-popup-close-button{color:#8aa0b6;font-size:16px;background:none;border:0;min-height:0}" +
    ".wm-pop__layer{font:600 10px/1 'Geist Mono',monospace;color:#38bdf8;text-transform:uppercase;letter-spacing:.04em}" +
    ".wm-pop__title{font-weight:600;font-size:13px;margin:3px 0 6px}" +
    ".wm-pop dl{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:0}.wm-pop dt{color:#8aa0b6}.wm-pop dd{margin:0;overflow-wrap:anywhere}" +
    ".wm-pop__nav{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font:11px 'Geist Mono',monospace;color:#8aa0b6}" +
    ".wm-pop__nav button{font:inherit;background:#0b1a28;color:#e2e8f0;border:1px solid #1e3247;border-radius:5px;padding:2px 8px;min-height:0;cursor:pointer}" +
    ".wm-pop__nav button:disabled{opacity:.4;cursor:default}";

  function themeMapShadow(mapEl) {
    // <honua-map> ships its own light preview chrome (title bar, zoom, footer).
    // This app replaces it with the map-chrome elements, so hide it and let
    // the canvas fill the element.
    if (!mapEl.shadowRoot || typeof CSSStyleSheet !== "function") return;
    var sheet = new CSSStyleSheet();
    sheet.replaceSync(
      ".map{border:0;border-radius:0;height:100%;min-height:0;grid-template-rows:1fr;background:#0a1a24}" +
      ".map__chrome,.map__footer{display:none}.map__canvas{background:#0a1a24;min-height:0;height:100%}.map__status:empty{display:none}" +
      // The identify popup renders inside this shadow root (the MapLibre
      // container lives there), so its styles must be adopted here too.
      POPUP_CSS
    );
    mapEl.shadowRoot.adoptedStyleSheets = mapEl.shadowRoot.adoptedStyleSheets.concat([sheet]);
  }

  /* ── identify popups across every visible layer ── */

  function formatValue(name, value) {
    if (value === null || value === undefined || value === "") return "—";
    if (name === "reported_at") {
      var t = Date.parse(value);
      if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
    }
    if (name === "status") return String(value).replace(/_/g, " ");
    return String(value);
  }

  function wireIdentify() {
    var X = W();
    var map = app.map;
    app.popup = new window.maplibregl.Popup({ className: "wm-popup", maxWidth: "320px", closeOnClick: false });
    map.on("click", function (event) {
      var measure = el("wm-measure");
      if (measure && measure.mode && measure.mode !== "off") return; // measuring owns the pointer
      var visible = app.controller.getState().layers
        .filter(function (layer) { return layer.visible && DATA_IDS.indexOf(layer.id) >= 0; })
        .map(function (layer) { return layer.id; })
        .filter(function (id) { return map.getLayer(id); });
      X.hitTestMap(map, { type: "click", point: { x: event.point.x, y: event.point.y }, lngLat: [event.lngLat.lng, event.lngLat.lat] }, { layers: visible, tolerance: 4, maxResults: 12 }).then(function (hit) {
        var seen = {};
        var models = [];
        hit.features.forEach(function (feature) {
          var def = DATA_LAYERS.filter(function (layer) { return layer.id === feature.layerId; })[0];
          if (!def) return;
          var key = feature.layerId + ":" + (feature.featureId != null ? feature.featureId : JSON.stringify(feature.properties));
          if (seen[key]) return;
          seen[key] = true;
          var id = feature.featureId != null ? feature.featureId : key;
          var model = X.preparePrimaryDetailModel({
            selection: [id],
            features: [{ id: id, properties: feature.properties }],
            titleField: def.titleField || undefined,
            fields: def.fields || Object.keys(feature.properties).filter(function (name) { return name !== "id"; }).slice(0, 6),
          });
          models.push({ layer: def, model: model });
        });
        if (!models.length) { app.popup.remove(); return; }
        showPopup(event.lngLat, models, 0);
      }).catch(function (error) {
        toast("Identify failed: " + (error && error.message ? error.message : error));
      });
    });
    map.on("mousemove", function (event) {
      var layers = DATA_IDS.filter(function (id) { return map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none"; });
      var hits = layers.length ? map.queryRenderedFeatures(event.point, { layers: layers }) : [];
      map.getCanvas().style.cursor = hits.length ? "pointer" : "";
    });
  }

  function showPopup(lngLat, models, index) {
    var entry = models[index];
    var root = document.createElement("div");
    root.className = "wm-pop";
    var layer = document.createElement("div");
    layer.className = "wm-pop__layer";
    layer.textContent = entry.layer.title;
    var title = document.createElement("div");
    title.className = "wm-pop__title";
    title.textContent = entry.model.title || entry.layer.title.replace(/ \(.*$/, "") + " feature";
    var dl = document.createElement("dl");
    entry.model.fields.forEach(function (field) {
      var dt = document.createElement("dt");
      dt.textContent = field.label;
      var dd = document.createElement("dd");
      dd.textContent = formatValue(field.name, field.value);
      dl.append(dt, dd);
    });
    root.append(layer, title, dl);
    if (models.length > 1) {
      var nav = document.createElement("div");
      nav.className = "wm-pop__nav";
      var prev = document.createElement("button");
      prev.type = "button";
      prev.textContent = "‹";
      prev.setAttribute("aria-label", "Previous result");
      prev.disabled = index === 0;
      prev.addEventListener("click", function () { showPopup(lngLat, models, index - 1); });
      var next = document.createElement("button");
      next.type = "button";
      next.textContent = "›";
      next.setAttribute("aria-label", "Next result");
      next.disabled = index === models.length - 1;
      next.addEventListener("click", function () { showPopup(lngLat, models, index + 1); });
      var count = document.createElement("span");
      count.textContent = index + 1 + " of " + models.length + " layers hit";
      nav.append(prev, count, next);
      root.append(nav);
    }
    app.popup.setLngLat(lngLat).setDOMContent(root).addTo(app.map);
  }

  /* ── filter builder: one registry → MapLibre filters + server where ── */

  function wireFilters(initial) {
    var X = W();
    app.registry = X.createFilterRegistry();
    var island = el("wm-f-island");
    var form = el("wm-filter-form");
    var zoomButton = el("wm-f-zoom");
    var lastExtent = null;
    var token = 0;

    function fldBoxes() { return Array.prototype.slice.call(form.querySelectorAll('input[name="fld"]')); }

    function readForm() {
      if (island.value) {
        app.registry.upsert({ id: "zoning-island", owner: { kind: "control", id: "filter-panel" }, sourceScope: ["zoning"], field: "island", operator: "=", value: island.value, lifecycle: "session" });
      } else app.registry.remove("zoning-island");
      var zones = fldBoxes().filter(function (box) { return box.checked; }).map(function (box) { return box.value; });
      if (zones.length < fldBoxes().length) {
        app.registry.upsert({ id: "flood-zones", owner: { kind: "control", id: "filter-panel" }, sourceScope: ["flood"], field: "fld_zone", operator: "in", value: zones, lifecycle: "session" });
      } else app.registry.remove("flood-zones");
    }

    function writeForm(snapshot) {
      var islandClause = snapshot.clauses.filter(function (c) { return c.id === "zoning-island"; })[0];
      island.value = islandClause ? String(islandClause.value) : "";
      var floodClause = snapshot.clauses.filter(function (c) { return c.id === "flood-zones"; })[0];
      fldBoxes().forEach(function (box) { box.checked = !floodClause || (floodClause.value || []).indexOf(box.value) >= 0; });
    }

    function apply() {
      var snapshot = app.registry.snapshot;
      var zoning = X.projectFilterRegistryToQuery(snapshot, { sourceId: "zoning" });
      var flood = X.projectFilterRegistryToQuery(snapshot, { sourceId: "flood" });
      app.map.setFilter("zoning-fill", zoning.runtimeFilter || null);
      app.map.setFilter("flood-fill", flood.runtimeFilter || null);
      el("wm-f-where").textContent = snapshot.clauses.length
        ? "zoning where: " + (zoning.where || "1=1") + "\nzoning filter: " + JSON.stringify(zoning.runtimeFilter || null) +
          "\nflood filter:  " + JSON.stringify(flood.runtimeFilter || null)
        : "";
      var out = el("wm-f-count");
      out.dataset.state = "";
      // Every application invalidates any in-flight count, including the
      // early returns below: a slow response for an older filter must never
      // overwrite this state or re-enable zoom with an obsolete extent.
      var mine = ++token;
      lastExtent = null;
      if (!snapshot.clauses.length) {
        out.textContent = "No filter applied.";
        zoomButton.disabled = true;
        return;
      }
      if (!zoning.where) {
        out.textContent = "Flood-zone filter applied on the map (tiles only).";
        zoomButton.disabled = true;
        return;
      }
      zoomButton.disabled = true;
      out.textContent = "Counting matching zoning polygons on the server…";
      zoningSource().then(function (source) {
        return source.queryExtent({ where: zoning.where });
      }).then(function (result) {
        if (mine !== token) return;
        lastExtent = result.extent;
        out.textContent = (typeof result.count === "number" ? result.count.toLocaleString("en-US") : "?") + " zoning polygons match (server count via connect().queryExtent).";
        zoomButton.disabled = !lastExtent;
      }).catch(function (error) {
        if (mine !== token) return;
        out.dataset.state = "error";
        out.textContent = "Server count unavailable: " + (error && error.message ? error.message : error) + ". The map filter is still applied.";
        zoomButton.disabled = true;
      });
    }

    form.addEventListener("change", function () { readForm(); apply(); });
    el("wm-f-clear").addEventListener("click", function () {
      app.registry.replace({ version: 1, clauses: [] });
      writeForm(app.registry.snapshot);
      apply();
    });
    zoomButton.addEventListener("click", function () {
      var e = lastExtent;
      if (!e) return;
      var b = e.bbox || [e.xmin, e.ymin, e.xmax, e.ymax];
      if (b.every(Number.isFinite)) app.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, duration: 900 });
    });
    if (initial && initial.clauses.length) {
      app.registry.replace(initial);
      writeForm(app.registry.snapshot);
      apply();
    }
  }

  function zoningSource() {
    if (!app.zoning) {
      app.zoning = W().connect({ endpoint: ZONING_FS, protocol: "auto", authorizationScopeFingerprint: "public", clientOptions: { timeoutMs: 15000 } })
        .then(function (connection) { return connection.source(); })
        .catch(function (error) { app.zoning = null; throw error; });
    }
    return app.zoning;
  }

  /* ── time slider over the inspections ── */

  function wireTime(fc) {
    var X = W();
    var slider = el("wm-time");
    var times = (fc.features || []).map(function (f) { return f.properties.reported_ms; }).filter(Number.isFinite).sort(function (a, b) { return a - b; });
    if (times.length < 2) {
      slider.setAttribute("unavailable-reason", "The inspections layer returned no usable reported_at timestamps.");
      return;
    }
    var DAY = 86400000;
    var start = Math.floor(times[0] / DAY) * DAY;
    var end = Math.ceil((times[times.length - 1] + 1) / DAY) * DAY;
    app.playback = X.createTemporalPlayback({
      extent: [start, end],
      windowMs: 7 * DAY,
      stepMs: DAY,
      frameIntervalMs: 700,
      loop: true,
      layer: { map: app.map, layerIds: ["inspections-points"] },
      timeField: "reported_ms",
    });
    slider.playback = app.playback;
    app.map.setFilter("inspections-points", null); // all dates until the slider is used
    slider.addEventListener("honua-time-change", function () { app.timeActive = true; });
  }

  /* ── swipe compare: two synced maps under <honua-swipe-control> ── */

  function wireCompare(mapPackage) {
    var toggle = el("wm-compare-toggle");
    var panel = el("wm-compare");
    var maps = null;
    var spec = mapPackage.mapSpec;

    function styleFor(ids) {
      var layers = spec.layers.filter(function (layer) { return ids(layer); }).map(function (layer) {
        var copy = Object.assign({}, layer, { layout: Object.assign({}, layer.layout || {}, { visibility: "visible" }) });
        delete copy.metadata;
        return copy;
      });
      return { version: 8, glyphs: spec.glyphs, sources: spec.sources, layers: layers };
    }

    function open() {
      panel.hidden = false;
      var view = { center: app.map.getCenter(), zoom: app.map.getZoom(), bearing: app.map.getBearing() };
      if (!maps) {
        var top = new window.maplibregl.Map(Object.assign({ container: "wm-compare-top", attributionControl: false, style: styleFor(function (l) { return l.id === "bm-streets" || app.basemapLayerIds.indexOf(l.id) >= 0 || l.id === "flood-fill" || l.id === "slr-fill"; }) }, view));
        var bottom = new window.maplibregl.Map(Object.assign({ container: "wm-compare-bottom", attributionControl: false, interactive: false, style: styleFor(function (l) { return l.id === "bm-imagery" || l.id === "basemap-roads-major" || l.id === "basemap-places"; }) }, view));
        top.on("move", function () { bottom.jumpTo({ center: top.getCenter(), zoom: top.getZoom(), bearing: top.getBearing(), pitch: top.getPitch() }); });
        el("wm-swipe").connect(top, bottom);
        maps = { top: top, bottom: bottom };
      } else {
        maps.top.jumpTo(view);
      }
      maps.top.resize();
      maps.bottom.resize();
      toggle.setAttribute("aria-pressed", "true");
      toggle.textContent = "Close compare";
      el("wm-mapwrap").classList.add("wm-comparing");
    }

    function close() {
      if (maps) app.map.jumpTo({ center: maps.top.getCenter(), zoom: maps.top.getZoom(), bearing: maps.top.getBearing() });
      panel.hidden = true;
      el("wm-mapwrap").classList.remove("wm-comparing");
      toggle.setAttribute("aria-pressed", "false");
      toggle.textContent = "Compare";
    }

    toggle.addEventListener("click", function () {
      if (panel.hidden) open(); else close();
    });
  }

  /* ── tabs (page-owned) ── */

  function wireTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.wm-tabs [role="tab"]'));
    function select(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        el(t.getAttribute("aria-controls")).hidden = !on;
      });
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { select(tab); });
      tab.addEventListener("keydown", function (event) {
        var d = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        var next = tabs[(i + d + tabs.length) % tabs.length];
        select(next);
        next.focus();
      });
    });
    var links = document.querySelectorAll('a[href="#wm-pane-filter"]');
    Array.prototype.forEach.call(links, function (link) {
      link.addEventListener("click", function () { select(el("wm-tab-filter")); });
    });
  }

  /* ── the copyable wiring shown in the code strip ── */

  var CODE = [
    '<script src="maplibre-gl.js"></script> <script src="pmtiles.js"></script>',
    '<script src="honua-webmap.min.js"></script>  <!-- @honua/sdk-js 0.2.10 subpaths, see sdk/README.md -->',
    "",
    "import { createHonuaWebComponentController } from \"@honua/sdk-js/web-components\"; // also registers <honua-*>",
    "import { HonuaGeocodingClient } from \"@honua/sdk-js/geocoding\";",
    "import { hitTestMap, preparePrimaryDetailModel } from \"@honua/sdk-js/interactions\";",
    "import { createFilterRegistry, projectFilterRegistryToQuery, serializeFilterRegistry } from \"@honua/sdk-js/filter-registry\";",
    "import { matchExpr, get, slice, coalesce } from \"@honua/sdk-js/expr\";",
    "import { createTemporalPlayback } from \"@honua/sdk-js/map\";",
    "import { connect } from \"@honua/sdk-js\";",
    "",
    "// 1. One controller owns layers, basemaps and the viewport; every element binds to it.",
    "const controller = createHonuaWebComponentController({ mapPackage }); // mapSpec: basemaps + 6 live layers",
    "mapEl.controller = controller;                     // <honua-map id=\"wm-map\">",
    "layerList.layers = state.layers.filter(isOperational); // <honua-layer-list>: toggle, opacity, order",
    "",
    "// 2. Paint and legend from one expression; <honua-legend layer=\"flood-fill\"> derives the rest live.",
    "paint[\"fill-color\"] = matchExpr(slice(coalesce(get(\"zone_code\"), \"\"), 0, 1), [\"0\", \"#e8c862\"], /* … */ \"#4a5a66\").toJSON();",
    "",
    "// 3. Address search: the SDK geocoder plugs straight into <honua-search>.",
    "search.geocoder = new HonuaGeocodingClient({ baseUrl: \"https://demo.honua.io\", locatorName: \"World\" });",
    "",
    "// 4. Identify across every visible layer, one detail model per hit.",
    "map.on(\"click\", async (e) => {",
    "  const hit = await hitTestMap(map, { point: e.point, lngLat: e.lngLat.toArray() }, { layers: visibleLayerIds, tolerance: 4 });",
    "  const models = hit.features.map((f) => preparePrimaryDetailModel({ selection: [target(f)], features: [f], fields }));",
    "  popup.setLngLat(e.lngLat).setDOMContent(render(models)).addTo(map);",
    "});",
    "",
    "// 5. Filters: one registry → MapLibre filter + server where + share-link state.",
    "registry.upsert({ id: \"zoning-island\", sourceScope: [\"zoning\"], field: \"island\", operator: \"=\", value: \"Maui\" });",
    "const { runtimeFilter, where } = projectFilterRegistryToQuery(registry.snapshot, { sourceId: \"zoning\" });",
    "map.setFilter(\"zoning-fill\", runtimeFilter);",
    "const zoning = await (await connect({ endpoint: base + \"/rest/services/maui-zoning/FeatureServer/2\" })).source();",
    "const { count, extent } = await zoning.queryExtent({ where });",
    "location.hash = \"filters=\" + serializeFilterRegistry(registry.snapshot);",
    "",
    "// 6. Time, swipe, measure, chrome.",
    "timeSlider.playback = createTemporalPlayback({ extent, windowMs: 7 * DAY, layer: { map, layerIds: [\"inspections-points\"] }, timeField: \"reported_ms\" });",
    "swipe.connect(topMap, bottomMap);                   // <honua-swipe-control>",
    "zoom.map = fullscreen.map = scaleBar.map = attribution.map = map; // <honua-measurement for=\"wm-map\"> binds itself",
  ];

  /* ── boot ── */

  function boot() {
    wireTabs();
    var code = el("wm-code-body");
    if (code) code.textContent = CODE.join("\n");
    if (!W() || !window.maplibregl) {
      setStatus("error", "SDK or MapLibre bundle failed to load");
      return;
    }
    var hash = {};
    try { hash = readHashState(); } catch (_) { hash = {}; }
    setStatus("boot", "loading live Maui layers from demo.honua.io…");

    var cfg = fetchJson(LAYERS_CONFIG).catch(function (error) { noteFailure("basemap config", error); return null; });
    var inspections = loadInspections().catch(function (error) {
      noteFailure("inspections (FeatureServer)", error);
      return { type: "FeatureCollection", features: [] };
    });

    Promise.all([cfg, inspections]).then(function (res) {
      var mapPackage = buildMapPackage(res[0], res[1]);
      if (hash.viewport) mapPackage.initialView = hash.viewport;
      var mapEl = el("wm-map");
      themeMapShadow(mapEl);
      app.controller = W().createHonuaWebComponentController({ mapPackage: mapPackage });
      wireLayerList();
      wireLegends();
      wireGeocoder();
      el("wm-bookmarks").setAttribute("bookmarks", JSON.stringify([
        { id: "kahului", label: "Kahului", viewport: { center: [-156.47, 20.885], zoom: 13.5 } },
        { id: "lahaina", label: "Lahaina", viewport: { center: [-156.677, 20.875], zoom: 14 } },
        { id: "kihei", label: "Kīhei", viewport: { center: [-156.45, 20.76], zoom: 13 } },
        { id: "molokai", label: "Molokaʻi", viewport: { center: [-157.0, 21.13], zoom: 10.2 } },
      ]));

      mapEl.addEventListener("honua-map-ready", function (event) {
        app.map = (event.detail && event.detail.map) || mapEl.map;
        wireChrome();
        wireIdentify();
        wireFilters(hash.filters);
        wireTime(res[1]);
        wireCompare(mapPackage);
        if (hash.layers) {
          DATA_IDS.forEach(function (id) { app.controller.setLayerVisibility(id, hash.layers.indexOf(id) >= 0); });
        }
        if (hash.basemap && hash.basemap !== "bm-streets" && app.map.getLayer(hash.basemap)) {
          el("wm-basemaps").selectBasemap(hash.basemap);
        }
        watchMapErrors(app.map);
        refreshStatus();
        mapEl.dataset.ready = "true";
      }, { once: true });
      mapEl.addEventListener("honua-map-error", function (event) {
        var message = event.detail && event.detail.message ? event.detail.message : "map error";
        if (window.console) window.console.warn("[webmap-app] honua-map-error:", message, event.detail && event.detail.error);
        var sourceId = event.detail && event.detail.sourceId;
        if (sourceId) recordSourceFailure(sourceId, event.detail.error);
        else if (!app.map) setStatus("error", "map failed to load: " + message);
      });
      document.addEventListener("honua-basemap-change", function (event) {
        if (event.detail && event.detail.basemapId) applyBasemap(event.detail.basemapId);
      });
      // SDK gap seen on 0.2.9 and unchanged in 0.2.10 (reported upstream): the in-memory controller
      // merges a new {center, zoom} into the previous viewport, which still
      // carries the last map bbox, and the runtime prefers bbox, so a
      // search/bookmark viewport alone does not move the map. Fly to the
      // viewport the element reports in its own event.
      function flyToDetail(viewport) {
        if (!app.map || !viewport || !viewport.center) return;
        app.map.flyTo({ center: viewport.center, zoom: typeof viewport.zoom === "number" ? viewport.zoom : app.map.getZoom(), duration: 1200 });
      }
      document.addEventListener("honua-geocode-select", function (event) {
        var c = event.detail && event.detail.candidate;
        if (c) toast("Found: " + c.address);
        flyToDetail(event.detail && event.detail.viewport);
      });
      document.addEventListener("honua-bookmark-change", function (event) {
        flyToDetail(event.detail && event.detail.viewport);
      });
      mapEl.controller = app.controller;
      // <honua-map> creates its MapLibre map before it reports ready; watch
      // tile/source errors from the moment the map exists, not from ready.
      (function waitForMap(tries) {
        if (mapEl.map) watchMapErrors(mapEl.map);
        else if (tries > 0 && !app.map) setTimeout(function () { waitForMap(tries - 1); }, 25);
      })(1200);
    }).catch(function (error) {
      setStatus("error", "could not start: " + (error && error.message ? error.message : error));
    });

    el("wm-share").addEventListener("click", function () {
      if (!app.map) return;
      var url = shareUrl();
      try { window.history.replaceState(null, "", url); } catch (_) { /* file:// */ }
      var done = function () { toast("Link copied: " + url); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { toast("Share link (copy it): " + url); });
      else toast("Share link (copy it): " + url);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

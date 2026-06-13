/*
 * honua.io SDK Controls Gallery — /demo-sdk-controls.html
 *
 * Every built-in control in @honua/sdk-js/controls (the SDK's native,
 * framework-free UI control kit), exercised live on one map. The kit today
 * ships TWO custom elements plus their helpers — this page shows all of it:
 *
 *   Station 1 — <honua-basemap-switcher>: exclusive bases (Map / Imagery /
 *               Terrain from the canonical layers.json contract), wired with
 *               .connect(map) + .bases, driven both by clicks on the real
 *               control and programmatically via .select(id), with the
 *               `change` CustomEvent stream logged live.
 *   Station 2 — <honua-legend>, EXPLICIT sections mode: sections built from
 *               the same palette constants that paint the overlay layers
 *               (one constant, two consumers), with follow-layer-visibility
 *               + auto-refresh demonstrated by per-layer toggles.
 *   Station 3 — <honua-legend>, DERIVE mode (the headline): the element
 *               parses the layer's own categorical paint expression via
 *               deriveLegendEntries(); a palette-shuffle button repaints the
 *               layer and the legend re-derives itself off `styledata` —
 *               map and legend cannot drift. The raw deriveLegendEntries()
 *               output is dumped alongside.
 *   Station 4 — the esri-compat MIGRATION lane, live: a widget GRID wiring
 *               20 of the lane's 77 API-compatible ArcGIS classes (bundled
 *               for this page) against the same MapLibre map through a
 *               duck-typed view — Home, Bookmarks, Swipe (the clip blade),
 *               plus Compass, Zoom, Fullscreen, Expand, BasemapToggle,
 *               ScaleBar, Attribution, Locate, LayerList, both 2D
 *               measurements, Sketch, Popup + PopupTemplate, Print, and
 *               FeatureLayer feeding FeatureTable from the live
 *               FeatureServer. The shims are HEADLESS: they own widget
 *               STATE and EVENT contracts so migrated app code keeps
 *               running; this page paints every pixel.
 *
 * Also exercised: defineHonuaControls() (registration is import-side-effect
 * in the vendored bundle; the call is shown in the code strip), and
 * HonuaBasemapStyleBinding (the engine inside the switcher — narrated, not
 * duplicated). The kit's docs note a layer-list control "to follow"; this
 * page gains a station when it ships.
 *
 * Server dependency is bases-only (PMTiles archives from the shared
 * assets/demo/layers.json contract, probed with HEAD — graceful absence).
 * The legend stations run entirely on bundled page data.
 */
(function () {
  "use strict";

  var SHARED_URL = "assets/demo/layers.json";

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function setStatus(state, text) {
    var pill = el("sc-status");
    if (!pill) return;
    pill.dataset.state = state;
    pill.textContent = text;
  }

  /* ── PMTiles protocol (bases only) ─────────────────────────────── */

  function ensurePMTilesProtocol() {
    if (ensurePMTilesProtocol._registered) return true;
    if (!window.pmtiles || !window.maplibregl) return false;
    try {
      var pmProtocol = new window.pmtiles.Protocol();
      window.maplibregl.addProtocol("pmtiles", pmProtocol.tile);
      ensurePMTilesProtocol._registered = true;
      return true;
    } catch (_e) {
      return false;
    }
  }

  function probeArchive(url) {
    if (!url) return Promise.resolve(false);
    return fetch(url, { method: "HEAD" }).then(
      function (res) {
        return res.ok;
      },
      function () {
        return false;
      }
    );
  }

  function findBaseDef(shared, baseId) {
    var bases = shared.bases || [];
    for (var i = 0; i < bases.length; i++) {
      if (bases[i].id === baseId) return bases[i];
    }
    return null;
  }

  /* Same three exclusive bases as demo.html, built from the same contract. */
  function buildBaseDefinitions(shared, availability) {
    var bm = shared.basemap || {};
    var backgroundLayer = {
      id: "background",
      type: "background",
      paint: { "background-color": shared.map.background },
    };
    var vectorSources = {
      basemap: { type: "vector", url: "pmtiles://" + bm.proxyUrl, attribution: bm.attribution || "" },
    };
    var vectorLayers = ((bm.style && bm.style.layers) || []).map(function (layer) {
      return JSON.parse(JSON.stringify(layer)); // deep copy — the binding owns these objects
    });

    var definitions = [];
    (shared.bases || []).forEach(function (base) {
      if (base.id === "map") {
        if (!availability.basemap) return;
        definitions.push({
          id: "map",
          label: base.label,
          kind: "vector",
          sources: vectorSources,
          layers: [backgroundLayer].concat(vectorLayers),
        });
      } else if (base.id === "imagery") {
        if (!availability.imagery || !base.pmtiles) return;
        definitions.push({
          id: "imagery",
          label: base.label,
          kind: "raster",
          sources: {
            "imagery-base": {
              type: "raster",
              url: "pmtiles://" + base.pmtiles.proxyUrl,
              tileSize: 256,
              attribution: base.attribution || "",
            },
          },
          layers: [
            backgroundLayer,
            { id: "base-imagery", type: "raster", source: "imagery-base", paint: base.paint || {} },
          ],
        });
      } else if (base.id === "terrain") {
        var hs = base.hillshade;
        if (!availability.hillshade || !hs || !hs.pmtiles) return;
        var sources = {
          "hillshade-base": {
            type: "raster",
            url: "pmtiles://" + hs.pmtiles.proxyUrl,
            tileSize: 256,
            attribution: hs.attribution || "",
          },
        };
        var layers = [backgroundLayer];
        if (availability.basemap) {
          sources.basemap = vectorSources.basemap;
          layers = layers.concat(vectorLayers);
        }
        layers.push({ id: "base-hillshade", type: "raster", source: "hillshade-base", paint: hs.paint || {} });
        definitions.push({
          id: "terrain",
          label: base.label,
          kind: "raster-dem-composite",
          sources: sources,
          layers: layers,
        });
      }
    });
    return definitions;
  }

  /* ── Gallery overlays (bundled, illustrative cartography) ───────────
   * Real, recognizable Maui locations so the legend rows mean something —
   * but hand-placed for this page (see the README): NOT a served dataset.
   * ONE palette constant per layer feeds BOTH the paint expression and the
   * explicit legend sections (the kit's "cannot drift" posture). */

  var POINT_KINDS = [
    { kind: "harbor", label: "Harbor", color: "#5fc4a6" },
    { kind: "airfield", label: "Airfield", color: "#e2914e" },
    { kind: "lighthouse", label: "Lighthouse", color: "#e8c862" },
  ];
  var POINT_KINDS_ALT = [
    // the shuffle palette for station 3 — same kinds, different hues
    { kind: "harbor", label: "Harbor", color: "#6aa9dc" },
    { kind: "airfield", label: "Airfield", color: "#d978a8" },
    { kind: "lighthouse", label: "Lighthouse", color: "#a48ad8" },
  ];
  var ROUTE_COLOR = "#d978a8";
  var WATERSHED_FILL = "rgba(85, 184, 138, 0.28)";
  var WATERSHED_OUTLINE = "#7ddfae";

  var GALLERY_POINTS = {
    type: "FeatureCollection",
    features: [
      pt("Kahului Harbor", "harbor", -156.472, 20.8986),
      pt("Lahaina Harbor", "harbor", -156.6776, 20.872),
      pt("Māʻalaea Harbor", "harbor", -156.511, 20.7905),
      pt("Kahului Airport (OGG)", "airfield", -156.4305, 20.8986),
      pt("Hāna Airport", "airfield", -156.0144, 20.7956),
      pt("Kapalua Airport", "airfield", -156.673, 20.9629),
      pt("Nākālele Point Light", "lighthouse", -156.5887, 21.0277),
      pt("McGregor Point Light", "lighthouse", -156.5253, 20.7796),
    ],
  };
  function pt(name, kind, lng, lat) {
    return { type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: { name: name, kind: kind } };
  }

  /* Hāna Highway, simplified to a sketch (illustrative). */
  var GALLERY_ROUTE = {
    type: "Feature",
    properties: { name: "Hāna Highway (sketch)" },
    geometry: {
      type: "LineString",
      coordinates: [
        [-156.466, 20.895],
        [-156.379, 20.917],
        [-156.325, 20.922],
        [-156.247, 20.928],
        [-156.146, 20.865],
        [-156.123, 20.846],
        [-156.084, 20.823],
        [-155.985, 20.758],
      ],
    },
  };

  /* West Maui watershed extent, sketched around Puʻu Kukui (illustrative). */
  var GALLERY_WATERSHED = {
    type: "Feature",
    properties: { name: "West Maui watershed (sketch)" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-156.66, 20.93],
          [-156.6, 20.97],
          [-156.52, 20.95],
          [-156.5, 20.87],
          [-156.58, 20.83],
          [-156.66, 20.86],
          [-156.66, 20.93],
        ],
      ],
    },
  };

  function pointColorMatch(palette) {
    var expr = ["match", ["get", "kind"]];
    palette.forEach(function (entry) {
      expr.push(entry.kind);
      expr.push(entry.color);
    });
    expr.push("#8b97a0");
    return expr;
  }

  var OVERLAYS = [
    {
      id: "gallery-watershed",
      name: "Watershed sketch",
      add: function (map) {
        map.addSource("gallery-watershed", { type: "geojson", data: GALLERY_WATERSHED });
        map.addLayer({
          id: "gallery-watershed",
          type: "fill",
          source: "gallery-watershed",
          paint: { "fill-color": WATERSHED_FILL, "fill-outline-color": WATERSHED_OUTLINE },
        });
      },
    },
    {
      id: "gallery-route",
      name: "Hāna Highway sketch",
      add: function (map) {
        map.addSource("gallery-route", { type: "geojson", data: GALLERY_ROUTE });
        map.addLayer({
          id: "gallery-route",
          type: "line",
          source: "gallery-route",
          paint: { "line-color": ROUTE_COLOR, "line-width": 2.4, "line-dasharray": [3, 1.6] },
        });
      },
    },
    {
      id: "gallery-points",
      name: "Points of interest",
      add: function (map) {
        map.addSource("gallery-points", { type: "geojson", data: GALLERY_POINTS });
        map.addLayer({
          id: "gallery-points",
          type: "circle",
          source: "gallery-points",
          paint: {
            "circle-color": pointColorMatch(POINT_KINDS),
            "circle-radius": 5.5,
            "circle-stroke-color": "#04151a",
            "circle-stroke-width": 1.5,
          },
        });
      },
    },
  ];

  /* Explicit legend sections — built from the SAME constants as the paints. */
  function explicitSections() {
    return [
      {
        title: "West Maui watershed (sketch)",
        layer: "gallery-watershed",
        entries: [{ label: "Forest reserve extent", color: { fill: WATERSHED_FILL, outline: WATERSHED_OUTLINE }, shape: "fill" }],
      },
      {
        title: "Hāna Highway (sketch)",
        layer: "gallery-route",
        entries: [{ label: "Scenic route", color: ROUTE_COLOR, shape: "line" }],
      },
      {
        title: "Points of interest",
        layer: "gallery-points",
        entries: POINT_KINDS.map(function (entry) {
          return { label: entry.label, color: entry.color, shape: "circle" };
        }),
      },
    ];
  }

  /* ── Code strip ─────────────────────────────────────────────────── */

  var ACCENT_RE =
    /\b(HonuaSDK|defineHonuaControls|deriveLegendEntries|HonuaBasemapStyleBinding|connect|select|bases|entries|refresh|addEventListener|setPaintProperty|setLayoutProperty|querySelector|watch|goTo|queryFeatures|measure|execute|locate|create|toggle)\b/g;

  function splitComment(line) {
    var inString = false;
    for (var i = 0; i < line.length - 1; i++) {
      var ch = line.charAt(i);
      if (ch === '"') {
        inString = !inString;
      } else if (!inString && ch === "/" && line.charAt(i + 1) === "/") {
        return [line.slice(0, i), line.slice(i)];
      }
    }
    return [line, ""];
  }

  function highlightLine(line) {
    var parts = splitComment(line);
    var html = "";
    var segments = parts[0].split(/("[^"]*")/);
    for (var i = 0; i < segments.length; i++) {
      if (!segments[i]) continue;
      if (segments[i].charAt(0) === '"') {
        html += '<span class="sc-code-str">' + escapeHtml(segments[i]) + "</span>";
      } else {
        html += escapeHtml(segments[i]).replace(ACCENT_RE, '<span class="sc-code-accent">$1</span>');
      }
    }
    if (parts[1]) {
      html += '<span class="sc-code-comment">' + escapeHtml(parts[1]) + "</span>";
    }
    return html;
  }

  var codeStrip = {
    raw: "",
    set: function (title, code) {
      this.raw = code;
      var titleEl = el("sc-code-title");
      var blockEl = el("sc-code-block");
      if (titleEl) titleEl.textContent = title;
      if (!blockEl) return;
      var lines = code.split("\n");
      var html = "";
      for (var i = 0; i < lines.length; i++) {
        html += highlightLine(lines[i]) + (i < lines.length - 1 ? "\n" : "");
      }
      blockEl.innerHTML = html;
    },
  };

  function attachCopyButton() {
    var btn = el("sc-code-copy");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (!navigator.clipboard || !navigator.clipboard.writeText) return;
      navigator.clipboard.writeText(codeStrip.raw).then(
        function () {
          btn.textContent = "copied";
          setTimeout(function () {
            btn.textContent = "copy";
          }, 1400);
        },
        function () {
          /* clipboard denied — never an error state */
        }
      );
    });
  }

  /* ── Capability sidebar ─────────────────────────────────────────── */

  function renderCapabilities(scene) {
    var list = el("sc-capability-list");
    if (!list) return;
    list.innerHTML = "";
    scene.capabilities.forEach(function (cap) {
      var row = document.createElement("li");
      var label = document.createElement("span");
      label.className = "sc-capability-label";
      label.textContent = cap.label;
      var badge = document.createElement("span");
      badge.className = "sc-ed-badge";
      badge.dataset.edition = cap.edition.toLowerCase();
      badge.textContent = cap.edition;
      row.appendChild(label);
      row.appendChild(badge);
      list.appendChild(row);
    });
  }

  /* ── Station 1: basemap switcher ────────────────────────────────── */

  var switcherStation = {
    logCount: 0,

    logEvent: function (detail) {
      var log = el("sc-event-log");
      if (!log) return;
      this.logCount++;
      var li = document.createElement("li");
      li.innerHTML =
        '<span class="sc-event-n">#' +
        this.logCount +
        "</span> <code>" +
        escapeHtml(
          JSON.stringify({
            value: detail.value,
            previousValue: detail.previousValue,
            kind: detail.kind,
          })
        ) +
        "</code>";
      log.insertBefore(li, log.firstChild);
      while (log.children.length > 6) log.removeChild(log.lastChild);
    },

    renderSelectButtons: function (ctx) {
      var row = el("sc-select-buttons");
      row.innerHTML = "";
      if (!ctx.switcher) return;
      ctx.switcher.bases.forEach(function (base) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sc-btn";
        btn.textContent = 'select("' + base.id + '")';
        btn.addEventListener("click", function () {
          ctx.switcher.select(base.id); // programmatic — fires the same change event
        });
        row.appendChild(btn);
      });
    },

    activate: function (ctx) {
      el("sc-switcher-block").hidden = false;
      this.renderSelectButtons(ctx);
    },
    deactivate: function () {
      el("sc-switcher-block").hidden = true;
    },
  };

  /* ── Station 2: legend, explicit sections ───────────────────────── */

  var explicitStation = {
    wired: false,

    wire: function (ctx) {
      if (this.wired) return;
      var legend = el("sc-legend-explicit");
      if (!legend || typeof legend.connect !== "function") return;
      legend.entries = explicitSections();
      legend.connect(ctx.map);

      var toggles = el("sc-layer-toggles");
      toggles.innerHTML = "";
      OVERLAYS.forEach(function (overlay) {
        var label = document.createElement("label");
        label.className = "sc-toggle";
        var box = document.createElement("input");
        box.type = "checkbox";
        box.checked = true;
        box.addEventListener("change", function () {
          // One layout property write; follow-layer-visibility + auto-refresh
          // do the rest — the matching legend section hides itself.
          ctx.map.setLayoutProperty(overlay.id, "visibility", box.checked ? "visible" : "none");
        });
        var name = document.createElement("span");
        name.textContent = overlay.name;
        label.appendChild(box);
        label.appendChild(name);
        toggles.appendChild(label);
      });
      this.wired = true;
    },

    activate: function (ctx) {
      this.wire(ctx);
      // Station 4's LayerList card can also toggle these layers — re-sync
      // the checkboxes with the map's actual layout state.
      var boxes = el("sc-layer-toggles").querySelectorAll("input");
      OVERLAYS.forEach(function (overlay, index) {
        if (boxes[index]) boxes[index].checked = ctx.map.getLayoutProperty(overlay.id, "visibility") !== "none";
      });
      el("sc-explicit-block").hidden = false;
    },
    deactivate: function () {
      el("sc-explicit-block").hidden = true;
    },
  };

  /* ── Station 3: legend, derive mode ─────────────────────────────── */

  var deriveStation = {
    wired: false,
    altPalette: false,

    dump: function (ctx) {
      var pre = el("sc-derive-dump");
      if (!pre) return;
      try {
        var entries = window.HonuaSDK.deriveLegendEntries(ctx.map, "gallery-points");
        pre.textContent = JSON.stringify(entries, null, 2);
      } catch (error) {
        // HonuaLegendDeriveError — the element fails just as gracefully.
        pre.textContent = "// " + (error && error.message ? error.message : String(error));
      }
    },

    wire: function (ctx) {
      if (this.wired) return;
      var legend = el("sc-legend-derive");
      if (!legend || typeof legend.connect !== "function") return;
      legend.connect(ctx.map); // no .entries assigned — derive mode only
      var self = this;
      el("sc-shuffle").addEventListener("click", function () {
        self.altPalette = !self.altPalette;
        var palette = self.altPalette ? POINT_KINDS_ALT : POINT_KINDS;
        // ONE paint write. The element's auto-refresh hears `styledata` and
        // re-derives — nothing on this page updates the legend by hand.
        ctx.map.setPaintProperty("gallery-points", "circle-color", pointColorMatch(palette));
        self.dump(ctx);
      });
      this.wired = true;
    },

    activate: function (ctx) {
      this.wire(ctx);
      el("sc-derive-block").hidden = false;
      this.dump(ctx);
    },
    deactivate: function () {
      el("sc-derive-block").hidden = true;
    },
  };

  /* ── Station 4: the esri-compat migration lane, exercised live ──────
   * @honua/sdk-js/esri-compat ships 77 API-compatible ArcGIS classes —
   * they are HEADLESS shims preserving widget STATE and EVENT contracts so
   * migrated app code keeps running; the pixels stay the app's (here:
   * MapLibre — this page paints every visible effect). Twenty shims are
   * bundled and run live in the widget grid; the catalog below is the full
   * export surface at the vendored SDK commit (43fe4fa — see
   * assets/vendor/README.md provenance). */
  var COMPAT_CLASSES = [
    "AreaMeasurement2D", "Attribution", "Basemap", "BasemapGallery", "BasemapLayerList", "BasemapToggle",
    "Bookmarks", "ClassBreaksRenderer", "Color", "Compass", "CoordinateConversion", "Directions",
    "DistanceMeasurement2D", "Editor", "Expand", "Extent", "Feature", "FeatureFilter",
    "FeatureForm", "FeatureLayer", "FeatureSet", "FeatureTable", "FeatureTableHighlightIds", "FeatureTemplates",
    "Fullscreen", "GeoJSONLayer", "Graphic", "GraphicsLayer", "GroupLayer", "Home",
    "Identify", "ImageryLayer", "LabelClass", "LayerList", "Legend", "Locate",
    "Map", "MapImageLayer", "MapImageSublayer", "MapView", "MapViewLayerView", "MapViewPopup",
    "MapViewUi", "Measurement", "OAuthInfo", "PictureMarkerSymbol", "Point", "Polygon",
    "Polyline", "Popup", "PopupTemplate", "Print", "Query", "RouteLayer",
    "RouteTask", "ScaleBar", "SceneView", "Search", "SimpleFillSymbol", "SimpleLineSymbol",
    "SimpleMarkerSymbol", "SimpleRenderer", "Sketch", "SpatialReference", "Swipe", "TableList",
    "TextSymbol", "TileLayer", "TimeSlider", "Track", "UniqueValueRenderer", "VectorTileLayer",
    "WFSLayer", "WMSLayer", "WMSSublayer", "WebMap", "Zoom",
  ];

  /* The classes this page actually wires (each one drives, or is driven by,
   * a visible effect on the map). The status pill and the catalog's bold
   * entries are computed from this list against the loaded bundle. */
  var COMPAT_WIRED = [
    "HomeCompat", "BookmarksCompat", "SwipeCompat",
    "CompassCompat", "ZoomCompat", "FullscreenCompat", "ExpandCompat",
    "BasemapToggleCompat", "ScaleBarCompat", "AttributionCompat", "LocateCompat",
    "LayerListCompat", "DistanceMeasurement2DCompat", "AreaMeasurement2DCompat",
    "SketchCompat", "PopupCompat", "PopupTemplateCompat", "PrintCompat",
    "FeatureLayerCompat", "FeatureTableCompat",
  ];

  function liveCompatClasses() {
    return COMPAT_WIRED.filter(function (name) {
      return typeof window.HonuaSDK[name] === "function";
    });
  }

  var EMPTY_FC = { type: "FeatureCollection", features: [] };

  /* GeoJSON micro-helpers for the measurement / sketch / locate paints. */
  function gjPoint(coords, props) {
    return { type: "Feature", properties: props || {}, geometry: { type: "Point", coordinates: coords } };
  }
  function gjLine(coords) {
    return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } };
  }
  function gjRing(coords) {
    return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords.concat([coords[0]])] } };
  }

  var compat = {
    wired: false,
    active: false,
    logCount: 0,
    overlayMap: null,
    swipeWidget: null,
    armedTool: null,
    _onMove: null,

    log: function (type, payload) {
      var log = el("sc-compat-log");
      if (!log) return;
      var text;
      try {
        var seen = [];
        text = JSON.stringify(payload === undefined ? {} : payload, function (_key, value) {
          if (typeof value === "object" && value !== null) {
            if (seen.indexOf(value) !== -1) return "…";
            seen.push(value);
          }
          if (typeof value === "function") return "ƒ";
          return value;
        });
      } catch (_e) {
        text = String(payload);
      }
      if (text && text.length > 110) text = text.slice(0, 109) + "…";
      this.logCount++;
      var li = document.createElement("li");
      li.innerHTML =
        '<span class="sc-event-n">#' +
        this.logCount +
        "</span> <code>" +
        escapeHtml(type + " " + text) +
        "</code>";
      log.insertBefore(li, log.firstChild);
      while (log.children.length > 6) log.removeChild(log.lastChild);
    },

    swipeAvailable: function (ctx) {
      var imagery = findBaseDef(ctx.shared, "imagery");
      return Boolean(ctx.availability.imagery && imagery && imagery.pmtiles);
    },

    ensureOverlay: function (ctx) {
      if (this.overlayMap) return this.overlayMap;
      var imagery = findBaseDef(ctx.shared, "imagery");
      this.overlayMap = new window.maplibregl.Map({
        container: "sc-swipe-map",
        style: {
          version: 8,
          sources: {
            naip: { type: "raster", url: "pmtiles://" + imagery.pmtiles.proxyUrl, tileSize: 256 },
          },
          layers: [
            { id: "bg", type: "background", paint: { "background-color": ctx.shared.map.background } },
            { id: "naip", type: "raster", source: "naip" },
          ],
        },
        center: ctx.map.getCenter(),
        zoom: ctx.map.getZoom(),
        minZoom: ctx.shared.map.minZoom,
        maxZoom: ctx.shared.map.maxZoom,
        interactive: false,
        attributionControl: false, // NAIP attribution rides in the panel footer
      });
      this.overlayMap.on("error", function (event) {
        // same treatment as the main map: transient tile errors are not
        // page errors
        if (console && console.debug) {
          console.debug("maplibre (swipe overlay):", event && event.error ? event.error.message : event);
        }
      });
      return this.overlayMap;
    },

    applyClip: function () {
      var shell = document.querySelector(".sc-map-shell");
      var overlay = el("sc-swipe-overlay");
      var line = el("sc-swipe-line");
      if (!shell || !overlay || !line || !this.swipeWidget) return;
      var x = Math.round((this.swipeWidget.position / 100) * shell.clientWidth);
      overlay.style.clipPath = "inset(0 0 0 " + x + "px)";
      line.style.left = x + "px";
    },

    wire: function (ctx) {
      if (this.wired) return;
      var S = window.HonuaSDK;
      var self = this;
      var map = ctx.map;
      if (!S.HomeCompat || !S.BookmarksCompat || !S.SwipeCompat || !S.CompatEventBus) return; // older bundle

      // The migrated app's "view": anything with goTo() works — the compat
      // shims are duck-typed on purpose. Accessor properties bridge the
      // ArcGIS view contract (center / zoom / rotation as plain mutable
      // properties — ZoomCompat writes view.zoom, CompassCompat writes
      // view.rotation) onto live MapLibre camera calls.
      var bus = new S.CompatEventBus();
      var view = {
        get center() {
          return map.getCenter().toArray();
        },
        set center(value) {
          map.easeTo({ center: value, duration: 600 });
        },
        get zoom() {
          return map.getZoom();
        },
        set zoom(value) {
          map.easeTo({ zoom: value, duration: 250 });
        },
        // ArcGIS rotation is counterclockwise from north; MapLibre bearing
        // is clockwise — the accessors negate.
        get rotation() {
          return ((-map.getBearing()) % 360 + 360) % 360;
        },
        set rotation(value) {
          var current = ((-map.getBearing()) % 360 + 360) % 360;
          if (Math.abs(current - value) < 0.01) return; // state-sync writes must not re-ease
          map.easeTo({ bearing: -value, duration: 700 });
        },
        goTo: function (target) {
          map.easeTo({
            center: target.center || map.getCenter(),
            zoom: typeof target.zoom === "number" ? target.zoom : map.getZoom(),
            duration: 1100,
          });
          bus.emit("view.go-to", { center: target.center, zoom: target.zoom }, view);
          return Promise.resolve();
        },
      };

      // EVERY emission flows through the shared log — this is the exact
      // stream a migrated app subscribes to.
      bus.onAny(function (event) {
        self.log(event.type, event.payload);
      });

      // Home — viewpoint captured at construction, the ArcGIS contract.
      var home = new S.HomeCompat({ view: view, eventBus: bus, viewpoint: { center: [-156.62, 20.88], zoom: 9.6 } });
      el("sc-compat-home").addEventListener("click", function () {
        home.go();
      });

      // Bookmarks — real Maui stops; goTo() flies, watch() highlights.
      var bookmarks = new S.BookmarksCompat({
        view: view,
        eventBus: bus,
        bookmarks: [
          { name: "Lahaina", target: { center: [-156.6776, 20.872], zoom: 13 } },
          { name: "Hāna", target: { center: [-155.985, 20.758], zoom: 12.5 } },
          { name: "Haleakalā", target: { center: [-156.2533, 20.7097], zoom: 11.5 } },
        ],
      });
      var row = el("sc-compat-bookmarks");
      bookmarks.bookmarks.forEach(function (bookmark) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sc-btn";
        btn.dataset.bookmark = bookmark.name;
        btn.textContent = 'goTo("' + bookmark.name + '")';
        btn.addEventListener("click", function () {
          bookmarks.goTo(bookmark.name);
        });
        row.appendChild(btn);
      });
      bookmarks.watch("activeBookmark", function (active) {
        var btns = row.querySelectorAll(".sc-btn");
        for (var i = 0; i < btns.length; i++) {
          btns[i].setAttribute("aria-pressed", active && btns[i].dataset.bookmark === active.name ? "true" : "false");
        }
      });
      bookmarks.load();

      // Swipe — the shim owns position state + events; this page paints the
      // blade (a clipped, camera-synced follower map showing NAIP imagery).
      var slider = el("sc-compat-swipe");
      var sliderVal = el("sc-compat-swipe-val");
      if (this.swipeAvailable(ctx)) {
        this.swipeWidget = new S.SwipeCompat({ view: view, eventBus: bus, position: Number(slider.value) });
        this.swipeWidget.load();
        slider.addEventListener("input", function () {
          self.swipeWidget.setPosition(Number(slider.value)); // ArcGIS API in…
        });
        this.swipeWidget.watch("position", function (position) {
          sliderVal.textContent = String(position); // …watch contract out
          self.applyClip();
        });
      } else {
        slider.disabled = true;
        el("sc-compat-swipe-pending").hidden = false;
      }

      /* ── The widget grid: scratch paint first. The shims own none of
       * these pixels — measurement working geometry, completed sketches,
       * the locate marker, and the table-selection halo are all painted by
       * this page from shim STATE. ── */
      map.addSource("sc-measure", { type: "geojson", data: EMPTY_FC });
      map.addSource("sc-sketch", { type: "geojson", data: EMPTY_FC });
      map.addSource("sc-locate", { type: "geojson", data: EMPTY_FC });
      map.addSource("sc-table-highlight", { type: "geojson", data: EMPTY_FC });
      var GRID_LAYERS = [
        { id: "sc-measure-fill", type: "fill", source: "sc-measure", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "rgba(106, 169, 220, 0.22)" } },
        { id: "sc-measure-line", type: "line", source: "sc-measure", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": "#6aa9dc", "line-width": 2, "line-dasharray": [2, 1.4] } },
        { id: "sc-measure-pts", type: "circle", source: "sc-measure", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#6aa9dc", "circle-radius": 4, "circle-stroke-color": "#04151a", "circle-stroke-width": 1.2 } },
        { id: "sc-sketch-fill", type: "fill", source: "sc-sketch", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "rgba(217, 120, 168, 0.22)" } },
        { id: "sc-sketch-line", type: "line", source: "sc-sketch", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": "#d978a8", "line-width": 2 } },
        { id: "sc-sketch-pts", type: "circle", source: "sc-sketch", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#d978a8", "circle-radius": 5, "circle-stroke-color": "#04151a", "circle-stroke-width": 1.4 } },
        { id: "sc-table-halo", type: "circle", source: "sc-table-highlight", paint: { "circle-color": "rgba(232, 200, 98, 0.25)", "circle-radius": 11, "circle-stroke-color": "#e8c862", "circle-stroke-width": 1.6 } },
        { id: "sc-locate-dot", type: "circle", source: "sc-locate", paint: { "circle-color": "#6aa9dc", "circle-radius": 6, "circle-stroke-color": "#eaf3f5", "circle-stroke-width": 2 } },
      ];
      GRID_LAYERS.forEach(function (layer) {
        map.addLayer(layer);
      });
      this.gridLayerIds = GRID_LAYERS.map(function (layer) {
        return layer.id;
      });

      // ── Compass — bearing ↔ orientation state; the card IS the compass.
      var compass = new S.CompassCompat({ view: view, eventBus: bus });
      var needle = el("sc-compass-needle");
      var compassOut = el("sc-compass-out");
      function renderCompass() {
        var bearing = map.getBearing();
        if (needle) needle.style.transform = "rotate(" + -bearing + "deg)";
        if (compassOut) compassOut.textContent = (((-bearing) % 360 + 360) % 360).toFixed(0) + "°";
      }
      map.on("rotate", renderCompass);
      map.on("rotateend", function () {
        compass.rotateTo(view.rotation); // state follows the map; the guarded setter makes this a no-op write
      });
      el("sc-compass-reset").addEventListener("click", function () {
        compass.goToNorth(); // the ArcGIS contract — writes view.rotation = 0
      });
      el("sc-compass-spin").addEventListener("click", function () {
        // a page action (labeled as such) so the state-follows-map lane is visible
        map.easeTo({ bearing: (map.getBearing() + 60) % 360, duration: 700 });
      });
      renderCompass();

      // ── Zoom — zoomIn()/zoomOut() write view.zoom; the accessor eases the map.
      var zoom = new S.ZoomCompat({ view: view, eventBus: bus });
      var zoomVal = el("sc-zoom-val");
      function renderZoom() {
        zoomVal.textContent = "zoom " + map.getZoom().toFixed(2);
      }
      map.on("zoom", renderZoom);
      el("sc-zoom-in").addEventListener("click", function () {
        zoom.zoomIn();
      });
      el("sc-zoom-out").addEventListener("click", function () {
        zoom.zoomOut();
      });
      renderZoom();

      // ── Fullscreen — the shim owns `active`; the page requests real
      // fullscreen on the map shell and marks it (the marker is the
      // guaranteed visible effect where the Fullscreen API is unavailable).
      var shell = document.querySelector(".sc-map-shell");
      var fullscreen = new S.FullscreenCompat({ view: view, element: shell, eventBus: bus });
      var fsOut = el("sc-fs-out");
      fullscreen.watch("active", function (active) {
        fsOut.textContent = "active: " + active;
        if (shell) shell.dataset.scFullscreen = active ? "true" : "false";
        if (active) {
          if (shell && shell.requestFullscreen) shell.requestFullscreen().catch(function () {});
        } else if (document.fullscreenElement) {
          document.exitFullscreen().catch(function () {});
        }
      });
      document.addEventListener("fullscreenchange", function () {
        if (!document.fullscreenElement && fullscreen.active) fullscreen.exit(); // Esc — sync the shim
      });
      el("sc-fs-toggle").addEventListener("click", function () {
        fullscreen.toggle();
      });

      // ── Expand — expanded state shows/hides the card's panel section.
      var expand = new S.ExpandCompat({ view: view, eventBus: bus, content: "#sc-expand-content" });
      var expandContent = el("sc-expand-content");
      var expandOut = el("sc-expand-out");
      expand.watch("expanded", function (expanded) {
        expandContent.hidden = !expanded;
        expandOut.textContent = "expanded: " + expanded;
      });
      el("sc-expand-toggle").addEventListener("click", function () {
        expand.toggle();
      });
      expand.load();

      // ── BasemapToggle — toggles map ⇄ imagery THROUGH the page's real
      // basemap switcher; switcher-driven changes flow back into shim state
      // over the bus ("map.basemap-changed", the shim's own contract).
      var bmBtn = el("sc-bmtoggle-btn");
      var bmOut = el("sc-bmtoggle-out");
      if (ctx.switcher && ctx.availability.imagery) {
        var basemapShim = { basemap: ctx.switcher.value };
        var basemapToggle = new S.BasemapToggleCompat({
          view: view,
          map: basemapShim,
          nextBasemap: ctx.switcher.value === "imagery" ? "map" : "imagery",
          eventBus: bus,
        });
        var applyBasemap = function (active) {
          bmOut.textContent = "active: " + active;
          if (active && ctx.switcher.value !== active) ctx.switcher.select(active);
        };
        basemapToggle.watch("activeBasemap", applyBasemap);
        bmBtn.addEventListener("click", function () {
          basemapToggle.toggle();
        });
        ctx.switcher.addEventListener("change", function (event) {
          var value = event.detail && event.detail.value;
          if (!value || value === basemapToggle.activeBasemap) return;
          // someone else drove the switcher — shim state follows via the bus
          basemapShim.basemap = value;
          basemapToggle.nextBasemap =
            event.detail.previousValue && event.detail.previousValue !== value
              ? event.detail.previousValue
              : value === "imagery"
                ? "map"
                : "imagery";
          bus.emit("map.basemap-changed", { basemap: value }, ctx.switcher);
        });
        applyBasemap(ctx.switcher.value);
      } else {
        bmBtn.disabled = true;
        el("sc-bmtoggle-pending").hidden = false;
      }

      // ── ScaleBar — zoom → {scale, text} state; also refreshes itself off
      // the bus "view.go-to" emissions (Home / Bookmarks / Locate flights).
      var scalebar = new S.ScaleBarCompat({ view: view, unit: "dual", eventBus: bus });
      var scalebarOut = el("sc-scalebar-out");
      scalebar.watch("text", function (text) {
        scalebarOut.textContent = text || "—";
      });
      map.on("zoomend", function () {
        scalebar.refresh();
      });
      scalebar.load(); // onLoad refreshes — first text lands through the watch above

      // ── Attribution — seeded with the page's real data credits.
      var attribution = new S.AttributionCompat({
        view: view,
        eventBus: bus,
        attributions: ["© OpenStreetMap contributors · Protomaps", "USDA NAIP", "USGS 3DEP"],
      });
      var attrOut = el("sc-attr-out");
      attribution.watch("text", function (text) {
        attrOut.textContent = text;
      });
      attrOut.textContent = attribution.getText();
      var attrBtn = el("sc-attr-add");
      attrBtn.addEventListener("click", function () {
        attribution.addAttribution("demo.honua.io");
        attrBtn.disabled = true;
      });

      // ── Locate — real geolocation when the browser grants it; otherwise
      // the provider resolves a documented SIMULATED position over Kahului
      // and the card says so. The shim's locate() flies the view either way.
      var SIMULATED_POSITION = { coords: { latitude: 20.8893, longitude: -156.4729, accuracy: 250 } };
      var locateSimulated = false;
      var locate = new S.LocateCompat({
        view: view,
        zoom: 12,
        eventBus: bus,
        locateProvider: function () {
          locateSimulated = false;
          return new Promise(function (resolve) {
            var geo = navigator.geolocation;
            var settled = false;
            var fallback = function () {
              if (settled) return;
              settled = true;
              locateSimulated = true;
              resolve(SIMULATED_POSITION);
            };
            if (!geo || typeof geo.getCurrentPosition !== "function") {
              fallback();
              return;
            }
            var timer = setTimeout(fallback, 4000);
            geo.getCurrentPosition(
              function (position) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve({
                  coords: {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                  },
                });
              },
              function () {
                clearTimeout(timer);
                fallback();
              }
            );
          });
        },
      });
      var locateOut = el("sc-locate-out");
      locate.watch("lastPosition", function (position) {
        if (!position) return;
        var coords = position.coords;
        locateOut.textContent =
          coords.latitude.toFixed(4) +
          ", " +
          coords.longitude.toFixed(4) +
          (locateSimulated ? " · simulated — geolocation unavailable here; this is Kahului" : "");
        var src = map.getSource("sc-locate");
        if (src) {
          src.setData({
            type: "FeatureCollection",
            features: [gjPoint([coords.longitude, coords.latitude], { simulated: locateSimulated })],
          });
        }
      });
      el("sc-locate-btn").addEventListener("click", function () {
        locate.locate().catch(function () {
          /* provider never rejects; belt and braces */
        });
      });

      // ── LayerList — the three gallery overlays behind the shim's
      // items/toggle API; its "layer.visibility-changed" bus event is the
      // ONLY thing that writes the map's layout property.
      var overlayLayers = OVERLAYS.map(function (overlay) {
        return { id: overlay.id, title: overlay.name, visible: true };
      });
      var layerList = new S.LayerListCompat({ map: { layers: overlayLayers }, eventBus: bus, includeHidden: true });
      bus.on("layer.visibility-changed", function (event) {
        var payload = event.payload || {};
        var isOverlay = overlayLayers.some(function (layer) {
          return layer.id === payload.layerId;
        });
        if (!isOverlay) return; // FeatureLayerCompat shares this event type
        map.setLayoutProperty(payload.layerId, "visibility", payload.visible ? "visible" : "none");
      });
      var layerListRows = el("sc-layerlist-rows");
      function renderLayerList(items) {
        layerListRows.innerHTML = "";
        items.forEach(function (item) {
          var row = document.createElement("button");
          row.type = "button";
          row.className = "sc-llrow";
          row.dataset.layer = String(item.id);
          row.setAttribute("aria-pressed", item.visible ? "true" : "false");
          row.textContent = item.title;
          row.addEventListener("click", function () {
            layerList.toggle(item.id);
          });
          layerListRows.appendChild(row);
        });
      }
      layerList.watch("items", renderLayerList);
      layerList.load();

      // ── Measurements + Sketch share one map-click dispatcher (one armed
      // tool at a time). The shims do the math / own the graphics list; the
      // page draws the working geometry.
      var distance = new S.DistanceMeasurement2DCompat({ view: view, eventBus: bus, unit: "kilometers" });
      var area = new S.AreaMeasurement2DCompat({ view: view, eventBus: bus, unit: "square-kilometers" });
      distance.watch("lastMeasurement", function (m) {
        if (m) el("sc-dist-out").textContent = m.value.toFixed(2) + " km · geodesic";
      });
      area.watch("lastMeasurement", function (m) {
        if (m) el("sc-area-out").textContent = m.value.toFixed(2) + " km²";
      });

      var sketchLayer = {
        graphics: [],
        add: function (graphic) {
          this.graphics.push(graphic);
          refreshSketchSource();
        },
        remove: function (graphic) {
          var index = this.graphics.indexOf(graphic);
          if (index < 0) return undefined;
          this.graphics.splice(index, 1);
          refreshSketchSource();
          return graphic;
        },
      };
      var sketch = new S.SketchCompat({ view: view, layer: sketchLayer, eventBus: bus });
      function refreshSketchSource() {
        var src = map.getSource("sc-sketch");
        if (src) src.setData({ type: "FeatureCollection", features: sketchLayer.graphics });
        el("sc-sketch-out").textContent =
          sketchLayer.graphics.length + " graphic" + (sketchLayer.graphics.length === 1 ? "" : "s");
      }
      el("sc-sketch-clear").addEventListener("click", function () {
        if (sketchLayer.graphics.length === 0) return;
        sketch.delete(sketchLayer.graphics.slice()); // shim removes via the layer contract
      });

      var clickPts = [];
      var toolButtons = {
        distance: el("sc-dist-arm"),
        area: el("sc-area-arm"),
        point: el("sc-sketch-point"),
        polyline: el("sc-sketch-line"),
        polygon: el("sc-sketch-poly"),
      };
      function setProvisional(features) {
        var src = map.getSource("sc-measure");
        if (src) src.setData({ type: "FeatureCollection", features: features });
      }
      function renderWorking(tool, pts) {
        var features = pts.map(function (p) {
          return gjPoint(p);
        });
        if (pts.length >= 2) features.push(gjLine(pts));
        if ((tool === "area" || tool === "polygon") && pts.length >= 3) features.push(gjRing(pts));
        setProvisional(features);
      }
      function applyArm(tool, keepDrawing) {
        if (sketch.state === "active") sketch.cancel();
        self.armedTool = tool;
        clickPts = [];
        if (!keepDrawing) setProvisional([]);
        Object.keys(toolButtons).forEach(function (key) {
          toolButtons[key].setAttribute("aria-pressed", key === tool ? "true" : "false");
        });
        el("sc-area-finish").disabled = tool !== "area";
        el("sc-sketch-finish").disabled = tool !== "polyline" && tool !== "polygon";
        map.getCanvas().style.cursor = tool ? "crosshair" : "";
        if (tool === "point" || tool === "polyline" || tool === "polygon") {
          sketch.create(tool); // the ArcGIS create() contract — sketch.create-started on the bus
        }
      }
      this.disarm = function () {
        applyArm(null, false);
      };
      Object.keys(toolButtons).forEach(function (key) {
        toolButtons[key].addEventListener("click", function () {
          applyArm(self.armedTool === key ? null : key, false);
        });
      });
      el("sc-area-finish").addEventListener("click", function () {
        if (self.armedTool !== "area" || clickPts.length < 3) return;
        area.measure(clickPts.slice()); // ArcGIS API in — area state out
        renderWorking("area", clickPts);
        applyArm(null, true); // keep the measured ring on screen
      });
      el("sc-sketch-finish").addEventListener("click", function () {
        var tool = self.armedTool;
        if (tool !== "polyline" && tool !== "polygon") return;
        var min = tool === "polyline" ? 2 : 3;
        if (clickPts.length < min) return;
        var feature = tool === "polyline" ? gjLine(clickPts.slice()) : gjRing(clickPts.slice());
        sketch.complete(feature); // shim appends it through the duck-typed layer → page repaints
        applyArm(null, false);
      });

      // ── Popup + PopupTemplate — click a gallery point; the template
      // interpolates {field} tokens, the popup owns visible/location/title
      // state, MapLibre paints the bubble.
      var popupTemplate = new S.PopupTemplateCompat({
        title: "{name}",
        content: "{kind} · a gallery point at {lng}, {lat}",
        outFields: ["name", "kind"],
        eventBus: bus,
      });
      var popup = new S.PopupCompat({ view: view, eventBus: bus });
      this.popupWidget = popup;
      var mlPopup = null;
      function renderPopup() {
        if (popup.visible && popup.location) {
          if (!mlPopup) {
            mlPopup = new window.maplibregl.Popup({
              closeButton: false,
              closeOnClick: false,
              className: "sc-ml-popup",
              maxWidth: "240px",
            });
          }
          mlPopup
            .setLngLat(popup.location)
            .setHTML(
              '<p class="sc-ml-popup-title">' +
                escapeHtml(popup.title || "") +
                '</p><p class="sc-ml-popup-body">' +
                escapeHtml(String(popup.content || "")) +
                "</p>"
            )
            .addTo(map);
          el("sc-popup-out").textContent = popup.title || "—";
        } else if (mlPopup) {
          mlPopup.remove();
          el("sc-popup-out").textContent = "—";
        }
      }
      popup.watch("visible", renderPopup);
      popup.watch("location", renderPopup);
      el("sc-popup-close").addEventListener("click", function () {
        popup.close();
      });
      function handlePopupClick(event) {
        var bbox = [
          [event.point.x - 6, event.point.y - 6],
          [event.point.x + 6, event.point.y + 6],
        ];
        var hits = map.queryRenderedFeatures(bbox, { layers: ["gallery-points"] });
        if (!hits.length) return;
        var feature = hits[0];
        var coords = feature.geometry.coordinates.slice();
        var attrs = {
          name: feature.properties.name,
          kind: feature.properties.kind,
          lng: coords[0].toFixed(4),
          lat: coords[1].toFixed(4),
        };
        popup.open({
          location: coords,
          features: [{ attributes: attrs }],
          title: popupTemplate.getTitle(attrs), // "{name}" interpolated by the shim
          content: popupTemplate.getContent(attrs),
        });
      }

      // One dispatcher; the armed tool decides who consumes the click.
      map.on("click", function (event) {
        if (!self.active) return;
        var tool = self.armedTool;
        if (!tool) {
          handlePopupClick(event);
          return;
        }
        clickPts.push([event.lngLat.lng, event.lngLat.lat]);
        if (tool === "distance") {
          renderWorking(tool, clickPts);
          if (clickPts.length === 2) {
            distance.measure(clickPts.slice()); // ArcGIS API in — haversine state out
            applyArm(null, true); // keep the measured segment on screen
          }
        } else if (tool === "area") {
          renderWorking(tool, clickPts);
          el("sc-area-finish").disabled = clickPts.length < 3;
        } else if (tool === "point") {
          sketch.complete(gjPoint(clickPts[0])); // a point completes on the first click
          applyArm(null, false);
        } else {
          renderWorking(tool, clickPts); // polyline / polygon vertices
        }
      });

      // ── FeatureLayer → FeatureTable — constructed against the LIVE
      // FeatureServer (read-only; the canonical layers.json contract).
      // load() pulls metadata, queryFeatureCount() the total, and the
      // table's refresh() runs the layer's real queryFeatures().
      var featureLayer = new S.FeatureLayerCompat({
        url: "https://demo.honua.io/rest/services/maui-place-names/FeatureServer/6",
        title: "Maui place names",
        outFields: ["*"],
        eventBus: bus,
        client: new S.HonuaClient({
          baseUrl: "https://demo.honua.io",
          // SDK calls options.fetchFn unbound; bare window.fetch throws
          fetchFn: window.fetch.bind(window),
        }),
      });
      var featureTable = new S.FeatureTableCompat({ layer: featureLayer, eventBus: bus, pageSize: 8 });
      var flOut = el("sc-fl-out");
      featureLayer.watch("loadStatus", function (status) {
        flOut.textContent = "loadStatus: " + status;
      });
      var tableEl = el("sc-ft-table");
      function pickTableColumns(attributes) {
        var keys = Object.keys(attributes);
        var preferred = ["name", "NAME", "feature_class", "class", "county"];
        var cols = preferred.filter(function (k) {
          return keys.indexOf(k) !== -1;
        });
        keys.forEach(function (k) {
          if (cols.length >= 2 || cols.indexOf(k) !== -1) return;
          if (/^(objectid|oid|fid|id)$/i.test(k)) return;
          cols.push(k);
        });
        return cols.slice(0, 2);
      }
      function renderTable() {
        var rows = featureTable.rows.slice(0, 8);
        if (!rows.length) {
          el("sc-ft-out").textContent = "0 rows";
          return;
        }
        var cols = pickTableColumns(rows[0].attributes);
        var html = "<thead><tr><th>oid</th>";
        cols.forEach(function (c) {
          html += "<th>" + escapeHtml(c) + "</th>";
        });
        html += "</tr></thead><tbody>";
        rows.forEach(function (row) {
          html += '<tr data-oid="' + row.objectId + '"><td>' + row.objectId + "</td>";
          cols.forEach(function (c) {
            var v = row.attributes[c];
            html += "<td>" + escapeHtml(v === undefined || v === null ? "" : String(v)) + "</td>";
          });
          html += "</tr>";
        });
        html += "</tbody>";
        tableEl.innerHTML = html;
        el("sc-ft-out").textContent = "rows 1–" + rows.length + " of " + featureTable.size + ' · queryFeatures(where: "1=1")';
      }
      tableEl.addEventListener("click", function (event) {
        var tr = event.target && event.target.closest ? event.target.closest("tr[data-oid]") : null;
        if (!tr) return;
        featureTable.selectRows([Number(tr.dataset.oid)]); // highlightIds → selection-changed on the bus
      });
      featureTable.watch("highlightIds", function (ids) {
        var trs = tableEl.querySelectorAll("tr[data-oid]");
        for (var i = 0; i < trs.length; i++) {
          trs[i].classList.toggle("sc-row-selected", ids.indexOf(Number(trs[i].dataset.oid)) !== -1);
        }
        // flash the selected place on the map (the page owns the pixels)
        var row = ids.length ? featureTable.findRowByObjectId(ids[0]) : null;
        var src = map.getSource("sc-table-highlight");
        if (!src) return;
        var geom = row && row.geometry;
        if (geom && typeof geom.x === "number" && typeof geom.y === "number" && Math.abs(geom.x) <= 180 && Math.abs(geom.y) <= 90) {
          src.setData({ type: "FeatureCollection", features: [gjPoint([geom.x, geom.y])] });
        } else {
          src.setData(EMPTY_FC);
        }
      });
      featureLayer
        .load()
        .then(function () {
          el("sc-fl-fields").textContent = featureLayer.listFields().length + " fields";
          return featureLayer.queryFeatureCount({ where: "1=1" });
        })
        .then(function (count) {
          el("sc-fl-count").textContent = count.toLocaleString("en-US") + " features";
          return featureTable.refresh();
        })
        .then(renderTable)
        .catch(function (error) {
          flOut.textContent = "FeatureServer unreachable — " + (error && error.message ? error.message : error);
          el("sc-ft-out").textContent = "table waits for the live layer";
        });

      // ── Print — the shim carries the export REQUEST contract (template
      // state + execute events); no print server in this demo, so the page
      // fulfils the job from the live canvas on the next painted frame.
      var print = new S.PrintCompat({
        view: view,
        eventBus: bus,
        printServiceUrl: "client:canvas",
        templateOptions: { title: "sdk-controls-gallery", format: "png32", layout: "map-only", dpi: 96 },
      });
      bus.on("print.execute-completed", function (event) {
        var job = event.payload || {};
        map.once("render", function () {
          try {
            var dataUrl = map.getCanvas().toDataURL("image/png");
            var link = el("sc-print-link");
            link.href = dataUrl;
            link.download = (job.title || "map-export") + ".png";
            link.hidden = false;
            el("sc-print-out").textContent = "png32 · " + Math.round((dataUrl.length * 3) / 4 / 1024) + " KB";
          } catch (_e) {
            el("sc-print-out").textContent = "canvas export unavailable";
          }
        });
        map.triggerRepaint();
      });
      el("sc-print-btn").addEventListener("click", function () {
        print.execute();
      });

      // ── Catalog — the full surface, with this page's wirings in bold.
      var wiredSet = {};
      liveCompatClasses().forEach(function (name) {
        wiredSet[name] = true;
      });
      el("sc-compat-catalog-list").innerHTML =
        COMPAT_CLASSES.map(function (name) {
          var cls = name + "Compat";
          return wiredSet[cls] ? '<strong class="sc-live">' + cls + "</strong>" : cls;
        }).join(" · ") +
        ' — 77 classes; <strong class="sc-live">bold</strong> = wired live on this page; @honua/sdk-js/esri-compat (plus esriConfig/esriRequest/IdentityManager helpers)';
      this.wired = true;
    },

    setGridLayersVisible: function (ctx, visible) {
      var ids = this.gridLayerIds || [];
      for (var i = 0; i < ids.length; i++) {
        ctx.map.setLayoutProperty(ids[i], "visibility", visible ? "visible" : "none");
      }
    },

    activate: function (ctx) {
      this.wire(ctx);
      this.active = true;
      el("sc-compat-block").hidden = false;
      this.setGridLayersVisible(ctx, true);
      // The blade contrasts NAIP against the vector base — if the user left
      // the switcher on Imagery, drop back to Map (a real change event,
      // logged by station 1 like any other).
      if (this.swipeWidget && ctx.switcher && ctx.switcher.value === "imagery") {
        ctx.switcher.select("map");
      }
      if (this.swipeWidget) {
        el("sc-swipe-overlay").hidden = false;
        el("sc-swipe-line").hidden = false;
        this.ensureOverlay(ctx);
        var self = this;
        this._onMove = function () {
          self.overlayMap.jumpTo({
            center: ctx.map.getCenter(),
            zoom: ctx.map.getZoom(),
            bearing: ctx.map.getBearing(),
            pitch: ctx.map.getPitch(),
          });
        };
        ctx.map.on("move", this._onMove);
        this.overlayMap.resize();
        this._onMove();
        this.applyClip();
      }
    },

    deactivate: function (ctx) {
      this.active = false;
      el("sc-compat-block").hidden = true;
      el("sc-swipe-overlay").hidden = true;
      el("sc-swipe-line").hidden = true;
      if (this._onMove) ctx.map.off("move", this._onMove);
      if (this.disarm) this.disarm(); // no armed measure/sketch tool off-station
      if (this.popupWidget && this.popupWidget.visible) this.popupWidget.close();
      if (this.wired) this.setGridLayersVisible(ctx, false); // the grid's scratch paint is station-scoped
    },
  };

  /* ── Stations (scenes pattern) ──────────────────────────────────── */

  var SCENES = [
    {
      id: "switcher",
      name: "Basemap switcher",
      caption:
        "<honua-basemap-switcher> — an accessible radio group over exclusive base definitions. Click the control top-right, use the arrow keys on it, or drive it from code below; every path fires the same change event.",
      camera: { center: [-156.62, 20.88], zoom: 9.6 },
      needsBases: true,
      capabilities: [
        { label: "Native UI controls (basemap switcher) — @honua/sdk-js/controls, Apache-2.0", edition: "Community" },
        { label: "Raster + vector tiles for the bases — static PMTiles range proxy", edition: "Community" },
      ],
      code: function () {
        return [
          "// importing @honua/sdk-js/controls registers the elements — or explicitly:",
          "defineHonuaControls(); // <honua-basemap-switcher> + <honua-legend>",
          'const switcher = document.querySelector("honua-basemap-switcher");',
          "switcher.connect(map);           // any MapLibre Map — duck-typed, no import",
          "switcher.bases = [mapBase, imageryBase, terrainBase]; // exclusive by contract",
          'switcher.addEventListener("change", (e) => log(e.detail)); // {value, previousValue, kind}',
          'switcher.select("imagery");      // programmatic path — same event, same binding',
          "// under the hood: HonuaBasemapStyleBinding owns base sources/layers and",
          "// keeps them beneath every overlay — hillshade and imagery can never stack",
        ].join("\n");
      },
      enter: function (ctx) {
        switcherStation.activate(ctx);
      },
      exit: function () {
        switcherStation.deactivate();
      },
    },
    {
      id: "legend-explicit",
      name: "Legend — explicit",
      caption:
        "<honua-legend> with explicit sections: rows come from the same palette constants that paint the layers. Toggle a layer off and its section hides itself — follow-layer-visibility plus auto-refresh, no page code in the loop.",
      camera: { center: [-156.35, 20.88], zoom: 9.6 },
      needsBases: false,
      capabilities: [
        { label: "Native UI controls (legend, explicit sections) — @honua/sdk-js/controls", edition: "Community" },
      ],
      code: function () {
        return [
          "// one palette constant, two consumers — paint and legend cannot drift",
          "legend.entries = [",
          '  { title: "West Maui watershed (sketch)", layer: "gallery-watershed",',
          '    entries: [{ label: "Forest reserve extent", shape: "fill",',
          '      color: { fill: "rgba(85,184,138,0.28)", outline: "#7ddfae" } }] },',
          '  { title: "Points of interest", layer: "gallery-points", entries: kinds }];',
          "legend.connect(map);",
          "// follow-layer-visibility + auto-refresh — this one line hides the section:",
          'map.setLayoutProperty("gallery-route", "visibility", "none");',
        ].join("\n");
      },
      enter: function (ctx) {
        explicitStation.activate(ctx);
      },
      exit: function () {
        explicitStation.deactivate();
      },
    },
    {
      id: "legend-derive",
      name: "Legend — derive",
      caption:
        "<honua-legend> in derive mode, the kit's headline: no entries are assigned — the element parses the layer's own match expression. Shuffle the palette and watch the legend re-derive itself from styledata.",
      camera: { center: [-156.35, 20.88], zoom: 9.6 },
      needsBases: false,
      capabilities: [
        { label: "Native UI controls (legend, derive mode + deriveLegendEntries) — @honua/sdk-js/controls", edition: "Community" },
      ],
      code: function () {
        return [
          '// markup only — no entries assigned, just a layer id to read:',
          '// <honua-legend layer="gallery-points" layer-title="…" auto-refresh />',
          "// the element parses the categorical paint expression itself:",
          '"circle-color": ["match", ["get", "kind"],',
          '  "harbor", "#5fc4a6", "airfield", "#e2914e", "lighthouse", "#e8c862", "#8b97a0"]',
          "// repaint the layer — auto-refresh re-derives off styledata:",
          'map.setPaintProperty("gallery-points", "circle-color", shuffled);',
          'const entries = deriveLegendEntries(map, "gallery-points"); // same parser, as data',
        ].join("\n");
      },
      enter: function (ctx) {
        deriveStation.activate(ctx);
      },
      exit: function () {
        deriveStation.deactivate();
      },
    },
    {
      id: "compat",
      name: "Esri-compat",
      caption:
        "The migration lane, live: a grid of 20 ArcGIS widget wirings — Home, Bookmarks, Swipe plus Compass, Zoom, Fullscreen, Expand, BasemapToggle, ScaleBar, Attribution, Locate, LayerList, both 2D measurements, Sketch, Popup + PopupTemplate, Print, and FeatureLayer feeding FeatureTable from the live FeatureServer — all running unchanged against this MapLibre map through @honua/sdk-js/esri-compat. The headless shims keep widget state and events; this page paints every pixel.",
      camera: { center: [-156.47, 20.89], zoom: 12.6 },
      needsBases: false,
      capabilities: [
        { label: "ArcGIS JS API compatibility — @honua/sdk-js/esri-compat, 20 of 77 classes wired live (Apache-2.0)", edition: "Community" },
        { label: "FeatureServer queries (place names) — live Honua server, read-only", edition: "Community" },
        { label: "Raster tiles (NAIP) under the swipe blade — static PMTiles range proxy", edition: "Community" },
      ],
      code: function () {
        return [
          "// migrated ArcGIS widget code — running against MapLibre, unchanged:",
          'const distance = new DistanceMeasurement2D({ view, unit: "kilometers" });',
          "distance.measure([a, b]);                     // → lastMeasurement {value, unit}",
          'const layer = new FeatureLayer({ url: ".../maui-place-names/FeatureServer/6" });',
          "const table = new FeatureTable({ layer });    // refresh() runs queryFeatures()",
          'sketch.create("polygon"); await print.execute(); // state + events in, pixels yours',
          "// 20 of the lane's 77 API-compatible classes wired live on this page",
        ].join("\n");
      },
      enter: function (ctx) {
        compat.activate(ctx);
      },
      exit: function (ctx) {
        compat.deactivate(ctx);
      },
    },
  ];

  var activeScene = null;

  function setActiveChip(sceneId) {
    var chips = document.querySelectorAll(".sc-scene-chip");
    for (var i = 0; i < chips.length; i++) {
      chips[i].setAttribute("aria-pressed", chips[i].dataset.scene === sceneId ? "true" : "false");
    }
  }

  function applyScene(ctx, scene, opts) {
    opts = opts || {};
    if (activeScene && activeScene.exit) activeScene.exit(ctx);
    activeScene = scene;

    if (opts.camera !== false) {
      ctx.map.easeTo({
        center: scene.camera.center,
        zoom: scene.camera.zoom,
        pitch: 0,
        bearing: 0,
        duration: opts.instant ? 0 : 1200,
      });
    }

    el("sc-scene-caption").textContent = scene.caption;
    var pending = scene.needsBases && !ctx.switcher;
    el("sc-scene-pending").hidden = !pending;

    renderCapabilities(scene);
    codeStrip.set("// @honua/sdk-js/controls — “" + scene.name + "”", scene.code(ctx));
    setActiveChip(scene.id);

    // Stations stay informative even when the bases are absent: station 1's
    // event log just stays empty until archives are seeded.
    if (scene.enter) scene.enter(ctx);
  }

  function renderScenes(ctx) {
    var nav = el("sc-scene-list");
    nav.innerHTML = "";
    SCENES.forEach(function (scene) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "sc-scene-chip";
      chip.dataset.scene = scene.id;
      chip.setAttribute("aria-pressed", "false");
      chip.textContent = scene.name;
      chip.addEventListener("click", function () {
        applyScene(ctx, scene);
      });
      nav.appendChild(chip);
    });
  }

  /* ── Bootstrap ──────────────────────────────────────────────────── */

  function collapsePanelsOnSmallScreens() {
    if (window.innerWidth >= 900) return;
    var codeStripEl = el("sc-code-strip");
    var capabilitiesEl = el("sc-capabilities");
    if (codeStripEl) codeStripEl.open = false;
    if (capabilitiesEl) capabilitiesEl.open = false;
  }

  function bootstrap() {
    if (!window.maplibregl || !window.pmtiles || !window.HonuaSDK) {
      setStatus("error", "demo assets failed to load");
      return;
    }

    collapsePanelsOnSmallScreens();
    attachCopyButton();

    fetch(SHARED_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load " + SHARED_URL);
        return res.json();
      })
      .then(function (shared) {
        ensurePMTilesProtocol();

        var ctx = { shared: shared, switcher: null };

        var map = new window.maplibregl.Map({
          container: "sc-map",
          style: {
            version: 8,
            glyphs: shared.server.glyphs,
            sources: {},
            layers: [{ id: "background", type: "background", paint: { "background-color": shared.map.background } }],
          },
          center: [-156.62, 20.88],
          zoom: 9.6,
          minZoom: shared.map.minZoom,
          maxZoom: shared.map.maxZoom,
          attributionControl: { compact: false },
        });
        map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
        map.addControl(new window.maplibregl.ScaleControl({ unit: "imperial" }));
        map.on("error", function (event) {
          if (console && console.debug) {
            console.debug("maplibre:", event && event.error ? event.error.message : event);
          }
        });
        ctx.map = map;

        setStatus("probing", "checking demo.honua.io…");

        var imagery = findBaseDef(shared, "imagery");
        var terrainBase = findBaseDef(shared, "terrain");
        var probes = Promise.all([
          probeArchive(shared.basemap && shared.basemap.proxyUrl),
          probeArchive(imagery && imagery.pmtiles && imagery.pmtiles.proxyUrl),
          probeArchive(terrainBase && terrainBase.hillshade && terrainBase.hillshade.pmtiles && terrainBase.hillshade.pmtiles.proxyUrl),
        ]);
        var mapReady = new Promise(function (resolve) {
          map.on("load", resolve);
        });

        return Promise.all([probes, mapReady]).then(function (results) {
          var availability = { basemap: results[0][0], imagery: results[0][1], hillshade: results[0][2] };
          ctx.availability = availability; // stations read this (compat swipe blade)

          // Station 1's exhibit: the real switcher, wired exactly as demo.html
          // wires it. With zero seeded bases it hides itself (its documented
          // empty state) and the pending note explains why.
          var switcher = el("sc-basemap-switcher");
          if (switcher && typeof switcher.connect === "function") {
            var definitions = buildBaseDefinitions(shared, availability);
            switcher.addEventListener("change", function (event) {
              switcherStation.logEvent(event.detail || {});
            });
            if (definitions.length > 0) {
              switcher.connect(map);
              switcher.bases = definitions;
              ctx.switcher = switcher;
            } else {
              switcher.style.display = "none";
            }
          }

          // Gallery overlays — bundled data, always present, above any base.
          OVERLAYS.forEach(function (overlay) {
            overlay.add(map);
          });

          renderScenes(ctx);
          applyScene(ctx, SCENES[0], { instant: true });

          var basesLive = [availability.basemap, availability.imagery, availability.hillshade].filter(Boolean).length;
          var elements = ["honua-basemap-switcher", "honua-legend"].filter(function (tag) {
            return Boolean(window.customElements && window.customElements.get(tag));
          });
          var compatLive = liveCompatClasses().length;
          if (basesLive === 0) {
            setStatus(
              "waiting",
              elements.length + " native controls · " + compatLive + " esri-compat shims live · 0 of 3 base archives seeded"
            );
          } else {
            setStatus(
              "live",
              "demo.honua.io · " + elements.length + " native controls + " + compatLive + " esri-compat shims live · " + basesLive + " of 3 base archives"
            );
          }
        });
      })
      .catch(function (error) {
        setStatus("error", "demo failed to start: " + (error && error.message ? error.message : error));
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();

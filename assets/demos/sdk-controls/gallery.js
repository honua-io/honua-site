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
 *   Station 4 — the esri-compat MIGRATION lane, live: HomeCompat,
 *               BookmarksCompat, and SwipeCompat (3 of the lane's 77
 *               API-compatible ArcGIS classes, bundled for this page) drive
 *               the same MapLibre map through a duck-typed goTo() view —
 *               widget state and events preserved, pixels stay the app's.
 *               SwipeCompat's position state paints a real clip blade.
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
    /\b(HonuaSDK|defineHonuaControls|deriveLegendEntries|HonuaBasemapStyleBinding|connect|select|bases|entries|refresh|addEventListener|setPaintProperty|setLayoutProperty|querySelector)\b/g;

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
   * they preserve widget STATE and EVENT contracts so migrated app code
   * keeps running; the pixels stay the app's (here: MapLibre). Three shims
   * are bundled and run live (Home, Bookmarks, Swipe); the catalog below is
   * the full export surface at the vendored SDK commit (43fe4fa — see
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

  var compat = {
    wired: false,
    logCount: 0,
    overlayMap: null,
    swipeWidget: null,
    _onMove: null,

    log: function (type, payload) {
      var log = el("sc-compat-log");
      if (!log) return;
      this.logCount++;
      var li = document.createElement("li");
      li.innerHTML =
        '<span class="sc-event-n">#' +
        this.logCount +
        "</span> <code>" +
        escapeHtml(type + " " + JSON.stringify(payload || {})) +
        "</code>";
      log.insertBefore(li, log.firstChild);
      while (log.children.length > 5) log.removeChild(log.lastChild);
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
      if (!S.HomeCompat || !S.BookmarksCompat || !S.SwipeCompat || !S.CompatEventBus) return; // older bundle

      // The migrated app's "view": anything with goTo() works — the compat
      // shims are duck-typed on purpose. Ours maps goTo targets to easeTo.
      var bus = new S.CompatEventBus();
      var view = {
        center: ctx.map.getCenter().toArray(),
        zoom: ctx.map.getZoom(),
        goTo: function (target) {
          ctx.map.easeTo({
            center: target.center || ctx.map.getCenter(),
            zoom: typeof target.zoom === "number" ? target.zoom : ctx.map.getZoom(),
            duration: 1100,
          });
          return Promise.resolve();
        },
      };

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

      // Every emission a migrated app could subscribe to, logged live.
      ["home.go", "bookmarks.go-to", "swipe.position-changed"].forEach(function (type) {
        bus.on(type, function (event) {
          // Listeners receive the bus envelope {type, payload, source}; log
          // just the payload (and for bookmarks, just the name) to keep the
          // panel readable.
          var payload = event && event.payload !== undefined ? event.payload : event;
          self.log(type, payload && payload.bookmark ? { bookmark: payload.bookmark.name } : payload);
        });
      });

      el("sc-compat-catalog-list").textContent =
        COMPAT_CLASSES.map(function (name) {
          return name + "Compat";
        }).join(" · ") + " — 77 classes; @honua/sdk-js/esri-compat (plus esriConfig/esriRequest/IdentityManager helpers)";
      this.wired = true;
    },

    activate: function (ctx) {
      this.wire(ctx);
      el("sc-compat-block").hidden = false;
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
      el("sc-compat-block").hidden = true;
      el("sc-swipe-overlay").hidden = true;
      el("sc-swipe-line").hidden = true;
      if (this._onMove) ctx.map.off("move", this._onMove);
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
        "The migration lane, live: ArcGIS widget code — Home, Bookmarks, Swipe — running unchanged against this MapLibre map through @honua/sdk-js/esri-compat. 77 API-compatible classes preserve widget state and events; the pixels stay yours.",
      camera: { center: [-156.47, 20.89], zoom: 12.6 },
      needsBases: false,
      capabilities: [
        { label: "ArcGIS JS API compatibility — @honua/sdk-js/esri-compat, 77 classes (Apache-2.0)", edition: "Community" },
        { label: "Raster tiles (NAIP) under the swipe blade — static PMTiles range proxy", edition: "Community" },
      ],
      code: function () {
        return [
          "// migrated ArcGIS app code — running against MapLibre, unchanged:",
          "const home = new Home({ view, viewpoint });        // esri-compat shims",
          'const bookmarks = new Bookmarks({ view, bookmarks: [{ name: "Hāna", … }] });',
          'await bookmarks.goTo("Hāna");                      // same API, same events',
          "const swipe = new Swipe({ view, position: 50 });",
          'swipe.watch("position", (p) => blade.style.clipPath = inset(p)); // state in, pixels yours',
          "// 77 API-compatible classes — contracts preserved, DOM stays the app's",
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
          var compatLive = ["HomeCompat", "BookmarksCompat", "SwipeCompat"].filter(function (name) {
            return typeof window.HonuaSDK[name] === "function";
          }).length;
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

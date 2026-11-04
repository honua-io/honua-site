/*
 * honua.io "Maui in 3D" demo — Overture building extrusions + USGS 3DEP
 * terrain over Maui, rendered 2.5D with MapLibre GL.
 *
 * Data access goes through the official Honua JS SDK (@honua/sdk-js):
 *   - window.HonuaSDK      (assets/vendor/honua-sdk.min.js — shared bundle:
 *                           client, dataset queries, controls, errors)
 *   - window.HonuaSceneSDK (assets/demos/maui-3d/honua-sdk-scene.min.js —
 *                           page-scoped bundle of @honua/sdk-js
 *                           scene-workspace: renderer-neutral scene
 *                           primitives + the MapLibre 2.5D adapter)
 * MapLibre GL (window.maplibregl) does pure rendering.
 *
 * WHY 2.5D (and not Cesium): the SDK ships a Cesium scene adapter and Honua
 * Server ships a Community-edition 3D Tiles route (/scenes/{id}/tileset.json),
 * but the live demo server has no published scene tileset and no
 * quantized-mesh terrain route — Cesium can't drape our terrarium PMTiles.
 * Rather than fake terrain or stream someone else's globe, this page renders
 * the honest path: the SAME renderer-neutral scene primitives
 * (elevation-source + extrusion) applied through the SDK's MapLibre adapter.
 * A Cesium adapter reads these primitives unchanged the day a scene tileset
 * is published.
 *
 * Endpoints come from TWO contracts:
 *   - assets/demo/layers.json          (shared: basemap, bases, glyphs, DEM)
 *   - assets/demos/maui-3d/config.json (page: maui-buildings, fixture, scenes)
 * Nothing here hardcodes a Honua path; code-strip snippets render FROM config.
 *
 * DUAL LANE (graceful absence):
 *   - live:    maui-buildings MVT from Honua's OGC API Tiles route (probed
 *              via SDK layer metadata), extruded by `render_height`.
 *   - sample:  ~200 real Kahului footprints from the same Overture extract,
 *              bundled as GeoJSON — the page stays fully interactive offline.
 * Terrain and each exclusive base are probed independently (HEAD on the
 * PMTiles range proxy) and drop out gracefully when unseeded.
 *
 * Attribution (required): Overture Maps Foundation · © OpenStreetMap
 * contributors (buildings, ODbL) — carried on both lanes' sources so the
 * MapLibre attribution control always shows it while buildings render.
 */
(function () {
  "use strict";

  var CONFIG_URL = "assets/demos/maui-3d/config.json";

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
    var pill = el("m3d-status");
    if (!pill) return;
    pill.dataset.state = state;
    pill.textContent = text;
  }

  function setChip(id, state, text) {
    var chip = el(id);
    if (!chip) return;
    chip.dataset.state = state;
    chip.textContent = text;
  }

  function isNotFound(error) {
    var S = window.HonuaSDK;
    return S.isHonuaError(error) && error instanceof S.HonuaHttpError && (error.statusCode === 404 || error.statusCode === 400);
  }

  function isUnreachable(error) {
    var S = window.HonuaSDK;
    return (S.isHonuaError(error) && error instanceof S.HonuaNetworkError) || error instanceof TypeError;
  }

  /* ── PMTiles protocol (basemap + DEM archives via the range proxy) ── */
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

  /* ── Extrusion cartography (ONE constant, TWO consumers) ───────────
   * The ramp paints the fill-extrusion AND writes the legend note, so the
   * map and its legend cannot drift. Stops chosen for the dark base:
   * 4 m default footprints stay muted, mid-rise reads teal, the few tall
   * structures (harbor cranes, hotels, the hospital) go warm. */
  var HEIGHT_RAMP = [
    { stop: 4, color: "#3d6276", label: "4 m (default)" },
    { stop: 18, color: "#5fc4a6", label: "18 m" },
    { stop: 45, color: "#e8c862", label: "45 m+" },
  ];

  function heightRampExpression(field) {
    var expr = ["interpolate", ["linear"], ["get", field]];
    HEIGHT_RAMP.forEach(function (s) {
      expr.push(s.stop);
      expr.push(s.color);
    });
    return expr;
  }

  function renderLegendNote(field) {
    var note = el("m3d-legend-note");
    if (!note) return;
    note.hidden = false;
    note.innerHTML =
      "extrusion height + color = <code>" +
      escapeHtml(field) +
      "</code> · " +
      HEIGHT_RAMP.map(function (s) {
        return '<span class="m3d-swatch" style="background:' + s.color + '"></span>' + escapeHtml(s.label);
      }).join(" ");
  }

  /* ── Exclusive bases — same SDK control + definitions as demo.html ──
   * Map / Imagery / Terrain(hillshade composite) from the SHARED contract,
   * each HEAD-probed; the SDK's <honua-basemap-switcher> guarantees exactly
   * one base renders at a time. */
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

  function probeBaseArchives(shared) {
    var bm = shared.basemap || {};
    var imagery = findBaseDef(shared, "imagery");
    var terrainBase = findBaseDef(shared, "terrain");
    return Promise.all([
      probeArchive(bm.proxyUrl),
      probeArchive(imagery && imagery.pmtiles && imagery.pmtiles.proxyUrl),
      probeArchive(terrainBase && terrainBase.hillshade && terrainBase.hillshade.pmtiles && terrainBase.hillshade.pmtiles.proxyUrl),
    ]).then(function (results) {
      return { basemap: results[0], imagery: results[1], hillshade: results[2] };
    });
  }

  function buildBaseDefinitions(shared, availability, background) {
    var bm = shared.basemap || {};
    var backgroundLayer = { id: "background", type: "background", paint: { "background-color": background } };
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
          layers: [backgroundLayer, { id: "base-imagery", type: "raster", source: "imagery-base", paint: base.paint || {} }],
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
        definitions.push({ id: "terrain", label: base.label, kind: "raster-dem-composite", sources: sources, layers: layers });
      }
    });
    return definitions;
  }

  var baseChangeFromScene = false;
  var activeSwitcher = null;

  function setupBasemapSwitcher(map, shared, availability, background) {
    var switcher = el("m3d-basemap-switcher");
    if (!switcher || typeof switcher.connect !== "function") return null;
    var definitions = buildBaseDefinitions(shared, availability, background);
    if (definitions.length === 0) {
      switcher.style.display = "none";
      return null;
    }
    switcher.addEventListener("change", function () {
      if (!baseChangeFromScene) setActiveChip(null);
    });
    baseChangeFromScene = true;
    try {
      switcher.connect(map);
      switcher.bases = definitions; // activates the first base ("map")
    } finally {
      baseChangeFromScene = false;
    }
    return switcher;
  }

  function selectBase(switcher, baseId) {
    if (!switcher || !baseId) return;
    baseChangeFromScene = true;
    try {
      if (!switcher.select(baseId)) switcher.select("map");
    } finally {
      baseChangeFromScene = false;
    }
  }

  /* ── Runtime state ─────────────────────────────────────────────── */

  var runtime = {
    lane: "probing", // "live" | "sample" | "absent"
    terrain: false, // terrarium DEM applied
    buildingsLayerId: null, // style layer id of the extrusion
    buildingsSource: null, // SDK contract Source (live lane only)
    buildingsArchive: null, // pmtiles proxyUrl when extrusions stream from the static MVT archive
    dem: null, // { sourceId, url, encoding, maxzoom, exaggeration, attribution }
    orbitFrame: null,
  };

  /* ── Scene-workspace primitives (the SDK 2.5D runtime path) ───────
   * Renderer-neutral primitives; HonuaSceneSDK.applyMapLibreScenePrimitives
   * diagnoses them against MAPLIBRE_SCENE_CAPABILITIES and applies terrain +
   * fill-extrusion. The vector/geojson buildings SOURCE is added first (the
   * adapter owns terrain sources, not feature sources). */

  function demPrimitive(config, shared) {
    var demLayer = null;
    for (var i = 0; i < (shared.layers || []).length; i++) {
      if (shared.layers[i].id === "terrain") demLayer = shared.layers[i];
    }
    if (!demLayer || !demLayer.pmtiles || !demLayer.pmtiles.proxyUrl) return null;
    return {
      kind: "elevation-source",
      id: "maui-dem",
      sourceId: "src-terrain-dem",
      protocol: "raster-dem",
      url: "pmtiles://" + demLayer.pmtiles.proxyUrl,
      encoding: demLayer.pmtiles.encoding || "terrarium",
      tileSize: 256,
      exaggeration: (config.terrain && config.terrain.exaggeration) || 1.15,
      attribution: demLayer.attribution || "USGS 3DEP",
      _proxyUrl: demLayer.pmtiles.proxyUrl,
    };
  }

  function extrusionPrimitive(config, sourceId, sourceLayerName) {
    var b = config.buildings;
    var primitive = {
      kind: "extrusion",
      id: "lyr-buildings",
      sourceId: sourceId,
      layerId: "lyr-buildings",
      height: ["get", b.renderHeightField],
      base: 0,
      color: heightRampExpression(b.renderHeightField),
      opacity: 0.85,
      attribution: b.attribution,
    };
    if (sourceLayerName) primitive.sourceLayer = sourceLayerName;
    return primitive;
  }

  function applyScenePrimitives(map, primitives) {
    var Scene = window.HonuaSceneSDK;
    var result = Scene.applyMapLibreScenePrimitives(map, primitives);
    result.diagnostics.forEach(function (d) {
      if (d.severity !== "info" && console && console.debug) {
        console.debug("scene-primitive:", d.code, d.message);
      }
    });
    return result;
  }

  /* ── Buildings lanes ───────────────────────────────────────────── */

  function probeBuildings(client, config) {
    var svc = config.buildings.service;
    return client.getLayerMetadata(svc.serviceId, svc.layerId).then(
      function (meta) {
        if (meta && meta.error) return { available: false, failure: "not-seeded" };
        return { available: true };
      },
      function (error) {
        return {
          available: false,
          failure: isNotFound(error) ? "not-seeded" : isUnreachable(error) ? "unreachable" : "error",
        };
      }
    );
  }

  function addLiveBuildings(map, config, shared, primitives, useArchive) {
    var b = config.buildings;
    if (useArchive) {
      // Pre-baked static MVT archive (tippecanoe) via the Honua range proxy:
      // extrusion geometry streams as S3 byte ranges — no ST_AsMVT, no
      // database. Zoom range (12–14) comes from the archive header. The
      // dynamic OGC Tiles route in b.tiles stays as the documented
      // live-rendering fallback.
      map.addSource("src-buildings", {
        type: "vector",
        url: "pmtiles://" + b.pmtiles.proxyUrl,
        attribution: b.attribution,
      });
    } else {
      map.addSource("src-buildings", {
        type: "vector",
        tiles: [shared.server.baseUrl + b.tiles.tileTemplate],
        minzoom: typeof b.tiles.minzoom === "number" ? b.tiles.minzoom : 0,
        maxzoom: typeof b.tiles.maxzoom === "number" ? b.tiles.maxzoom : 14,
        attribution: b.attribution,
      });
    }
    primitives.push(
      extrusionPrimitive(
        config,
        "src-buildings",
        useArchive && b.pmtiles.sourceLayer ? b.pmtiles.sourceLayer : b.tiles.sourceLayer
      )
    );
  }

  function addSampleBuildings(map, config, fixture, primitives) {
    map.addSource("src-buildings", {
      type: "geojson",
      data: fixture,
      attribution: config.buildings.attribution,
    });
    primitives.push(extrusionPrimitive(config, "src-buildings", null));
  }

  function loadFixture(config) {
    return fetch(config.buildings.fixture.url).then(function (res) {
      if (!res.ok) throw new Error("fixture " + res.status);
      return res.json();
    });
  }

  /* ── Scenes ───────────────────────────────────────────────────────
   * Each scene = camera + caption + the SDK calls behind it (code strip) +
   * the server capabilities it exercises (sidebar; edition labels mirror
   * pricing.html — every protocol surface used here is Community). */

  var SCENES = [
    {
      id: "kahului",
      name: "Kahului Harbor",
      caption:
        "Maui's deep-draft harbor and commercial core, extruded from Overture footprints — warehouses, the mall, and the harbor cranes rise by their real height attributes (render_height: measured height, else floors × 3 m, else 4 m).",
      base: "map",
      camera: { center: [-156.472, 20.896], zoom: 14.6, pitch: 58, bearing: -28 },
      orbit: false,
      capabilities: [
        { label: "Vector tiles (MVT) — static PMTiles range proxy", edition: "Community" },
        { label: "Live MVT rendering — OGC API Tiles", edition: "Community" },
        { label: "Scene runtime primitives — @honua/sdk-js scene-workspace, MapLibre 2.5D adapter", edition: "Community" },
        { label: "Terrain tiles — terrarium DEM, static PMTiles range proxy", edition: "Community" },
      ],
      code: function (config, shared) {
        var b = config.buildings;
        var archiveLayer = (b.pmtiles && b.pmtiles.sourceLayer) || b.tiles.sourceLayer;
        var lines = runtime.buildingsArchive
          ? [
              "// buildings stream as pre-baked MVT byte ranges (no database)",
              'map.addSource("buildings", { type: "vector",',
              '  url: "pmtiles://' + runtime.buildingsArchive + '" });',
              "// live alternative: " + b.tiles.tileTemplate + " (rendered per request)",
              "// renderer-neutral scene primitives through the SDK's MapLibre adapter",
              "HonuaSceneSDK.applyMapLibreScenePrimitives(map, [",
            ]
          : [
              "// buildings arrive as MVT from Honua's OGC API Tiles route",
              'map.addSource("buildings", { type: "vector",',
              '  tiles: ["' + shared.server.baseUrl + b.tiles.tileTemplate + '"] });',
              "// renderer-neutral scene primitives through the SDK's MapLibre adapter",
              "// (a Cesium adapter consumes these same primitives unchanged)",
              "HonuaSceneSDK.applyMapLibreScenePrimitives(map, [",
            ];
        if (runtime.dem) {
          lines.push('  { kind: "elevation-source", sourceId: "terrain-dem", protocol: "raster-dem",');
          lines.push('    encoding: "' + runtime.dem.encoding + '", url: "pmtiles://' + runtime.dem._proxyUrl + '" },');
        }
        lines.push(
          '  { kind: "extrusion", sourceId: "buildings", sourceLayer: "' +
            (runtime.buildingsArchive ? archiveLayer : b.tiles.sourceLayer) +
            '",'
        );
        lines.push('    height: ["get", "' + b.renderHeightField + '"], color: heightRamp } ]);');
        return lines.join("\n");
      },
    },
    {
      id: "wailuku",
      name: "Wailuku",
      caption:
        "The county seat against the West Maui Mountains — government-district buildings in the foreground, ʻĪao Valley cutting the ridge behind. Click any building to query its Overture attributes live.",
      base: "terrain",
      camera: { center: [-156.5045, 20.8893], zoom: 15.0, pitch: 62, bearing: -118 },
      orbit: false,
      capabilities: [
        { label: "Attribute query — GeoServices FeatureServer", edition: "Community" },
        { label: "Vector tiles (MVT) — static PMTiles range proxy", edition: "Community" },
        { label: "3D Tiles serving — Honua Scene protocol (not exercised by this 2.5D page)", edition: "Community" },
      ],
      code: function (config, shared) {
        var b = config.buildings;
        return [
          "// every extrusion is a queryable feature — same layer, same server",
          'const { features } = await dataset.source("' + b.id + '").query({',
          "  spatialFilter: HonuaSDK.envelope(/* click hit-box */, { wkid: 4326 }),",
          '  outFields: ["name", "class", "subtype", "height", "num_floors",',
          '              "' + b.renderHeightField + '", "height_source"],',
          "  returnGeometry: false, pagination: { limit: 1 } });",
          "// render_height provenance is baked at seed time:",
          "// COALESCE(height, num_floors * 3.0, 4.0)",
        ].join("\n");
      },
    },
    {
      id: "haleakala",
      name: "Haleakalā crater",
      caption:
        "The 3,055 m shield volcano, orbiting slowly over the summit crater — terrarium-encoded DEM tiles streamed as byte ranges through the Honua PMTiles proxy, exaggerated 1.4× up here. Interact to take the camera.",
      base: "terrain",
      camera: { center: [-156.16, 20.712], zoom: 11.8, pitch: 66, bearing: 20 },
      orbit: true,
      capabilities: [
        { label: "Terrain tiles — terrarium DEM, static PMTiles range proxy", edition: "Community" },
        { label: "Raster tiles (hillshade) — static PMTiles range proxy", edition: "Community" },
        { label: "Live raster rendering (ImageServer / terrain routes)", edition: "Community" },
      ],
      code: function (config) {
        var ex = (config.terrain && config.terrain.orbitExaggeration) || 1.4;
        var lines = [];
        if (runtime.dem) {
          lines.push("// terrarium DEM byte ranges via the Honua PMTiles range proxy");
          lines.push('map.addSource("terrain-dem", { type: "raster-dem", encoding: "' + runtime.dem.encoding + '",');
          lines.push('  url: "pmtiles://' + runtime.dem._proxyUrl + '" });');
        }
        lines.push('map.setTerrain({ source: "terrain-dem", exaggeration: ' + ex + " });");
        lines.push("// slow orbit until you take the camera (any interaction stops it)");
        lines.push("map.rotateTo(map.getBearing() + 90, { duration: 15000, easing: t => t });");
        return lines.join("\n");
      },
    },
  ];

  /* ── Code strip (same minimal highlighter as demo.js — CSP self-only) ── */

  var ACCENT_RE = /\b(HonuaSDK|HonuaSceneSDK|HonuaClient|applyMapLibreScenePrimitives|createDataset|envelope|queryAll|query|source|setTerrain|rotateTo|addSource|addLayer|getSource|setData|select|querySelector)\b/g;

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
        html += '<span class="m3d-code-str">' + escapeHtml(segments[i]) + "</span>";
      } else {
        html += escapeHtml(segments[i]).replace(ACCENT_RE, '<span class="m3d-code-accent">$1</span>');
      }
    }
    if (parts[1]) {
      html += '<span class="m3d-code-comment">' + escapeHtml(parts[1]) + "</span>";
    }
    return html;
  }

  var codeStrip = {
    raw: "",
    set: function (title, code) {
      this.raw = code;
      var titleEl = el("m3d-code-title");
      var blockEl = el("m3d-code-block");
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
    var btn = el("m3d-code-copy");
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
          // Clipboard denied — leave the button as-is; never an error state.
        }
      );
    });
  }

  /* ── Capability sidebar ────────────────────────────────────────── */

  function renderCapabilities(scene) {
    var list = el("m3d-capability-list");
    if (!list) return;
    list.innerHTML = "";
    scene.capabilities.forEach(function (cap) {
      var row = document.createElement("li");
      var label = document.createElement("span");
      label.className = "m3d-capability-label";
      label.textContent = cap.label;
      var badge = document.createElement("span");
      badge.className = "m3d-ed-badge";
      badge.dataset.edition = cap.edition.toLowerCase();
      badge.textContent = cap.edition;
      row.appendChild(label);
      row.appendChild(badge);
      list.appendChild(row);
    });
  }

  /* ── Orbit (Haleakalā): slow continuous rotation, killed by ANY user
   * interaction or scene change. rAF-free — chained rotateTo easing. ── */

  function stopOrbit(map) {
    if (!runtime.orbiting) return;
    runtime.orbiting = false;
    map.stop();
  }

  function startOrbit(map) {
    runtime.orbiting = true;
    function spin() {
      if (!runtime.orbiting) return;
      map.rotateTo(map.getBearing() + 90, {
        duration: 15000,
        easing: function (t) {
          return t;
        },
      });
    }
    map.on("moveend", function onEnd() {
      if (runtime.orbiting) spin();
      else map.off("moveend", onEnd);
    });
    spin();
  }

  function attachOrbitKillers(map) {
    ["mousedown", "wheel", "touchstart", "dragstart"].forEach(function (evt) {
      map.on(evt, function () {
        stopOrbit(map);
      });
    });
  }

  /* ── Scene switcher ────────────────────────────────────────────── */

  function setActiveChip(sceneId) {
    var chips = document.querySelectorAll(".m3d-scene-chip");
    for (var i = 0; i < chips.length; i++) {
      chips[i].setAttribute("aria-pressed", chips[i].dataset.scene === sceneId ? "true" : "false");
    }
  }

  function applyScene(map, config, shared, scene, opts) {
    opts = opts || {};
    stopOrbit(map);

    selectBase(activeSwitcher, scene.base);

    // Per-scene terrain exaggeration (the DEM source persists; only the
    // terrain binding changes — the same map.setTerrain the SDK adapter set).
    if (runtime.terrain && runtime.dem) {
      var ex = scene.orbit
        ? (config.terrain && config.terrain.orbitExaggeration) || 1.4
        : (config.terrain && config.terrain.exaggeration) || 1.15;
      map.setTerrain({ source: runtime.dem.sourceId, exaggeration: ex });
    }

    map.easeTo({
      center: scene.camera.center,
      zoom: scene.camera.zoom,
      pitch: scene.camera.pitch || 0,
      bearing: scene.camera.bearing || 0,
      duration: opts.instant ? 0 : 1800,
    });

    var caption = el("m3d-scene-caption");
    if (caption) caption.textContent = scene.caption;

    renderCapabilities(scene);
    codeStrip.set("// @honua/sdk-js — the calls behind “" + scene.name + "”", scene.code(config, shared));
    setActiveChip(scene.id);

    if (scene.orbit && runtime.terrain) {
      if (opts.instant) {
        startOrbit(map);
      } else {
        map.once("moveend", function () {
          var chips = document.querySelectorAll('.m3d-scene-chip[data-scene="' + scene.id + '"][aria-pressed="true"]');
          if (chips.length > 0) startOrbit(map);
        });
      }
    }
  }

  function renderScenes(map, config, shared) {
    var nav = el("m3d-scene-list");
    if (!nav) return;
    nav.innerHTML = "";
    SCENES.forEach(function (scene) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "m3d-scene-chip";
      chip.dataset.scene = scene.id;
      chip.setAttribute("aria-pressed", "false");
      chip.textContent = scene.name;
      chip.addEventListener("click", function () {
        applyScene(map, config, shared, scene);
      });
      nav.appendChild(chip);
    });
  }

  /* ── Click → query → popup ─────────────────────────────────────── */

  function round4(value) {
    return Math.round(value * 10000) / 10000;
  }

  var POPUP_FIELDS = ["name", "class", "subtype", "height", "num_floors", "render_height", "height_source"];

  function buildingPopupHtml(attrs, sourceNote, attribution) {
    var rows = "";
    POPUP_FIELDS.forEach(function (key) {
      if (attrs[key] === undefined || attrs[key] === null || attrs[key] === "") return;
      rows +=
        '<div class="m3d-popup-row"><span>' +
        escapeHtml(key) +
        "</span><strong>" +
        escapeHtml(String(attrs[key])) +
        "</strong></div>";
    });
    return (
      '<article class="m3d-popup">' +
      '<p class="m3d-popup-kicker mono">Buildings (Overture) · ' +
      escapeHtml(sourceNote) +
      "</p>" +
      '<div class="m3d-popup-grid">' +
      (rows || '<div class="m3d-popup-row"><span>No attributes</span></div>') +
      "</div>" +
      '<p class="m3d-popup-attr mono">' +
      escapeHtml(attribution) +
      "</p>" +
      "</article>"
    );
  }

  function attachClickQuery(map, config) {
    var S = window.HonuaSDK;
    var b = config.buildings;

    map.on("click", function (event) {
      if (runtime.lane === "live" && runtime.buildingsSource) {
        // 6px hit-test box. The corners are normalized to a true SW/NE
        // envelope because the scenes rotate the camera (with a non-zero
        // bearing, screen-left is not geographic west — unnormalized corners
        // produce an inverted envelope the server rejects).
        var p = event.point;
        var c1 = map.unproject([p.x - 6, p.y + 6]);
        var c2 = map.unproject([p.x + 6, p.y - 6]);
        var sw = { lng: Math.min(c1.lng, c2.lng), lat: Math.min(c1.lat, c2.lat) };
        var ne = { lng: Math.max(c1.lng, c2.lng), lat: Math.max(c1.lat, c2.lat) };
        var filter = S.envelope(sw.lng, sw.lat, ne.lng, ne.lat, { wkid: 4326 });
        runtime.buildingsSource
          .query({ spatialFilter: filter, outFields: ["*"], returnGeometry: false, pagination: { limit: 1 } })
          .then(function (result) {
            codeStrip.set(
              "// @honua/sdk-js — the query that just ran",
              [
                'const { features } = await dataset.source("' + b.id + '").query({',
                "  spatialFilter: HonuaSDK.envelope(" +
                  round4(sw.lng) +
                  ", " +
                  round4(sw.lat) +
                  ", " +
                  round4(ne.lng) +
                  ", " +
                  round4(ne.lat) +
                  ", { wkid: 4326 }),",
                '  outFields: ["*"], returnGeometry: false, pagination: { limit: 1 } });',
                "// → " + result.features.length + (result.features.length === 1 ? " feature" : " features"),
              ].join("\n")
            );
            if (result.features.length === 0) return;
            new window.maplibregl.Popup({ closeButton: true, maxWidth: "320px" })
              .setLngLat(event.lngLat)
              .setHTML(buildingPopupHtml(result.features[0].attributes || {}, "live query", b.attribution))
              .addTo(map);
          })
          .catch(function () {
            // A failed click query never breaks the page.
          });
      } else if (runtime.lane === "sample" && runtime.buildingsLayerId) {
        var hits = map.queryRenderedFeatures(event.point, { layers: [runtime.buildingsLayerId] });
        if (hits.length === 0) return;
        codeStrip.set(
          "// bundled sample lane — local hit-test (no server)",
          [
            "// offline lane: the same footprints, queried client-side",
            'map.queryRenderedFeatures(e.point, { layers: ["lyr-buildings"] });',
            "// → live lane swaps this for dataset.source(…).query()",
          ].join("\n")
        );
        new window.maplibregl.Popup({ closeButton: true, maxWidth: "320px" })
          .setLngLat(event.lngLat)
          .setHTML(buildingPopupHtml(hits[0].properties || {}, "bundled sample", b.attribution))
          .addTo(map);
      }
    });
  }

  /* ── Bootstrap ─────────────────────────────────────────────────── */

  function collapsePanelsOnSmallScreens() {
    if (window.innerWidth >= 900) return;
    var codeStripEl = el("m3d-code-strip");
    var capabilitiesEl = el("m3d-capabilities");
    if (codeStripEl) codeStripEl.open = false;
    if (capabilitiesEl) capabilitiesEl.open = false;
  }

  function bootstrap() {
    if (!window.maplibregl || !window.HonuaSDK || !window.HonuaSceneSDK) {
      setStatus("error", "demo assets failed to load");
      return;
    }
    var S = window.HonuaSDK;

    collapsePanelsOnSmallScreens();
    attachCopyButton();

    Promise.all([
      fetch(CONFIG_URL).then(function (r) {
        if (!r.ok) throw new Error("Failed to load " + CONFIG_URL);
        return r.json();
      }),
      fetch("assets/demo/layers.json").then(function (r) {
        if (!r.ok) throw new Error("Failed to load shared contract");
        return r.json();
      }),
    ])
      .then(function (configs) {
        var config = configs[0];
        var shared = configs[1];

        var client = new S.HonuaClient({
          baseUrl: shared.server.baseUrl,
          // SDK calls options.fetchFn unbound; bare window.fetch throws
          // "Illegal invocation" in browsers (honua-sdk-js bug, filed).
          fetchFn: window.fetch.bind(window),
        });

        var map = new window.maplibregl.Map({
          container: "m3d-map",
          style: {
            version: 8,
            glyphs: shared.server.glyphs,
            sources: {},
            layers: [{ id: "background", type: "background", paint: { "background-color": config.map.background } }],
          },
          center: config.map.center,
          zoom: config.map.zoom,
          pitch: config.map.pitch,
          bearing: config.map.bearing,
          minZoom: config.map.minZoom,
          maxZoom: config.map.maxZoom,
          maxPitch: 70,
          attributionControl: { compact: false },
        });
        map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
        map.addControl(new window.maplibregl.ScaleControl({ unit: "imperial" }));

        // Route MapLibre's per-tile fetch errors to console.debug (transient
        // aborts during camera moves, cold-DB 503s — MapLibre retries).
        map.on("error", function (event) {
          if (console && console.debug) {
            console.debug("maplibre:", event && event.error ? event.error.message : event);
          }
        });

        setStatus("probing", "checking demo.honua.io…");
        ensurePMTilesProtocol();

        var dem = demPrimitive(config, shared);
        var buildingsPm = config.buildings.pmtiles;
        var probes = Promise.all([
          probeBuildings(client, config),
          probeArchive(dem && dem._proxyUrl),
          probeBaseArchives(shared),
          probeArchive(buildingsPm && buildingsPm.proxyUrl),
        ]);
        var mapReady = new Promise(function (resolve) {
          map.on("load", resolve);
        });

        Promise.all([probes, mapReady]).then(function (results) {
          var buildingsProbe = results[0][0];
          var demAvailable = results[0][1];
          var baseAvailability = results[0][2];
          var buildingsArchiveOk = results[0][3];

          // Exclusive bases first, so they sit beneath the extrusions.
          activeSwitcher = setupBasemapSwitcher(map, shared, baseAvailability, config.map.background);

          var primitives = [];
          if (demAvailable && dem) {
            primitives.push(dem);
            runtime.dem = dem;
            runtime.terrain = true;
            setChip("m3d-terrain-chip", "live", "terrain: terrarium DEM live");
          } else {
            setChip("m3d-terrain-chip", "absent", "terrain: not seeded — flat view");
          }

          var lanePromise;
          // The static MVT archive renders extrusions even when the
          // FeatureServer probe fails (it never touches the database);
          // click queries still go to the FeatureServer and degrade
          // gracefully if the live server is struggling.
          if (buildingsArchiveOk || buildingsProbe.available) {
            runtime.lane = "live";
            runtime.buildingsArchive = buildingsArchiveOk ? buildingsPm.proxyUrl : null;
            addLiveBuildings(map, config, shared, primitives, buildingsArchiveOk);
            setChip(
              "m3d-lane-chip",
              "live",
              buildingsArchiveOk ? "buildings: static MVT archive" : "buildings: live MVT"
            );
            lanePromise = Promise.resolve();
          } else {
            // Graceful absence: fall back to the bundled Overture sample so
            // the page stays fully interactive (clearly labeled, no faking —
            // these are real Kahului footprints from the same extract).
            lanePromise = loadFixture(config).then(
              function (fixture) {
                runtime.lane = "sample";
                addSampleBuildings(map, config, fixture, primitives);
                setChip(
                  "m3d-lane-chip",
                  "sample",
                  buildingsProbe.failure === "unreachable"
                    ? "buildings: bundled sample (server offline)"
                    : "buildings: bundled sample (live layer not seeded yet)"
                );
              },
              function () {
                runtime.lane = "absent";
                setChip("m3d-lane-chip", "absent", "buildings: unavailable");
              }
            );
          }

          lanePromise.then(function () {
            // ONE SDK call applies the whole 2.5D scene: terrain binding +
            // fill-extrusion layer, with capability diagnostics.
            var result = applyScenePrimitives(map, primitives);
            if (
              primitives.some(function (p) {
                return p.kind === "extrusion";
              }) &&
              map.getLayer("lyr-buildings")
            ) {
              runtime.buildingsLayerId = "lyr-buildings";
              renderLegendNote(config.buildings.renderHeightField);
            }

            // Live lane gets a queryable SDK dataset source for click queries.
            if (runtime.lane === "live") {
              var dataset = S.createDataset({
                id: "maui-3d",
                client: client,
                sources: [
                  {
                    id: config.buildings.id,
                    protocol: "geoservices-feature-service",
                    locator: {
                      url: shared.server.baseUrl,
                      serviceId: config.buildings.service.serviceId,
                      layerId: config.buildings.service.layerId,
                    },
                    capabilities: S.PROTOCOL_DEFAULT_CAPABILITIES["geoservices-feature-service"],
                  },
                ],
                skipCompatibilityCheck: true,
              });
              runtime.buildingsSource = dataset.source(config.buildings.id);
            }

            renderScenes(map, config, shared);
            attachOrbitKillers(map);
            attachClickQuery(map, config);
            applyScene(map, config, shared, SCENES[0], { instant: true });

            if (runtime.lane === "live") {
              setStatus(
                "live",
                "demo.honua.io · buildings live (" +
                  (runtime.buildingsArchive ? "static MVT archive" : "MVT") +
                  ")" +
                  (runtime.terrain ? " · terrain live" : "")
              );
            } else if (runtime.lane === "sample") {
              setStatus(
                "waiting",
                buildingsProbe.failure === "unreachable"
                  ? "demo server not reachable — showing the bundled Overture sample"
                  : "live buildings not seeded yet — showing the bundled Overture sample"
              );
            } else {
              setStatus("offline", "buildings unavailable — terrain-only view");
            }

            // Headless-verification hook (read-only; not part of the page API).
            window.__m3d = { map: map, runtime: runtime, sceneResult: result };
          });
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

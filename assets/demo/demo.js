/*
 * honua.io live demo — Maui, Hawaiʻi.
 *
 * Data access goes through the official Honua JS SDK (@honua/sdk-js), loaded
 * as a vendored browser bundle (assets/vendor/honua-sdk.min.js, exposed as
 * window.HonuaSDK — see assets/vendor/README.md for provenance). MapLibre GL
 * (window.maplibregl) does pure rendering.
 *
 * Every endpoint / service id / collection id lives in assets/demo/layers.json
 * (the seeding contract). Nothing here hardcodes a Honua path — the code-strip
 * snippets are rendered FROM that config so the displayed URLs always match
 * the wire.
 *
 * UI model: SCENES are the primary control — each scene sets layer visibility
 * + camera, narrates one capability story, and drives two companion panels:
 *   - the code strip (the actual SDK calls behind the current scene, swapping
 *     to the real query on feature click), and
 *   - the capability sidebar (server capabilities + protocols exercised, with
 *     edition labels matching the published split on pricing.html).
 * The flat layer-toggle list survives collapsed behind the scenes UI.
 *
 * SDK surface used:
 *   - new HonuaSDK.HonuaClient({ baseUrl })
 *   - client.checkCompatibility()
 *   - client.getLayerMetadata(serviceId, layerId)        (availability probe)
 *   - client.getMapServiceMetadata(serviceId)            (availability probe)
 *   - HonuaSDK.createDataset(...) + source.query()/queryAll()  (feature data)
 *   - HonuaSDK.envelope(...)                              (click hit-test filter)
 *   - HonuaSDK.createHonuaTileServiceLayer(...)           (raster tile sources)
 *   - HonuaSDK.isHonuaError / HonuaHttpError              (graceful 404s)
 */
(function () {
  "use strict";

  var CONFIG_URL = "assets/demo/layers.json";

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
    var pill = el("demo-status");
    if (!pill) return;
    pill.dataset.state = state;
    pill.textContent = text;
  }

  /* ── Esri JSON → GeoJSON (rendering only) ─────────────────────────
   * The SDK returns GeoServices (Esri JSON) geometries; it does not ship a
   * GeoJSON converter, so the demo carries this minimal one. */
  function esriGeometryToGeoJson(geom) {
    if (!geom) return null;
    if (typeof geom.x === "number" && typeof geom.y === "number") {
      return { type: "Point", coordinates: [geom.x, geom.y] };
    }
    if (Array.isArray(geom.points)) {
      return { type: "MultiPoint", coordinates: geom.points };
    }
    if (Array.isArray(geom.paths)) {
      return geom.paths.length === 1
        ? { type: "LineString", coordinates: geom.paths[0] }
        : { type: "MultiLineString", coordinates: geom.paths };
    }
    if (Array.isArray(geom.rings)) {
      return esriRingsToGeoJson(geom.rings);
    }
    if (geom.type && (geom.coordinates || geom.geometries)) {
      return geom; // already GeoJSON
    }
    return null;
  }

  /* Esri polygons list every ring flat: exterior rings wind clockwise, holes
   * counter-clockwise. Group holes under their containing shell and emit
   * MultiPolygon when there is more than one shell. */
  function esriRingArea(ring) {
    var area = 0;
    for (var i = 0; i < ring.length - 1; i++) {
      area += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
    }
    return area; /* > 0 = clockwise (shell), < 0 = counter-clockwise (hole) */
  }

  function pointInRing(pt, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0];
      var yi = ring[i][1];
      var xj = ring[j][0];
      var yj = ring[j][1];
      var crosses = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function esriRingsToGeoJson(rings) {
    var shells = [];
    var holes = [];
    for (var i = 0; i < rings.length; i++) {
      var ring = rings[i];
      if (!Array.isArray(ring) || ring.length < 4) continue;
      (esriRingArea(ring) > 0 ? shells : holes).push(ring);
    }
    if (shells.length === 0) {
      /* Malformed winding — fall back to treating the input as one polygon. */
      return rings.length ? { type: "Polygon", coordinates: rings } : null;
    }
    var polygons = shells.map(function (shell) {
      return [shell];
    });
    for (var h = 0; h < holes.length; h++) {
      var host = null;
      for (var p = 0; p < polygons.length; p++) {
        if (pointInRing(holes[h][0], polygons[p][0])) {
          host = polygons[p];
          break;
        }
      }
      (host || polygons[0]).push(holes[h]);
    }
    return polygons.length === 1
      ? { type: "Polygon", coordinates: polygons[0] }
      : { type: "MultiPolygon", coordinates: polygons };
  }

  function featuresToGeoJson(features) {
    var out = [];
    for (var i = 0; i < features.length; i++) {
      var geometry = esriGeometryToGeoJson(features[i].geometry);
      if (!geometry) continue;
      out.push({ type: "Feature", geometry: geometry, properties: features[i].attributes || {} });
    }
    return { type: "FeatureCollection", features: out };
  }

  function isNotFound(error) {
    var S = window.HonuaSDK;
    return S.isHonuaError(error) && error instanceof S.HonuaHttpError && (error.statusCode === 404 || error.statusCode === 400);
  }

  function isUnreachable(error) {
    var S = window.HonuaSDK;
    return (S.isHonuaError(error) && error instanceof S.HonuaNetworkError) || error instanceof TypeError;
  }

  /* ── Basemap (Protomaps PMTiles via Honua proxy) ────────────────── */

  /*
   * loadBasemap(map, config)
   *
   * Adds the Protomaps OSM basemap beneath all data layers using the
   * PMTiles proxy URL declared in config.basemap.proxyUrl.
   *
   * Graceful-absence contract: if the archive hasn't been seeded yet the
   * proxy returns 404. We detect that via a HEAD probe and either:
   *   (a) skip silently — map stays on background colour, no error state; OR
   *   (b) show a subtle "basemap pending" note in the panel badge if present.
   * We never surface a console error to end-users for the absent basemap.
   *
   * When the basemap loads we append the attribution string from
   * config.basemap.attribution to MapLibre's attribution control.
   *
   * Seeding contract lives in layers.json "$basemapSeedingContract".
   */
  function loadBasemap(map, config) {
    var bm = config.basemap;
    if (!bm || !bm.proxyUrl || !bm.style || !bm.archiveId) return;

    // HEAD probe: see if the archive is present before wiring up the source.
    fetch(bm.proxyUrl, { method: "HEAD" })
      .then(function (res) {
        if (!res.ok) {
          // Archive not yet seeded — silent fallback, show panel note.
          var badge = document.getElementById("basemap-pending-badge");
          if (badge) badge.style.display = "inline";
          return;
        }
        // Archive present — wire up the PMTiles vector source and style layers.
        map.addSource("basemap", {
          type: "vector",
          url: "pmtiles://" + bm.proxyUrl,
          attribution: bm.attribution || "",
        });

        // Insert basemap layers BELOW the background layer (index 1) so all
        // data layers remain on top. We iterate the declared style layers in
        // order; each is inserted before the first non-background map layer.
        var insertBefore = getFirstDataLayerId(map);
        var styleLayers = bm.style.layers || [];
        for (var i = 0; i < styleLayers.length; i++) {
          try {
            var layerDef = JSON.parse(JSON.stringify(styleLayers[i])); // deep copy
            if (insertBefore) {
              map.addLayer(layerDef, insertBefore);
            } else {
              map.addLayer(layerDef);
            }
          } catch (_e) {
            // Individual basemap layer failures must not break the demo.
          }
        }

        // Append basemap attribution to the existing MapLibre attribution control.
        if (bm.attribution) {
          appendAttribution(map, bm.attribution);
        }
      })
      .catch(function () {
        // Network error — treat as absent, stay silent.
        var badge = document.getElementById("basemap-pending-badge");
        if (badge) badge.style.display = "inline";
      });
  }

  /* Returns the id of the first layer added by data-layer plumbing so we can
   * insert basemap layers beneath it. Falls back to undefined (append). */
  function getFirstDataLayerId(map) {
    var layers = map.getStyle().layers || [];
    for (var i = 0; i < layers.length; i++) {
      if (layers[i].id !== "background") {
        return layers[i].id;
      }
    }
    return undefined;
  }

  /* Appends an attribution string to the MapLibre attribution control if
   * it isn't already present. Manipulates the DOM node MapLibre creates. */
  function appendAttribution(map, text) {
    try {
      var ctrl = map.getContainer().querySelector(".maplibregl-ctrl-attrib-inner");
      if (!ctrl) return;
      if (ctrl.textContent.indexOf(text) !== -1) return; // idempotent
      var sep = document.createTextNode(" | ");
      var span = document.createElement("span");
      span.textContent = text;
      ctrl.appendChild(sep);
      ctrl.appendChild(span);
    } catch (_e) {
      // Attribution is cosmetic — never fatal.
    }
  }

  /* ── Layer state ────────────────────────────────────────────────── */

  function createLayerState(config) {
    var states = [];
    for (var i = 0; i < config.layers.length; i++) {
      states.push({
        def: config.layers[i],
        available: false,
        probed: false,
        visible: Boolean(config.layers[i].defaultVisible),
        mapLayerIds: [],
        source: null, // SDK contract Source (queryable layers)
        failure: null,
      });
    }
    return states;
  }

  function findState(states, layerId) {
    for (var i = 0; i < states.length; i++) {
      if (states[i].def.id === layerId) return states[i];
    }
    return null;
  }

  function findLayerDef(config, layerId) {
    for (var i = 0; i < config.layers.length; i++) {
      if (config.layers[i].id === layerId) return config.layers[i];
    }
    return null;
  }

  function probeLayer(client, state) {
    var def = state.def;
    var probe =
      def.render === "raster" || def.render === "terrain"
        ? client.getMapServiceMetadata(def.service.serviceId)
        : client.getLayerMetadata(def.service.serviceId, def.service.layerId);

    return probe.then(
      function (meta) {
        state.probed = true;
        // Some GeoServices stacks report errors inside a 200 body.
        if (meta && meta.error) {
          state.available = false;
          state.failure = "not-seeded";
        } else {
          state.available = true;
        }
        return state;
      },
      function (error) {
        state.probed = true;
        state.available = false;
        state.failure = isNotFound(error) ? "not-seeded" : isUnreachable(error) ? "unreachable" : "error";
        return state;
      }
    );
  }

  /* ── Map layer plumbing (plain MapLibre) ────────────────────────── */

  function addLayerToMap(map, state, config) {
    var S = window.HonuaSDK;
    var def = state.def;
    var base = config.server.baseUrl;
    var sourceId = "src-" + def.id;

    if (def.render === "raster") {
      // SDK helper builds the {z}/{y}/{x} raster source from the MapServer path.
      var tileDef = S.createHonuaTileServiceLayer({
        id: def.id,
        url: base + def.service.path,
        attribution: def.attribution,
      });
      map.addSource(sourceId, tileDef.source);
      map.addLayer({ id: "lyr-" + def.id, type: "raster", source: sourceId, paint: def.paint || {} });
      state.mapLayerIds = ["lyr-" + def.id];
    } else if (def.render === "terrain") {
      map.addSource(sourceId, {
        type: "raster-dem",
        tiles: [base + def.service.tileTemplate],
        tileSize: 256,
        encoding: def.service.encoding || "terrarium",
        attribution: def.attribution,
      });
      state.terrainSourceId = sourceId;
      state.mapLayerIds = [];
    } else if (def.render === "mvt") {
      map.addSource(sourceId, {
        type: "vector",
        tiles: [base + def.tiles.tileTemplate],
        minzoom: 0,
        maxzoom: 15,
        attribution: def.attribution,
      });
      var mvtLayer = {
        id: "lyr-" + def.id,
        source: sourceId,
        "source-layer": def.tiles.sourceLayer,
        type: def.geometryType === "line" ? "line" : "fill",
        paint: def.paint || {},
      };
      if (typeof def.minzoom === "number") mvtLayer.minzoom = def.minzoom;
      map.addLayer(mvtLayer);
      state.mapLayerIds = ["lyr-" + def.id];
    } else if (def.render === "geojson") {
      map.addSource(sourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        attribution: def.attribution,
      });
      var type = def.geometryType === "line" ? "line" : def.geometryType === "point" ? "circle" : "fill";
      map.addLayer({ id: "lyr-" + def.id, source: sourceId, type: type, paint: def.paint || {} });
      state.mapLayerIds = ["lyr-" + def.id];
      if (def.labelField) {
        map.addLayer({
          id: "lyr-" + def.id + "-label",
          source: sourceId,
          type: "symbol",
          layout: {
            "text-field": ["get", def.labelField],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11,
            "text-offset": [0, 0.9],
            "text-anchor": "top",
          },
          paint: { "text-color": "#e6efee", "text-halo-color": "#04151a", "text-halo-width": 1.1 },
        });
        state.mapLayerIds.push("lyr-" + def.id + "-label");
      }
    }
    applyVisibility(map, state);
  }

  function loadGeoJsonData(map, state) {
    // SDK does the data access: protocol-neutral source.queryAll() drains
    // FeatureServer pagination and returns typed features.
    var def = state.def;
    return state.source
      .queryAll({
        where: "1=1",
        outFields: ["*"],
        returnGeometry: true,
        outSr: 4326,
        pagination: { limit: def.maxFeatures || 2000 },
      })
      .then(function (result) {
        var src = map.getSource("src-" + def.id);
        if (src) src.setData(featuresToGeoJson(result.features.slice()));
        state.featureCount = result.features.length;
      });
  }

  function applyVisibility(map, state) {
    var visibility = state.visible ? "visible" : "none";
    for (var i = 0; i < state.mapLayerIds.length; i++) {
      if (map.getLayer(state.mapLayerIds[i])) {
        map.setLayoutProperty(state.mapLayerIds[i], "visibility", visibility);
      }
    }
    if (state.def.render === "terrain" && state.terrainSourceId) {
      map.setTerrain(state.visible ? { source: state.terrainSourceId, exaggeration: state.def.exaggeration || 1.2 } : null);
    }
  }

  /* ── Scenes ─────────────────────────────────────────────────────────
   * Each scene = layer visibility set + camera + one-line caption + the SDK
   * calls behind it (code strip) + the server capabilities it exercises
   * (capability sidebar). Edition labels mirror the published edition table
   * on pricing.html — factual labels only:
   *   - every protocol surface (GeoServices REST, OGC API Tiles/MVT, terrain,
   *     vector tiles — read, query, tiles, metadata)  → Community
   *   - raster file import + serving                  → Community
   *   - COG serving direct from S3/Azure              → Pro
   * Code builders take `config` so every displayed URL comes from layers.json
   * (the single source of truth for endpoints).
   */
  var SCENES = [
    {
      id: "parcels-zoning",
      name: "Parcels & zoning",
      caption: "County TMK parcels and zoning districts over Wailuku — click any parcel to inspect it.",
      layers: ["parcels", "zoning"],
      camera: { center: [-156.498, 20.885], zoom: 14, pitch: 0, bearing: 0 },
      capabilities: [
        { label: "Vector tiles (MVT) — OGC API Tiles", edition: "Community" },
        { label: "Attribute query — GeoServices FeatureServer", edition: "Community" },
        { label: "Layer metadata probes — GeoServices REST", edition: "Community" },
      ],
      code: function (config) {
        var parcels = findLayerDef(config, "parcels");
        return [
          "// parcel polygons arrive as MVT from Honua's OGC API Tiles route",
          'map.addSource("parcels", { type: "vector",',
          '  tiles: ["' + config.server.baseUrl + parcels.tiles.tileTemplate + '"] });',
          "// click → GeoServices FeatureServer query through the SDK",
          'const { features } = await dataset.source("parcels").query({',
          "  spatialFilter: HonuaSDK.envelope(west, south, east, north, { wkid: 4326 }), pagination: { limit: 1 } });",
        ].join("\n");
      },
    },
    {
      id: "coastal-risk",
      name: "Coastal risk",
      caption: "FEMA flood zones and NOAA 3.2 ft sea-level-rise extent blended over the Kīhei coast.",
      layers: ["hillshade", "flood-hazard", "sea-level-rise"],
      camera: { center: [-156.46, 20.77], zoom: 12.4, pitch: 0, bearing: 0 },
      capabilities: [
        { label: "Feature query + pagination — GeoServices FeatureServer", edition: "Community" },
        { label: "Spatial & attribute filters, EPSG:4326 output", edition: "Community" },
      ],
      code: function (config) {
        var flood = findLayerDef(config, "flood-hazard");
        return [
          "// drain every flood-hazard polygon through SDK pagination",
          'const { features } = await dataset.source("flood-hazard").queryAll({',
          '  where: "1=1", outFields: ["*"], returnGeometry: true, outSr: 4326,',
          "  pagination: { limit: " + (flood.maxFeatures || 2000) + " } });",
          'map.getSource("flood-hazard").setData(toGeoJSON(features));',
        ].join("\n");
      },
    },
    {
      id: "terrain",
      name: "Terrain",
      caption: "USGS 3DEP hillshade draped on 2.5D terrain over Haleakalā — drag to orbit.",
      layers: ["hillshade", "terrain"],
      camera: { center: [-156.22, 20.74], zoom: 11.2, pitch: 60, bearing: 150 },
      capabilities: [
        { label: "Terrain tiles — terrarium-encoded DEM", edition: "Community" },
        { label: "Raster tile serving (hillshade) — MapServer", edition: "Community" },
      ],
      code: function (config) {
        var hillshade = findLayerDef(config, "hillshade");
        var terrain = findLayerDef(config, "terrain");
        return [
          "// hillshade: the SDK builds the raster tile source from the MapServer path",
          "const hillshade = HonuaSDK.createHonuaTileServiceLayer({",
          '  id: "hillshade", url: "' + config.server.baseUrl + hillshade.service.path + '" });',
          'map.addSource("hillshade", hillshade.source);',
          "// terrarium-encoded DEM tiles from the same server drive the 2.5D tilt",
          'map.setTerrain({ source: "terrain-dem", exaggeration: ' + (terrain.exaggeration || 1.2) + " });",
        ].join("\n");
      },
    },
    {
      id: "imagery",
      name: "Imagery",
      caption: "USDA NAIP aerial imagery swapped in over Kahului — same SDK helper, different service.",
      layers: ["imagery"],
      camera: { center: [-156.47, 20.885], zoom: 13, pitch: 0, bearing: 0 },
      capabilities: [
        { label: "Raster tile serving — GeoServices MapServer", edition: "Community" },
        { label: "COG serving direct from S3/Azure", edition: "Pro" },
      ],
      code: function (config) {
        var imagery = findLayerDef(config, "imagery");
        return [
          "// NAIP imagery: cloud-optimized GeoTIFFs served as map tiles",
          "const imagery = HonuaSDK.createHonuaTileServiceLayer({",
          '  id: "imagery", url: "' + config.server.baseUrl + imagery.service.path + '" });',
          'map.addSource("imagery", imagery.source);',
          'map.addLayer({ id: "imagery", type: "raster", source: "imagery" });',
        ].join("\n");
      },
    },
    {
      id: "place-names",
      name: "Place names",
      caption: "USGS GNIS place names with Hawaiian diacriticals — Hāna, Māʻalaea, Haleakalā — rendered from live queries.",
      layers: ["hillshade", "place-names"],
      camera: { center: [-156.33, 20.8], zoom: 10, pitch: 0, bearing: 0 },
      capabilities: [
        { label: "Feature query — GeoServices FeatureServer", edition: "Community" },
        { label: "SDF glyph serving for map labels (/fonts)", edition: "Community" },
      ],
      code: function (config) {
        return [
          "// GNIS names — Unicode-clean end to end (Hāna, Māʻalaea, Haleakalā)",
          'const { features } = await dataset.source("place-names").queryAll({',
          '  where: "1=1", outFields: ["*"], returnGeometry: true, outSr: 4326 });',
          "// label glyphs come from Honua too: " + config.server.glyphs.replace(config.server.baseUrl, ""),
        ].join("\n");
      },
    },
  ];

  /* ── Code strip: minimal CSS-class syntax highlighting (no external
   * highlighter — CSP stays self-only). Tokenizer order: comment → strings →
   * accented SDK/API names; everything passes through escapeHtml. ── */

  var ACCENT_RE = /\b(HonuaSDK|HonuaClient|createDataset|createHonuaTileServiceLayer|envelope|queryAll|query|source|setTerrain|addSource|addLayer|getSource|setData)\b/g;

  /* Split a line at the first `//` that is not inside a double-quoted string
   * (so "https://…" URLs are not mistaken for comments). */
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
        html += '<span class="demo-code-str">' + escapeHtml(segments[i]) + "</span>";
      } else {
        html += escapeHtml(segments[i]).replace(ACCENT_RE, '<span class="demo-code-accent">$1</span>');
      }
    }
    if (parts[1]) {
      html += '<span class="demo-code-comment">' + escapeHtml(parts[1]) + "</span>";
    }
    return html;
  }

  var codeStrip = {
    raw: "",
    set: function (title, code) {
      this.raw = code;
      var titleEl = el("demo-code-title");
      var blockEl = el("demo-code-block");
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
    var btn = el("demo-code-copy");
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

  /* ── Capability sidebar ─────────────────────────────────────────── */

  function renderCapabilities(scene) {
    var list = el("demo-capability-list");
    if (!list) return;
    list.innerHTML = "";
    scene.capabilities.forEach(function (cap) {
      var row = document.createElement("li");
      var label = document.createElement("span");
      label.className = "demo-capability-label";
      label.textContent = cap.label;
      var badge = document.createElement("span");
      badge.className = "demo-ed-badge";
      badge.dataset.edition = cap.edition.toLowerCase();
      badge.textContent = cap.edition;
      row.appendChild(label);
      row.appendChild(badge);
      list.appendChild(row);
    });
  }

  /* ── Scene switcher ─────────────────────────────────────────────── */

  function setActiveChip(sceneId) {
    var chips = document.querySelectorAll(".demo-scene-chip");
    for (var i = 0; i < chips.length; i++) {
      chips[i].setAttribute("aria-pressed", chips[i].dataset.scene === sceneId ? "true" : "false");
    }
  }

  function applyScene(map, states, config, scene, opts) {
    opts = opts || {};
    states.forEach(function (state) {
      state.visible = scene.layers.indexOf(state.def.id) !== -1;
      applyVisibility(map, state);
    });

    if (opts.camera !== false) {
      map.easeTo({
        center: scene.camera.center,
        zoom: scene.camera.zoom,
        pitch: scene.camera.pitch || 0,
        bearing: scene.camera.bearing || 0,
        duration: opts.instant ? 0 : 1400,
      });
    }

    var caption = el("demo-scene-caption");
    if (caption) caption.textContent = scene.caption;

    // Graceful absence: the scene still narrates + shows its code even when
    // none of its datasets are seeded yet.
    var nonePresent = scene.layers.every(function (layerId) {
      var state = findState(states, layerId);
      return !state || !state.available;
    });
    var pending = el("demo-scene-pending");
    if (pending) pending.style.display = nonePresent ? "" : "none";

    renderCapabilities(scene);
    codeStrip.set("// @honua/sdk-js — the calls behind “" + scene.name + "”", scene.code(config));
    setActiveChip(scene.id);
    renderPanel(map, states);
  }

  function renderScenes(map, states, config) {
    var nav = el("demo-scene-list");
    if (!nav) return;
    nav.innerHTML = "";
    SCENES.forEach(function (scene) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "demo-scene-chip";
      chip.dataset.scene = scene.id;
      chip.setAttribute("aria-pressed", "false");
      chip.textContent = scene.name;
      chip.addEventListener("click", function () {
        applyScene(map, states, config, scene);
      });
      nav.appendChild(chip);
    });
  }

  /* ── "All layers" advanced panel (collapsed behind the scenes UI) ── */

  function renderPanel(map, states) {
    var list = el("demo-layer-list");
    list.innerHTML = "";
    states.forEach(function (state) {
      var def = state.def;
      var row = document.createElement("li");
      row.className = "demo-layer-row";
      row.dataset.available = String(state.available);

      var label = document.createElement("label");
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = state.visible && state.available;
      checkbox.disabled = !state.available;
      checkbox.addEventListener("change", function () {
        state.visible = checkbox.checked;
        applyVisibility(map, state);
        // A manual toggle means the view no longer matches a scene.
        setActiveChip(null);
      });

      var name = document.createElement("span");
      name.className = "demo-layer-name";
      name.textContent = def.name;

      label.appendChild(checkbox);
      label.appendChild(name);

      if (!state.available) {
        var badge = document.createElement("span");
        badge.className = "demo-layer-badge";
        badge.textContent = state.failure === "unreachable" ? "server offline" : "not yet available";
        badge.title = "This dataset has not been seeded on demo.honua.io yet. The page is wired to " + def.service.path + ".";
        label.appendChild(badge);
      }

      var attribution = document.createElement("span");
      attribution.className = "demo-layer-attr mono";
      attribution.textContent = def.attribution;

      row.appendChild(label);
      row.appendChild(attribution);
      list.appendChild(row);
    });
  }

  /* ── Click → SDK query → popup (+ code strip shows the query) ───── */

  function round4(value) {
    return Math.round(value * 10000) / 10000;
  }

  function clickQueryCode(sourceId, sw, ne, count) {
    return [
      'const { features } = await dataset.source("' + sourceId + '").query({',
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
      "// → " + count + (count === 1 ? " feature" : " features"),
    ].join("\n");
  }

  function attachClickQuery(map, states) {
    var S = window.HonuaSDK;
    var queryable = states.filter(function (s) {
      return s.available && s.def.queryable && s.source;
    });
    if (queryable.length === 0) return;

    map.on("click", function (event) {
      // 6px hit-test box around the click, expressed as a lng/lat envelope.
      var p = event.point;
      var sw = map.unproject([p.x - 6, p.y + 6]);
      var ne = map.unproject([p.x + 6, p.y - 6]);
      var filter = S.envelope(sw.lng, sw.lat, ne.lng, ne.lat, { wkid: 4326 });

      // Top-most visible layer first (reverse of draw order).
      var candidates = queryable
        .filter(function (s) {
          return s.visible;
        })
        .reverse();
      if (candidates.length === 0) return;

      var run = Promise.resolve(null);
      candidates.forEach(function (state) {
        run = run.then(function (hit) {
          if (hit) return hit;
          return state.source
            .query({
              spatialFilter: filter,
              outFields: ["*"],
              returnGeometry: false,
              pagination: { limit: 1 },
            })
            .then(function (result) {
              return result.features.length > 0 ? { state: state, feature: result.features[0] } : null;
            })
            .catch(function () {
              return null; // a single failed layer never breaks the click
            });
        });
      });

      run.then(function (hit) {
        // Code strip: show the query that ran (the hit, or the top-most miss).
        var shownState = hit ? hit.state : candidates[0];
        codeStrip.set(
          "// @honua/sdk-js — the query that just ran",
          clickQueryCode(shownState.def.id, sw, ne, hit ? 1 : 0)
        );

        if (!hit) return;
        var rows = "";
        var attrs = hit.feature.attributes || {};
        var keys = Object.keys(attrs).slice(0, 10);
        keys.forEach(function (key) {
          rows +=
            '<div class="demo-popup-row"><span>' +
            escapeHtml(key) +
            "</span><strong>" +
            escapeHtml(attrs[key] === null || attrs[key] === undefined ? "—" : attrs[key]) +
            "</strong></div>";
        });
        var html =
          '<article class="demo-popup">' +
          '<p class="demo-popup-kicker mono">' +
          escapeHtml(hit.state.def.name) +
          "</p>" +
          '<div class="demo-popup-grid">' +
          (rows || '<div class="demo-popup-row"><span>No attributes</span></div>') +
          "</div>" +
          '<p class="demo-popup-attr mono">' +
          escapeHtml(hit.state.def.attribution) +
          "</p>" +
          "</article>";
        new window.maplibregl.Popup({ closeButton: true, maxWidth: "320px" })
          .setLngLat(event.lngLat)
          .setHTML(html)
          .addTo(map);
      });
    });
  }

  /* ── Bootstrap ──────────────────────────────────────────────────── */

  function collapsePanelsOnSmallScreens() {
    if (window.innerWidth >= 900) return;
    var codeStripEl = el("demo-code-strip");
    var capabilitiesEl = el("demo-capabilities");
    if (codeStripEl) codeStripEl.open = false;
    if (capabilitiesEl) capabilitiesEl.open = false;
  }

  function bootstrap() {
    if (!window.maplibregl || !window.HonuaSDK) {
      setStatus("error", "demo assets failed to load");
      return;
    }
    var S = window.HonuaSDK;

    collapsePanelsOnSmallScreens();
    attachCopyButton();

    fetch(CONFIG_URL)
      .then(function (response) {
        if (!response.ok) throw new Error("Failed to load " + CONFIG_URL);
        return response.json();
      })
      .then(function (config) {
        var client = new S.HonuaClient({
          baseUrl: config.server.baseUrl,
          // SDK calls options.fetchFn unbound; bare window.fetch throws
          // "Illegal invocation" in browsers (honua-sdk-js bug, filed).
          fetchFn: window.fetch.bind(window)
        });

        var map = new window.maplibregl.Map({
          container: "demo-map",
          style: {
            version: 8,
            glyphs: config.server.glyphs,
            sources: {},
            layers: [{ id: "background", type: "background", paint: { "background-color": config.map.background } }],
          },
          center: config.map.center,
          zoom: config.map.zoom,
          minZoom: config.map.minZoom,
          maxZoom: config.map.maxZoom,
          attributionControl: { compact: false },
        });
        map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
        map.addControl(new window.maplibregl.ScaleControl({ unit: "imperial" }));

        setStatus("probing", "checking demo.honua.io…");

        var states = createLayerState(config);
        var probes = Promise.all(
          states.map(function (state) {
            return probeLayer(client, state);
          })
        );
        var compatibility = client.checkCompatibility().catch(function () {
          return null;
        });
        var mapReady = new Promise(function (resolve) {
          map.on("load", resolve);
        });

        Promise.all([probes, compatibility, mapReady]).then(function (results) {
          // Load basemap beneath all data layers. Gracefully absent until seeded.
          loadBasemap(map, config);

          var compat = results[1];
          var live = states.filter(function (s) {
            return s.available;
          });
          var unreachable = states.every(function (s) {
            return s.failure === "unreachable";
          });

          // One SDK dataset spanning every available queryable FeatureServer layer.
          var descriptors = live
            .filter(function (s) {
              return s.def.queryable;
            })
            .map(function (s) {
              return {
                id: s.def.id,
                protocol: "geoservices-feature-service",
                locator: {
                  url: config.server.baseUrl,
                  serviceId: s.def.service.serviceId,
                  layerId: s.def.service.layerId,
                },
                capabilities: S.PROTOCOL_DEFAULT_CAPABILITIES["geoservices-feature-service"],
              };
            });
          if (descriptors.length > 0) {
            var dataset = S.createDataset({
              id: "maui-demo",
              client: client,
              sources: descriptors,
              skipCompatibilityCheck: true,
            });
            live.forEach(function (s) {
              if (s.def.queryable) s.source = dataset.source(s.def.id);
            });
          }

          live.forEach(function (state) {
            try {
              addLayerToMap(map, state, config);
            } catch (error) {
              state.available = false;
              state.failure = "error";
            }
          });

          var geojsonLoads = live
            .filter(function (s) {
              return s.available && s.def.render === "geojson" && s.source;
            })
            .map(function (s) {
              return loadGeoJsonData(map, s).catch(function () {
                s.available = false;
                s.failure = "not-seeded";
                renderPanel(map, states);
              });
            });

          // Scenes are the primary UI. Apply the first scene's layer mix +
          // panels immediately; only fly its camera when at least one of its
          // datasets is actually present (unseeded server keeps the island-
          // wide view so the page stays presentable with zero layers).
          renderScenes(map, states, config);
          var firstScene = SCENES[0];
          var firstSceneHasData = firstScene.layers.some(function (layerId) {
            var state = findState(states, layerId);
            return state && state.available;
          });
          applyScene(map, states, config, firstScene, {
            camera: firstSceneHasData,
            instant: true,
          });

          attachClickQuery(map, states);

          Promise.all(geojsonLoads).then(function () {
            renderPanel(map, states);
          });

          if (unreachable) {
            setStatus("offline", "demo server not reachable yet — layers light up as data is seeded");
          } else if (live.length === 0) {
            setStatus("waiting", "connected — 0 of " + states.length + " layers seeded so far");
          } else {
            var version = compat && compat.compatibility && compat.compatibility.serverVersion;
            setStatus(
              "live",
              "demo.honua.io" + (version ? " v" + version : "") + " · " + live.length + " of " + states.length + " layers live"
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

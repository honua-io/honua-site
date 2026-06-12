/*
 * honua.io live demo — Maui Nui, Hawaiʻi (all of Maui County: Maui, Molokaʻi,
 * Lānaʻi, Kahoʻolawe).
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
 *   - client.getLayerMetadata(serviceId, layerId)        (availability probe)
 *   - client.getMapServiceMetadata(serviceId)            (availability probe)
 *   - HonuaSDK.createDataset(...) + source.query()/queryAll()  (feature data)
 *   - HonuaSDK.envelope(...)                              (click hit-test filter)
 *   - HonuaSDK.createHonuaTileServiceLayer(...)           (raster tile sources)
 *   - HonuaSDK.isHonuaError / HonuaHttpError              (graceful 404s)
 *   - <honua-basemap-switcher> (@honua/sdk-js/controls)   (exclusive bases)
 *   - <honua-legend> (@honua/sdk-js/controls)             (palette-driven legend)
 *
 * Bases are EXCLUSIVE: the vector "Map", NAIP "Imagery", and the composite
 * "Terrain" (vector base + hillshade) are registered with the SDK's native
 * <honua-basemap-switcher>, which guarantees exactly one base renders at a
 * time — hillshade and imagery can never stack. Data overlays stay
 * independent toggles above the active base.
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

  /* ── PMTiles protocol (shared by basemap + static raster archives) ─ */

  /*
   * Registers the pmtiles:// protocol (vendored assets/vendor/pmtiles.js)
   * exactly once so pmtiles:// source URLs resolve through HTTP range
   * requests against the Honua proxy instead of the browser trying to fetch
   * the pmtiles:// scheme directly (which CSP rightly blocks). Used by the
   * vector basemap AND the pre-baked raster archives (hillshade, imagery,
   * terrarium terrain).
   */
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

  /* ── Cartography palettes (ONE constant, TWO consumers) ──────────────
   * Each palette below drives BOTH the layer's paint expression and the
   * <honua-legend> explicit section, so the map and its legend cannot drift.
   *
   * Zoning: families are grouped on `zone_code` — the County of Maui's
   * stable numeric district code. The descriptive `zone_dist` field is NOT
   * used for matching because its spelling varies in the source data (the
   * live layer carries both "M-1 Light Industrial" and "M1 Light
   * Industrial" for code 410). Codes were discovered with a
   * returnDistinctValues query against the live FeatureServer layer.
   * Colors are a colorblind-considerate categorical set tuned for the dark
   * vector base (distinct hues, mid-high lightness). */
  var ZONING_ATTRIBUTE = "zone_code";
  var ZONING_FALLBACK_COLOR = "#8b97a0"; // interim, roads, project/historic districts, unzoned + unseen codes
  var ZONING_FAMILIES = [
    // R-0/R-1/R-2/R-3, Residential-WRA, D-1/D-2 duplex
    { family: "Residential", codes: ["000", "010", "020", "030", "040", "101", "102"], color: "#e8c862" },
    // Multi Family-WRA, A-1/A-2 apartment, H/H-1/H-2/H-M hotel
    { family: "Apartment / Hotel", codes: ["100", "110", "120", "200", "210", "215", "220"], color: "#e2914e" },
    // B-1/B-2/B-3/B-CT/BR, WCT, Commercial Mixed Use/Business Multi Family-WRA, SBR
    { family: "Business / Commercial", codes: ["310", "320", "330", "340", "360", "365", "370", "380", "390"], color: "#d978a8" },
    // M-1/M-2/M-3, AP airport
    { family: "Industrial", codes: ["410", "420", "425", "430"], color: "#a48ad8" },
    // AG, R rural, RU-0.5/RU-1
    { family: "Agricultural / Rural", codes: ["500", "600", "605", "610"], color: "#8fb454" },
    // GC, OS/OS-1/OS-2, drainage, OZ, beach right-of-way, PK/PK(GC)
    { family: "Park / Open Space", codes: ["819", "820", "821", "822", "825", "829", "919", "925", "929"], color: "#55b88a" },
    // P-1/P-2, Public/Quasi-Public-WRA, P public use
    { family: "Public / Quasi-public", codes: ["900", "902", "905", "909"], color: "#6aa9dc" },
  ];

  /* FEMA flood zones, grouped by hazard class on `fld_zone` (live distinct
   * values: A, AE, AH, AO, D, V, VE, X). */
  var FLOOD_ATTRIBUTE = "fld_zone";
  var FLOOD_FALLBACK_COLOR = "#8b97a0";
  var FLOOD_CLASSES = [
    { label: "Coastal high hazard (V, VE)", codes: ["V", "VE"], color: "#e2737e" },
    { label: "1% annual chance (A, AE, AH, AO)", codes: ["A", "AE", "AH", "AO"], color: "#5b9bd1" },
    { label: "Minimal hazard (X)", codes: ["X"], color: "#56708a" },
    { label: "Undetermined (D)", codes: ["D"], color: "#8b97a0" },
  ];

  /* Builds ["match", ["get", attr], codes1, color1, ..., fallback]. */
  function categoricalMatch(attribute, groups, fallbackColor) {
    var expr = ["match", ["get", attribute]];
    groups.forEach(function (group) {
      expr.push(group.codes.slice());
      expr.push(group.color);
    });
    expr.push(fallbackColor);
    return expr;
  }

  /* Injects the palette-driven paints into the loaded config (layers.json
   * deliberately omits these paints — see its $paintComment fields). */
  function applyCartographyPaints(config) {
    var zoning = findLayerDef(config, "zoning");
    if (zoning) {
      zoning.paint = {
        "fill-color": categoricalMatch(ZONING_ATTRIBUTE, ZONING_FAMILIES, ZONING_FALLBACK_COLOR),
        "fill-opacity": 0.5,
        "fill-outline-color": "rgba(4, 21, 26, 0.55)",
      };
    }
    var flood = findLayerDef(config, "flood-hazard");
    if (flood) {
      flood.paint = {
        "fill-color": categoricalMatch(FLOOD_ATTRIBUTE, FLOOD_CLASSES, FLOOD_FALLBACK_COLOR),
        // Minimal-hazard X covers most of the inhabited coast — keep it quiet.
        "fill-opacity": ["match", ["get", FLOOD_ATTRIBUTE], ["X"], 0.22, 0.5],
        "fill-outline-color": "rgba(4, 21, 26, 0.5)",
      };
    }
  }

  /* ── Legend (<honua-legend>, @honua/sdk-js/controls) ──────────────────
   * Explicit-sections mode: with a match on grouped code arrays, derive
   * mode would label rows with the raw joined code lists ("000, 010, 020,
   * …"), so the legend gets explicit family rows instead — built from the
   * SAME palette constants the paint expressions use. Sections carry the
   * style layer id + `follow-layer-visibility`, so each section appears
   * only while its layer is on; `auto-refresh` re-renders on styledata. */
  function buildLegendSections(config) {
    var sections = [
      {
        title: "Zoning — district family",
        layer: "lyr-zoning",
        entries: ZONING_FAMILIES.map(function (group) {
          return { label: group.family, color: group.color, shape: "fill" };
        }).concat([{ label: "Other / unzoned", color: ZONING_FALLBACK_COLOR, shape: "fill" }]),
      },
      {
        title: "Flood hazard (FEMA)",
        layer: "lyr-flood-hazard",
        entries: FLOOD_CLASSES.map(function (group) {
          return { label: group.label, color: group.color, shape: "fill" };
        }),
      },
    ];
    var slr = findLayerDef(config, "sea-level-rise");
    if (slr && slr.paint && typeof slr.paint["fill-color"] === "string") {
      sections.push({
        title: "Sea level rise (NOAA)",
        layer: "lyr-sea-level-rise",
        entries: [{ label: "3.2 ft scenario extent", color: slr.paint["fill-color"], shape: "fill" }],
      });
    }
    return sections;
  }

  /* Wire the legend AFTER the overlay layers exist on the map: sections
   * reference style layer ids, and `follow-layer-visibility` reads each
   * section layer's visibility on every render — probing a layer that was
   * never added (unseeded dataset) would log a MapLibre error per render.
   * Sections for unavailable layers are filtered out for the same reason. */
  function setupLegend(map, config, states) {
    var legend = el("demo-legend");
    if (!legend || typeof legend.connect !== "function") return;
    var presentLayerIds = {};
    (states || []).forEach(function (state) {
      if (!state.available) return;
      state.mapLayerIds.forEach(function (id) {
        presentLayerIds[id] = true;
      });
    });
    legend.entries = buildLegendSections(config).filter(function (section) {
      return presentLayerIds[section.layer];
    });
    legend.connect(map);
  }

  /* ── Exclusive bases (<honua-basemap-switcher>, @honua/sdk-js/controls) ─
   *
   * Three exclusive bases, all streamed as PMTiles byte ranges through the
   * Honua range proxy:
   *   - "map":     the dark Protomaps vector base (config.basemap)
   *   - "imagery": the NAIP raster pyramid
   *   - "terrain": COMPOSITE — vector base + hillshade rendered together
   * The switcher's style binding guarantees exclusivity (hillshade and
   * imagery can never stack) and keeps base layers beneath the overlays.
   *
   * The `background` layer from the map's initial style is declared as a
   * SHARED layer of every base: the binding inserts base layers before the
   * first style layer not owned by any base, so without owning `background`
   * (the first style layer, opaque) every base would be inserted beneath it
   * and never render.
   *
   * Graceful absence: each archive is HEAD-probed (the same contract the
   * old single-basemap loader used); bases whose archives are missing are
   * dropped, and with zero bases the switcher hides + the pending badge
   * shows. */
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

  function probeBaseArchives(config) {
    var bm = config.basemap || {};
    var imagery = findBaseDef(config, "imagery");
    var terrain = findBaseDef(config, "terrain");
    return Promise.all([
      probeArchive(bm.proxyUrl),
      probeArchive(imagery && imagery.pmtiles && imagery.pmtiles.proxyUrl),
      probeArchive(terrain && terrain.hillshade && terrain.hillshade.pmtiles && terrain.hillshade.pmtiles.proxyUrl),
    ]).then(function (results) {
      return { basemap: results[0], imagery: results[1], hillshade: results[2] };
    });
  }

  function findBaseDef(config, baseId) {
    var bases = config.bases || [];
    for (var i = 0; i < bases.length; i++) {
      if (bases[i].id === baseId) return bases[i];
    }
    return null;
  }

  function buildBaseDefinitions(config, availability) {
    var bm = config.basemap || {};
    var backgroundLayer = {
      id: "background",
      type: "background",
      paint: { "background-color": config.map.background },
    };
    var vectorSources = {
      basemap: { type: "vector", url: "pmtiles://" + bm.proxyUrl, attribution: bm.attribution || "" },
    };
    var vectorLayers = ((bm.style && bm.style.layers) || []).map(function (layer) {
      return JSON.parse(JSON.stringify(layer)); // deep copy — the binding owns these objects
    });

    var definitions = [];
    (config.bases || []).forEach(function (base) {
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
          // Composite: SHARES the vector base sources/layers with "map" —
          // the binding keeps shared layers visible across both bases.
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

  /* Guard so scene-driven base changes don't clear the active scene chip,
   * while a user click on the switcher does (the view no longer matches). */
  var baseChangeFromScene = false;

  /* The connected <honua-basemap-switcher>, set during bootstrap (null when
   * no base archive is seeded yet — scenes then skip base selection). */
  var activeSwitcher = null;

  function setupBasemapSwitcher(map, config, availability) {
    var switcher = el("demo-basemap-switcher");
    if (!switcher || typeof switcher.connect !== "function") return null;
    var definitions = buildBaseDefinitions(config, availability);
    if (definitions.length === 0) {
      switcher.style.display = "none";
      var badge = el("basemap-pending-badge");
      if (badge) badge.style.display = "inline";
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

    // Static PMTiles layers (raster archives AND the pre-baked MVT vector
    // archives): probe the archive on the range proxy with a HEAD request
    // (mirrors the basemap contract). The whole availability check stays off
    // the database/dynamic-rendering path. Queryable vector layers still get
    // an SDK FeatureServer source for click queries — this probe only gates
    // rendering, and a failed click query never breaks the page.
    if (def.pmtiles && def.pmtiles.proxyUrl) {
      return fetch(def.pmtiles.proxyUrl, { method: "HEAD" }).then(
        function (res) {
          state.probed = true;
          state.available = res.ok;
          if (!res.ok) {
            state.failure = res.status === 404 ? "not-seeded" : "error";
          }
          return state;
        },
        function () {
          state.probed = true;
          state.available = false;
          state.failure = "unreachable";
          return state;
        }
      );
    }

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
      if (def.pmtiles && def.pmtiles.proxyUrl && ensurePMTilesProtocol()) {
        // Pre-baked static PMTiles archive via the Honua range proxy: byte
        // ranges straight off object storage — no dynamic rendering, no DB.
        // The dynamic ImageServer route in def.service stays as the
        // documented live-rendering fallback.
        map.addSource(sourceId, {
          type: "raster",
          url: "pmtiles://" + def.pmtiles.proxyUrl,
          tileSize: 256,
          attribution: def.attribution,
        });
      } else {
        // SDK helper builds the {z}/{y}/{x} raster source from the MapServer path.
        var tileDef = S.createHonuaTileServiceLayer({
          id: def.id,
          url: base + def.service.path,
          attribution: def.attribution,
        });
        map.addSource(sourceId, tileDef.source);
      }
      map.addLayer({ id: "lyr-" + def.id, type: "raster", source: sourceId, paint: def.paint || {} });
      state.mapLayerIds = ["lyr-" + def.id];
    } else if (def.render === "terrain") {
      if (def.pmtiles && def.pmtiles.proxyUrl && ensurePMTilesProtocol()) {
        // Static terrarium-encoded DEM tiles (PMTiles). NOTE: encodings
        // differ by source — the archive is terrarium, the dynamic /terrain
        // fallback route is Mapbox Terrain-RGB.
        map.addSource(sourceId, {
          type: "raster-dem",
          url: "pmtiles://" + def.pmtiles.proxyUrl,
          tileSize: 256,
          encoding: def.pmtiles.encoding || "terrarium",
          attribution: def.attribution,
        });
      } else {
        map.addSource(sourceId, {
          type: "raster-dem",
          tiles: [base + def.service.tileTemplate],
          tileSize: 256,
          encoding: def.service.encoding || "terrarium",
          attribution: def.attribution,
        });
      }
      state.terrainSourceId = sourceId;
      state.mapLayerIds = [];
    } else if (def.render === "mvt") {
      var useVectorArchive = Boolean(def.pmtiles && def.pmtiles.proxyUrl && ensurePMTilesProtocol());
      if (useVectorArchive) {
        // Pre-baked static MVT archive (tippecanoe) via the Honua range
        // proxy: byte ranges straight off object storage — no ST_AsMVT, no
        // database. Zoom range comes from the archive header (TileJSON), so
        // MapLibre overzooms past the baked maxzoom exactly like it does on
        // the capped dynamic source. The dynamic OGC Tiles route in
        // def.tiles stays as the documented live-rendering fallback.
        map.addSource(sourceId, {
          type: "vector",
          url: "pmtiles://" + def.pmtiles.proxyUrl,
          attribution: def.attribution,
        });
      } else {
        map.addSource(sourceId, {
          type: "vector",
          tiles: [base + def.tiles.tileTemplate],
          minzoom: 0,
          // Source maxzoom caps how deep MapLibre requests tiles; past it the
          // client overzooms. layers.json sets 13 for the heavy MVT layers so a
          // z14+ scene pulls a couple of z13 tiles instead of ~18 z14 tiles —
          // the demo RDS (db.t4g.micro) cannot serve that burst cold.
          maxzoom: (def.tiles && typeof def.tiles.maxzoom === "number") ? def.tiles.maxzoom : 15,
          attribution: def.attribution,
        });
      }
      var mvtLayer = {
        id: "lyr-" + def.id,
        source: sourceId,
        // Tippecanoe names the archive's internal layer; the contract pins it
        // to 'layer' (matching the server's ST_AsMVT constant) and declares it
        // per-layer as pmtiles.sourceLayer in case an archive ever diverges.
        "source-layer": useVectorArchive && def.pmtiles.sourceLayer ? def.pmtiles.sourceLayer : def.tiles.sourceLayer,
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
            "text-font": ["NotoSansRegular"],
            "text-size": 11,
            "text-offset": [0, 0.9],
            "text-anchor": "top",
          },
          // Halo sized for every base: barely-there on the dark vector base,
          // load-bearing over bright NAIP imagery.
          paint: { "text-color": "#e6efee", "text-halo-color": "#04151a", "text-halo-width": 1.4 },
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
      caption:
        "Zoning districts colored by family — residential, business, agricultural, open space — with TMK parcel lines over Wailuku. The legend reads from the same palette the layer paints with; click any parcel to inspect it.",
      base: "map",
      layers: ["parcels", "zoning"],
      camera: { center: [-156.498, 20.885], zoom: 14, pitch: 0, bearing: 0 },
      capabilities: [
        { label: "Vector tiles (MVT) — static PMTiles range proxy", edition: "Community" },
        { label: "Live MVT rendering — OGC API Tiles", edition: "Community" },
        { label: "Attribute query — GeoServices FeatureServer", edition: "Community" },
        { label: "Native UI controls (legend) — @honua/sdk-js/controls", edition: "Community" },
      ],
      code: function (config) {
        var parcels = findLayerDef(config, "parcels");
        if (parcels.pmtiles && parcels.pmtiles.proxyUrl) {
          return [
            "// zoning + parcels stream as pre-baked MVT byte ranges (no database)",
            'map.addSource("parcels", { type: "vector",',
            '  url: "pmtiles://' + parcels.pmtiles.proxyUrl + '" });',
            "// live alternative: " + parcels.tiles.tileTemplate + " (rendered per request)",
            '// one palette, two consumers: match on "' + ZONING_ATTRIBUTE + '" paints the map…',
            '"fill-color": ["match", ["get", "' + ZONING_ATTRIBUTE + '"], ["010", "020", …], "#e8c862", …]',
            "// …and the same constant feeds the SDK legend control",
            'document.querySelector("honua-legend").entries = zoningSections;',
          ].join("\n");
        }
        return [
          "// zoning + parcels arrive as MVT from Honua's OGC API Tiles route",
          'map.addSource("parcels", { type: "vector",',
          '  tiles: ["' + config.server.baseUrl + parcels.tiles.tileTemplate + '"] });',
          '// one palette, two consumers: match on "' + ZONING_ATTRIBUTE + '" paints the map…',
          '"fill-color": ["match", ["get", "' + ZONING_ATTRIBUTE + '"], ["010", "020", …], "#e8c862", …]',
          "// …and the same constant feeds the SDK legend control",
          'document.querySelector("honua-legend").entries = zoningSections;',
        ].join("\n");
      },
    },
    {
      id: "coastal-risk",
      name: "Coastal risk",
      caption:
        "FEMA flood zones by hazard class and the NOAA 3.2 ft sea-level-rise extent over the Kīhei coast, on the terrain base.",
      base: "terrain",
      layers: ["flood-hazard", "sea-level-rise"],
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
      base: "terrain",
      layers: ["terrain"],
      camera: { center: [-156.22, 20.74], zoom: 11.2, pitch: 60, bearing: 150 },
      capabilities: [
        { label: "Terrain tiles — terrarium DEM, static PMTiles range proxy", edition: "Community" },
        { label: "Raster tiles (hillshade) — static PMTiles range proxy", edition: "Community" },
        { label: "Live raster rendering (ImageServer / terrain routes)", edition: "Community" },
      ],
      code: function (config) {
        var base = findBaseDef(config, "terrain");
        var hillshade = base && base.hillshade;
        var terrain = findLayerDef(config, "terrain");
        if (hillshade && hillshade.pmtiles && terrain.pmtiles) {
          return [
            '// the "Terrain" base = vector base + hillshade, one exclusive option',
            "// swapped by the SDK's native basemap switcher control",
            'switcher.select("terrain"); // hillshade: pmtiles://' + hillshade.pmtiles.proxyUrl.replace(config.server.baseUrl, "…"),
            "// the 2.5D tilt reads a separate terrarium DEM via the same range proxy",
            'map.addSource("terrain-dem", { type: "raster-dem", encoding: "terrarium",',
            '  url: "pmtiles://' + terrain.pmtiles.proxyUrl + '" });',
            'map.setTerrain({ source: "terrain-dem", exaggeration: ' + (terrain.exaggeration || 1.2) + " });",
          ].join("\n");
        }
        return [
          "// hillshade: the SDK builds the raster tile source from the MapServer path",
          "const hillshade = HonuaSDK.createHonuaTileServiceLayer({",
          '  id: "hillshade", url: "' + config.server.baseUrl + (hillshade ? hillshade.service.path : "") + '" });',
          'map.addSource("hillshade", hillshade.source);',
          "// Terrain-RGB-encoded DEM tiles from the same server drive the 2.5D tilt",
          'map.setTerrain({ source: "terrain-dem", exaggeration: ' + (terrain.exaggeration || 1.2) + " });",
        ].join("\n");
      },
    },
    {
      id: "imagery",
      name: "Imagery",
      caption: "USDA NAIP aerial imagery as an exclusive base over Kahului — one radio on the switcher, same range proxy.",
      base: "imagery",
      layers: [],
      camera: { center: [-156.47, 20.885], zoom: 13, pitch: 0, bearing: 0 },
      capabilities: [
        { label: "Raster tiles — static PMTiles range proxy", edition: "Community" },
        { label: "Native UI controls (basemap switcher) — @honua/sdk-js/controls", edition: "Community" },
        { label: "COG serving direct from S3/Azure", edition: "Pro" },
      ],
      code: function (config) {
        var imagery = findBaseDef(config, "imagery");
        if (imagery && imagery.pmtiles) {
          return [
            "// exclusive bases via the SDK's native control kit:",
            "// <honua-basemap-switcher> shows exactly one base at a time",
            'switcher.select("imagery");',
            "// under the hood: one pre-baked WebP PMTiles pyramid (z7-13)",
            'map.addSource("imagery-base", { type: "raster",',
            '  url: "pmtiles://' + imagery.pmtiles.proxyUrl + '" });',
            "// live alternative: " + imagery.service.tileTemplate + " (rendered per request)",
          ].join("\n");
        }
        return [
          "// NAIP imagery: cloud-optimized GeoTIFFs served as map tiles",
          "const imagery = HonuaSDK.createHonuaTileServiceLayer({",
          '  id: "imagery", url: "' + config.server.baseUrl + (imagery ? imagery.service.path : "") + '" });',
          'map.addSource("imagery", imagery.source);',
          'map.addLayer({ id: "imagery", type: "raster", source: "imagery" });',
        ].join("\n");
      },
    },
    {
      id: "place-names",
      name: "Place names",
      caption: "USGS GNIS place names with Hawaiian diacriticals — Hāna, Kaunakakai, Lānaʻi City — across all four islands of Maui Nui, rendered from live queries.",
      base: "terrain",
      layers: ["place-names"],
      camera: { center: [-156.68, 20.87], zoom: 9, pitch: 0, bearing: 0 },
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

  var ACCENT_RE = /\b(HonuaSDK|HonuaClient|createDataset|createHonuaTileServiceLayer|envelope|queryAll|query|source|setTerrain|addSource|addLayer|getSource|setData|select|querySelector)\b/g;

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

    // Each scene prescribes an exclusive base; the switcher guarantees the
    // bases never stack (scene-driven changes keep the scene chip active).
    selectBase(activeSwitcher, scene.base);

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
    // none of its datasets are seeded yet. Scenes whose story is the base
    // itself (no overlay layers, e.g. Imagery) are never "pending".
    var nonePresent =
      scene.layers.length > 0 &&
      scene.layers.every(function (layerId) {
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

  /* URL-valued attributes (e.g. the TMK assessor link) become real links;
   * the https?:// anchor keeps javascript:/data: schemes out. */
  function renderPopupValue(value) {
    if (value === null || value === undefined) return escapeHtml("—");
    var text = String(value);
    if (/^https?:\/\/\S+$/i.test(text)) {
      var label = text.replace(/^https?:\/\//i, "");
      if (label.length > 34) label = label.slice(0, 31) + "…";
      return (
        '<a class="demo-popup-link" href="' +
        escapeHtml(text) +
        '" target="_blank" rel="noopener">' +
        escapeHtml(label) +
        " ↗</a>"
      );
    }
    return escapeHtml(text);
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
            renderPopupValue(attrs[key]) +
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
        // Palette-driven paints (zoning families, flood classes) — the same
        // constants feed the legend, so map and legend cannot drift.
        applyCartographyPaints(config);

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

        // MapLibre console.error()s every failed tile fetch unless an error
        // listener exists. The demo database (db.t4g.micro) can 503 MVT
        // bursts when cold and tile fetches abort routinely during camera
        // moves — both transient, both retried/refetched by MapLibre. Route
        // them to console.debug so a visitor's console stays clean; real
        // failures still surface through the status pill / layer badges.
        map.on("error", function (event) {
          if (console && console.debug) {
            console.debug("maplibre:", event && event.error ? event.error.message : event);
          }
        });

        setStatus("probing", "checking demo.honua.io…");

        ensurePMTilesProtocol();

        var states = createLayerState(config);
        var probes = Promise.all(
          states.map(function (state) {
            return probeLayer(client, state);
          })
        );
        var baseProbes = probeBaseArchives(config);
        // LIVE-SERVER WORKAROUND: client.checkCompatibility() reads
        // GET /api/v1/admin/capabilities, which demo.honua.io serves behind
        // auth — every page view logged a guaranteed console 401 and the
        // version suffix never rendered. Skip the call (resolving null takes
        // the exact code path the .catch already took) until the live server
        // exposes the compatibility contract unauthenticated; then restore:
        //   client.checkCompatibility().catch(function () { return null; })
        var compatibility = Promise.resolve(null);
        var mapReady = new Promise(function (resolve) {
          map.on("load", resolve);
        });

        Promise.all([probes, compatibility, mapReady, baseProbes]).then(function (results) {
          // Exclusive bases first, so they sit beneath every overlay layer.
          // (The legend is wired further down, once overlays exist on the
          // map — its sections reference overlay layer ids.)
          activeSwitcher = setupBasemapSwitcher(map, config, results[3]);

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

          // Overlays exist now — wire the legend (SDK control; sections are
          // built from the same palette constants as the layer paints).
          setupLegend(map, config, states);

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

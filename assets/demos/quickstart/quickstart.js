/*
 * honua.io "Put a map on the page" — the JavaScript flagship (demo.html).
 *
 * One MapLibre map, one Honua server, four SDK verbs:
 *
 *   - HonuaSDK.connect()               discover maui-parcels FeatureServer layer 1
 *   - HonuaSDK.explainQuery()          the plan for "which parcel is under the click?"
 *   - HonuaSDK.mountSourceToMapLibre() execute that plan and mount the parcel on the map
 *   - source.query()                   the same query, read back for the popup
 *
 * Rendering: maui-zoning (FeatureServer layer 2) is styled by category from
 * OGC API Tiles MVT; maui-parcels lot lines come from the same tile route.
 * The Maui parcels layer carries only a TMK tax-zone digit (1-6), not a
 * zoning or land-use class, so the category style is applied to the zoning
 * layer underneath the parcels. The page says so in its sidebar.
 *
 * Basemap: Protomaps vector archive through the PMTiles range proxy, styled
 * from the shared assets/demo/layers.json contract. If the archive does not
 * answer, the map stays on the dark background and the chip says why.
 *
 * Live first. If the demo server is unreachable, the bundled Kahului fixture
 * (assets/demos/quickstart/fixtures/*.geojson) is drawn instead and the
 * status pill says "fixture". Geocoding has no fixture: it reports
 * unavailable rather than inventing a location.
 *
 * SDK: @honua/sdk-js 0.2.9 browser IIFE (window.HonuaSDK), vendored verbatim
 * from the npm tarball under assets/sdk-samples/0.2.9/d46ee89/browser/ and
 * loaded with its published SRI hash.
 */
(function () {
  "use strict";

  var BASE = "https://demo.honua.io";
  var LAYERS_CONFIG = "assets/demo/layers.json";
  var PARCELS = BASE + "/rest/services/maui-parcels/FeatureServer/1";
  var ZONING_TILES = BASE + "/ogc/tiles/collections/maui-zoning/tiles/WebMercatorQuad/{z}/{y}/{x}";
  var PARCEL_TILES = BASE + "/ogc/tiles/collections/maui-parcels/tiles/WebMercatorQuad/{z}/{y}/{x}";
  var GEOCODER = BASE + "/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";
  var FIXTURES = {
    zoning: "assets/demos/quickstart/fixtures/zoning.geojson",
    parcels: "assets/demos/quickstart/fixtures/parcels.geojson",
  };
  var ATTRIBUTION = "County of Maui · Hawaiʻi Statewide GIS Program";
  // The dynamic parcel tile route answers 413 for the densest z13 tiles in
  // Kahului, so parcel lines start at z14. Clicking works at every zoom.
  var PARCEL_MINZOOM = 14;

  /* ── Category style: ONE table, TWO consumers (map paint + legend) ──
   * zone_code is a three-digit County of Maui code whose first digit is the
   * zoning family; "099" (Interim) is the one code outside its family. */
  var CATEGORIES = [
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
  var INTERIM = { code: "099", label: "Interim", color: "#8f86b0" };
  var FALLBACK_COLOR = "#4a5a66";

  function categoryExpression() {
    var match = ["match", ["slice", ["coalesce", ["get", "zone_code"], ""], 0, 1]];
    CATEGORIES.forEach(function (c) {
      match.push(c.key, c.color);
    });
    match.push(FALLBACK_COLOR);
    return ["case", ["==", ["get", "zone_code"], INTERIM.code], INTERIM.color, match];
  }

  /* ── the copyable call site (kept ≤ 20 lines; it is what developers take away) ── */
  var CODE = [
    '<script src="maplibre-gl.js"></script> <script src="honua-sdk.min.js"></script>  <!-- @honua/sdk-js 0.2.9 -->',
    'const base = "https://demo.honua.io", S = HonuaSDK;',
    'const map = new maplibregl.Map({ container: "map", center: [-156.47, 20.89], zoom: 12, style: { version: 8, sources: {},',
    '  layers: [{ id: "bg", type: "background", paint: { "background-color": "#0a1a24" } }] } });',
    'map.on("load", async () => {',
    '  map.addSource("zoning", { type: "vector", tiles: [base + "/ogc/tiles/collections/maui-zoning/tiles/WebMercatorQuad/{z}/{y}/{x}"] });',
    '  map.addLayer({ id: "zoning", type: "fill", source: "zoning", "source-layer": "layer", paint: { "fill-opacity": 0.6,',
    '    "fill-color": ["match", ["slice", ["get", "zone_code"], 0, 1], "0", "#e8c862", "3", "#e0645c", "5", "#7fbf5a", "#7d95a3"] } });',
    '  const parcels = (await S.connect({ endpoint: base + "/rest/services/maui-parcels/FeatureServer/1",',
    '    protocol: "auto", authorizationScopeFingerprint: "public" })).source();',
    '  let picked;',
    '  map.on("click", async ({ lngLat }) => {',
    '    const query = { filter: S.queryFilter.spatial("intersects", S.point(lngLat.lng, lngLat.lat)),',
    '      outFields: ["tmk_txt", "gisacres"], returnGeometry: true, pagination: { limit: 1 } };',
    '    const plan = S.explainQuery({ descriptor: parcels.descriptor, query }); // inspect it before it runs',
    '    picked?.dispose(); picked = await S.mountSourceToMapLibre(map, parcels, plan, { sourceId: "picked" });',
    '    const [parcel] = (await parcels.query(query)).features;',
    '    new maplibregl.Popup().setLngLat(lngLat).setText(`TMK ${parcel.attributes.tmk_txt}`).addTo(map);',
    "  });",
    "});",
  ].join("\n");

  /* ── DOM helpers ─────────────────────────────────────────────── */

  function el(id) {
    return document.getElementById(id);
  }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function setStatus(state, text) {
    var pill = el("qs-status");
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

  var requestLog = [];
  function logRequest(method, url, outcome) {
    requestLog.unshift({ method: method, url: url, outcome: outcome });
    if (requestLog.length > 8) requestLog.length = 8;
    var list = el("qs-requests");
    if (!list) return;
    list.textContent = "";
    requestLog.forEach(function (entry) {
      var item = make("li");
      item.appendChild(make("span", "qs-req-method", entry.method));
      item.appendChild(make("span", "qs-req-url", entry.url));
      item.appendChild(make("span", "qs-req-outcome", entry.outcome));
      list.appendChild(item);
    });
  }

  function renderLegend() {
    var list = el("qs-legend");
    if (!list) return;
    list.textContent = "";
    CATEGORIES.concat([{ label: INTERIM.label + " (" + INTERIM.code + ")", color: INTERIM.color }]).forEach(function (c) {
      var item = make("li");
      var swatch = make("span", "qs-swatch");
      swatch.style.background = c.color;
      item.appendChild(swatch);
      item.appendChild(make("span", null, c.label));
      list.appendChild(item);
    });
  }

  function renderCode() {
    var block = el("qs-code");
    if (block) block.textContent = CODE;
    var copy = el("qs-copy");
    if (!copy) return;
    copy.addEventListener("click", function () {
      var done = function (label) {
        copy.textContent = label;
        setTimeout(function () {
          copy.textContent = "copy";
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(CODE).then(
          function () {
            done("copied");
          },
          function () {
            done("select + copy");
          }
        );
      } else {
        done("select + copy");
      }
    });
  }

  /* ── basemap (shared contract) ───────────────────────────────── */

  function fetchJson(url) {
    return fetch(url).then(function (response) {
      if (!response.ok) throw new Error(response.status + " " + url);
      return response.json();
    });
  }

  function probeArchive(url) {
    if (!url) return Promise.resolve({ ok: false, status: "unset" });
    return fetch(url, { method: "HEAD" }).then(
      function (response) {
        return { ok: response.ok, status: response.status };
      },
      function () {
        return { ok: false, status: "network" };
      }
    );
  }

  function ensurePMTilesProtocol() {
    if (!window.pmtiles || !window.maplibregl) return false;
    if (ensurePMTilesProtocol.done) return true;
    var protocol = new window.pmtiles.Protocol();
    window.maplibregl.addProtocol("pmtiles", protocol.tile);
    ensurePMTilesProtocol.done = true;
    return true;
  }

  function addBasemap(map, shared) {
    var basemap = (shared && shared.basemap) || {};
    return probeArchive(basemap.proxyUrl).then(function (probe) {
      logRequest("HEAD", basemap.proxyUrl || "(no basemap configured)", String(probe.status));
      if (!probe.ok || !ensurePMTilesProtocol()) {
        setChip(
          "qs-basemap-chip",
          "degraded",
          "basemap: Protomaps archive unavailable (" + probe.status + ") — dark background"
        );
        return false;
      }
      map.addSource("basemap", {
        type: "vector",
        url: "pmtiles://" + basemap.proxyUrl,
        attribution: basemap.attribution || "",
      });
      var before = map.getLayer("zoning-fill") ? "zoning-fill" : undefined;
      ((basemap.style && basemap.style.layers) || []).forEach(function (layer) {
        var copy = {};
        Object.keys(layer).forEach(function (key) {
          if (key.charAt(0) !== "$") copy[key] = layer[key];
        });
        try {
          map.addLayer(copy, before);
        } catch (_error) {
          /* a basemap layer the vendored MapLibre cannot parse is skipped, never fatal */
        }
      });
      setChip("qs-basemap-chip", "live", "basemap: Protomaps via PMTiles range proxy");
      return true;
    });
  }

  /* ── data layers ─────────────────────────────────────────────── */

  function addDataLayers(map, mode, fixtures) {
    if (mode === "live") {
      map.addSource("zoning", {
        type: "vector",
        tiles: [ZONING_TILES],
        minzoom: 7,
        maxzoom: 16,
        attribution: ATTRIBUTION,
      });
      map.addSource("parcels", {
        type: "vector",
        tiles: [PARCEL_TILES],
        minzoom: PARCEL_MINZOOM,
        maxzoom: 16,
      });
    } else {
      map.addSource("zoning", { type: "geojson", data: fixtures.zoning, attribution: ATTRIBUTION + " · fixture" });
      map.addSource("parcels", { type: "geojson", data: fixtures.parcels });
    }
    var vector = mode === "live";
    var add = function (layer) {
      if (vector) layer["source-layer"] = "layer";
      map.addLayer(layer);
    };
    add({
      id: "zoning-fill",
      type: "fill",
      source: "zoning",
      paint: { "fill-color": categoryExpression(), "fill-opacity": 0.55 },
    });
    add({
      id: "zoning-line",
      type: "line",
      source: "zoning",
      paint: { "line-color": "#0a1a24", "line-width": 0.6, "line-opacity": 0.8 },
    });
    add({
      id: "parcels-line",
      type: "line",
      source: "parcels",
      minzoom: vector ? PARCEL_MINZOOM : 0,
      paint: {
        "line-color": "#d8efe8",
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.3, 15, 0.8, 17, 1.4],
        "line-opacity": 0.55,
      },
    });
  }

  /* ── popup ───────────────────────────────────────────────────── */

  function zoningAt(map, point) {
    var hits = map.queryRenderedFeatures(point, { layers: ["zoning-fill"] });
    return hits.length ? hits[0].properties : null;
  }

  function showPopup(map, lngLat, parcel, zoning, note) {
    var body = make("div", "qs-popup");
    if (parcel) {
      body.appendChild(make("strong", null, "TMK " + (parcel.tmk_txt || "—")));
      if (typeof parcel.gisacres === "number") {
        body.appendChild(make("span", null, parcel.gisacres.toFixed(2) + " GIS acres"));
      }
    } else {
      body.appendChild(make("strong", null, "No parcel here"));
    }
    if (zoning) {
      body.appendChild(make("span", null, "Zoning: " + (zoning.zone_dist || zoning.zone_code || "—")));
    }
    if (parcel && parcel.qpub_link && /^https:\/\//.test(parcel.qpub_link)) {
      var link = make("a", null, "County parcel record ↗");
      link.href = parcel.qpub_link;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      body.appendChild(link);
    }
    if (note) body.appendChild(make("em", null, note));
    if (showPopup.current) showPopup.current.remove();
    showPopup.current = new window.maplibregl.Popup({ maxWidth: "260px" }).setLngLat(lngLat).setDOMContent(body).addTo(map);
  }

  /* ── live lane: the SDK verbs ────────────────────────────────── */

  function connectParcels() {
    var S = window.HonuaSDK;
    if (!S || typeof S.connect !== "function") return Promise.reject(new Error("SDK bundle not loaded"));
    return S.connect({
      endpoint: PARCELS,
      protocol: "auto",
      authorizationScopeFingerprint: "public",
      clientOptions: {
        timeoutMs: 10000,
        interceptors: [
          {
            after: function (context) {
              logRequest(context.request.method || "GET", context.request.url, String(context.response.status));
            },
            error: function (context) {
              logRequest(context.request.method || "GET", context.request.url, "error");
            },
          },
        ],
      },
    }).then(function (connection) {
      return connection.source();
    });
  }

  function wireLiveClick(map, parcels) {
    var S = window.HonuaSDK;
    var picked = null;
    map.on("click", function (event) {
      var lngLat = event.lngLat;
      var zoning = zoningAt(map, event.point);
      var query = {
        filter: S.queryFilter.spatial("intersects", S.point(lngLat.lng, lngLat.lat)),
        outFields: ["tmk_txt", "gisacres", "qpub_link"],
        returnGeometry: true,
        pagination: { limit: 1 },
      };
      var plan;
      try {
        plan = S.explainQuery({ descriptor: parcels.descriptor, query: query });
      } catch (error) {
        showPopup(map, lngLat, null, zoning, "plan rejected: " + (error && error.message ? error.message : error));
        return;
      }
      var planNode = el("qs-plan");
      if (planNode) {
        planNode.textContent =
          (plan.fingerprint || "plan") +
          " · " +
          (plan.steps || [])
            .map(function (step) {
              return step.engine + ":" + step.operation;
            })
            .join(" → ");
      }
      if (picked) {
        try {
          picked.dispose();
        } catch (_error) {
          /* already gone */
        }
        picked = null;
      }
      var mount = S.mountSourceToMapLibre(map, parcels, plan, {
        sourceId: "picked",
        layerId: "picked",
        geometry: "polygon",
        paint: { "fill-color": "#5fc4a6", "fill-opacity": 0.45, "fill-outline-color": "#c9fff0" },
      }).then(
        function (mounted) {
          picked = mounted;
        },
        function (error) {
          /* the popup below still reports the parcel; the highlight is decoration */
          if (window.console) window.console.warn("[quickstart] mount failed:", error && error.message ? error.message : error);
        }
      );
      var read = parcels.query(query).then(
        function (result) {
          var feature = result.features && result.features[0];
          showPopup(map, lngLat, feature ? feature.attributes : null, zoning);
        },
        function (error) {
          showPopup(map, lngLat, null, zoning, "parcel query failed: " + (error && error.message ? error.message : error));
        }
      );
      Promise.all([mount, read]).then(function () {
        if (el("qs-map")) el("qs-map").dataset.lastClick = lngLat.lng.toFixed(5) + "," + lngLat.lat.toFixed(5);
      });
    });
  }

  /* ── fixture lane ────────────────────────────────────────────── */

  function wireFixtureClick(map) {
    map.on("click", function (event) {
      var parcels = map.queryRenderedFeatures(event.point, { layers: ["parcels-line"] });
      var zoning = zoningAt(map, event.point);
      var parcel = parcels.length ? parcels[0].properties : null;
      showPopup(map, event.lngLat, parcel, zoning, "fixture — live server unreachable");
    });
  }

  /* ── geocoder ────────────────────────────────────────────────── */

  var marker = null;
  function wireGeocoder(map) {
    var form = el("qs-geocode");
    if (!form) return;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var input = el("qs-address");
      var note = el("qs-geocode-note");
      var text = input ? input.value.trim() : "";
      if (!text) return;
      var url = GEOCODER + "?SingleLine=" + encodeURIComponent(text) + "&maxLocations=1&f=json";
      if (note) note.textContent = "searching…";
      fetch(url)
        .then(function (response) {
          logRequest("GET", url, String(response.status));
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function (body) {
          var best = body && body.candidates && body.candidates[0];
          if (!best || !best.location) {
            if (note) note.textContent = "no match for “" + text + "”";
            return;
          }
          var center = [best.location.x, best.location.y];
          map.flyTo({ center: center, zoom: 15, speed: 1.6 });
          if (marker) marker.remove();
          marker = new window.maplibregl.Marker({ color: "#e8c862" }).setLngLat(center).addTo(map);
          if (note) note.textContent = best.address + " · score " + best.score;
          if (el("qs-map")) el("qs-map").dataset.geocoded = best.address;
        })
        .catch(function (error) {
          if (note) note.textContent = "geocoder unavailable (" + (error && error.message ? error.message : error) + ") — no fixture substitute";
        });
    });
  }

  /* ── bootstrap ───────────────────────────────────────────────── */

  function createMap() {
    var map = new window.maplibregl.Map({
      container: "qs-map",
      style: {
        version: 8,
        glyphs: BASE + "/fonts/{fontstack}/{range}.pbf",
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": "#0a1a24" } }],
      },
      center: [-156.47, 20.89],
      zoom: 12,
      minZoom: 7,
      maxZoom: 18,
      attributionControl: { compact: false },
    });
    map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    window.honuaQuickstart = { map: map };
    return map;
  }

  function onLoad(map) {
    return new Promise(function (resolve) {
      if (map.loaded()) resolve();
      else map.once("load", resolve);
    });
  }

  function loadFixtures() {
    return Promise.all([fetchJson(FIXTURES.zoning), fetchJson(FIXTURES.parcels)]).then(function (loaded) {
      return { zoning: loaded[0], parcels: loaded[1] };
    });
  }

  function bootstrap() {
    renderLegend();
    renderCode();
    if (!window.maplibregl) {
      setStatus("error", "MapLibre failed to load");
      return;
    }
    setStatus("probing", "connecting to demo.honua.io…");
    var map = createMap();
    wireGeocoder(map);

    var shared = fetchJson(LAYERS_CONFIG).catch(function () {
      return null;
    });
    var parcels = connectParcels();

    onLoad(map).then(function () {
      parcels.then(
        function (source) {
          addDataLayers(map, "live");
          wireLiveClick(map, source);
          setStatus("live", "live · demo.honua.io · maui-parcels + maui-zoning");
          setChip("qs-data-chip", "live", "data: OGC API Tiles MVT + FeatureServer query");
        },
        function (error) {
          return loadFixtures().then(
            function (fixtures) {
              addDataLayers(map, "fixture", fixtures);
              wireFixtureClick(map);
              map.fitBounds([[-156.48, 20.88], [-156.44, 20.9]], { padding: 30, duration: 0 });
              setStatus("fixture", "fixture — live server unreachable");
              setChip(
                "qs-data-chip",
                "degraded",
                "data: bundled Kahului fixture (" + (error && error.message ? error.message : error) + ")"
              );
            },
            function () {
              setStatus("error", "live server unreachable and fixture failed to load");
            }
          );
        }
      ).then(function () {
        return shared.then(function (config) {
          return addBasemap(map, config);
        });
      });
    });

    map.on("error", function (event) {
      var source = event && event.sourceId;
      if (source === "zoning" || source === "parcels") {
        setChip("qs-data-chip", "degraded", "data: some " + source + " tiles failed to load");
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootstrap);
  else bootstrap();
})();

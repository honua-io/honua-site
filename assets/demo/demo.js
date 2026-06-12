/*
 * honua.io live demo — Maui, Hawaiʻi.
 *
 * Data access goes through the official Honua JS SDK (@honua/sdk-js), loaded
 * as a vendored browser bundle (assets/vendor/honua-sdk.min.js, exposed as
 * window.HonuaSDK — see assets/vendor/README.md for provenance). MapLibre GL
 * (window.maplibregl) does pure rendering.
 *
 * Every endpoint / service id / collection id lives in assets/demo/layers.json
 * (the seeding contract). Nothing here hardcodes a Honua path.
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

  /* ── Layer panel UI ─────────────────────────────────────────────── */

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

  /* ── Click → SDK query → popup ──────────────────────────────────── */

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

  function bootstrap() {
    if (!window.maplibregl || !window.HonuaSDK) {
      setStatus("error", "demo assets failed to load");
      return;
    }
    var S = window.HonuaSDK;

    fetch(CONFIG_URL)
      .then(function (response) {
        if (!response.ok) throw new Error("Failed to load " + CONFIG_URL);
        return response.json();
      })
      .then(function (config) {
        var client = new S.HonuaClient({ baseUrl: config.server.baseUrl });

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
        map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
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

          renderPanel(map, states);
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

/*
 * honua.io "One Layer, Five Doors" demo (route: demo-two-protocols.html).
 *
 * Doors 1-3 — one canonical query, executed through the protocol-neutral contract
 * of the official Honua JS SDK (@honua/sdk-js, vendored as
 * assets/vendor/honua-sdk.min.js → window.HonuaSDK):
 *
 *   - protocol: "geoservices-feature-service"  → /rest/services/…/FeatureServer/0/query
 *   - protocol: "ogc-features"                 → /ogc/features/collections/…/items
 *
 * The two source descriptors differ ONLY in `protocol` and `locator`; the
 * query object and the result shape are identical. A third strip shows the
 * same filter through OData v4 ($filter), also via the SDK's "odata" source.
 *
 * Door 4 — OGC API Tiles: the same layer as MVT on the same map (toggle),
 *   filtered client-side by the same zone_code predicate; the pane counts the
 *   tiles MapLibre loaded and the matching features they carry.
 * Door 5 — OGC API Maps: the server renders the current map view (bbox) as a
 *   PNG; the pane reports the image bytes. That route takes no attribute
 *   filter today, which the pane says rather than pretending otherwise.
 *
 * Dual lane: live against https://demo.honua.io when the zoning layer is
 * seeded; bundled fixtures (assets/demos/two-protocols/fixtures/*) otherwise,
 * labeled "sample data — live server pending".
 *
 * SDK surface used:
 *   - new HonuaSDK.HonuaClient({ baseUrl, interceptors })  (timing + raw capture)
 *   - client.getLayerMetadata(serviceId, layerId)          (availability probe)
 *   - HonuaSDK.createDataset(...) + dataset.source(id).query(...)
 *   - HonuaSDK.PROTOCOL_DEFAULT_CAPABILITIES
 *   - HonuaSDK.envelope(...)                               (bbox filter)
 *
 * Endpoint / schema contract lives in assets/demos/two-protocols/config.json.
 */
(function () {
  "use strict";

  var CONFIG_URL = "assets/demos/two-protocols/config.json";
  var RAW_PREVIEW_LIMIT = 4000; // chars of pretty-printed response shown per pane

  /* Opt-in backend override (assets/demos/backend-override.js). Identity when no
   * ?apiBase= / window.HONUA_DEMO_BASE_URL override is active, so the default lane
   * is byte-identical; the fallback keeps the page working if the shim is absent. */
  var BACKEND = window.HonuaDemoBackend || {
    resolve: function (pageDefault) { return pageDefault; },
    rebase: function (value) { return value; },
  };

  /* ── tiny DOM helpers ───────────────────────────────────────── */

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(state, text) {
    var pill = el("tp-status");
    if (!pill) return;
    pill.dataset.state = state;
    pill.textContent = text;
  }

  /* ── Esri JSON → GeoJSON (rendering only; polygons + passthrough) ─ */

  function esriRingArea(ring) {
    var area = 0;
    for (var i = 0; i < ring.length - 1; i++) {
      area += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
    }
    return area; /* > 0 = clockwise (shell) */
  }

  function esriGeometryToGeoJson(geom) {
    if (!geom) return null;
    if (geom.type && (geom.coordinates || geom.geometries)) return geom; // already GeoJSON
    if (Array.isArray(geom.rings)) {
      var shells = [];
      var holes = [];
      for (var i = 0; i < geom.rings.length; i++) {
        var ring = geom.rings[i];
        if (!Array.isArray(ring) || ring.length < 4) continue;
        (esriRingArea(ring) > 0 ? shells : holes).push(ring);
      }
      if (shells.length === 0) {
        return geom.rings.length ? { type: "Polygon", coordinates: geom.rings } : null;
      }
      if (shells.length === 1) return { type: "Polygon", coordinates: [shells[0]].concat(holes) };
      return {
        type: "MultiPolygon",
        coordinates: shells.map(function (shell) {
          return [shell];
        }),
      };
    }
    if (typeof geom.x === "number" && typeof geom.y === "number") {
      return { type: "Point", coordinates: [geom.x, geom.y] };
    }
    return null;
  }

  function sdkFeaturesToGeoJson(features) {
    var out = [];
    for (var i = 0; i < features.length; i++) {
      var geometry = esriGeometryToGeoJson(features[i].geometry);
      if (!geometry) continue;
      out.push({ type: "Feature", geometry: geometry, properties: features[i].attributes || {} });
    }
    return { type: "FeatureCollection", features: out };
  }

  /* ── raw-response preview ───────────────────────────────────── */

  function prettyPreview(value) {
    var text;
    if (typeof value === "string") {
      try {
        text = JSON.stringify(JSON.parse(value), null, 2);
      } catch (_e) {
        text = value;
      }
    } else {
      text = JSON.stringify(value, null, 2);
    }
    if (text.length > RAW_PREVIEW_LIMIT) {
      return text.slice(0, RAW_PREVIEW_LIMIT) + "\n… (truncated — " + text.length + " chars total)";
    }
    return text;
  }

  /* ── pane rendering ─────────────────────────────────────────── */

  function renderPane(key, data) {
    // data: { url, urlLabel, ms, count, totalCount, raw, error, sample }
    var req = el("tp-req-" + key);
    if (req) {
      req.innerHTML =
        '<span class="lbl">' +
        escapeHtml(data.urlLabel || "GET") +
        " </span>" +
        escapeHtml(data.url || "—");
    }
    var stats = el("tp-stats-" + key);
    if (stats) {
      if (data.error) {
        stats.innerHTML = '<span class="tp-stat-err">error: ' + escapeHtml(data.error) + "</span>";
      } else {
        var ms =
          typeof data.ms === "number"
            ? "<span><strong>" + Math.round(data.ms) + "</strong> ms</span>"
            : '<span>elapsed: n/a · sample</span>';
        var count = "<span><strong>" + data.count + "</strong> features</span>";
        var total =
          typeof data.totalCount === "number" && data.totalCount !== data.count
            ? "<span>(" + data.totalCount + " matched)</span>"
            : "";
        stats.innerHTML = count + total + ms;
      }
    }
    var raw = el("tp-raw-" + key);
    if (raw) {
      raw.textContent = data.raw ? prettyPreview(data.raw) : data.error ? "// request failed" : "// no response";
    }
    var flag = el("tp-flag-" + key);
    if (flag) flag.style.display = data.sample ? "inline-block" : "none";
  }

  function renderMatchLine(gs, ogc, od) {
    var line = el("tp-match");
    if (!line) return;
    if (gs.error || ogc.error || (od && od.error)) {
      line.dataset.state = "mismatch";
      line.textContent = "✗ one of the query doors failed — see the pane for details";
      return;
    }
    var same = gs.count === ogc.count && (!od || od.count === gs.count);
    if (same) {
      line.dataset.state = "match";
      line.textContent =
        "✓ " + gs.count + " features — identical results through " + (od ? "all three query doors" : "both feature protocols");
    } else {
      line.dataset.state = "mismatch";
      line.textContent =
        "✗ counts differ: GeoServices " + gs.count + " vs OGC " + ogc.count + (od ? " vs OData " + od.count : "");
    }
  }

  /* ── code strips (always the code that actually runs) ───────── */

  function codeLine(text, diff) {
    var html = escapeHtml(text);
    html = html.replace(/(\/\/[^&]*)$/, '<span class="tp-code-comment">$1</span>');
    return diff ? '<span class="tp-code-diff">' + html + "</span>" : html;
  }

  function queryLines(state) {
    var lines = [];
    lines.push("  .query({");
    if (state.where) lines.push('    where: "' + state.where + '",');
    if (state.bbox) {
      lines.push("    spatialFilter: HonuaSDK.envelope(");
      lines.push(
        "      " +
          state.bbox.map(function (n) {
            return n.toFixed(4);
          }).join(", ") +
          ", { wkid: 4326 }),"
      );
    }
    lines.push('    outFields: ["*"],');
    lines.push("    returnGeometry: true,");
    lines.push("    pagination: { limit: " + state.limit + " },");
    lines.push("  });");
    return lines;
  }

  function renderCodeStrips(config, state) {
    var base = config.server.baseUrl;
    var layer = config.layer;

    var gs = [];
    gs.push(codeLine("// source descriptor — the only lines that differ:"));
    gs.push(codeLine('{ id: "zoning-geoservices",', true));
    gs.push(codeLine('  protocol: "geoservices-feature-service",', true));
    gs.push(codeLine('  locator: { url: "' + base + '",', true));
    gs.push(codeLine('             serviceId: "' + layer.serviceId + '", layerId: ' + layer.layerId + " },", true));
    gs.push(codeLine("  capabilities: HonuaSDK.PROTOCOL_DEFAULT_CAPABILITIES[", true));
    gs.push(codeLine('    "geoservices-feature-service"] }', true));
    gs.push(codeLine(""));
    gs.push(codeLine("// identical from here on"));
    gs.push(codeLine('var result = await dataset.source("zoning-geoservices")', true));
    queryLines(state).forEach(function (line) {
      gs.push(codeLine(line));
    });
    el("tp-code-geoservices").innerHTML = gs.join("\n");

    var ogc = [];
    ogc.push(codeLine("// source descriptor — the only lines that differ:"));
    ogc.push(codeLine('{ id: "zoning-ogc",', true));
    ogc.push(codeLine('  protocol: "ogc-features",', true));
    ogc.push(codeLine('  locator: { url: "' + base + '",', true));
    ogc.push(codeLine('             collectionId: "' + layer.collectionId + '" },', true));
    ogc.push(codeLine("  capabilities: HonuaSDK.PROTOCOL_DEFAULT_CAPABILITIES[", true));
    ogc.push(codeLine('    "ogc-features"] }', true));
    ogc.push(codeLine(""));
    ogc.push(codeLine("// identical from here on"));
    ogc.push(codeLine('var result = await dataset.source("zoning-ogc")', true));
    queryLines(state).forEach(function (line) {
      ogc.push(codeLine(line));
    });
    el("tp-code-ogc").innerHTML = ogc.join("\n");

    var od = [];
    od.push(codeLine("// same query, OData v4 lane — where compiles to $filter"));
    od.push(codeLine('{ id: "zoning-odata",', true));
    od.push(codeLine('  protocol: "odata",', true));
    od.push(
      codeLine(
        '  locator: { url: "' +
          base +
          config.odata.basePath +
          '", layerId: ' +
          (state.odataLayerId === null ? "/* discovered from /odata/Layers */" : state.odataLayerId) +
          " },",
        true
      )
    );
    od.push(codeLine("  capabilities: HonuaSDK.PROTOCOL_DEFAULT_CAPABILITIES.odata }", true));
    od.push(codeLine('var result = await dataset.source("zoning-odata")', true));
    queryLines(state).forEach(function (line) {
      od.push(codeLine(line));
    });
    el("tp-code-odata").innerHTML = od.join("\n");

    var tiles = [];
    tiles.push(codeLine("// door 4 — the same layer as vector tiles, same predicate as a style filter"));
    tiles.push(codeLine('map.addSource("zoning-mvt", { type: "vector",', true));
    tiles.push(codeLine('  tiles: ["' + base + config.tiles.path + '"] });', true));
    tiles.push(codeLine('map.addLayer({ id: "zoning-mvt", type: "line", source: "zoning-mvt",'));
    tiles.push(codeLine('  "source-layer": "' + config.tiles.sourceLayer + '",'));
    tiles.push(
      codeLine(
        "  filter: " + JSON.stringify(mvtFilter(config)) + " });",
        true
      )
    );
    el("tp-code-tiles").innerHTML = tiles.join("\n");
  }

  /* ── canonical query construction (shared by every lane) ────── */

  function builderState(config, map, odataLayerId) {
    var select = el("tp-filter");
    var value = select ? select.value : "";
    var state = {
      where: value ? config.layer.filterField + " = '" + value + "'" : undefined,
      bbox: null,
      limit: config.query.limit,
      odataLayerId: odataLayerId,
    };
    var bboxToggle = el("tp-bbox");
    if (bboxToggle && bboxToggle.checked && map) {
      var b = map.getBounds();
      state.bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    }
    return state;
  }

  function toSdkQuery(state) {
    var S = window.HonuaSDK;
    var query = {
      outFields: ["*"],
      returnGeometry: true,
      pagination: { limit: state.limit },
    };
    if (state.where) query.where = state.where;
    if (state.bbox) {
      query.spatialFilter = S.envelope(state.bbox[0], state.bbox[1], state.bbox[2], state.bbox[3], { wkid: 4326 });
    }
    return query;
  }

  /* ── fixture lane ───────────────────────────────────────────── */

  function bboxIntersectsFeature(bbox, feature) {
    // feature: GeoJSON Polygon fixture — compute its bbox and test overlap.
    var coords = feature.geometry && feature.geometry.coordinates;
    if (!coords || !coords[0]) return false;
    var xmin = Infinity;
    var ymin = Infinity;
    var xmax = -Infinity;
    var ymax = -Infinity;
    for (var i = 0; i < coords[0].length; i++) {
      var pt = coords[0][i];
      if (pt[0] < xmin) xmin = pt[0];
      if (pt[0] > xmax) xmax = pt[0];
      if (pt[1] < ymin) ymin = pt[1];
      if (pt[1] > ymax) ymax = pt[1];
    }
    return xmin <= bbox[2] && xmax >= bbox[0] && ymin <= bbox[3] && ymax >= bbox[1];
  }

  function filterFixtureFeatures(fixtures, config, state) {
    var field = config.layer.filterField;
    var match = el("tp-filter") ? el("tp-filter").value : "";
    return fixtures.ogc.features.filter(function (feature) {
      if (match && feature.properties[field] !== match) return false;
      if (state.bbox && !bboxIntersectsFeature(state.bbox, feature)) return false;
      return true;
    });
  }

  function odataFilterExpression(config, state) {
    // Mirrors the SDK's where → $filter rewrite for the simple equality the
    // builder emits (the live lane uses the SDK's real rewrite).
    var parts = [];
    if (state.where) parts.push(state.where.replace(" = ", " eq "));
    return parts.join(" and ");
  }

  function fixtureUrls(config, state) {
    var base = config.server.baseUrl;
    var layer = config.layer;

    var gs = new URLSearchParams();
    gs.set("f", "json");
    gs.set("where", state.where || "1=1");
    gs.set("outFields", "*");
    gs.set("returnGeometry", "true");
    if (state.bbox) {
      gs.set(
        "geometry",
        JSON.stringify({
          xmin: state.bbox[0],
          ymin: state.bbox[1],
          xmax: state.bbox[2],
          ymax: state.bbox[3],
          spatialReference: { wkid: 4326 },
        })
      );
      gs.set("geometryType", "esriGeometryEnvelope");
      gs.set("spatialRel", "esriSpatialRelIntersects");
    }
    gs.set("resultRecordCount", String(state.limit));

    var ogc = new URLSearchParams();
    if (state.where) ogc.set("filter", state.where);
    if (state.bbox) ogc.set("bbox", state.bbox.join(","));
    ogc.set("limit", String(state.limit));

    var od = new URLSearchParams();
    od.set("$count", "true");
    var odFilter = odataFilterExpression(config, state);
    if (odFilter) od.set("$filter", odFilter);
    od.set("$select", config.odata.selectFields.join(","));
    od.set("$top", String(state.limit));

    return {
      geoservices:
        base + "/rest/services/" + layer.serviceId + "/FeatureServer/" + layer.layerId + "/query?" + gs.toString(),
      ogc: base + "/ogc/features/collections/" + layer.collectionId + "/items?" + ogc.toString(),
      odata: base + config.odata.basePath + "/Layers(2)/Features?" + od.toString(),
    };
  }

  function runFixtureLane(fixtures, config, map, state) {
    var matched = filterFixtureFeatures(fixtures, config, state);
    var ids = {};
    matched.forEach(function (f) {
      ids[f.id] = true;
    });
    var urls = fixtureUrls(config, state);

    var gsRaw = {};
    Object.keys(fixtures.geoservices).forEach(function (k) {
      if (k !== "$comment") gsRaw[k] = fixtures.geoservices[k];
    });
    gsRaw.features = fixtures.geoservices.features.filter(function (f) {
      return ids[f.attributes.OBJECTID];
    });

    var ogcRaw = {};
    Object.keys(fixtures.ogc).forEach(function (k) {
      if (k !== "$comment") ogcRaw[k] = fixtures.ogc[k];
    });
    ogcRaw.features = matched;
    ogcRaw.numberMatched = matched.length;
    ogcRaw.numberReturned = matched.length;

    var odRaw = { "@odata.context": fixtures.odata["@odata.context"] };
    odRaw["@odata.count"] = matched.length;
    odRaw.value = fixtures.odata.value.filter(function (row) {
      return ids[row.ObjectId];
    });

    renderPane("geoservices", {
      url: urls.geoservices,
      urlLabel: "GET (the request the page will send once the layer is live)",
      ms: null,
      count: gsRaw.features.length,
      raw: gsRaw,
      sample: true,
    });
    renderPane("ogc", {
      url: urls.ogc,
      urlLabel: "GET (the request the page will send once the layer is live)",
      ms: null,
      count: ogcRaw.features.length,
      raw: ogcRaw,
      sample: true,
    });
    renderPane("odata", {
      url: urls.odata,
      urlLabel: "GET (the request the page will send once the layer is live)",
      ms: null,
      count: odRaw.value.length,
      raw: odRaw,
      sample: true,
    });
    renderMatchLine({ count: gsRaw.features.length }, { count: ogcRaw.features.length }, { count: odRaw.value.length });
    renderRenderDoorsUnavailable(config);
    setMapData(map, { type: "FeatureCollection", features: matched });
  }

  /* ── live lane ──────────────────────────────────────────────── */

  function classifyRequest(url) {
    if (url.indexOf("/rest/services/") !== -1 && url.indexOf("/query") !== -1) return "geoservices";
    if (url.indexOf("/ogc/features/collections/") !== -1 && url.indexOf("/items") !== -1) return "ogc";
    if (url.indexOf("/odata/") !== -1 && url.indexOf("/Features") !== -1 && url.indexOf("$metadata") === -1) {
      return "odata";
    }
    return null;
  }

  function createCapture() {
    // Shared mutable slot the HonuaClient interceptor writes into; the run
    // loop reads it after each source.query() resolves. `active` gates out
    // probe/metadata traffic between runs.
    var capture = { active: false, lanes: {} };
    capture.interceptor = {
      after: function (context) {
        if (!capture.active) return;
        var lane = classifyRequest(context.request.url);
        if (!lane) return;
        var entry = {
          url: context.request.url,
          ms: context.durationMs,
          rawPromise: context.response
            .clone()
            .text()
            .catch(function () {
              return "";
            }),
        };
        capture.lanes[lane] = entry;
      },
      error: function (context) {
        if (!capture.active) return;
        var lane = classifyRequest(context.request.url);
        if (!lane) return;
        capture.lanes[lane] = {
          url: context.request.url,
          ms: context.durationMs,
          rawPromise: Promise.resolve(""),
        };
      },
    };
    return capture;
  }

  function runLiveSource(source, query, capture, lane) {
    return source.query(query).then(
      function (result) {
        var entry = capture.lanes[lane] || {};
        var rawPromise = entry.rawPromise || Promise.resolve("");
        return rawPromise.then(function (raw) {
          return {
            url: entry.url,
            ms: entry.ms,
            count: result.features.length,
            totalCount: typeof result.totalCount === "number" ? result.totalCount : undefined,
            raw: raw,
            features: result.features,
          };
        });
      },
      function (error) {
        var entry = capture.lanes[lane] || {};
        return {
          url: entry.url,
          ms: entry.ms,
          count: 0,
          error: error && error.message ? error.message : String(error),
        };
      }
    );
  }

  function runLiveLane(live, config, map, state) {
    var query = toSdkQuery(state);
    live.capture.active = true;
    live.capture.lanes = {};

    var runs = [
      runLiveSource(live.geoservices, query, live.capture, "geoservices"),
      runLiveSource(live.ogc, query, live.capture, "ogc"),
      live.odata
        ? runLiveSource(live.odata, query, live.capture, "odata")
        : Promise.resolve(null),
    ];

    return Promise.all(runs).then(function (results) {
      live.capture.active = false;
      var gs = results[0];
      var ogc = results[1];
      var od = results[2];

      renderPane("geoservices", {
        url: gs.url,
        urlLabel: "GET",
        ms: gs.ms,
        count: gs.count,
        totalCount: gs.totalCount,
        raw: gs.raw,
        error: gs.error,
        sample: false,
      });
      renderPane("ogc", {
        url: ogc.url,
        urlLabel: "GET",
        ms: ogc.ms,
        count: ogc.count,
        totalCount: ogc.totalCount,
        raw: ogc.raw,
        error: ogc.error,
        sample: false,
      });
      if (od) {
        renderPane("odata", {
          url: od.url,
          urlLabel: "GET",
          ms: od.ms,
          count: od.count,
          totalCount: od.totalCount,
          raw: od.raw,
          error: od.error,
          sample: false,
        });
      } else {
        var stats = el("tp-stats-odata");
        if (stats) {
          stats.innerHTML =
            "<span>OData layer id for this dataset is not discoverable yet — showing the sample lane above.</span>";
        }
      }
      renderMatchLine(gs, ogc, od);

      var renderable = !ogc.error && ogc.features ? ogc.features : !gs.error && gs.features ? gs.features : [];
      setMapData(map, sdkFeaturesToGeoJson(renderable));
    });
  }

  /* ── doors 4 + 5: OGC API Tiles (MVT) and OGC API Maps (PNG) ─ */

  function selectedValue() {
    var select = el("tp-filter");
    return select ? select.value : "";
  }

  // The builder's `zone_code = '030'` predicate, as a MapLibre style filter.
  function mvtFilter(config) {
    var value = selectedValue();
    return value ? ["==", ["get", config.layer.filterField], value] : ["has", config.layer.filterField];
  }

  var tilesDoor = { loaded: {}, firstUrl: null, enabled: false };

  function tileTemplate(config) {
    return config.server.baseUrl + config.tiles.path;
  }

  function ensureMvtLayer(map, config) {
    if (!map || map.getSource("tp-mvt")) return;
    map.addSource("tp-mvt", {
      type: "vector",
      tiles: [tileTemplate(config)],
      minzoom: config.tiles.minzoom,
      maxzoom: config.tiles.maxzoom,
      attribution: config.layer.attribution,
    });
    map.addLayer({
      id: "tp-mvt-line",
      type: "line",
      source: "tp-mvt",
      "source-layer": config.tiles.sourceLayer,
      filter: mvtFilter(config),
      paint: { "line-color": "#e8a35c", "line-width": 1.4, "line-opacity": 0.9 },
    });
    map.on("data", function (event) {
      if (event.sourceId !== "tp-mvt" || !event.tile || !event.tile.tileID) return;
      var c = event.tile.tileID.canonical;
      var key = c.z + "/" + c.y + "/" + c.x;
      if (!tilesDoor.loaded[key]) {
        tilesDoor.loaded[key] = true;
        if (!tilesDoor.firstUrl) {
          tilesDoor.firstUrl = tileTemplate(config).replace("{z}", c.z).replace("{y}", c.y).replace("{x}", c.x);
        }
      }
    });
    map.on("idle", function () {
      if (tilesDoor.enabled) renderTilesSummary(map, config);
    });
  }

  function renderTilesSummary(map, config) {
    var tileCount = Object.keys(tilesDoor.loaded).length;
    var ids = {};
    var matching = 0;
    if (map.getSource("tp-mvt")) {
      map
        .querySourceFeatures("tp-mvt", { sourceLayer: config.tiles.sourceLayer, filter: mvtFilter(config) })
        .forEach(function (feature) {
          var id = feature.id !== undefined ? feature.id : feature.properties && feature.properties.id;
          if (id === undefined) {
            matching += 1;
          } else if (!ids[id]) {
            ids[id] = true;
            matching += 1;
          }
        });
    }
    var req = el("tp-req-tiles");
    if (req) {
      req.innerHTML =
        '<span class="lbl">GET </span>' +
        escapeHtml(tileTemplate(config)) +
        (tilesDoor.firstUrl ? '<br /><span class="lbl">e.g. </span>' + escapeHtml(tilesDoor.firstUrl) : "");
    }
    var stats = el("tp-stats-tiles");
    if (stats) {
      stats.innerHTML =
        "<span><strong>" +
        tileCount +
        "</strong> tiles loaded</span><span><strong>" +
        matching +
        "</strong> matching features in loaded tiles</span>";
    }
  }

  function runTilesDoor(map, config) {
    var toggle = el("tp-mvt");
    tilesDoor.enabled = !!(toggle && toggle.checked);
    if (!map) return;
    var apply = function () {
      ensureMvtLayer(map, config);
      map.setFilter("tp-mvt-line", mvtFilter(config));
      map.setLayoutProperty("tp-mvt-line", "visibility", tilesDoor.enabled ? "visible" : "none");
      if (!tilesDoor.enabled) {
        var stats = el("tp-stats-tiles");
        if (stats) stats.innerHTML = "<span>toggle “Draw the selection from OGC API Tiles” to open this door</span>";
        var req = el("tp-req-tiles");
        if (req) req.innerHTML = '<span class="lbl">GET </span>' + escapeHtml(tileTemplate(config));
      } else {
        renderTilesSummary(map, config);
      }
    };
    if (map.__tpLoaded) apply();
    else map.once("load", apply);
  }

  var mapsDoor = { objectUrl: null, seq: 0 };

  function mapsRequest(map, config) {
    var b = map.getBounds();
    var bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(function (n) {
      return n.toFixed(5);
    });
    var canvas = map.getCanvas();
    var cw = canvas.clientWidth || 800;
    var ch = canvas.clientHeight || 340;
    var width = Math.min(config.maps.maxWidth, Math.round(cw));
    var height = Math.max(1, Math.round((width * ch) / cw));
    var url =
      config.server.baseUrl +
      config.maps.path +
      "?bbox=" +
      bbox.join(",") +
      "&width=" +
      width +
      "&height=" +
      height +
      "&f=" +
      config.maps.format;
    return { url: url, width: width, height: height };
  }

  function runMapsDoor(map, config) {
    if (!map) return Promise.resolve();
    var seq = ++mapsDoor.seq;
    var request = mapsRequest(map, config);
    var req = el("tp-req-maps");
    if (req) req.innerHTML = '<span class="lbl">GET </span>' + escapeHtml(request.url);
    var stats = el("tp-stats-maps");
    if (stats) stats.innerHTML = "<span>rendering…</span>";
    var started = performance.now();
    return fetch(request.url)
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.blob();
      })
      .then(function (blob) {
        if (seq !== mapsDoor.seq) return;
        var ms = performance.now() - started;
        if (stats) {
          stats.innerHTML =
            "<span><strong>" +
            blob.size.toLocaleString("en-US") +
            "</strong> bytes</span><span>" +
            escapeHtml(blob.type || "image/png") +
            " · " +
            request.width +
            "×" +
            request.height +
            "</span><span><strong>" +
            Math.round(ms) +
            "</strong> ms</span>";
        }
        var img = el("tp-maps-img");
        if (img) {
          if (mapsDoor.objectUrl) URL.revokeObjectURL(mapsDoor.objectUrl);
          mapsDoor.objectUrl = blob.size > 0 ? URL.createObjectURL(blob) : null;
          if (mapsDoor.objectUrl) {
            img.src = mapsDoor.objectUrl;
            img.hidden = false;
          } else {
            img.hidden = true;
          }
        }
        if (blob.size === 0 && stats) {
          stats.innerHTML += '<span class="tp-stat-err">empty image — the server returned 0 bytes</span>';
        }
      })
      .catch(function (error) {
        if (seq !== mapsDoor.seq) return;
        if (stats) {
          stats.innerHTML =
            '<span class="tp-stat-err">error: ' + escapeHtml(error && error.message ? error.message : error) + "</span>";
        }
      });
  }

  function whenIdle(map) {
    return new Promise(function (resolve) {
      if (!map) return resolve();
      var done = false;
      var finish = function () {
        if (!done) {
          done = true;
          resolve();
        }
      };
      map.once("idle", finish);
      setTimeout(finish, 4000);
      map.triggerRepaint();
    });
  }

  function renderRenderDoorsUnavailable(config) {
    ["tiles", "maps"].forEach(function (key) {
      var flag = el("tp-flag-" + key);
      if (flag) flag.style.display = "inline-block";
      var stats = el("tp-stats-" + key);
      if (stats) {
        stats.innerHTML =
          "<span>not opened — the live server is unavailable, and a rendering door has no honest sample substitute</span>";
      }
    });
    var tiles = el("tp-req-tiles");
    if (tiles) tiles.innerHTML = '<span class="lbl">GET (once live) </span>' + escapeHtml(tileTemplate(config));
    var maps = el("tp-req-maps");
    if (maps) {
      maps.innerHTML =
        '<span class="lbl">GET (once live) </span>' +
        escapeHtml(config.server.baseUrl + config.maps.path + "?bbox=…&width=…&height=…&f=" + config.maps.format);
    }
  }

  /* ── map ────────────────────────────────────────────────────── */

  function createMap(config) {
    if (!window.maplibregl) return null;
    var map = new window.maplibregl.Map({
      container: "tp-map",
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "background", type: "background", paint: { "background-color": config.map.background } }],
      },
      center: config.map.center,
      zoom: config.map.zoom,
      minZoom: config.map.minZoom,
      maxZoom: config.map.maxZoom,
      attributionControl: { compact: false },
    });
    map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    map.on("load", function () {
      map.__tpLoaded = true;
      map.addSource("tp-results", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        attribution: config.layer.attribution,
      });
      map.addLayer({
        id: "tp-results-fill",
        source: "tp-results",
        type: "fill",
        paint: { "fill-color": "#3aa088", "fill-opacity": 0.3 },
      });
      map.addLayer({
        id: "tp-results-line",
        source: "tp-results",
        type: "line",
        paint: { "line-color": "#5fc4a6", "line-width": 1.2 },
      });
    });
    return map;
  }

  var mapFittedOnce = false;

  function geoJsonExtent(featureCollection) {
    var xmin = Infinity;
    var ymin = Infinity;
    var xmax = -Infinity;
    var ymax = -Infinity;
    var scan = function (coords) {
      if (typeof coords[0] === "number") {
        if (coords[0] < xmin) xmin = coords[0];
        if (coords[0] > xmax) xmax = coords[0];
        if (coords[1] < ymin) ymin = coords[1];
        if (coords[1] > ymax) ymax = coords[1];
        return;
      }
      for (var i = 0; i < coords.length; i++) scan(coords[i]);
    };
    featureCollection.features.forEach(function (feature) {
      if (feature.geometry && feature.geometry.coordinates) scan(feature.geometry.coordinates);
    });
    return xmin <= xmax ? [xmin, ymin, xmax, ymax] : null;
  }

  function setMapData(map, featureCollection) {
    if (!map) return;
    var apply = function () {
      var src = map.getSource("tp-results");
      if (src) src.setData(featureCollection);
      // Re-fit whenever the selection changes (not when the visitor limited the
      // query to the current view), so every door looks at the same features.
      var bboxLimited = el("tp-bbox") && el("tp-bbox").checked;
      if ((!mapFittedOnce || !bboxLimited) && featureCollection.features.length > 0) {
        var extent = geoJsonExtent(featureCollection);
        if (extent) {
          mapFittedOnce = true;
          map.fitBounds([[extent[0], extent[1]], [extent[2], extent[3]]], { padding: 40, duration: 0, maxZoom: 14 });
        }
      }
    };
    if (map.isStyleLoaded() && map.getSource("tp-results")) {
      apply();
    } else {
      map.once("idle", apply);
    }
  }

  /* ── OData layer-id discovery (live lane only) ──────────────── */

  function discoverOdataLayerId(config) {
    // Honua Server keys OData feature routes by a server-wide integer layer
    // id (/odata/Layers({id})/Features). Resolve it by name from the layers
    // collection; if anything is off, the strip falls back to the sample lane.
    var url = config.server.baseUrl + config.odata.basePath + "/Layers?$top=200";
    var hints = config.odata.layerNameHints.map(function (h) {
      return h.toLowerCase();
    });
    return fetch(url)
      .then(function (response) {
        if (!response.ok) return null;
        return response.json();
      })
      .then(function (body) {
        if (!body || !Array.isArray(body.value)) return null;
        for (var i = 0; i < body.value.length; i++) {
          var row = body.value[i];
          var name = String(row.Name || row.name || "").toLowerCase();
          if (name && hints.indexOf(name) !== -1 && typeof (row.Id !== undefined ? row.Id : row.id) === "number") {
            return row.Id !== undefined ? row.Id : row.id;
          }
        }
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  /* ── bootstrap ──────────────────────────────────────────────── */

  function populateFilterOptions(config) {
    var select = el("tp-filter");
    if (!select) return;
    select.innerHTML = "";
    config.layer.filterOptions.forEach(function (option) {
      var node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.label;
      select.appendChild(node);
    });
  }

  function fetchJson(url) {
    return fetch(url).then(function (response) {
      if (!response.ok) throw new Error("Failed to load " + url);
      return response.json();
    });
  }

  function bootstrap() {
    setStatus("probing", "starting…");

    fetchJson(CONFIG_URL)
      .then(function (config) {
        // Every server URL in the config (server.baseUrl) is pointed at the override
        // backend when one is active; unchanged otherwise.
        config = BACKEND.rebase(config);
        return Promise.all([
          config,
          fetchJson(config.fixtures.geoservices),
          fetchJson(config.fixtures.ogc),
          fetchJson(config.fixtures.odata),
        ]);
      })
      .then(function (loaded) {
        var config = loaded[0];
        var fixtures = { geoservices: loaded[1], ogc: loaded[2], odata: loaded[3] };
        var map = createMap(config);
        populateFilterOptions(config);

        var S = window.HonuaSDK;
        var probe;
        var capture = null;
        var client = null;

        if (S) {
          capture = createCapture();
          client = new S.HonuaClient({
            baseUrl: config.server.baseUrl,
            timeoutMs: 8000,
            interceptors: [capture.interceptor],
            // SDK 0.0.14-alpha.0 stores `options.fetchFn ?? fetch` and calls it
            // as `this.fetchFn(...)`; an unbound window.fetch throws "Illegal
            // invocation" in browsers, so every request fails as a
            // HonuaNetworkError. Pass a bound fetch until the SDK binds it.
            fetchFn: window.fetch.bind(window),
          });
          probe = client
            .getLayerMetadata(config.layer.serviceId, config.layer.layerId)
            .then(function (meta) {
              return !(meta && meta.error);
            })
            .catch(function () {
              return false;
            });
        } else {
          probe = Promise.resolve(false);
        }

        probe.then(function (liveAvailable) {
          var live = null;
          var odataDiscovery = liveAvailable ? discoverOdataLayerId(config) : Promise.resolve(null);

          odataDiscovery.then(function (odataLayerId) {
            if (liveAvailable) {
              // One dataset, every protocol lane: the descriptors differ only
              // in `protocol` and `locator`. This is the demo's whole point.
              var sources = [
                {
                  id: "zoning-geoservices",
                  protocol: "geoservices-feature-service",
                  locator: {
                    url: config.server.baseUrl,
                    serviceId: config.layer.serviceId,
                    layerId: config.layer.layerId,
                  },
                  capabilities: S.PROTOCOL_DEFAULT_CAPABILITIES["geoservices-feature-service"],
                },
                {
                  id: "zoning-ogc",
                  protocol: "ogc-features",
                  locator: {
                    url: config.server.baseUrl,
                    collectionId: config.layer.collectionId,
                  },
                  capabilities: S.PROTOCOL_DEFAULT_CAPABILITIES["ogc-features"],
                },
              ];
              if (odataLayerId !== null) {
                sources.push({
                  id: "zoning-odata",
                  protocol: "odata",
                  locator: {
                    url: config.server.baseUrl + config.odata.basePath,
                    layerId: odataLayerId,
                  },
                  capabilities: S.PROTOCOL_DEFAULT_CAPABILITIES.odata,
                });
              }
              var dataset = S.createDataset({
                id: "maui-zoning-two-protocols",
                client: client,
                sources: sources,
                skipCompatibilityCheck: true,
              });
              live = {
                capture: capture,
                geoservices: dataset.source("zoning-geoservices"),
                ogc: dataset.source("zoning-ogc"),
                odata: odataLayerId !== null ? dataset.source("zoning-odata") : null,
              };
              var host = config.server.baseUrl.replace(/^https?:\/\//, "");
              setStatus("live", "live · " + host + " · " + config.layer.serviceId);
            } else {
              setStatus("sample", "sample data — live server pending");
            }

            var run = function () {
              var button = el("tp-run");
              if (button) button.disabled = true;
              var state = builderState(config, map, odataLayerId);
              renderCodeStrips(config, state);
              var done = live
                ? runLiveLane(live, config, map, state).then(function () {
                    runTilesDoor(map, config);
                    // The first run fits the map to the results; render the
                    // server PNG for the view the visitor actually sees.
                    return whenIdle(map).then(function () {
                      return runMapsDoor(map, config);
                    });
                  })
                : Promise.resolve(runFixtureLane(fixtures, config, map, state));
              done
                .catch(function () {
                  /* per-pane errors are rendered inline; never break the page */
                })
                .then(function () {
                  if (button) button.disabled = false;
                });
            };

            var runButton = el("tp-run");
            if (runButton) runButton.addEventListener("click", run);
            var mvtToggle = el("tp-mvt");
            if (mvtToggle && live) {
              mvtToggle.addEventListener("change", function () {
                runTilesDoor(map, config);
              });
            }

            // First render: run the default query so both panes are populated
            // without interaction (and the fixture lane works fully offline).
            run();
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

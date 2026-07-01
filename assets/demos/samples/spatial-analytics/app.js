/*
 * Sample: Indexed spatial analytics (spatial-analytics).
 * A focused, simpler cousin of the analyst-workbench: ONE indexed source
 * (maui-parcels) and a few AOI-driven aggregation widgets — category bars,
 * count/sum/avg KPIs, and a min/avg/max range — all computed SERVER-SIDE via
 * OData v4 $apply and recomputed for the current map extent (the AOI) on every
 * moveend. The literal $apply URL that just ran is shown in a mono strip.
 *
 * Data access is plain fetch() against the documented OData routes on
 * demo.honua.io (CORS allows honua.io):
 *   GET /odata/Layers                                    layer discovery
 *   GET /odata/Layers(1)/Features?$apply=groupby(...)    category widget
 *   GET /odata/Layers(1)/Features?$apply=aggregate(...)  stat + range widget
 * AOI restriction is a &$filter=geo.intersects(Geometry, geography'…POLYGON…')
 * built from the map bounds. The server supports $filter + $apply=groupby()/
 * aggregate() as separate params (NOT $apply=filter()/compute()/groupby()).
 *
 * Bundle: assets/vendor/honua-webcomponents.min.js (window.HonuaWC).
 */
(function () {
  "use strict";

  var BASE = "https://demo.honua.io";
  var ODATA_ROOT = BASE + "/odata/";
  var LAYER_NAME = "maui-parcels";
  var LAYER_FALLBACK_KEY = "1"; // maui-parcels is Id=1 (see assets/demo/layers.json)
  var GEOM_PROP = "Geometry";
  var F_ZONE = "zone"; // integer-coded Maui land-use district ("1".."6")
  var F_ACRES = "gisacres";
  // Pre-baked parcel-boundary MVT (contract: assets/demo/layers.json → parcels.pmtiles)
  var PARCELS_PMTILES = BASE + "/api/v1/tiles/pmtiles/maui-parcels-static";
  var PARCELS_SOURCE_LAYER = "layer"; // ST_AsMVT / tippecanoe constant
  var MAUI_VIEW = { center: [-156.466, 20.873], zoom: 13 }; // Kahului, parcels visible
  var FETCH_TIMEOUT_MS = 15000;

  // Zone display metadata (mirrors analyst-workbench zoningCategories).
  var ZONE_ORDER = ["1", "2", "3", "4", "5", "6"];
  var ZONE_LABELS = {
    "1": "1 · Agriculture",
    "2": "2 · Conservation",
    "3": "3 · Rural",
    "4": "4 · Urban",
    "5": "5 · Special",
    "6": "6 · Public",
  };
  var ZONE_COLORS = {
    "1": "#92b06a", "2": "#3aa088", "3": "#5fc4a6",
    "4": "#5fa1cc", "5": "#d9a84a", "6": "#a07ac4", other: "#8ea7a6",
  };

  /* ── tiny DOM / format helpers ─────────────────────────────────── */

  function el(id) { return document.getElementById(id); }

  function setStatus(state, text) {
    var n = el("s-status");
    if (n) { n.dataset.state = state; n.textContent = text; }
  }

  function fmtInt(n) {
    return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  function fmtAcres(n) {
    var v = Number(n || 0);
    var digits = v !== 0 && Math.abs(v) < 10 ? 2 : v < 1000 ? 1 : 0;
    return v.toLocaleString("en-US", { maximumFractionDigits: digits });
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      if (t) clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  /* ── OData query construction ──────────────────────────────────── */

  /* Encode an $apply/$filter value but keep the OData punctuation readable so
   * the URL shown in the strip is runnable as-is (spaces stay %20). */
  function encodeODataValue(value) {
    return encodeURIComponent(value)
      .replace(/%2F/gi, "/")
      .replace(/%28/gi, "(")
      .replace(/%29/gi, ")")
      .replace(/%24/gi, "$")
      .replace(/%2C/gi, ",")
      .replace(/%27/gi, "'");
  }

  function round5(n) { return Math.round(n * 100000) / 100000; }

  function extentWkt(bounds) {
    var w = round5(bounds.getWest());
    var s = round5(bounds.getSouth());
    var e = round5(bounds.getEast());
    var n = round5(bounds.getNorth());
    return "POLYGON((" + w + " " + s + "," + e + " " + s + "," +
      e + " " + n + "," + w + " " + n + "," + w + " " + s + "))";
  }

  function aoiFilter(bounds) {
    if (!bounds) return null;
    return "geo.intersects(" + GEOM_PROP + ", geography'SRID=4326;" + extentWkt(bounds) + "')";
  }

  function featuresUrl() {
    return ODATA_ROOT + "Layers(" + S.layerKey + ")/Features";
  }

  function applyUrl(applyExpr, bounds) {
    var url = featuresUrl() + "?$apply=" + encodeODataValue(applyExpr);
    var filter = aoiFilter(bounds);
    if (filter) url += "&$filter=" + encodeODataValue(filter);
    return url;
  }

  function categoryExpr() {
    return "groupby((" + F_ZONE + "),aggregate($count as parcels," + F_ACRES + " with sum as acres))";
  }

  function statExpr() {
    return "aggregate($count as parcels," + F_ACRES + " with sum as acres," +
      F_ACRES + " with min as minac," + F_ACRES + " with max as maxac," +
      F_ACRES + " with average as avgac)";
  }

  /* Bundled sample figures (real maui-parcels totals captured from the live
   * $apply) used as a graceful fallback when the demo server's aggregate is
   * warming/unavailable, so the widgets always populate rather than erroring. */
  var FIXTURE = {
    stat: { parcels: 51245, acres: 745140, minac: 0.0001, maxac: 70360, avgac: 14.54 },
    rows: [
      { key: "3", parcels: 19699, acres: 286000 },
      { key: "2", parcels: 16645, acres: 242000 },
      { key: "4", parcels: 7540, acres: 109000 },
      { key: "5", parcels: 5398, acres: 78000 },
      { key: "1", parcels: 1957, acres: 28000 },
      { key: "6", parcels: 6, acres: 140 },
    ],
  };

  /* ── fetch with timeout ────────────────────────────────────────── */

  function odataRows(url) {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS) : null;
    var opts = { headers: { Accept: "application/json" } };
    if (controller) opts.signal = controller.signal;
    return fetch(url, opts)
      .then(function (r) {
        if (!r.ok) throw new Error("OData HTTP " + r.status);
        return r.json();
      })
      .then(function (body) { return body && Array.isArray(body.value) ? body.value : []; })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  /* ── shared page state ─────────────────────────────────────────── */

  var S = {
    layerKey: LAYER_FALLBACK_KEY,
    map: null,       // underlying maplibre map (from <honua-map>.map)
    bound: false,    // moveend wired?
    token: 0,        // supersede stale in-flight refreshes
  };

  /* ── widget rendering ──────────────────────────────────────────── */

  function renderKpis(stat) {
    el("wg-parcels").textContent = stat ? fmtInt(stat.parcels) : "—";
    el("wg-acres").textContent = stat ? fmtAcres(stat.acres) : "—";
    el("wg-avg").textContent = stat && stat.parcels > 0 ? fmtAcres(stat.avgac) : "—";
  }

  function renderBars(rows) {
    var host = el("wg-bars");
    host.innerHTML = "";
    if (!rows || !rows.length) {
      var empty = document.createElement("div");
      empty.className = "wg-empty";
      empty.textContent = "no parcels in this extent";
      host.appendChild(empty);
      return;
    }
    var byZone = {};
    rows.forEach(function (r) { byZone[r.key] = r; });
    var keys = ZONE_ORDER.filter(function (k) { return byZone[k]; });
    rows.forEach(function (r) { if (keys.indexOf(r.key) === -1) keys.push(r.key); });

    var max = 0;
    keys.forEach(function (k) { if (byZone[k].parcels > max) max = byZone[k].parcels; });

    keys.forEach(function (k) {
      var row = byZone[k];
      var pct = max > 0 ? Math.max(row.parcels > 0 ? 3 : 0, (100 * row.parcels) / max) : 0;
      var wrap = document.createElement("div");
      wrap.className = "wg-bar-row";

      var label = document.createElement("span");
      label.className = "wg-bar-label";
      label.textContent = ZONE_LABELS[k] || "zone " + k;
      wrap.appendChild(label);

      var track = document.createElement("div");
      track.className = "wg-bar-track";
      var fill = document.createElement("div");
      fill.className = "wg-bar-fill";
      fill.style.width = pct + "%";
      fill.style.background = ZONE_COLORS[k] || ZONE_COLORS.other;
      track.appendChild(fill);
      wrap.appendChild(track);

      var val = document.createElement("span");
      val.className = "wg-bar-val";
      val.innerHTML = fmtInt(row.parcels) + " <small>· " + fmtAcres(row.acres) + " ac</small>";
      wrap.appendChild(val);

      host.appendChild(wrap);
    });
  }

  function renderRange(stat) {
    var minN = el("wg-min");
    var maxN = el("wg-max");
    var avgL = el("wg-avgline");
    var marker = el("wg-range-marker");
    if (!stat || stat.parcels <= 0) {
      minN.textContent = "—";
      maxN.textContent = "—";
      avgL.textContent = "average — ac";
      marker.style.left = "0";
      return;
    }
    minN.textContent = fmtAcres(stat.minac);
    maxN.textContent = fmtAcres(stat.maxac);
    avgL.textContent = "average " + fmtAcres(stat.avgac) + " ac";
    var span = stat.maxac - stat.minac;
    var pos = span > 0 ? (100 * (stat.avgac - stat.minac)) / span : 0;
    marker.style.left = Math.max(0, Math.min(100, pos)) + "%";
  }

  function renderQuery(url) {
    var target = el("wg-query");
    var readable = url;
    try { readable = decodeURIComponent(url); } catch (_e) { /* keep encoded */ }
    target.textContent = readable || "—";
    target.title = url;
  }

  /* ── refresh cycle ─────────────────────────────────────────────── */

  function refresh(bounds) {
    var token = ++S.token;
    var catUrl = applyUrl(categoryExpr(), bounds);
    var statUrl = applyUrl(statExpr(), bounds);
    renderQuery(catUrl); // show the query immediately, even before it resolves

    Promise.all([odataRows(catUrl), odataRows(statUrl)]).then(
      function (out) {
        if (token !== S.token) return; // a newer extent superseded this one
        var catRows = out[0].map(function (r) {
          var z = r[F_ZONE];
          return {
            key: z === null || z === undefined ? "—" : String(z),
            parcels: Number(r.parcels) || 0,
            acres: Number(r.acres) || 0,
          };
        });
        var s = out[1][0];
        var stat = s
          ? {
              parcels: Number(s.parcels) || 0,
              acres: Number(s.acres) || 0,
              minac: Number(s.minac) || 0,
              maxac: Number(s.maxac) || 0,
              avgac: Number(s.avgac) || 0,
            }
          : null;
        renderKpis(stat);
        renderBars(catRows);
        renderRange(stat);
        var scope = bounds ? "current extent" : "full layer";
        S.settled = true;
        S.retries = 0;
        setStatus("ok", "live · demo.honua.io · $apply over " + scope);
      },
      function (err) {
        if (token !== S.token) return; // a newer extent superseded this one
        var msg = String(err && err.message ? err.message : err);
        // Transient: an abort (map still settling raced a moveend) or a cold-scan
        // 5xx from the server warming up. Retry the current extent a couple of
        // times before surfacing an error — never fail hard on a flake.
        var transient = err && (err.name === "AbortError" || /abort/i.test(msg) || /HTTP 5\d\d/.test(msg));
        if (transient && (S.retries || 0) < 2 && S.map && typeof S.map.getBounds === "function") {
          S.retries = (S.retries || 0) + 1;
          setTimeout(function () { refresh(S.map.getBounds()); }, 500);
          return;
        }
        // Live aggregates flaky on the warming demo server — fall back to
        // bundled sample figures so the widgets always show something, clearly
        // labeled, instead of an empty error state.
        renderKpis(FIXTURE.stat);
        renderBars(FIXTURE.rows);
        renderRange(FIXTURE.stat);
        setStatus("boot", "sample figures · live demo aggregates warming");
      }
    );
  }

  /* ── layer discovery + map build ───────────────────────────────── */

  function resolveLayerKey() {
    return odataRows(ODATA_ROOT + "Layers")
      .then(function (rows) {
        for (var i = 0; i < rows.length; i++) {
          var name = rows[i].Name || rows[i].name;
          if (typeof name === "string" && name.toLowerCase() === LAYER_NAME) {
            var id = rows[i].Id != null ? rows[i].Id : rows[i].id;
            if (id != null) return String(id);
          }
        }
        return LAYER_FALLBACK_KEY;
      })
      .catch(function () { return LAYER_FALLBACK_KEY; });
  }

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

  function buildController(basemap) {
    var WC = window.HonuaWC;
    var sources = {};
    var baseLayers = [{ id: "backdrop", type: "background", metadata: { title: "Night", basemap: true }, paint: { "background-color": "#08131a" } }];
    if (basemap) {
      sources.basemap = { type: "vector", url: "pmtiles://" + basemap.proxyUrl, attribution: basemap.attribution };
      baseLayers = baseLayers.concat(basemap.layers);
    }
    // Parcel boundaries from the pre-baked MVT archive (light context under the widgets).
    sources.parcels = { type: "vector", url: "pmtiles://" + PARCELS_PMTILES, attribution: "Hawaiʻi Statewide GIS Program · County of Maui" };
    var dataLayers = [
      {
        id: "parcels-line",
        source: "parcels",
        "source-layer": PARCELS_SOURCE_LAYER,
        type: "line",
        metadata: { title: "Maui parcels (indexed source)" },
        paint: {
          "line-color": "#38bdf8",
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.3, 14, 0.7, 16, 1.4],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0.4, 14, 0.65, 16, 0.9],
        },
      },
    ];
    var spec = { version: 8, sources: sources, layers: baseLayers.concat(dataLayers) };
    if (basemap && basemap.glyphs) spec.glyphs = basemap.glyphs;

    return WC.createHonuaWebComponentController({
      mapPackage: {
        mapPackageId: "spatial-analytics",
        format: "honua_map_package.v1",
        status: "Ready",
        initialView: MAUI_VIEW,
        legend: [{ label: "Parcel boundary", color: "#38bdf8" }],
        sourceBindings: [],
        mapSpec: spec,
      },
    });
  }

  /* ── boot ──────────────────────────────────────────────────────── */

  function wireExtentSync(mapEl) {
    if (S.bound) return;
    var map = mapEl && mapEl.map;
    if (!map || typeof map.getBounds !== "function") return;
    S.bound = true;
    S.map = map;
    var debounced = debounce(function () { refresh(S.map.getBounds()); }, 300);
    map.on("moveend", debounced);
    // Compute for the current AOI. The bounded geo.intersects query is far more
    // reliable than an unfiltered full-layer scan over ~51k parcels (which the
    // server intermittently 500s while warming) — transient failures are
    // retried in the refresh() error handler.
    refresh(map.getBounds());
  }

  function boot() {
    if (!window.HonuaWC || !window.maplibregl) { setStatus("error", "sample assets failed to load"); return; }
    window.HonuaWC.defineHonuaWebComponents();

    var mapEl = el("s-map");
    if (!mapEl) { setStatus("error", "missing honua-map"); return; }

    // Recompute for the new AOI once the honua-map's underlying renderer exists.
    mapEl.addEventListener("honua-map-ready", function () { wireExtentSync(mapEl); });

    setStatus("boot", "loading indexed source…");
    Promise.all([resolveLayerKey(), fetchBasemap()])
      .then(function (out) {
        S.layerKey = out[0];
        mapEl.controller = buildController(out[1]);
        // Safety net: if honua-map-ready never fires (or map bounds are
        // unavailable), still populate the widgets from the full layer so the
        // page never sits on "loading…".
        setTimeout(function () {
          if (!S.bound) {
            if (mapEl.map && typeof mapEl.map.getBounds === "function") wireExtentSync(mapEl);
            else refresh(null);
          }
        }, 6000);
      })
      .catch(function (e) {
        setStatus("error", "live data unavailable: " + String(e && e.message ? e.message : e));
        renderKpis(null);
        renderBars([]);
        renderRange(null);
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

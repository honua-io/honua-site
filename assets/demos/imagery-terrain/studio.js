/*
 * honua.io Imagery & Terrain Studio — /demo-imagery-terrain.html
 *
 * The raster-side companion to demo.html: four scenes over the SAME live
 * archives the main demo streams from demo.honua.io —
 *
 *   1. Imagery swipe   — NAIP aerial imagery vs the dark vector base behind a
 *                        draggable blade. The blade is a second, non-interactive
 *                        MapLibre map showing only the imagery, camera-synced
 *                        and clipped in screen space with CSS clip-path (the
 *                        standard MapLibre compare technique; @honua/sdk-js has
 *                        no swipe helper — its esri-compat SwipeCompat is a
 *                        state-only shim with no rendering. Gap noted in the
 *                        README).
 *   2. Elevation profile — click two points; the page reads terrarium-encoded
 *                        DEM tiles STRAIGHT OFF the maui-terrain-static PMTiles
 *                        archive (byte-range reads, the same archive MapLibre
 *                        drapes as 3D terrain) and decodes pixels client-side:
 *                        (R*256 + G + B/256) - 32768 metres. Hand-rolled SVG
 *                        chart per the Analyst Workbench precedent.
 *   3. Hillshade anatomy — toggle hillshade over the base (via the SDK basemap
 *                        switcher, so it can never stack with imagery) and race
 *                        the SAME tile through both serving paths: static
 *                        PMTiles range read vs the live ImageServer render.
 *   4. STAC browser    — dual lane. The live /stac catalog is valid but has
 *                        zero collections today; the page probes it on boot and
 *                        flips to live search automatically once collections
 *                        exist. Until then it browses a bundled ItemCollection
 *                        of 8 real Sentinel-2 L2A scenes over Maui (fetched at
 *                        build time from Earth Search — provenance inside
 *                        stac-items.json).
 *
 * Endpoints come from the canonical assets/demo/layers.json contract (consumed
 * read-only, the Analyst Workbench precedent) plus this demo's config.json.
 * Bases are EXCLUSIVE via the SDK's native <honua-basemap-switcher>
 * (@honua/sdk-js/controls, window.HonuaSDK vendored bundle).
 */
(function () {
  "use strict";

  var CONFIG_URL = "assets/demos/imagery-terrain/config.json";
  var FIXTURE_BASE = "assets/demos/imagery-terrain/";

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
    var pill = el("its-status");
    if (!pill) return;
    pill.dataset.state = state;
    pill.textContent = text;
  }

  function fmt(n) {
    return Math.round(n).toLocaleString("en-US");
  }

  /* ── PMTiles protocol + direct archive readers ────────────────────── */

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

  var archiveReaders = {};
  function archiveReader(url) {
    if (!archiveReaders[url]) {
      archiveReaders[url] = new window.pmtiles.PMTiles(url);
    }
    return archiveReaders[url];
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

  /* ── Shared-contract accessors (assets/demo/layers.json, read-only) ── */

  function findBaseDef(shared, baseId) {
    var bases = shared.bases || [];
    for (var i = 0; i < bases.length; i++) {
      if (bases[i].id === baseId) return bases[i];
    }
    return null;
  }

  function findLayerDef(shared, layerId) {
    var layers = shared.layers || [];
    for (var i = 0; i < layers.length; i++) {
      if (layers[i].id === layerId) return layers[i];
    }
    return null;
  }

  /* ── Exclusive bases (<honua-basemap-switcher>, @honua/sdk-js/controls) ─
   * Same three bases as demo.html, built from the same contract: the dark
   * Protomaps vector "Map", the NAIP "Imagery" pyramid, and the composite
   * "Terrain" (vector base + hillshade). The switcher's style binding
   * guarantees exclusivity — hillshade and imagery can never stack. */

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

  /* Guard so scene-driven base changes don't count as a user override. */
  var baseChangeFromScene = false;
  var activeSwitcher = null;

  function setupBasemapSwitcher(map, shared, availability, onUserChange) {
    var switcher = el("its-basemap-switcher");
    if (!switcher || typeof switcher.connect !== "function") return null;
    var definitions = buildBaseDefinitions(shared, availability);
    if (definitions.length === 0) {
      switcher.style.display = "none";
      return null;
    }
    switcher.addEventListener("change", function (event) {
      if (!baseChangeFromScene) onUserChange(event);
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

  function selectBase(baseId) {
    if (!activeSwitcher || !baseId) return;
    baseChangeFromScene = true;
    try {
      if (!activeSwitcher.select(baseId)) activeSwitcher.select("map");
    } finally {
      baseChangeFromScene = false;
    }
  }

  /* ── Code strip (minimal CSS-class highlighting, CSP self-only) ────── */

  var ACCENT_RE =
    /\b(HonuaSDK|HonuaClient|createHonuaStacSearch|PMTiles|getZxy|search|select|jumpTo|addSource|addLayer|setTerrain|setPaintProperty|fitBounds|createImageBitmap)\b/g;

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
        html += '<span class="its-code-str">' + escapeHtml(segments[i]) + "</span>";
      } else {
        html += escapeHtml(segments[i]).replace(ACCENT_RE, '<span class="its-code-accent">$1</span>');
      }
    }
    if (parts[1]) {
      html += '<span class="its-code-comment">' + escapeHtml(parts[1]) + "</span>";
    }
    return html;
  }

  var codeStrip = {
    raw: "",
    set: function (title, code) {
      this.raw = code;
      var titleEl = el("its-code-title");
      var blockEl = el("its-code-block");
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
    var btn = el("its-code-copy");
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
    var list = el("its-capability-list");
    if (!list) return;
    list.innerHTML = "";
    scene.capabilities.forEach(function (cap) {
      var row = document.createElement("li");
      var label = document.createElement("span");
      label.className = "its-capability-label";
      label.textContent = cap.label;
      var badge = document.createElement("span");
      badge.className = "its-ed-badge";
      badge.dataset.edition = cap.edition.toLowerCase();
      badge.textContent = cap.edition;
      row.appendChild(label);
      row.appendChild(badge);
      list.appendChild(row);
    });
  }

  /* ── Geometry helpers ───────────────────────────────────────────── */

  var EARTH_RADIUS_KM = 6371.0088;

  function haversineKm(a, b) {
    var dLat = ((b[1] - a[1]) * Math.PI) / 180;
    var dLng = ((b[0] - a[0]) * Math.PI) / 180;
    var la = (a[1] * Math.PI) / 180;
    var lb = (b[1] * Math.PI) / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
  }

  /* WebMercator world pixel coords at zoom z (256px tiles). */
  function lngLatToWorld(lng, lat, z) {
    var scale = 256 * Math.pow(2, z);
    var x = ((lng + 180) / 360) * scale;
    var s = Math.sin((lat * Math.PI) / 180);
    var y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
    return [x, y];
  }

  /* ── Scene 1: imagery swipe ─────────────────────────────────────────
   * SDK gap, worked around on purpose: @honua/sdk-js exports no swipe or
   * compare helper (its esri-compat SwipeCompat tracks position state but
   * renders nothing), so the blade is the standard MapLibre compare
   * technique — a second non-interactive map showing only the NAIP base,
   * camera-synced via jumpTo on every move and clipped with CSS clip-path.
   * The slider is interaction code, not a widget. */
  var swipe = {
    ctx: null,
    overlayMap: null,
    fraction: 0.55,
    active: false,
    _onMove: null,
    _onResize: null,

    available: function (ctx) {
      return Boolean(ctx.availability.imagery);
    },

    ensureOverlay: function (ctx) {
      if (this.overlayMap) return this.overlayMap;
      var imagery = findBaseDef(ctx.shared, "imagery");
      this.overlayMap = new window.maplibregl.Map({
        container: "its-swipe-map",
        style: {
          version: 8,
          sources: {
            naip: {
              type: "raster",
              url: "pmtiles://" + imagery.pmtiles.proxyUrl,
              tileSize: 256,
              // Attribution rides in the scene panel footer — this clipped
              // follower map renders no MapLibre attribution control of its
              // own (it would collide with the main map's).
            },
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
        attributionControl: false,
      });
      return this.overlayMap;
    },

    sync: function () {
      if (!this.overlayMap || !this.ctx) return;
      var main = this.ctx.map;
      this.overlayMap.jumpTo({
        center: main.getCenter(),
        zoom: main.getZoom(),
        bearing: main.getBearing(),
        pitch: main.getPitch(),
      });
    },

    apply: function () {
      var shell = el("its-map-shell");
      var overlay = el("its-swipe-overlay");
      var handle = el("its-swipe-handle");
      if (!shell || !overlay || !handle) return;
      var width = shell.clientWidth;
      var x = Math.round(this.fraction * width);
      overlay.style.clipPath = "inset(0 0 0 " + x + "px)";
      handle.style.left = x + "px";
      handle.setAttribute("aria-valuenow", String(Math.round(this.fraction * 100)));
    },

    setFraction: function (f) {
      this.fraction = Math.min(0.98, Math.max(0.02, f));
      this.apply();
    },

    activate: function (ctx) {
      if (!this.available(ctx)) return;
      this.ctx = ctx;
      var overlay = el("its-swipe-overlay");
      var handle = el("its-swipe-handle");
      overlay.hidden = false;
      handle.hidden = false;
      this.ensureOverlay(ctx);
      var self = this;
      this._onMove = function () {
        self.sync();
      };
      this._onResize = function () {
        self.apply();
        if (self.overlayMap) self.overlayMap.resize();
      };
      ctx.map.on("move", this._onMove);
      window.addEventListener("resize", this._onResize);
      this.overlayMap.resize();
      this.sync();
      this.apply();
      this.active = true;
    },

    deactivate: function () {
      if (!this.active) return;
      var overlay = el("its-swipe-overlay");
      var handle = el("its-swipe-handle");
      if (overlay) overlay.hidden = true;
      if (handle) handle.hidden = true;
      if (this.ctx && this._onMove) this.ctx.map.off("move", this._onMove);
      if (this._onResize) window.removeEventListener("resize", this._onResize);
      this.active = false;
    },

    bindHandle: function () {
      var handle = el("its-swipe-handle");
      var shell = el("its-map-shell");
      if (!handle || !shell) return;
      var self = this;
      var dragging = false;

      handle.addEventListener("pointerdown", function (event) {
        dragging = true;
        handle.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
      handle.addEventListener("pointermove", function (event) {
        if (!dragging) return;
        var rect = shell.getBoundingClientRect();
        self.setFraction((event.clientX - rect.left) / rect.width);
      });
      handle.addEventListener("pointerup", function (event) {
        dragging = false;
        try {
          handle.releasePointerCapture(event.pointerId);
        } catch (_e) {
          /* already released */
        }
      });
      handle.addEventListener("keydown", function (event) {
        if (event.key === "ArrowLeft") {
          self.setFraction(self.fraction - 0.04);
          event.preventDefault();
        } else if (event.key === "ArrowRight") {
          self.setFraction(self.fraction + 0.04);
          event.preventDefault();
        }
      });
    },
  };

  /* ── Scene 2: terrain & elevation profile ───────────────────────────
   * Decode approach mirrors the SDK's terrain-rgb-elevation example (the
   * SDK itself exports no elevation decode/profile helper — gap noted in
   * the README): fetch the encoded DEM tile, draw to canvas, read pixels,
   * apply the encoding formula. Encoding here is TERRARIUM (the archive's
   * declared encoding in layers.json): (R*256 + G + B/256) - 32768 m. */
  var profile = {
    ctx: null,
    points: [],
    busy: false,
    result: null,
    tileCache: {},
    headerPromise: null,
    layersAdded: false,
    _onClick: null,

    available: function (ctx) {
      var terrain = findLayerDef(ctx.shared, "terrain");
      return Boolean(ctx.availability.terrain && terrain && terrain.pmtiles);
    },

    archiveUrl: function (ctx) {
      return findLayerDef(ctx.shared, "terrain").pmtiles.proxyUrl;
    },

    zoomRange: function (ctx) {
      // The archive header declares its own zoom range — no guessing.
      if (!this.headerPromise) {
        this.headerPromise = archiveReader(this.archiveUrl(ctx))
          .getHeader()
          .then(function (h) {
            return { min: h.minZoom, max: h.maxZoom };
          });
      }
      return this.headerPromise;
    },

    tileImageData: function (ctx, z, x, y) {
      var key = z + "/" + x + "/" + y;
      if (!this.tileCache[key]) {
        this.tileCache[key] = archiveReader(this.archiveUrl(ctx))
          .getZxy(z, x, y)
          .then(function (tile) {
            if (!tile || !tile.data) return null;
            return createImageBitmap(new Blob([tile.data], { type: "image/png" })).then(function (bitmap) {
              var canvas = document.createElement("canvas");
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
              var g = canvas.getContext("2d", { willReadFrequently: true });
              g.drawImage(bitmap, 0, 0);
              var data = g.getImageData(0, 0, bitmap.width, bitmap.height);
              if (bitmap.close) bitmap.close();
              return data;
            });
          });
      }
      return this.tileCache[key];
    },

    decodeTerrarium: function (r, g, b) {
      return r * 256 + g + b / 256 - 32768;
    },

    /* Sample elevations for lngLat points at zoom z (grouped per tile so
     * each tile is fetched/decoded exactly once). */
    sampleElevations: function (ctx, lngLats, z) {
      var self = this;
      var jobs = lngLats.map(function (ll) {
        var w = lngLatToWorld(ll[0], ll[1], z);
        var tx = Math.floor(w[0] / 256);
        var ty = Math.floor(w[1] / 256);
        return { ll: ll, tx: tx, ty: ty, fx: w[0] - tx * 256, fy: w[1] - ty * 256 };
      });
      var tiles = {};
      jobs.forEach(function (job) {
        tiles[job.tx + "/" + job.ty] = true;
      });
      return Promise.all(
        jobs.map(function (job) {
          return self.tileImageData(ctx, z, job.tx, job.ty).then(function (img) {
            if (!img) return null; // tile absent (open ocean) → sea level
            var s = img.width / 256; // honor 512px tiles transparently
            var px = Math.min(img.width - 1, Math.max(0, Math.floor(job.fx * s)));
            var py = Math.min(img.height - 1, Math.max(0, Math.floor(job.fy * s)));
            var i = (py * img.width + px) * 4;
            return self.decodeTerrarium(img.data[i], img.data[i + 1], img.data[i + 2]);
          });
        })
      ).then(function (elevations) {
        return { elevations: elevations, tileCount: Object.keys(tiles).length };
      });
    },

    ensureLayers: function (ctx) {
      if (this.layersAdded) return;
      var map = ctx.map;
      map.addSource("its-profile-line", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("its-profile-points", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("its-profile-hover", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "its-profile-line",
        type: "line",
        source: "its-profile-line",
        paint: { "line-color": "#45d6c8", "line-width": 2, "line-dasharray": [2, 1.5] },
      });
      map.addLayer({
        id: "its-profile-points",
        type: "circle",
        source: "its-profile-points",
        paint: {
          "circle-color": "#45d6c8",
          "circle-radius": 5,
          "circle-stroke-color": "#04151a",
          "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({
        id: "its-profile-hover",
        type: "circle",
        source: "its-profile-hover",
        paint: {
          "circle-color": "#e8c862",
          "circle-radius": 4.5,
          "circle-stroke-color": "#04151a",
          "circle-stroke-width": 1.5,
        },
      });
      this.layersAdded = true;
    },

    setLayerVisibility: function (ctx, visible) {
      if (!this.layersAdded) return;
      var v = visible ? "visible" : "none";
      ["its-profile-line", "its-profile-points", "its-profile-hover"].forEach(function (id) {
        if (ctx.map.getLayer(id)) ctx.map.setLayoutProperty(id, "visibility", v);
      });
    },

    setPoints: function (ctx, lngLats) {
      this.points = lngLats.slice();
      var features = lngLats.map(function (ll, i) {
        return { type: "Feature", geometry: { type: "Point", coordinates: ll }, properties: { which: i } };
      });
      ctx.map.getSource("its-profile-points").setData({ type: "FeatureCollection", features: features });
      ctx.map.getSource("its-profile-line").setData({
        type: "FeatureCollection",
        features:
          lngLats.length === 2
            ? [{ type: "Feature", geometry: { type: "LineString", coordinates: lngLats }, properties: {} }]
            : [],
      });
      el("its-profile-clear").disabled = lngLats.length === 0;
    },

    clear: function (ctx) {
      this.setPoints(ctx, []);
      this.result = null;
      ctx.map.getSource("its-profile-hover").setData({ type: "FeatureCollection", features: [] });
      el("its-profile-chart").innerHTML = "";
      el("its-profile-stats").textContent = "";
      el("its-profile-hint").textContent = "// click two points on the map — or run the preset";
    },

    run: function (ctx, a, b, label) {
      if (this.busy) return Promise.resolve();
      var self = this;
      this.busy = true;
      this.setPoints(ctx, [a, b]);
      el("its-profile-hint").textContent = "// reading terrarium tiles off the archive…";

      var cfg = ctx.config.profile;
      var samples = [];
      var i;
      for (i = 0; i < cfg.samples; i++) {
        var t = i / (cfg.samples - 1);
        samples.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }

      return this.zoomRange(ctx)
        .then(function (range) {
          // Walk down from the archive's max zoom until the profile touches
          // an acceptable number of distinct tiles.
          var z = range.max;
          for (; z > range.min; z--) {
            var seen = {};
            for (var k = 0; k < samples.length; k++) {
              var w = lngLatToWorld(samples[k][0], samples[k][1], z);
              seen[Math.floor(w[0] / 256) + "/" + Math.floor(w[1] / 256)] = true;
            }
            if (Object.keys(seen).length <= cfg.maxTiles) break;
          }
          return self.sampleElevations(ctx, samples, z).then(function (result) {
            return { z: z, elevations: result.elevations, tileCount: result.tileCount };
          });
        })
        .then(function (result) {
          var rows = [];
          var cumKm = 0;
          for (var k = 0; k < samples.length; k++) {
            if (k > 0) cumKm += haversineKm(samples[k - 1], samples[k]);
            var elev = result.elevations[k];
            rows.push({ lngLat: samples[k], km: cumKm, elev: elev === null ? 0 : elev });
          }
          self.result = { rows: rows, z: result.z, tileCount: result.tileCount, label: label || null };
          self.renderChart(ctx);
          self.busy = false;
        })
        .catch(function (error) {
          self.busy = false;
          el("its-profile-hint").textContent =
            "// profile failed: " + (error && error.message ? error.message : error);
        });
    },

    runPreset: function (ctx) {
      var preset = ctx.config.profile.preset;
      return this.run(ctx, preset.a.lngLat, preset.b.lngLat, preset.label);
    },

    renderChart: function (ctx) {
      var rows = this.result.rows;
      var z = this.result.z;
      var chartEl = el("its-profile-chart");
      var statsEl = el("its-profile-stats");
      chartEl.innerHTML = "";

      var min = Infinity;
      var max = -Infinity;
      rows.forEach(function (row) {
        if (row.elev < min) min = row.elev;
        if (row.elev > max) max = row.elev;
      });
      var totalKm = rows[rows.length - 1].km;
      var yMin = Math.min(0, Math.floor(min / 100) * 100);
      var yMax = Math.max(100, Math.ceil(max / 100) * 100);

      var W = 280;
      var H = 130;
      var L = 38;
      var R = 8;
      var T = 10;
      var B = 20;
      var iw = W - L - R;
      var ih = H - T - B;

      function px(km) {
        return L + (totalKm === 0 ? 0 : (km / totalKm) * iw);
      }
      function py(elev) {
        return T + (1 - (elev - yMin) / (yMax - yMin)) * ih;
      }

      var NS = "http://www.w3.org/2000/svg";
      var svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.setAttribute("class", "its-chart-svg");

      var line = "";
      var area = "M" + px(0) + "," + py(yMin <= 0 ? 0 : yMin);
      rows.forEach(function (row, idx) {
        var cmd = (idx === 0 ? "M" : "L") + px(row.km).toFixed(1) + "," + py(row.elev).toFixed(1);
        line += cmd;
        area += "L" + px(row.km).toFixed(1) + "," + py(row.elev).toFixed(1);
      });
      area += "L" + px(totalKm).toFixed(1) + "," + (T + ih) + "L" + px(0) + "," + (T + ih) + "Z";

      var areaPath = document.createElementNS(NS, "path");
      areaPath.setAttribute("d", area);
      areaPath.setAttribute("class", "its-chart-area");
      svg.appendChild(areaPath);

      var linePath = document.createElementNS(NS, "path");
      linePath.setAttribute("d", line);
      linePath.setAttribute("class", "its-chart-line");
      svg.appendChild(linePath);

      // y ticks: min(0), mid, max — metres
      [yMin, (yMin + yMax) / 2, yMax].forEach(function (val) {
        var tick = document.createElementNS(NS, "line");
        tick.setAttribute("x1", L);
        tick.setAttribute("x2", W - R);
        tick.setAttribute("y1", py(val));
        tick.setAttribute("y2", py(val));
        tick.setAttribute("class", "its-chart-grid");
        svg.appendChild(tick);
        var label = document.createElementNS(NS, "text");
        label.setAttribute("x", L - 4);
        label.setAttribute("y", py(val) + 3);
        label.setAttribute("text-anchor", "end");
        label.setAttribute("class", "its-chart-label");
        label.textContent = fmt(val);
        svg.appendChild(label);
      });
      // x ticks: 0, mid, total — km
      [0, totalKm / 2, totalKm].forEach(function (km, idx) {
        var label = document.createElementNS(NS, "text");
        label.setAttribute("x", px(km));
        label.setAttribute("y", H - 6);
        label.setAttribute("text-anchor", idx === 0 ? "start" : idx === 2 ? "end" : "middle");
        label.setAttribute("class", "its-chart-label");
        label.textContent = km.toFixed(1) + " km";
        svg.appendChild(label);
      });

      // hover: guide + readout + matching dot on the map line
      var guide = document.createElementNS(NS, "line");
      guide.setAttribute("y1", T);
      guide.setAttribute("y2", T + ih);
      guide.setAttribute("class", "its-chart-guide");
      guide.setAttribute("visibility", "hidden");
      svg.appendChild(guide);
      var readout = document.createElementNS(NS, "text");
      readout.setAttribute("y", T + 8);
      readout.setAttribute("class", "its-chart-readout");
      readout.setAttribute("visibility", "hidden");
      svg.appendChild(readout);

      var hoverSource = ctx.map.getSource("its-profile-hover");
      svg.addEventListener("mousemove", function (event) {
        var rect = svg.getBoundingClientRect();
        var km = ((event.clientX - rect.left) / rect.width * W - L) / iw * totalKm;
        km = Math.min(totalKm, Math.max(0, km));
        var nearest = rows[0];
        for (var k = 1; k < rows.length; k++) {
          if (Math.abs(rows[k].km - km) < Math.abs(nearest.km - km)) nearest = rows[k];
        }
        guide.setAttribute("x1", px(nearest.km));
        guide.setAttribute("x2", px(nearest.km));
        guide.setAttribute("visibility", "visible");
        readout.textContent = nearest.km.toFixed(1) + " km · " + fmt(nearest.elev) + " m";
        var anchorEnd = nearest.km > totalKm * 0.6;
        readout.setAttribute("x", px(nearest.km) + (anchorEnd ? -5 : 5));
        readout.setAttribute("text-anchor", anchorEnd ? "end" : "start");
        readout.setAttribute("visibility", "visible");
        if (hoverSource) {
          hoverSource.setData({
            type: "FeatureCollection",
            features: [{ type: "Feature", geometry: { type: "Point", coordinates: nearest.lngLat }, properties: {} }],
          });
        }
      });
      svg.addEventListener("mouseleave", function () {
        guide.setAttribute("visibility", "hidden");
        readout.setAttribute("visibility", "hidden");
        if (hoverSource) hoverSource.setData({ type: "FeatureCollection", features: [] });
      });

      chartEl.appendChild(svg);

      var maxFt = max * 3.28084;
      statsEl.textContent =
        (this.result.label ? this.result.label + " — " : "") +
        totalKm.toFixed(1) +
        " km · " +
        fmt(min) +
        " m → " +
        fmt(max) +
        " m (" +
        fmt(maxFt) +
        " ft) · decoded from " +
        this.result.tileCount +
        " z" +
        z +
        " terrarium tiles, client-side";
      el("its-profile-hint").textContent = "// hover the chart to walk the line on the map";

      var archiveUrl = this.archiveUrl(ctx);
      codeStrip.set("// terrarium decode — the calls behind this profile", [
        "// the SAME archive MapLibre drapes as 3D terrain, read directly:",
        'const archive = new PMTiles("' + archiveUrl + '");',
        "const { data } = await archive.getZxy(" + z + ", x, y); // one HTTP byte-range read",
        "// decode (terrarium): elevation = (R * 256 + G + B / 256) - 32768",
        "// → " + rows.length + " samples, max " + fmt(max) + " m over " + totalKm.toFixed(1) + " km",
      ].join("\n"));
    },

    activate: function (ctx) {
      this.ctx = ctx;
      el("its-profile-block").hidden = false;
      if (!this.available(ctx)) return;
      this.ensureLayers(ctx);
      this.setLayerVisibility(ctx, true);
      var self = this;
      this._onClick = function (event) {
        if (self.busy) return;
        var next = self.points.length >= 2 ? [] : self.points.slice();
        next.push([event.lngLat.lng, event.lngLat.lat]);
        if (next.length === 2) {
          self.run(ctx, next[0], next[1], null);
        } else {
          self.setPoints(ctx, next);
          el("its-profile-hint").textContent = "// now click the second point";
        }
      };
      ctx.map.on("click", this._onClick);

      // 3D drape: the same DEM the profile decodes — only while this scene
      // is active, so other scenes stay flat and clickable.
      var terrainDef = findLayerDef(ctx.shared, "terrain");
      if (!ctx.map.getSource("its-dem")) {
        ctx.map.addSource("its-dem", {
          type: "raster-dem",
          url: "pmtiles://" + terrainDef.pmtiles.proxyUrl,
          tileSize: 256,
          encoding: terrainDef.pmtiles.encoding || "terrarium",
        });
      }
      ctx.map.setTerrain({ source: "its-dem", exaggeration: terrainDef.exaggeration || 1.3 });

      if (!this.result) this.runPreset(ctx);
    },

    deactivate: function (ctx) {
      el("its-profile-block").hidden = true;
      if (this._onClick) ctx.map.off("click", this._onClick);
      this.setLayerVisibility(ctx, false);
      if (ctx.map.getTerrain && ctx.map.getTerrain()) ctx.map.setTerrain(null);
    },
  };

  /* ── Scene 3: hillshade anatomy ───────────────────────────────────── */
  var hillshade = {
    raceBusy: false,

    available: function (ctx) {
      return Boolean(ctx.availability.hillshade);
    },

    syncControls: function (ctx) {
      var toggle = el("its-hillshade-toggle");
      var opacity = el("its-hillshade-opacity");
      var on = activeSwitcher && activeSwitcher.value === "terrain";
      toggle.checked = Boolean(on);
      toggle.disabled = !this.available(ctx) || !activeSwitcher;
      opacity.disabled = !on;
    },

    bind: function (ctx) {
      var self = this;
      var toggle = el("its-hillshade-toggle");
      var opacity = el("its-hillshade-opacity");
      toggle.addEventListener("change", function () {
        selectBase(toggle.checked ? "terrain" : "map");
        self.syncControls(ctx);
        self.applyOpacity(ctx);
      });
      opacity.addEventListener("input", function () {
        self.applyOpacity(ctx);
      });
      el("its-race-run").addEventListener("click", function () {
        self.runRace(ctx);
      });
    },

    applyOpacity: function (ctx) {
      var opacity = el("its-hillshade-opacity");
      if (ctx.map.getLayer("base-hillshade")) {
        ctx.map.setPaintProperty("base-hillshade", "raster-opacity", Number(opacity.value) / 100);
      }
    },

    /* The latency race: the SAME hillshade tile through both serving paths,
     * on user click only. Static = byte ranges off the PMTiles archive
     * (object storage, CDN-cacheable). Live = the seeded ImageServer route
     * rendering from PostGIS raster per request — kept seeded exactly to
     * demonstrate dynamic rendering (layers.json documents it as the
     * fallback lane). Factual numbers against our own server. */
    runRace: function (ctx) {
      if (this.raceBusy) return;
      var self = this;
      this.raceBusy = true;
      var btn = el("its-race-run");
      var results = el("its-race-results");
      btn.disabled = true;
      results.innerHTML = "";

      var tile = ctx.config.latencyRace.tile;
      var base = findBaseDef(ctx.shared, "terrain");
      var hs = base && base.hillshade;
      var archiveUrl = hs && hs.pmtiles && hs.pmtiles.proxyUrl;
      var liveTemplate = hs && hs.service && hs.service.tileTemplate;

      function card(label, ms, blob, note) {
        var li = document.createElement("div");
        li.className = "its-race-card";
        var img = document.createElement("img");
        img.width = 72;
        img.height = 72;
        img.alt = label + " tile";
        if (blob) img.src = URL.createObjectURL(blob);
        var text = document.createElement("div");
        var strong = document.createElement("strong");
        strong.textContent = ms === null ? "failed" : fmt(ms) + " ms";
        var span = document.createElement("span");
        span.textContent = label;
        var noteEl = document.createElement("em");
        noteEl.textContent = note;
        text.appendChild(strong);
        text.appendChild(span);
        text.appendChild(noteEl);
        li.appendChild(img);
        li.appendChild(text);
        results.appendChild(li);
      }

      var staticLane = !archiveUrl
        ? Promise.resolve(null)
        : Promise.resolve()
            .then(function () {
              var t0 = performance.now();
              return archiveReader(archiveUrl)
                .getZxy(tile.z, tile.x, tile.y)
                .then(function (t) {
                  var ms = performance.now() - t0;
                  card(
                    "static PMTiles archive",
                    ms,
                    t && t.data ? new Blob([t.data], { type: "image/png" }) : null,
                    "HTTP range read off object storage — no rendering, no database"
                  );
                });
            })
            .catch(function () {
              card("static PMTiles archive", null, null, "archive read failed");
            });

      var liveLane = !liveTemplate
        ? Promise.resolve(null)
        : Promise.resolve().then(function () {
            var url =
              ctx.shared.server.baseUrl +
              liveTemplate.replace("{z}", tile.z).replace("{y}", tile.y).replace("{x}", tile.x);
            var controller = new AbortController();
            var timer = setTimeout(function () {
              controller.abort();
            }, ctx.config.latencyRace.timeoutMs);
            var t0 = performance.now();
            return fetch(url, { signal: controller.signal })
              .then(function (res) {
                if (!res.ok) throw new Error("HTTP " + res.status);
                return res.blob().then(function (blob) {
                  clearTimeout(timer);
                  var ms = performance.now() - t0;
                  card("live ImageServer render", ms, blob, "rendered per request from PostGIS raster (ST_Clip → PNG)");
                });
              })
              .catch(function (error) {
                clearTimeout(timer);
                card(
                  "live ImageServer render",
                  null,
                  null,
                  error && error.name === "AbortError" ? "timed out — dynamic lane under load" : "route returned an error"
                );
              });
          });

      // Static first, then live — sequential, so the numbers never contend
      // for the same connection.
      staticLane
        .then(function () {
          return liveLane;
        })
        .then(function () {
          var note = document.createElement("p");
          note.className = "its-hint";
          note.textContent =
            "// same z" + tile.z + " tile, your network, this click — run again to see a warm CDN read on the static lane";
          results.appendChild(note);
          btn.disabled = false;
          self.raceBusy = false;
        });
    },

    activate: function (ctx) {
      el("its-hillshade-block").hidden = false;
      this.syncControls(ctx);
      this.applyOpacity(ctx);
    },

    deactivate: function () {
      el("its-hillshade-block").hidden = true;
    },
  };

  /* ── Scene 4: STAC browser (dual lane) ──────────────────────────────
   * The vendored window.HonuaSDK bundle cherry-picks the surface demo.html
   * uses and does NOT include the SDK's HonuaStacSearch client (it exists
   * in @honua/sdk-js — gap noted in the README); the probe and the live
   * lane are plain fetch() against the same routes HonuaStacSearch wraps,
   * and the code strip shows the SDK call the live lane maps to. */
  var stac = {
    loaded: false,
    lane: null, // "live" | "fixture"
    items: [],
    layersAdded: false,
    activeId: null,

    probe: function (ctx) {
      var url = ctx.shared.server.baseUrl + ctx.config.stac.collectionsPath;
      return fetch(url, { headers: { accept: "application/json" } })
        .then(function (res) {
          if (!res.ok) return { reachable: false, collections: [] };
          return res.json().then(function (body) {
            return { reachable: true, collections: (body && body.collections) || [] };
          });
        })
        .catch(function () {
          return { reachable: false, collections: [] };
        });
    },

    load: function (ctx) {
      if (this.loaded) return Promise.resolve();
      var self = this;
      var live = ctx.stacProbe && ctx.stacProbe.collections.length > 0;
      var task;
      if (live) {
        var body = JSON.parse(JSON.stringify(ctx.config.stac.searchBody));
        body.collections = ctx.stacProbe.collections.map(function (c) {
          return c.id;
        });
        task = fetch(ctx.shared.server.baseUrl + ctx.config.stac.searchPath, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        })
          .then(function (res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
          })
          .then(function (collection) {
            self.lane = "live";
            self.items = collection.features || [];
            self.attribution = "live STAC items from demo.honua.io";
          });
      } else {
        task = fetch(ctx.config.stac.fixtureUrl)
          .then(function (res) {
            return res.json();
          })
          .then(function (collection) {
            self.lane = "fixture";
            self.items = collection.features || [];
            self.attribution =
              (collection["honua:fixture"] && collection["honua:fixture"].attribution) ||
              "Contains modified Copernicus Sentinel data, processed by ESA";
          });
      }
      return task.then(function () {
        self.loaded = true;
        self.render(ctx);
      });
    },

    thumbHref: function (item) {
      var asset = item.assets && item.assets.thumbnail;
      if (!asset || !asset.href) return null;
      // Fixture hrefs are relative to the fixture directory; live hrefs are
      // absolute against demo.honua.io (allowed by this page's img-src).
      return /^https?:\/\//i.test(asset.href) ? asset.href : FIXTURE_BASE + asset.href;
    },

    ensureLayers: function (ctx) {
      if (this.layersAdded) return;
      var map = ctx.map;
      map.addSource("its-stac-footprints", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "its-stac-fill",
        type: "fill",
        source: "its-stac-footprints",
        paint: { "fill-color": "#45d6c8", "fill-opacity": 0.06 },
      });
      map.addLayer({
        id: "its-stac-outline",
        type: "line",
        source: "its-stac-footprints",
        paint: { "line-color": "#45d6c8", "line-width": 1.2, "line-opacity": 0.7 },
      });
      map.addLayer({
        id: "its-stac-active",
        type: "line",
        source: "its-stac-footprints",
        filter: ["==", ["get", "id"], ""],
        paint: { "line-color": "#e8c862", "line-width": 2.4 },
      });
      this.layersAdded = true;
    },

    setLayerVisibility: function (ctx, visible) {
      if (!this.layersAdded) return;
      var v = visible ? "visible" : "none";
      ["its-stac-fill", "its-stac-outline", "its-stac-active"].forEach(function (id) {
        if (ctx.map.getLayer(id)) ctx.map.setLayoutProperty(id, "visibility", v);
      });
    },

    render: function (ctx) {
      var badge = el("its-stac-lane");
      badge.textContent =
        this.lane === "live"
          ? "live STAC catalog — " + ctx.stacProbe.collections.length + " collection(s) on demo.honua.io"
          : "sample catalog — live STAC pending collections";
      badge.dataset.lane = this.lane;
      badge.title =
        this.lane === "live"
          ? "Items come from POST " + ctx.config.stac.searchPath + " on the live demo server."
          : "GET " +
            ctx.config.stac.collectionsPath +
            " on demo.honua.io returns zero collections today (the catalog itself is live and valid). These 8 items are real Sentinel-2 L2A scenes over Maui, bundled at build time from Earth Search; the page flips to the live lane automatically once collections exist.";

      var attr = el("its-stac-attr");
      attr.textContent = "// " + this.attribution;

      this.ensureLayers(ctx);
      var footprints = this.items.map(function (item) {
        return { type: "Feature", geometry: item.geometry, properties: { id: item.id } };
      });
      ctx.map.getSource("its-stac-footprints").setData({ type: "FeatureCollection", features: footprints });

      var list = el("its-stac-list");
      list.innerHTML = "";
      var self = this;
      this.items.forEach(function (item) {
        var p = item.properties || {};
        var li = document.createElement("li");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "its-stac-card";
        btn.dataset.itemId = item.id;

        var thumb = self.thumbHref(item);
        if (thumb) {
          var img = document.createElement("img");
          img.src = thumb;
          img.alt = "Preview of " + item.id;
          img.loading = "lazy";
          img.width = 56;
          img.height = 56;
          btn.appendChild(img);
        }

        var text = document.createElement("span");
        text.className = "its-stac-meta";
        var title = document.createElement("strong");
        title.textContent = (p.datetime || "").slice(0, 10) || item.id;
        var sub = document.createElement("span");
        var cloud = p["eo:cloud_cover"];
        sub.textContent =
          (p.platform ? p.platform + " · " : "") +
          (typeof cloud === "number" ? cloud.toFixed(1) + "% cloud" : "") +
          (p["grid:code"] ? " · " + p["grid:code"].replace("MGRS-", "") : "");
        var id = document.createElement("code");
        id.textContent = item.id;
        text.appendChild(title);
        text.appendChild(sub);
        text.appendChild(id);
        btn.appendChild(text);

        btn.addEventListener("click", function () {
          self.selectItem(ctx, item, btn);
        });
        li.appendChild(btn);
        list.appendChild(li);
      });
    },

    selectItem: function (ctx, item, btn) {
      this.activeId = item.id;
      var cards = document.querySelectorAll(".its-stac-card");
      for (var i = 0; i < cards.length; i++) {
        cards[i].setAttribute("aria-pressed", cards[i] === btn ? "true" : "false");
      }
      if (ctx.map.getLayer("its-stac-active")) {
        ctx.map.setFilter("its-stac-active", ["==", ["get", "id"], item.id]);
      }
      if (item.bbox && item.bbox.length === 4) {
        ctx.map.fitBounds(
          [
            [item.bbox[0], item.bbox[1]],
            [item.bbox[2], item.bbox[3]],
          ],
          { padding: { top: 60, bottom: 60, left: 340, right: 60 }, duration: 900 }
        );
      }
      var p = item.properties || {};
      codeStrip.set("// STAC — the item you just opened", [
        "// " + item.id + " · " + (p.datetime || "") + " · " + (typeof p["eo:cloud_cover"] === "number" ? p["eo:cloud_cover"].toFixed(1) + "% cloud" : ""),
        "GET " + (this.lane === "live" ? ctx.shared.server.baseUrl : "…earth-search.aws.element84.com/v1") + "/collections/" + (item.collection || "…") + "/items/" + item.id,
        "// assets: thumbnail" + (this.lane === "fixture" ? " (bundled at build time — CSP allows no third-party hotlinks)" : ""),
      ].join("\n"));
    },

    activate: function (ctx) {
      el("its-stac-block").hidden = false;
      var self = this;
      this.load(ctx).then(function () {
        self.setLayerVisibility(ctx, true);
      });
    },

    deactivate: function (ctx) {
      el("its-stac-block").hidden = true;
      this.setLayerVisibility(ctx, false);
    },
  };

  /* ── Scenes ──────────────────────────────────────────────────────────
   * Each scene = exclusive base + camera + caption + scene block + the
   * calls behind it (code strip) + the server capabilities it exercises
   * (capability sidebar). Edition labels mirror pricing.html:
   *   - every protocol surface (tiles, terrain, STAC, …)   → Community
   *   - raster file import + serving                       → Community
   *   - COG serving direct from S3/Azure                   → Pro
   */
  var SCENES = [
    {
      id: "swipe",
      name: "Imagery swipe",
      base: "map",
      caption:
        "USDA NAIP aerial imagery behind a draggable blade over Kahului — vector base on the left, imagery on the right. Both sides stream as PMTiles byte ranges from demo.honua.io.",
      requires: "imagery",
      capabilities: [
        { label: "Raster tiles (NAIP) — static PMTiles range proxy", edition: "Community" },
        { label: "Native UI controls (basemap switcher) — @honua/sdk-js/controls", edition: "Community" },
        { label: "COG serving direct from S3/Azure — the production path for imagery at scale (this demo pre-bakes tiles instead)", edition: "Pro" },
      ],
      code: function (ctx) {
        var imagery = findBaseDef(ctx.shared, "imagery");
        return [
          "// the blade: a second synced MapLibre map, clipped in CSS —",
          "// the SDK has no swipe helper (gap filed), so this is the standard",
          "// MapLibre compare technique in ~60 lines of interaction code",
          'overlay.addSource("naip", { type: "raster",',
          '  url: "pmtiles://' + (imagery && imagery.pmtiles ? imagery.pmtiles.proxyUrl : "…") + '" });',
          'main.on("move", () => overlay.jumpTo({ center: main.getCenter(), zoom: main.getZoom() }));',
          'overlayEl.style.clipPath = "inset(0 0 0 " + sliderX + "px)";',
        ].join("\n");
      },
      enter: function (ctx) {
        swipe.activate(ctx);
      },
      exit: function () {
        swipe.deactivate();
      },
    },
    {
      id: "profile",
      name: "Elevation profile",
      base: "terrain",
      caption:
        "Click two points — the page reads terrarium DEM tiles straight off the archive and decodes elevations in your browser. Preset: Pāʻia (sea level) to the Haleakalā summit, 3,055 m.",
      requires: "terrain",
      capabilities: [
        { label: "Terrain tiles — terrarium DEM, static PMTiles range proxy", edition: "Community" },
        { label: "Live terrain rendering — /terrain Terrain-RGB route (seeded fallback lane)", edition: "Community" },
        { label: "Raster file import + serving (USGS 3DEP DEM)", edition: "Community" },
      ],
      code: function (ctx) {
        var terrain = findLayerDef(ctx.shared, "terrain");
        return [
          "// terrarium tiles, two consumers: MapLibre drapes them as 3D terrain…",
          'map.addSource("dem", { type: "raster-dem", encoding: "terrarium",',
          '  url: "pmtiles://' + (terrain && terrain.pmtiles ? terrain.pmtiles.proxyUrl : "…") + '" });',
          "// …and this page reads the SAME bytes directly for the profile:",
          "const { data } = await archive.getZxy(z, x, y); // HTTP range request",
          "elevation = (R * 256 + G + B / 256) - 32768; // metres",
        ].join("\n");
      },
      enter: function (ctx) {
        profile.activate(ctx);
      },
      exit: function (ctx) {
        profile.deactivate(ctx);
      },
    },
    {
      id: "hillshade",
      name: "Hillshade anatomy",
      base: "map",
      caption:
        "USGS 3DEP hillshade over the West Maui mountains — toggle it over the base, then race the same tile through both serving paths: pre-baked archive vs live render.",
      requires: "hillshade",
      capabilities: [
        { label: "Raster tiles (hillshade) — static PMTiles range proxy", edition: "Community" },
        { label: "Live raster rendering — ImageServer tile route (PostGIS)", edition: "Community" },
      ],
      code: function (ctx) {
        var base = findBaseDef(ctx.shared, "terrain");
        var hs = base && base.hillshade;
        return [
          "// the same pixels, two serving paths:",
          'map.addSource("hillshade", { type: "raster", // static: pre-baked archive',
          '  url: "pmtiles://' + (hs && hs.pmtiles ? hs.pmtiles.proxyUrl : "…") + '" });',
          "// live: rendered per request from PostGIS raster — kept seeded",
          "// on purpose as the dynamic lane (slower; that is the point)",
          "GET " + (hs && hs.service ? hs.service.tileTemplate : "…") + " // ImageServer",
        ].join("\n");
      },
      enter: function (ctx) {
        hillshade.activate(ctx);
      },
      exit: function () {
        hillshade.deactivate();
      },
    },
    {
      id: "stac",
      name: "STAC browser",
      base: "map",
      caption:
        "Browse scenes the way machines do — a STAC ItemCollection with footprints, timestamps, and cloud cover. Live /stac is probed on boot; today it has zero collections, so this browses a bundled sample of real Sentinel-2 scenes.",
      requires: null, // fixture lane always works
      capabilities: [
        { label: "STAC API — catalog, conformance, item search (/stac)", edition: "Community" },
        { label: "OGC API Features alignment — same collections surface", edition: "Community" },
      ],
      code: function (ctx) {
        return [
          "// @honua/sdk-js — the call the live lane runs once /stac has collections",
          "const stac = createHonuaStacSearch(client);",
          "const items = await stac.search({ bbox: [" + ctx.config.stac.searchBody.bbox.join(", ") + "],",
          '  sortby: [{ field: "properties.datetime", direction: "desc" }], limit: 8 });',
          "// today: GET " + ctx.config.stac.collectionsPath + ' → { "collections": [] } — so the page',
          "// browses 8 real Sentinel-2 L2A scenes bundled at build time (Earth Search/ESA)",
        ].join("\n");
      },
      enter: function (ctx) {
        stac.activate(ctx);
      },
      exit: function (ctx) {
        stac.deactivate(ctx);
      },
    },
  ];

  var activeScene = null;

  function setActiveChip(sceneId) {
    var chips = document.querySelectorAll(".its-scene-chip");
    for (var i = 0; i < chips.length; i++) {
      chips[i].setAttribute("aria-pressed", chips[i].dataset.scene === sceneId ? "true" : "false");
    }
  }

  function applyScene(ctx, scene, opts) {
    opts = opts || {};
    if (activeScene && activeScene.exit) activeScene.exit(ctx);
    activeScene = scene;

    selectBase(scene.base);

    if (opts.camera !== false) {
      var camera = ctx.config.scenes[scene.id];
      ctx.map.easeTo({
        center: camera.center,
        zoom: camera.zoom,
        pitch: camera.pitch || 0,
        bearing: camera.bearing || 0,
        duration: opts.instant ? 0 : 1400,
      });
    }

    el("its-scene-caption").textContent = scene.caption;
    var pending = scene.requires && !ctx.availability[scene.requires];
    el("its-scene-pending").hidden = !pending;

    renderCapabilities(scene);
    codeStrip.set("// the calls behind “" + scene.name + "”", scene.code(ctx));
    setActiveChip(scene.id);

    // Graceful absence: a pending scene still narrates and shows its code,
    // but its interactive block stays hidden until the archive is seeded.
    if (scene.enter && !pending) scene.enter(ctx);
  }

  function renderScenes(ctx) {
    var nav = el("its-scene-list");
    nav.innerHTML = "";
    SCENES.forEach(function (scene) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "its-scene-chip";
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
    var codeStripEl = el("its-code-strip");
    var capabilitiesEl = el("its-capabilities");
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

    Promise.all([
      fetch(CONFIG_URL).then(function (res) {
        if (!res.ok) throw new Error("Failed to load " + CONFIG_URL);
        return res.json();
      }),
    ])
      .then(function (loaded) {
        var config = loaded[0];
        return fetch(config.sharedContract).then(function (res) {
          if (!res.ok) throw new Error("Failed to load " + config.sharedContract);
          return res.json().then(function (shared) {
            return { config: config, shared: shared };
          });
        });
      })
      .then(function (ctx) {
        var shared = ctx.shared;
        ensurePMTilesProtocol();

        var map = new window.maplibregl.Map({
          container: "its-map",
          style: {
            version: 8,
            glyphs: shared.server.glyphs,
            sources: {},
            layers: [{ id: "background", type: "background", paint: { "background-color": shared.map.background } }],
          },
          center: ctx.config.scenes.swipe.center,
          zoom: ctx.config.scenes.swipe.zoom,
          minZoom: shared.map.minZoom,
          maxZoom: shared.map.maxZoom,
          attributionControl: { compact: false },
        });
        map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
        map.addControl(new window.maplibregl.ScaleControl({ unit: "imperial" }));

        // MapLibre console.error()s every failed/aborted tile fetch unless an
        // error listener exists; route the routine ones to console.debug
        // (same rationale as demo.js — real failures surface in the pill).
        map.on("error", function (event) {
          if (console && console.debug) {
            console.debug("maplibre:", event && event.error ? event.error.message : event);
          }
        });

        ctx.map = map;
        setStatus("probing", "checking demo.honua.io…");

        var imagery = findBaseDef(shared, "imagery");
        var terrainBase = findBaseDef(shared, "terrain");
        var terrainLayer = findLayerDef(shared, "terrain");

        var probes = Promise.all([
          probeArchive(shared.basemap && shared.basemap.proxyUrl),
          probeArchive(imagery && imagery.pmtiles && imagery.pmtiles.proxyUrl),
          probeArchive(terrainBase && terrainBase.hillshade && terrainBase.hillshade.pmtiles && terrainBase.hillshade.pmtiles.proxyUrl),
          probeArchive(terrainLayer && terrainLayer.pmtiles && terrainLayer.pmtiles.proxyUrl),
          stac.probe(ctx),
        ]);
        var mapReady = new Promise(function (resolve) {
          map.on("load", resolve);
        });

        return Promise.all([probes, mapReady]).then(function (results) {
          var probed = results[0];
          ctx.availability = {
            basemap: probed[0],
            imagery: probed[1],
            hillshade: probed[2],
            terrain: probed[3],
          };
          ctx.stacProbe = probed[4];

          activeSwitcher = setupBasemapSwitcher(map, shared, ctx.availability, function () {
            // A user click on the switcher means the view no longer matches
            // the scene: retire the swipe blade (it narrates map-vs-imagery)
            // and clear the chip, like demo.html does.
            if (swipe.active) swipe.deactivate();
            setActiveChip(null);
            hillshade.syncControls(ctx);
            hillshade.applyOpacity(ctx);
          });

          swipe.bindHandle();
          hillshade.bind(ctx);
          el("its-profile-preset").textContent = "▶ " + ctx.config.profile.preset.label;
          el("its-profile-preset").addEventListener("click", function () {
            if (profile.available(ctx)) profile.runPreset(ctx);
          });
          el("its-profile-clear").addEventListener("click", function () {
            profile.clear(ctx);
          });

          renderScenes(ctx);
          applyScene(ctx, SCENES[0], { instant: true });

          var archivesLive = [ctx.availability.basemap, ctx.availability.imagery, ctx.availability.hillshade, ctx.availability.terrain].filter(Boolean).length;
          var stacNote = ctx.stacProbe.reachable
            ? ctx.stacProbe.collections.length > 0
              ? "STAC live (" + ctx.stacProbe.collections.length + " collections)"
              : "STAC catalog live, 0 collections — sample lane"
            : "STAC unreachable";

          if (archivesLive === 0 && !ctx.stacProbe.reachable) {
            setStatus("offline", "demo server not reachable yet — scenes light up as archives are seeded");
          } else if (archivesLive === 0) {
            setStatus("waiting", "connected — 0 of 4 raster archives seeded · " + stacNote);
          } else {
            setStatus("live", "demo.honua.io · " + archivesLive + " of 4 raster archives live · " + stacNote);
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

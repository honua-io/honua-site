/*
 * honua.io Esri Leaflet demo — /demo-esri-leaflet.html
 *
 * The interoperability proof for web developers: the map stack on this page
 * is UNMODIFIED Leaflet + Esri Leaflet (vendored verbatim — see
 * assets/vendor/README.md), not Honua's SDK. Every layer and query goes
 * through Honua Server's GeoServices REST surface exactly as it would
 * against ArcGIS:
 *
 *   - L.esri.featureLayer(...)  → FeatureServer query (GeoJSON out)
 *   - L.esri.query(...)         → FeatureServer spatial query on click
 *   - the ImageServer tile route ({z}/{y}/{x}) for server-rendered rasters
 *                                 (hillshade, NAIP) — deliberately the DYNAMIC
 *                                 lane: this page is about the Esri-compatible
 *                                 surface, and CloudFront caches the tiles for
 *                                 24 h. The static PMTiles lanes star on the
 *                                 other demos. NOTE: consumed via plain
 *                                 L.tileLayer on the Esri-shaped template
 *                                 rather than L.esri.tiledMapLayer, because
 *                                 tiledMapLayer fetches service metadata
 *                                 before its first tile and Honua's
 *                                 ImageServer f=json metadata currently takes
 *                                 30-40 s (server gap, filed) — the tile
 *                                 route itself is fast and CDN-cached.
 *
 * Leaflet's own controls (zoom, layers, popups, attribution) are used on
 * purpose — the foreign client's idioms are the story. Endpoints come from
 * the canonical assets/demo/layers.json contract (read-only, the same
 * precedent as the other demo pages). Scenes pattern per demo.html.
 *
 * NOTE on editing: esri-leaflet's editing methods (addFeature/updateFeature/
 * deleteFeature) call the FeatureServer applyEdits surface, which Honua
 * gates behind the Pro `editing.featureserver-edits` entitlement — the
 * Esri-compatibility premium is paid on the write side only; editing through
 * the open protocols (OGC API Features, WFS-T, OData, gRPC) is Community.
 * This page is read-only and labels that split factually in the sidebar.
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
    var pill = el("el-status");
    if (!pill) return;
    pill.dataset.state = state;
    pill.textContent = text;
  }

  /* ── Cartography (same palette family as demo.js — one constant, two
   * consumers: the featureLayer style fn and the panel legend). ────── */
  var ZONING_ATTRIBUTE = "zone_code";
  var ZONING_FALLBACK_COLOR = "#8b97a0";
  var ZONING_FAMILIES = [
    { family: "Residential", codes: ["000", "010", "020", "030", "040", "101", "102"], color: "#e8c862" },
    { family: "Apartment / Hotel", codes: ["100", "110", "120", "200", "210", "215", "220"], color: "#e2914e" },
    { family: "Business / Commercial", codes: ["310", "320", "330", "340", "360", "365", "370", "380", "390"], color: "#d978a8" },
    { family: "Industrial", codes: ["410", "420", "425", "430"], color: "#a48ad8" },
    { family: "Agricultural / Rural", codes: ["500", "600", "605", "610"], color: "#8fb454" },
    { family: "Park / Open Space", codes: ["819", "820", "821", "822", "825", "829", "919", "925", "929"], color: "#55b88a" },
    { family: "Public / Quasi-public", codes: ["900", "902", "905", "909"], color: "#6aa9dc" },
  ];

  function zoningColor(code) {
    for (var i = 0; i < ZONING_FAMILIES.length; i++) {
      if (ZONING_FAMILIES[i].codes.indexOf(code) !== -1) return ZONING_FAMILIES[i].color;
    }
    return ZONING_FALLBACK_COLOR;
  }

  function renderLegend() {
    var rows = el("el-legend-rows");
    rows.innerHTML = "";
    ZONING_FAMILIES.concat([{ family: "Other / unzoned", color: ZONING_FALLBACK_COLOR }]).forEach(function (g) {
      var li = document.createElement("li");
      var sw = document.createElement("span");
      sw.className = "el-swatch";
      sw.style.background = g.color;
      var label = document.createElement("span");
      label.textContent = g.family;
      li.appendChild(sw);
      li.appendChild(label);
      rows.appendChild(li);
    });
  }

  /* ── Code strip ─────────────────────────────────────────────────── */

  var ACCENT_RE =
    /\b(L|esri|featureLayer|tiledMapLayer|query|intersects|nearby|run|addTo|bindPopup|setStyle|on)\b/g;

  function splitComment(line) {
    var inString = false;
    for (var i = 0; i < line.length - 1; i++) {
      var ch = line.charAt(i);
      if (ch === '"') inString = !inString;
      else if (!inString && ch === "/" && line.charAt(i + 1) === "/") return [line.slice(0, i), line.slice(i)];
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
        html += '<span class="el-code-str">' + escapeHtml(segments[i]) + "</span>";
      } else {
        html += escapeHtml(segments[i]).replace(ACCENT_RE, '<span class="el-code-accent">$1</span>');
      }
    }
    if (parts[1]) html += '<span class="el-code-comment">' + escapeHtml(parts[1]) + "</span>";
    return html;
  }

  var codeStrip = {
    raw: "",
    set: function (title, code) {
      this.raw = code;
      var titleEl = el("el-code-title");
      var blockEl = el("el-code-block");
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
    var btn = el("el-code-copy");
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
    var list = el("el-capability-list");
    if (!list) return;
    list.innerHTML = "";
    scene.capabilities.forEach(function (cap) {
      var row = document.createElement("li");
      var label = document.createElement("span");
      label.className = "el-capability-label";
      label.textContent = cap.label;
      var badge = document.createElement("span");
      badge.className = "el-ed-badge";
      badge.dataset.edition = cap.edition.toLowerCase();
      badge.textContent = cap.edition;
      row.appendChild(label);
      row.appendChild(badge);
      list.appendChild(row);
    });
  }

  /* ── Shared-contract accessors ──────────────────────────────────── */

  function findLayerDef(shared, layerId) {
    var layers = shared.layers || [];
    for (var i = 0; i < layers.length; i++) {
      if (layers[i].id === layerId) return layers[i];
    }
    return null;
  }

  function findBaseDef(shared, baseId) {
    var bases = shared.bases || [];
    for (var i = 0; i < bases.length; i++) {
      if (bases[i].id === baseId) return bases[i];
    }
    return null;
  }

  function probeService(url) {
    return fetch(url + "?f=json")
      .then(function (res) {
        if (!res.ok) return false;
        return res.json().then(function (body) {
          return !(body && body.error);
        });
      })
      .catch(function () {
        return false;
      });
  }

  /* ── Bootstrap ──────────────────────────────────────────────────── */

  var ctx = {
    map: null,
    shared: null,
    base: null,
    available: {},
    layers: {}, // live Leaflet layers by id
    sceneLayers: [], // layers owned by the active scene
  };

  function serviceUrl(def) {
    return ctx.base + def.service.path;
  }

  function clearSceneLayers() {
    ctx.map.closePopup(); // popups belong to the scene that opened them
    ctx.sceneLayers.forEach(function (layer) {
      ctx.map.removeLayer(layer);
    });
    ctx.sceneLayers = [];
    if (ctx._clickHandler) {
      ctx.map.off("click", ctx._clickHandler);
      ctx._clickHandler = null;
    }
  }

  /* ── Scenes ─────────────────────────────────────────────────────── */

  var SCENES = [
    {
      id: "features",
      name: "Feature layers",
      caption:
        "L.esri.featureLayer — zoning polygons styled by district family and GNIS place names with popups, both streaming from Honua's FeatureServer as if it were ArcGIS. Click any feature.",
      view: { center: [20.885, -156.498], zoom: 14 },
      requires: ["zoning", "place-names"],
      legend: true,
      capabilities: [
        { label: "GeoServices FeatureServer — query, metadata, pagination (esri-leaflet featureLayer)", edition: "Community" },
        { label: "GeoJSON output from the Esri query surface (f=geojson)", edition: "Community" },
      ],
      code: function () {
        var zoning = findLayerDef(ctx.shared, "zoning");
        return [
          "// unmodified esri-leaflet — only the URL points at Honua:",
          "const zoning = L.esri.featureLayer({",
          '  url: "' + serviceUrl(zoning) + '",',
          "  style: (f) => ({ color: familyColor(f.properties." + ZONING_ATTRIBUTE + "), weight: 1, fillOpacity: 0.45 }),",
          "}).addTo(map);",
          'zoning.bindPopup((l) => `${l.feature.properties.zone_dist}`);',
        ].join("\n");
      },
      enter: function () {
        var zoningDef = findLayerDef(ctx.shared, "zoning");
        var placesDef = findLayerDef(ctx.shared, "place-names");

        if (ctx.available.zoning) {
          var zoning = window.L.esri
            .featureLayer({
              url: serviceUrl(zoningDef),
              style: function (feature) {
                var color = zoningColor(feature.properties && feature.properties[ZONING_ATTRIBUTE]);
                return { color: color, weight: 1, opacity: 0.9, fillColor: color, fillOpacity: 0.45 };
              },
            })
            .bindPopup(function (layer) {
              var p = layer.feature.properties || {};
              return (
                '<strong class="el-popup-kicker">Zoning</strong>' +
                escapeHtml(p.zone_dist || p[ZONING_ATTRIBUTE] || "—") +
                '<br><span class="el-popup-sub">zone_code ' +
                escapeHtml(p[ZONING_ATTRIBUTE] || "—") +
                " · County of Maui</span>"
              );
            })
            .addTo(ctx.map);
          ctx.sceneLayers.push(zoning);
        }

        if (ctx.available["place-names"]) {
          var places = window.L.esri
            .featureLayer({
              url: serviceUrl(placesDef),
              pointToLayer: function (_feature, latlng) {
                return window.L.circleMarker(latlng, {
                  radius: 5,
                  color: "#04151a",
                  weight: 1.5,
                  fillColor: "#5fc4a6",
                  fillOpacity: 0.95,
                });
              },
            })
            .bindPopup(function (layer) {
              var p = layer.feature.properties || {};
              return (
                '<strong class="el-popup-kicker">Place name</strong>' +
                escapeHtml(p.name || "—") +
                '<br><span class="el-popup-sub">' +
                escapeHtml(p.class || "GNIS") +
                " · USGS</span>"
              );
            })
            .addTo(ctx.map);
          ctx.sceneLayers.push(places);
        }
        el("el-legend").hidden = !ctx.available.zoning;
      },
      exit: function () {
        el("el-legend").hidden = true;
      },
    },
    {
      id: "query",
      name: "Click to query",
      caption:
        "L.esri.query — click anywhere and the page runs a point-intersects query against the parcels FeatureServer, the exact call an ArcGIS app would make. The literal request appears below.",
      view: { center: [20.79, -156.46], zoom: 15 },
      requires: ["parcels"],
      capabilities: [
        { label: "GeoServices FeatureServer — spatial query (geometry intersects)", edition: "Community" },
        { label: "FeatureServer editing (applyEdits) — what esri-leaflet's edit methods would call. Not used here: the Esri write surface is the Pro half of the editing split; open-protocol editing is Community", edition: "Pro" },
      ],
      code: function () {
        var parcels = findLayerDef(ctx.shared, "parcels");
        return [
          "// the same query an ArcGIS app would issue — click the map:",
          'L.esri.query({ url: "' + serviceUrl(parcels) + '" })',
          "  .intersects(e.latlng)",
          "  .run((err, fc) => showPopup(fc.features[0]));",
        ].join("\n");
      },
      enter: function () {
        var parcelsDef = findLayerDef(ctx.shared, "parcels");
        if (!ctx.available.parcels) return;
        ctx._clickHandler = function (event) {
          var started = performance.now();
          window.L.esri
            .query({ url: serviceUrl(parcelsDef) })
            .intersects(event.latlng)
            .run(function (error, featureCollection) {
              var ms = Math.round(performance.now() - started);
              if (error || !featureCollection || featureCollection.features.length === 0) {
                window.L.popup()
                  .setLatLng(event.latlng)
                  .setContent('<span class="el-popup-sub">no parcel here — ' + ms + " ms</span>")
                  .openOn(ctx.map);
                return;
              }
              var p = featureCollection.features[0].properties || {};
              var rows = "";
              Object.keys(p)
                .slice(0, 8)
                .forEach(function (key) {
                  rows +=
                    '<div class="el-popup-row"><span>' +
                    escapeHtml(key) +
                    "</span><strong>" +
                    escapeHtml(p[key] === null || p[key] === undefined ? "—" : String(p[key])) +
                    "</strong></div>";
                });
              window.L.popup({ maxWidth: 320 })
                .setLatLng(event.latlng)
                .setContent(
                  '<strong class="el-popup-kicker">Parcel (TMK)</strong>' +
                    rows +
                    '<span class="el-popup-sub">L.esri.query().intersects() · ' +
                    ms +
                    " ms</span>"
                )
                .openOn(ctx.map);

              codeStrip.set("// esri-leaflet — the query that just ran", [
                'L.esri.query({ url: "' + serviceUrl(parcelsDef) + '" })',
                "  .intersects(L.latLng(" + event.latlng.lat.toFixed(5) + ", " + event.latlng.lng.toFixed(5) + "))",
                "  .run(callback); // → " + featureCollection.features.length + " feature(s) in " + ms + " ms",
              ].join("\n"));
            });
        };
        ctx.map.on("click", ctx._clickHandler);
      },
      exit: function () {},
    },
    {
      id: "tiles",
      name: "Server-rendered tiles",
      caption:
        "Honua's ImageServer tile route, consumed by Leaflet — NAIP imagery rendered by the server per request (and cached at the CDN edge for 24 h). Use Leaflet's layers control (bottom-right) to swap hillshade and imagery.",
      view: { center: [20.885, -156.47], zoom: 13 },
      requires: [],
      capabilities: [
        { label: "GeoServices ImageServer tile route — server-rendered rasters (live lane; the static PMTiles lanes star on the other demos)", edition: "Community" },
        { label: "Raster file import + serving (NAIP COG, 3DEP hillshade)", edition: "Community" },
      ],
      code: function () {
        var imagery = findBaseDef(ctx.shared, "imagery");
        return [
          "// Esri-shaped tile endpoints — tiledMapLayer just works:",
          "const naip = L.esri.tiledMapLayer({",
          '  url: "' + ctx.base + (imagery ? imagery.service.path : "") + '",',
          "}).addTo(map);",
          "// {z}/{y}/{x} tiles rendered from the source rasters per request,",
          "// then cached for 24 h at the CDN edge",
        ].join("\n");
      },
      enter: function () {
        // Swap the base through normal add/remove so Leaflet's layers
        // control radio state stays truthful.
        if (ctx.layers.imagery) {
          if (ctx.layers.hillshade && ctx.map.hasLayer(ctx.layers.hillshade)) ctx.map.removeLayer(ctx.layers.hillshade);
          if (!ctx.map.hasLayer(ctx.layers.imagery)) ctx.map.addLayer(ctx.layers.imagery);
        }
      },
      exit: function () {
        if (ctx.layers.imagery && ctx.map.hasLayer(ctx.layers.imagery)) ctx.map.removeLayer(ctx.layers.imagery);
        if (ctx.layers.hillshade && !ctx.map.hasLayer(ctx.layers.hillshade)) ctx.map.addLayer(ctx.layers.hillshade);
      },
    },
  ];

  var activeScene = null;

  function setActiveChip(sceneId) {
    var chips = document.querySelectorAll(".el-scene-chip");
    for (var i = 0; i < chips.length; i++) {
      chips[i].setAttribute("aria-pressed", chips[i].dataset.scene === sceneId ? "true" : "false");
    }
  }

  function applyScene(scene, opts) {
    opts = opts || {};
    if (activeScene && activeScene.exit) activeScene.exit();
    clearSceneLayers();
    activeScene = scene;

    if (opts.camera !== false) {
      ctx.map.flyTo(scene.view.center, scene.view.zoom, { duration: opts.instant ? 0 : 1.4 });
    }

    el("el-scene-caption").textContent = scene.caption;
    var pending =
      scene.requires.length > 0 &&
      scene.requires.every(function (id) {
        return !ctx.available[id];
      });
    el("el-scene-pending").hidden = !pending;

    renderCapabilities(scene);
    codeStrip.set("// esri-leaflet — “" + scene.name + "”", scene.code());
    setActiveChip(scene.id);
    if (!pending) scene.enter();
  }

  function renderScenes() {
    var nav = el("el-scene-list");
    nav.innerHTML = "";
    SCENES.forEach(function (scene) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "el-scene-chip";
      chip.dataset.scene = scene.id;
      chip.setAttribute("aria-pressed", "false");
      chip.textContent = scene.name;
      chip.addEventListener("click", function () {
        applyScene(scene);
      });
      nav.appendChild(chip);
    });
  }

  function collapsePanelsOnSmallScreens() {
    if (window.innerWidth >= 900) return;
    var codeStripEl = el("el-code-strip");
    var capabilitiesEl = el("el-capabilities");
    if (codeStripEl) codeStripEl.open = false;
    if (capabilitiesEl) capabilitiesEl.open = false;
  }

  function bootstrap() {
    if (!window.L || !window.L.esri) {
      setStatus("error", "demo assets failed to load");
      return;
    }

    collapsePanelsOnSmallScreens();
    attachCopyButton();
    renderLegend();

    fetch(SHARED_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load " + SHARED_URL);
        return res.json();
      })
      .then(function (shared) {
        ctx.shared = shared;
        ctx.base = shared.server.baseUrl;

        var map = window.L.map("el-map", {
          center: SCENES[0].view.center,
          zoom: SCENES[0].view.zoom,
          minZoom: shared.map.minZoom,
          maxZoom: shared.map.maxZoom,
          zoomControl: true,
        });
        window.L.control.scale({ imperial: true }).addTo(map);
        ctx.map = map;

        setStatus("probing", "checking demo.honua.io…");

        // Availability probes — the same graceful-absence contract as the
        // other demos, expressed in this client's terms (f=json metadata).
        var terrainBase = findBaseDef(shared, "terrain");
        var imageryBase = findBaseDef(shared, "imagery");
        // Raster availability is probed with a single low-zoom TILE rather
        // than service metadata: the tile route is CDN-cached and fast,
        // while ImageServer f=json metadata currently takes 30-40 s on the
        // live server (gap filed against honua-server).
        function probeTile(template) {
          // z11 over West Maui: small enough to render inside the request
          // budget (the z<=8 county-wide mosaics deliberately exceed it —
          // see layers.json) and CDN-cached after the first hit.
          var url = ctx.base + template.replace("{z}", 11).replace("{y}", 902).replace("{x}", 133);
          return fetch(url, { method: "GET" })
            .then(function (res) { return res.ok; })
            .catch(function () { return false; });
        }
        var probes = {
          zoning: probeService(ctx.base + findLayerDef(shared, "zoning").service.path),
          "place-names": probeService(ctx.base + findLayerDef(shared, "place-names").service.path),
          parcels: probeService(ctx.base + findLayerDef(shared, "parcels").service.path),
          hillshade: probeTile(terrainBase.hillshade.service.tileTemplate),
          imagery: probeTile(imageryBase.service.tileTemplate),
        };
        var keys = Object.keys(probes);

        return Promise.all(
          keys.map(function (key) {
            return probes[key];
          })
        ).then(function (results) {
          keys.forEach(function (key, i) {
            ctx.available[key] = results[i];
          });

          // Bases — server-rendered rasters through L.esri.tiledMapLayer
          // (the route is {ImageServer}/tile/{z}/{y}/{x}, the exact shape
          // tiledMapLayer requests; CloudFront caches them for 24 h).
          var bases = {};
          var dark = window.L.layerGroup(); // empty group — the dark shell background shows through
          bases["Dark"] = dark;
          function esriTileLayer(template, attribution) {
            // Esri-shaped tile endpoint ({Service}/tile/{z}/{y}/{x}) via plain
            // L.tileLayer: same URLs L.esri.tiledMapLayer would request, minus
            // its blocking service-metadata fetch (see header note).
            return window.L.tileLayer(ctx.base + template, {
              maxNativeZoom: 13,
              attribution: attribution,
            });
          }
          if (ctx.available.hillshade) {
            ctx.layers.hillshade = esriTileLayer(
              terrainBase.hillshade.service.tileTemplate,
              "USGS 3DEP · rendered by Honua Server"
            );
            bases["Hillshade"] = ctx.layers.hillshade;
            ctx.layers.hillshade.addTo(map);
          } else {
            dark.addTo(map);
          }
          if (ctx.available.imagery) {
            ctx.layers.imagery = esriTileLayer(
              imageryBase.service.tileTemplate,
              "USDA NAIP · rendered by Honua Server"
            );
            bases["Imagery (NAIP)"] = ctx.layers.imagery;
          }
          if (Object.keys(bases).length > 1) {
            window.L.control.layers(bases, null, { collapsed: false, position: "bottomright" }).addTo(map);
          }

          renderScenes();
          applyScene(SCENES[0], { instant: true });

          var live = keys.filter(function (key) {
            return ctx.available[key];
          }).length;
          if (live === 0) {
            setStatus("offline", "demo server not reachable yet — scenes light up as data is seeded");
          } else {
            setStatus(
              "live",
              "demo.honua.io · GeoServices REST · " + live + " of " + keys.length + " services live · client: esri-leaflet 3.0.19"
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

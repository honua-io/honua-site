/*
 * honua.io "Spatial analytics in the browser" demo.
 *
 * One MapLibre map, one button per Honua Server analytics operation. Every
 * button sends exactly one plain fetch() to demo.honua.io, prints that request
 * verbatim in the request strip, and paints the GeoJSON response into its own
 * source/layer. Nothing is computed client-side and nothing is faked: a failed
 * call shows the server's status and problem detail, and a capability whose
 * entitlement the server reports inactive is disabled with the reason.
 *
 * Basemap: Protomaps PMTiles through the Honua range proxy (shared contract in
 * assets/demo/layers.json). When the archive is unavailable the map stays on
 * the dark background and the basemap chip says so.
 */
(function () {
  "use strict";

  var SERVER = "https://demo.honua.io";
  var FEATURES = SERVER + "/ogc/features/collections";
  var MANIFEST_URL = SERVER + "/api/v1/capabilities/manifest";
  // Dim base layer: the raw inspection points, a plain OGC API Features read
  // (no analysis). Not a result layer, so Clear keeps it.
  var BASE_ITEMS_URL = FEATURES + "/maui-inspections/items?limit=100";
  // An active entitlement is not enough for H3: the server aggregates H3 only
  // on managed-store layers with the h3 Postgres extension installed. Every
  // source-mode layer (all seven Maui layers and maui-inspections) answers
  // 501. The page probes this ordered candidate list at load, one cheap
  // coarse-resolution request each, and the first collection that answers 200
  // becomes the H3 target. No 200 → the button is disabled with the server's
  // detail. Only these names exist or may be published by the demo operator.
  var H3_CANDIDATES = ["maui-buildings-managed", "maui-inspections-scratch"];
  var H3_LAYERS = {
    "maui-buildings-managed": { noun: "buildings", resolution: 8, source: "managed copy of maui-buildings" },
    // 27 points: resolution 6 (~3 km cells) still aggregates (up to 3 per
    // cell) and reads at the initial zoom; 7 and 8 are almost all count 1.
    "maui-inspections-scratch": { noun: "inspections", resolution: 6, source: "managed scratch layer" },
  };
  var H3_PROBE_RESOLUTION = 5;
  var SHARED_CONTRACT = "assets/demo/layers.json";
  var BACKGROUND = "#0a1a24";
  var REQUEST_TIMEOUT_MS = 28000; // below the 30 s CloudFront/Lambda edge ceiling

  // Density is never sent unbounded: the full 42k-building layer exceeds the
  // 30 s edge timeout. The envelope is the current view, clipped to this
  // window around the map centre (measured: a ~7 x 5 km Kahului window
  // returns in ~3 s; ~15 x 11 km in ~8 s; ~30 x 22 km times out).
  var DENSITY_MAX_SPAN = { lon: 0.1, lat: 0.07 };

  var INITIAL_VIEW = { center: [-156.36, 20.8], zoom: 9.3 };

  var CLUSTER_COLORS = [
    "#5fc4a6", "#e8c862", "#7aa8ff", "#e07a9a", "#b48cf2",
    "#f0a35e", "#6fd3e6", "#a8d672", "#ff8a80", "#c9b48a",
  ];
  var NOISE_COLOR = "#6b8290";
  var RAMP = ["#14323d", "#2f7f78", "#5fc4a6", "#e8c862", "#f07a4a"];

  /* Each operation: what it proves, the exact request, and how to paint. */
  var OPS = {
    cluster: {
      key: "analytics.clustering",
      label: "Spatial clustering (DBSCAN)",
      method: "POST",
      url: FEATURES + "/maui-inspections/clusters",
      body: function () {
        return { algorithm: "dbscan", eps: 5000, minPoints: 2 };
      },
    },
    join: {
      key: "analytics.spatial-join",
      label: "Spatial join to zoning",
      method: "POST",
      url: FEATURES + "/maui-inspections/spatial-join",
      body: function () {
        return { joinLayerId: 2, predicate: "intersects", carryFields: "zone_code,zone_dist,cp_area" };
      },
    },
    buffer: {
      key: "analytics.buffer-aggregate",
      label: "Buffer + aggregate",
      method: "POST",
      url: FEATURES + "/maui-inspections/buffer-aggregate",
      body: function () {
        return { distance: 1000, unit: "meters" };
      },
    },
    h3: {
      key: "analytics.h3",
      label: "H3 aggregation",
      method: "GET",
      // Set from the probe-selected H3 target (see selectH3Target).
      url: h3Url(H3_CANDIDATES[0], H3_LAYERS[H3_CANDIDATES[0]].resolution),
      body: null,
    },
    density: {
      key: "analytics.density",
      label: "Density binning (hex)",
      method: "POST",
      url: FEATURES + "/maui-buildings/density",
      body: function (ctx) {
        var b = ctx.envelope;
        return {
          mode: "hex",
          cellSize: 250,
          geometry: { xmin: b[0], ymin: b[1], xmax: b[2], ymax: b[3], spatialReference: { wkid: 4326 } },
          geometryType: "esriGeometryEnvelope",
          inSR: 4326,
          spatialRel: "esriSpatialRelIntersects",
        };
      },
    },
  };

  var CAPABILITY_ROWS = [
    { key: "analytics.clustering", label: "Spatial clustering — DBSCAN / k-means" },
    { key: "analytics.spatial-join", label: "Spatial join — cross-layer predicate + carry fields" },
    { key: "analytics.buffer-aggregate", label: "Buffer aggregate — buffer, dissolve, count" },
    { key: "analytics.h3", label: "H3 aggregation — hexagonal cells; needs the h3 Postgres extension and a managed-store layer; source-mode layers answer 501" },
    { key: "analytics.density", label: "Density binning — hex / square grid" },
    { key: "serve.ogc-api-features", label: "OGC API Features — the collections the analyses run on" },
  ];
  // Edition labels follow the published edition split (editions.html /
  // honua-server capability catalog): the analytics compute keys are Pro,
  // the OGC API Features door is Community.
  var EDITION = {
    "analytics.clustering": "Pro",
    "analytics.spatial-join": "Pro",
    "analytics.buffer-aggregate": "Pro",
    "analytics.h3": "Pro",
    "analytics.density": "Pro",
    "serve.ogc-api-features": "Community",
  };

  var state = {
    map: null,
    entitlements: null, // Map key -> entitlement record, or null when unknown
    manifest: null,
    results: {}, // op -> { status, ms, features, request }
    // Bumped by clearAll(). A response whose request started in an older
    // generation is stale: it never repaints, re-labels, or moves the camera.
    generation: 0,
    providerBlocked: {}, // capability key -> server detail when the provider answers 501
    providerStatus: {}, // capability key -> HTTP status behind providerBlocked
    h3Pending: true, // H3 target probe still running: button stays disabled
    h3Target: null, // collection id the H3 button sends to, once probed
    pending: new Set(), // AbortControllers of in-flight requests
    popup: null,
  };

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(stateName, text) {
    var pill = el("sa-status");
    pill.dataset.state = stateName;
    pill.textContent = text;
  }

  function setChip(id, stateName, text) {
    var chip = el(id);
    chip.dataset.state = stateName;
    chip.textContent = text;
  }

  function setResult(text, isError) {
    var node = el("sa-result");
    node.textContent = text;
    if (isError) node.dataset.state = "error";
    else delete node.dataset.state;
  }

  function setLegend(html) {
    var node = el("sa-legend");
    if (!html) {
      node.hidden = true;
      node.innerHTML = "";
      return;
    }
    node.hidden = false;
    node.innerHTML = html;
  }

  /* ── request strip ─────────────────────────────────────────────── */

  function requestSnippet(op, body) {
    var lines = [];
    if (op.method === "GET") {
      lines.push('const res = await fetch("' + op.url + '");');
    } else {
      lines.push('const res = await fetch("' + op.url + '", {');
      lines.push('  method: "POST",');
      lines.push('  headers: { "Content-Type": "application/json" },');
      lines.push("  body: JSON.stringify(" + JSON.stringify(body) + "),");
      lines.push("});");
    }
    lines.push("const geojson = await res.json(); // FeatureCollection");
    lines.push('map.addSource("result", { type: "geojson", data: geojson });');
    return lines.join("\n");
  }

  function showRequest(title, snippet, outcome) {
    el("sa-code-title").textContent = "// " + title;
    el("sa-code-block").textContent = snippet + (outcome ? "\n// → " + outcome : "");
  }

  function attachCopyButton() {
    var btn = el("sa-code-copy");
    btn.addEventListener("click", function () {
      var text = el("sa-code-block").textContent;
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(text).then(
        function () {
          btn.textContent = "copied";
          setTimeout(function () {
            btn.textContent = "copy";
          }, 1400);
        },
        function () {
          // Clipboard denied: leave the button as-is; never an error state.
        }
      );
    });
  }

  /* ── capability manifest → entitlement gating ──────────────────── */

  function loadManifest() {
    return fetch(MANIFEST_URL, { headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (manifest) {
        var list = (manifest && manifest.policies && manifest.policies.entitlements) || [];
        var byKey = new Map();
        list.forEach(function (entry) {
          if (entry && entry.key) byKey.set(entry.key, entry);
        });
        state.manifest = manifest;
        state.entitlements = byKey;
        return true;
      })
      .catch(function () {
        state.entitlements = null;
        return false;
      });
  }

  // Returns "active" | "inactive" | "unknown". A key the manifest does not
  // list as an entitlement (e.g. a Community protocol) is not gated.
  function entitlementState(key) {
    if (!state.entitlements) return "unknown";
    var entry = state.entitlements.get(key);
    if (!entry) return EDITION[key] === "Community" ? "active" : "unknown";
    return entry.active === true ? "active" : "inactive";
  }

  function inactiveReason(key) {
    var entry = state.entitlements && state.entitlements.get(key);
    var code = entry && entry.reasonCode ? entry.reasonCode : "inactive";
    return (
      "Unavailable on demo.honua.io right now: the capability manifest reports " +
      key +
      " " +
      code +
      ", so the server answers 402. It turns on when the demo runs the 2026.1 licensing-disabled configuration."
    );
  }

  function providerReason(key) {
    return (
      "Unavailable on demo.honua.io: " +
      state.providerBlocked[key] +
      " (HTTP " +
      (state.providerStatus[key] || 501) +
      "). H3 runs only on a managed-store layer with the h3 Postgres extension; source-mode layers answer 501. Use “Hex density of buildings in view” for hexbins."
    );
  }

  function blockForProvider(key, detail, status) {
    state.providerBlocked[key] = detail || "the configured data provider does not support this operation";
    state.providerStatus[key] = status || 501;
    applyGating();
    renderCapabilities();
  }

  function h3Url(collection, resolution) {
    return FEATURES + "/" + collection + "/h3?resolution=" + resolution;
  }

  // Point the H3 button, its labels, and OPS.h3 at the probed collection.
  function selectH3Target(collection) {
    var layer = H3_LAYERS[collection];
    state.h3Target = collection;
    OPS.h3.url = h3Url(collection, layer.resolution);
    OPS.h3.label = "H3 aggregation (" + collection + ")";
    var button = document.querySelector('.sa-action[data-op="h3"]');
    if (!button) return;
    button.querySelector(".sa-action-title").textContent = "H3 hexbins of " + layer.noun;
    button.querySelector(".sa-action-meta").textContent = "resolution " + layer.resolution + " · " + layer.source;
  }

  // Probe H3_CANDIDATES in order; the first 200 wins. A 404 means the
  // collection is not published, a 501 means it is source-mode; either way
  // try the next one. When none answers 200 the button is disabled with the
  // first server detail (a 501 if any candidate answered one).
  function probeH3() {
    if (entitlementState("analytics.h3") === "inactive") {
      state.h3Pending = false;
      return Promise.resolve(null);
    }
    var refusals = [];
    function probe(index) {
      if (index >= H3_CANDIDATES.length) return Promise.resolve(null);
      var collection = H3_CANDIDATES[index];
      return fetch(h3Url(collection, H3_PROBE_RESOLUTION), { headers: { Accept: "application/geo+json, application/json" } })
        .then(function (res) {
          if (res.status === 200) return { status: 200, collection: collection };
          return res
            .json()
            .catch(function () {
              return null;
            })
            .then(function (problem) {
              refusals.push({ collection: collection, status: res.status, detail: problem && problem.detail });
              return probe(index + 1);
            });
        })
        .catch(function () {
          refusals.push({ collection: collection, status: 0, detail: null });
          return probe(index + 1);
        });
    }
    return probe(0).then(function (winner) {
      state.h3Pending = false;
      var result = winner;
      if (winner) {
        selectH3Target(winner.collection);
        applyGating();
      } else {
        var answered = refusals.filter(function (r) {
          return r.status > 0;
        });
        var refusal =
          answered.filter(function (r) {
            return r.status === 501;
          })[0] || answered[0];
        if (refusal) {
          var meta = document.querySelector('.sa-action[data-op="h3"] .sa-action-meta');
          if (meta) meta.textContent = "no managed-store layer answers";
          blockForProvider("analytics.h3", refusal.detail, refusal.status);
          result = { status: refusal.status, detail: refusal.detail, refusals: refusals };
        } else {
          // Network failure on every candidate: leave the button on the first
          // candidate; a click reports the error.
          applyGating();
          result = null;
        }
      }
      state.h3Probe = result;
      return result;
    });
  }

  function applyGating() {
    var buttons = document.querySelectorAll(".sa-action[data-op]");
    Array.prototype.forEach.call(buttons, function (button) {
      var key = button.dataset.key;
      var existing = button.querySelector(".sa-action-reason");
      if (existing) existing.remove();
      var blocked = entitlementState(key) === "inactive" ? inactiveReason(key) : state.providerBlocked[key] ? providerReason(key) : null;
      if (!blocked && key === "analytics.h3" && state.h3Pending) {
        button.disabled = true;
        button.dataset.gated = "probing";
        button.title = "Probing which managed-store layer answers H3…";
        return;
      }
      if (blocked) {
        button.disabled = true;
        button.dataset.gated = entitlementState(key) === "inactive" ? "inactive" : "provider";
        var reason = document.createElement("span");
        reason.className = "sa-action-reason";
        reason.textContent = blocked;
        button.appendChild(reason);
        button.title = blocked;
      } else {
        button.disabled = false;
        delete button.dataset.gated;
        button.removeAttribute("title");
      }
    });
  }

  function renderCapabilities() {
    var list = el("sa-capability-list");
    list.innerHTML = "";
    CAPABILITY_ROWS.forEach(function (row) {
      var li = document.createElement("li");
      var label = document.createElement("span");
      label.className = "sa-capability-label";
      label.textContent = row.label;
      var code = document.createElement("code");
      code.textContent = row.key;
      label.appendChild(code);

      var badges = document.createElement("span");
      badges.className = "sa-capability-badges";
      var edition = document.createElement("span");
      edition.className = "sa-ed-badge";
      edition.dataset.edition = EDITION[row.key].toLowerCase();
      edition.textContent = EDITION[row.key];
      var live = document.createElement("span");
      var s = entitlementState(row.key);
      var providerDetail = state.providerBlocked[row.key];
      live.className = "sa-state-badge";
      live.dataset.state = providerDetail ? "inactive" : s;
      live.textContent = providerDetail ? "n/a" : s === "active" ? "on" : s === "inactive" ? "off" : "?";
      live.title = providerDetail
        ? "Licensed, but this data provider answers " + (state.providerStatus[row.key] || 501) + ": " + providerDetail
        : s === "active"
          ? "Active on demo.honua.io"
          : s === "inactive"
            ? "Inactive on demo.honua.io"
            : "Entitlement state unknown (manifest unavailable)";
      badges.appendChild(edition);
      badges.appendChild(live);

      li.appendChild(label);
      li.appendChild(badges);
      list.appendChild(li);
    });

    var foot = el("sa-capability-foot");
    var existing = el("sa-edition-note");
    if (existing) existing.remove();
    if (state.manifest && state.manifest.policies) {
      var note = document.createElement("span");
      note.id = "sa-edition-note";
      note.textContent =
        " demo.honua.io reports edition " +
        (state.manifest.policies.currentEdition || "unknown") +
        (state.manifest.policies.licenseValidationState
          ? " (" + state.manifest.policies.licenseValidationState + ")"
          : "") +
        ". ";
      foot.insertBefore(note, foot.lastElementChild);
    }
  }

  /* ── basemap ───────────────────────────────────────────────────── */

  function ensurePMTilesProtocol() {
    if (!window.pmtiles || !window.maplibregl) return false;
    try {
      var protocol = new window.pmtiles.Protocol();
      window.maplibregl.addProtocol("pmtiles", protocol.tile);
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

  function addBasemap(map, shared) {
    var bm = shared && shared.basemap;
    if (!bm || !bm.proxyUrl) {
      setChip("sa-basemap-chip", "absent", "basemap: not configured — dark background");
      return Promise.resolve(false);
    }
    return probeArchive(bm.proxyUrl).then(function (ok) {
      if (!ok || !ensurePMTilesProtocol()) {
        setChip("sa-basemap-chip", "degraded", "basemap: PMTiles unavailable — dark background");
        return false;
      }
      map.addSource("basemap", { type: "vector", url: "pmtiles://" + bm.proxyUrl, attribution: bm.attribution || "" });
      ((bm.style && bm.style.layers) || []).forEach(function (layer) {
        map.addLayer(JSON.parse(JSON.stringify(layer)));
      });
      setChip("sa-basemap-chip", "live", "basemap: Protomaps PMTiles");
      return true;
    });
  }

  /* ── result layers (one source per operation) ──────────────────── */

  var LAYERS = {
    cluster: ["sa-cluster-circle"],
    join: ["sa-join-circle"],
    buffer: ["sa-buffer-fill", "sa-buffer-line", "sa-buffer-label"],
    h3: ["sa-h3-fill", "sa-h3-line"],
    density: ["sa-density-fill", "sa-density-line", "sa-density-window"],
  };

  function sourceId(opName) {
    return "sa-" + opName;
  }

  function removeResult(map, opName) {
    (LAYERS[opName] || []).forEach(function (id) {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    [sourceId(opName), sourceId(opName) + "-label", sourceId(opName) + "-window"].forEach(function (id) {
      if (map.getSource(id)) map.removeSource(id);
    });
    delete state.results[opName];
  }

  function clusterColorExpression() {
    var expr = ["match", ["%", ["to-number", ["get", "clusterId"], 0], CLUSTER_COLORS.length]];
    CLUSTER_COLORS.forEach(function (color, index) {
      expr.push(index, color);
    });
    expr.push(NOISE_COLOR);
    return ["case", ["==", ["typeof", ["get", "clusterId"]], "number"], expr, NOISE_COLOR];
  }

  function countField(features) {
    var candidates = ["featureCount", "count", "pointCount", "total"];
    for (var i = 0; i < candidates.length; i++) {
      var name = candidates[i];
      if (features.some(function (f) { return f.properties && typeof f.properties[name] === "number"; })) return name;
    }
    return null;
  }

  function rampExpression(field, max) {
    var top = Math.max(max, 1);
    var expr = ["interpolate", ["linear"], ["to-number", ["get", field], 0]];
    RAMP.forEach(function (color, index) {
      expr.push((top * index) / (RAMP.length - 1), color);
    });
    return expr;
  }

  function rampLegend(field, max) {
    return (
      "cell colour = <code>" +
      escapeHtml(field) +
      "</code> · " +
      RAMP.map(function (color, index) {
        var value = Math.round((Math.max(max, 1) * index) / (RAMP.length - 1));
        return '<span class="sa-swatch" style="background:' + color + '"></span>' + value;
      }).join(" ")
    );
  }

  function ringArea(ring) {
    var area = 0;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    }
    return Math.abs(area / 2);
  }

  function ringCentroid(ring) {
    var x = 0;
    var y = 0;
    var n = ring.length > 1 ? ring.length - 1 : ring.length;
    for (var i = 0; i < n; i++) {
      x += ring[i][0];
      y += ring[i][1];
    }
    return [x / n, y / n];
  }

  // One label per result feature, placed on its largest polygon part, so a
  // dissolved MultiPolygon carries its single count once rather than per part.
  function labelPoints(features, field) {
    return {
      type: "FeatureCollection",
      features: features
        .map(function (feature) {
          var g = feature.geometry;
          if (!g) return null;
          var polygons = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
          if (!polygons.length) return null;
          var best = polygons.reduce(function (a, b) {
            return ringArea(b[0]) > ringArea(a[0]) ? b : a;
          });
          var count = feature.properties ? feature.properties[field] : null;
          return {
            type: "Feature",
            geometry: { type: "Point", coordinates: ringCentroid(best[0]) },
            properties: { label: count == null ? "" : count + " inspections within 1 km" },
          };
        })
        .filter(Boolean),
    };
  }

  function boundsOf(features) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    function visit(coords) {
      if (typeof coords[0] === "number") {
        b[0] = Math.min(b[0], coords[0]);
        b[1] = Math.min(b[1], coords[1]);
        b[2] = Math.max(b[2], coords[0]);
        b[3] = Math.max(b[3], coords[1]);
        return;
      }
      coords.forEach(visit);
    }
    features.forEach(function (f) {
      if (f.geometry && f.geometry.coordinates) visit(f.geometry.coordinates);
    });
    return isFinite(b[0]) ? b : null;
  }

  function fitTo(map, features) {
    var b = boundsOf(features);
    if (!b) return;
    map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding: { top: 60, bottom: 220, left: window.innerWidth >= 900 ? 360 : 40, right: window.innerWidth >= 900 ? 330 : 40 }, maxZoom: 13, duration: 700 }
    );
  }

  function parseAttributes(props) {
    var raw = props && props.attributes;
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(raw);
    } catch (_e) {
      return {};
    }
  }

  function listValue(value) {
    if (value == null) return "";
    if (typeof value === "string") {
      // MapLibre serialises array properties to JSON strings in queried features.
      if (value.charAt(0) === "[") {
        try {
          return listValue(JSON.parse(value));
        } catch (_e) {
          return value;
        }
      }
      return value;
    }
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  }

  function paint(map, opName, geojson, ctx) {
    var id = sourceId(opName);
    var features = geojson.features || [];
    map.addSource(id, { type: "geojson", data: geojson });

    if (opName === "cluster") {
      map.addLayer({
        id: "sa-cluster-circle",
        type: "circle",
        source: id,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 9],
          "circle-color": clusterColorExpression(),
          "circle-stroke-color": "#08131a",
          "circle-stroke-width": 1.5,
        },
      });
      var clusters = new Set();
      var noise = 0;
      features.forEach(function (f) {
        var c = f.properties && f.properties.clusterId;
        if (typeof c === "number") clusters.add(c);
        else noise++;
      });
      setLegend(
        "colour = <code>clusterId</code> · " +
          clusters.size +
          " clusters" +
          '<span class="sa-swatch" style="background:' +
          NOISE_COLOR +
          '"></span>noise (' +
          noise +
          ")"
      );
      return features.length + " inspections, " + clusters.size + " DBSCAN clusters, " + noise + " unclustered.";
    }

    if (opName === "join") {
      map.addLayer({
        id: "sa-join-circle",
        type: "circle",
        source: id,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 9],
          "circle-color": ["case", [">", ["to-number", ["get", "matchCount"], 0], 0], "#e8c862", NOISE_COLOR],
          "circle-stroke-color": "#08131a",
          "circle-stroke-width": 1.5,
        },
      });
      var matched = features.filter(function (f) {
        return f.properties && f.properties.matchCount > 0;
      }).length;
      setLegend(
        '<span class="sa-swatch" style="background:#e8c862"></span>inside a zoning district' +
          '<span class="sa-swatch" style="background:' +
          NOISE_COLOR +
          '"></span>no zoning match · click a point'
      );
      return matched + " of " + features.length + " inspections intersect a zoning district. Click one for the carried zone fields.";
    }

    if (opName === "buffer") {
      map.addLayer({
        id: "sa-buffer-fill",
        type: "fill",
        source: id,
        paint: { "fill-color": "#7aa8ff", "fill-opacity": 0.32 },
      });
      map.addLayer({
        id: "sa-buffer-line",
        type: "line",
        source: id,
        paint: { "line-color": "#7aa8ff", "line-width": 1.2, "line-opacity": 0.85 },
      });
      var field = countField(features) || "featureCount";
      map.addSource(id + "-label", { type: "geojson", data: labelPoints(features, field) });
      map.addLayer({
        id: "sa-buffer-label",
        type: "symbol",
        source: id + "-label",
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["NotoSansRegular"],
          "text-size": 12,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#e6f0f0", "text-halo-color": "#08131a", "text-halo-width": 1.5 },
      });
      var total = features.reduce(function (sum, f) {
        return sum + ((f.properties && f.properties[field]) || 0);
      }, 0);
      setLegend('<span class="sa-swatch" style="background:#7aa8ff"></span>1 km buffers, dissolved · label = <code>' + escapeHtml(field) + "</code>");
      return features.length + " dissolved buffer group" + (features.length === 1 ? "" : "s") + " covering " + total + " inspections.";
    }

    // h3 + density: choropleth of cells
    var cellField = countField(features) || "featureCount";
    var max = features.reduce(function (m, f) {
      var v = f.properties && Number(f.properties[cellField]);
      return isFinite(v) && v > m ? v : m;
    }, 0);
    map.addLayer({
      id: "sa-" + opName + "-fill",
      type: "fill",
      source: id,
      paint: { "fill-color": rampExpression(cellField, max), "fill-opacity": 0.72 },
    });
    map.addLayer({
      id: "sa-" + opName + "-line",
      type: "line",
      source: id,
      paint: { "line-color": "#08131a", "line-width": 0.4, "line-opacity": 0.6 },
    });
    setLegend(rampLegend(cellField, max));
    var covered = features.reduce(function (sum, f) {
      return sum + ((f.properties && Number(f.properties[cellField])) || 0);
    }, 0);

    if (opName === "density") {
      var e = ctx.envelope;
      map.addSource(id + "-window", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[[e[0], e[1]], [e[2], e[1]], [e[2], e[3]], [e[0], e[3]], [e[0], e[1]]]],
          },
        },
      });
      map.addLayer({
        id: "sa-density-window",
        type: "line",
        source: id + "-window",
        paint: { "line-color": "#e8c862", "line-width": 1.2, "line-dasharray": [3, 2] },
      });
      return (
        features.length +
        " hexes (250 m) covering " +
        covered +
        " buildings inside the dashed window" +
        (ctx.clipped ? ", clipped around the map centre to stay under the 30 s edge timeout." : ".")
      );
    }
    var h3Layer = H3_LAYERS[state.h3Target] || H3_LAYERS[H3_CANDIDATES[0]];
    return (
      features.length +
      " H3 cells (resolution " +
      h3Layer.resolution +
      ") covering " +
      covered +
      " " +
      h3Layer.noun +
      " · " +
      h3Layer.source +
      " " +
      (state.h3Target || H3_CANDIDATES[0]) +
      "."
    );
  }

  /* ── popups ────────────────────────────────────────────────────── */

  function popupHtml(kicker, rows) {
    return (
      '<p class="sa-popup-kicker">' +
      escapeHtml(kicker) +
      '</p><div class="sa-popup-grid">' +
      rows
        .filter(function (r) {
          return r[1] !== "" && r[1] != null;
        })
        .map(function (r) {
          return '<div class="sa-popup-row"><span>' + escapeHtml(r[0]) + "</span><strong>" + escapeHtml(r[1]) + "</strong></div>";
        })
        .join("") +
      "</div>"
    );
  }

  function attachPopups(map) {
    var clickable = ["sa-join-circle", "sa-cluster-circle", "sa-base-circle", "sa-h3-fill", "sa-density-fill", "sa-buffer-fill"];
    map.on("click", function (event) {
      var layers = clickable.filter(function (id) {
        return map.getLayer(id);
      });
      if (!layers.length) return;
      var hits = map.queryRenderedFeatures(event.point, { layers: layers });
      if (!hits.length) return;
      var f = hits[0];
      var p = f.properties || {};
      var html;
      if (f.layer.id === "sa-base-circle") {
        html = popupHtml("inspection · OGC API Features", [
          ["name", p.name],
          ["status", p.status],
          ["category", p.category],
          ["reported_at", p.reported_at],
        ]);
      } else if (f.layer.id === "sa-join-circle" || f.layer.id === "sa-cluster-circle") {
        var attrs = parseAttributes(p);
        var rows = [
          ["name", attrs.name],
          ["status", attrs.status],
          ["category", attrs.category],
        ];
        if (f.layer.id === "sa-join-circle") {
          rows.push(["zoning matches", p.matchCount]);
          rows.push(["zone_code", listValue(p.zone_code) || "—"]);
          rows.push(["zone_dist", listValue(p.zone_dist) || "—"]);
          rows.push(["cp_area", listValue(p.cp_area) || "—"]);
          html = popupHtml("spatial-join · maui-zoning", rows);
        } else {
          rows.unshift(["clusterId", p.clusterId == null || p.clusterId === "null" ? "noise" : p.clusterId]);
          html = popupHtml("clusters · DBSCAN", rows);
        }
      } else if (f.layer.id === "sa-buffer-fill") {
        html = popupHtml("buffer-aggregate · 1 km", [["featureCount", p.featureCount]]);
      } else {
        var cellRows = Object.keys(p).map(function (k) {
          return [k, p[k]];
        });
        html = popupHtml(f.layer.id === "sa-h3-fill" ? "h3 cell · " + (state.h3Target || "") : "density cell", cellRows);
      }
      if (state.popup) state.popup.remove();
      state.popup = new window.maplibregl.Popup({ closeButton: true, maxWidth: "300px" })
        .setLngLat(event.lngLat)
        .setHTML(html)
        .addTo(map);
    });
    clickable.forEach(function (id) {
      map.on("mouseenter", id, function () {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", id, function () {
        map.getCanvas().style.cursor = "";
      });
    });
  }

  /* ── running an operation ──────────────────────────────────────── */

  function densityEnvelope(map) {
    var bounds = map.getBounds();
    var view = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
    var center = map.getCenter();
    var halfLon = DENSITY_MAX_SPAN.lon / 2;
    var halfLat = DENSITY_MAX_SPAN.lat / 2;
    var envelope = [
      Math.max(view[0], center.lng - halfLon),
      Math.max(view[1], center.lat - halfLat),
      Math.min(view[2], center.lng + halfLon),
      Math.min(view[3], center.lat + halfLat),
    ].map(function (v) {
      return Math.round(v * 10000) / 10000;
    });
    var clipped = envelope[2] - envelope[0] < view[2] - view[0] - 1e-6 || envelope[3] - envelope[1] < view[3] - view[1] - 1e-6;
    return { envelope: envelope, clipped: clipped };
  }

  function problemText(status, payload, fallbackText) {
    if (payload && typeof payload === "object") {
      return (payload.title ? payload.title + ": " : "") + (payload.detail || payload.message || "");
    }
    return fallbackText || "HTTP " + status;
  }

  function setBusy(button, busy) {
    if (busy) button.dataset.busy = "true";
    else delete button.dataset.busy;
    button.setAttribute("aria-busy", busy ? "true" : "false");
  }

  /* ── base layer: raw inspections, painted before any analysis ──── */

  function addBaseLayer(map) {
    return fetch(BASE_ITEMS_URL, { headers: { Accept: "application/geo+json, application/json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (geojson) {
        if (!geojson || !Array.isArray(geojson.features)) throw new Error("not a FeatureCollection");
        map.addSource("sa-base", { type: "geojson", data: geojson });
        map.addLayer({
          id: "sa-base-circle",
          type: "circle",
          source: "sa-base",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 14, 6],
            "circle-color": "#8ea7a6",
            "circle-opacity": 0.45,
            "circle-stroke-color": "#08131a",
            "circle-stroke-width": 1,
          },
        });
        state.base = { features: geojson.features.length };
        return geojson.features.length;
      })
      .catch(function (error) {
        // Honest absence: the analyses still work; the base layer is optional.
        state.base = { features: 0, error: String(error && error.message ? error.message : error) };
        return 0;
      });
  }

  function run(opName, button, opts) {
    var auto = !!(opts && opts.auto);
    var map = state.map;
    var op = OPS[opName];
    var ctx = opName === "density" ? densityEnvelope(map) : {};
    var body = op.body ? op.body(ctx) : null;
    var snippet = requestSnippet(op, body);
    showRequest(op.method + " " + op.url.replace(SERVER, ""), snippet, "sending…");
    setResult(op.label + ": waiting for demo.honua.io…");
    setBusy(button, true);

    var generation = state.generation;
    var isStale = function () {
      return generation !== state.generation;
    };
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    if (controller) state.pending.add(controller);
    var timer = controller
      ? setTimeout(function () {
          controller.abort();
        }, REQUEST_TIMEOUT_MS)
      : null;
    var started = performance.now();
    var init = { method: op.method, headers: { Accept: "application/geo+json, application/json" } };
    if (body) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    if (controller) init.signal = controller.signal;

    return fetch(op.url, init)
      .then(function (res) {
        return res.text().then(function (text) {
          var payload = null;
          try {
            payload = text ? JSON.parse(text) : null;
          } catch (_e) {
            payload = null;
          }
          return { res: res, payload: payload, text: text };
        });
      })
      .then(function (r) {
        if (isStale()) return;
        var ms = Math.round(performance.now() - started);
        if (!r.res.ok || !r.payload || !Array.isArray(r.payload.features)) {
          var detail = problemText(r.res.status, r.payload, r.res.ok ? "response was not a GeoJSON FeatureCollection" : null);
          showRequest(op.method + " " + op.url.replace(SERVER, ""), snippet, r.res.status + " in " + ms + " ms · " + detail);
          setResult(op.label + " failed (" + r.res.status + "): " + detail, true);
          state.results[opName] = { status: r.res.status, ms: ms, features: 0, error: detail };
          if (r.res.status === 402) {
            button.disabled = true;
            button.dataset.gated = "inactive";
          } else if (r.res.status === 501) {
            blockForProvider(op.key, r.payload && r.payload.detail);
          }
          return;
        }
        removeResult(map, opName);
        var summary = paint(map, opName, r.payload, ctx);
        var count = r.payload.features.length;
        state.results[opName] = { status: r.res.status, ms: ms, features: count, request: { method: op.method, url: op.url, body: body } };
        showRequest(op.method + " " + op.url.replace(SERVER, ""), snippet, r.res.status + " in " + ms + " ms · " + count + " features");
        setResult(
          auto
            ? "Ran: " + button.querySelector(".sa-action-title").textContent.toLowerCase() + " · " + count + " features · " + ms + " ms. " + summary
            : summary + " (" + ms + " ms)"
        );
        button.setAttribute("aria-pressed", "true"); // result stays on the map until cleared
        if (opName !== "density" && count) fitTo(map, r.payload.features);
      })
      .catch(function (error) {
        if (isStale()) return;
        var ms = Math.round(performance.now() - started);
        var aborted = error && error.name === "AbortError";
        var detail = aborted
          ? "no response within " + REQUEST_TIMEOUT_MS / 1000 + " s (edge timeout is 30 s)"
          : "network error: " + (error && error.message ? error.message : error);
        showRequest(op.method + " " + op.url.replace(SERVER, ""), snippet, detail);
        setResult(op.label + " failed: " + detail, true);
        state.results[opName] = { status: 0, ms: ms, features: 0, error: detail };
      })
      .then(function () {
        if (timer) clearTimeout(timer);
        if (controller) state.pending.delete(controller);
        setBusy(button, false);
      });
  }

  function clearAll() {
    var map = state.map;
    // Invalidate and cancel anything still in flight before clearing, so a
    // late response cannot paint back onto the cleared map.
    state.generation += 1;
    state.pending.forEach(function (controller) {
      controller.abort();
    });
    state.pending.clear();
    Object.keys(LAYERS).forEach(function (opName) {
      removeResult(map, opName);
    });
    if (state.popup) state.popup.remove();
    Array.prototype.forEach.call(document.querySelectorAll(".sa-action[data-op]"), function (b) {
      b.setAttribute("aria-pressed", "false");
    });
    setLegend(null);
    setResult("Cleared. Pick an analysis.");
    showRequest("request", "// Press an analysis button to see the exact request it sends.", null);
    map.easeTo({ center: INITIAL_VIEW.center, zoom: INITIAL_VIEW.zoom, duration: 600 });
  }

  function wireButtons() {
    Array.prototype.forEach.call(document.querySelectorAll(".sa-action[data-op]"), function (button) {
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", function () {
        if (button.disabled || button.dataset.busy === "true") return;
        run(button.dataset.op, button);
      });
    });
    el("sa-clear").addEventListener("click", clearAll);
  }

  /* ── bootstrap ─────────────────────────────────────────────────── */

  function collapsePanelsOnSmallScreens() {
    if (window.innerWidth >= 900) return;
    el("sa-code-strip").open = false;
    el("sa-capabilities").open = false;
  }

  function bootstrap() {
    if (!window.maplibregl) {
      setStatus("error", "demo assets failed to load");
      return;
    }
    collapsePanelsOnSmallScreens();
    attachCopyButton();
    // Buttons stay disabled until the manifest has been read, so an inactive
    // entitlement is never offered as clickable.
    Array.prototype.forEach.call(document.querySelectorAll(".sa-action[data-op]"), function (b) {
      b.disabled = true;
    });

    var shared = fetch(SHARED_CONTRACT).then(
      function (r) {
        return r.ok ? r.json() : null;
      },
      function () {
        return null;
      }
    );

    var map = new window.maplibregl.Map({
      container: "sa-map",
      style: {
        version: 8,
        glyphs: SERVER + "/fonts/{fontstack}/{range}.pbf",
        sources: {},
        layers: [{ id: "background", type: "background", paint: { "background-color": BACKGROUND } }],
      },
      center: INITIAL_VIEW.center,
      zoom: INITIAL_VIEW.zoom,
      minZoom: 7,
      maxZoom: 17,
      attributionControl: { compact: false },
    });
    state.map = map;
    map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new window.maplibregl.ScaleControl({ unit: "metric" }));
    map.on("error", function (event) {
      if (console && console.debug) console.debug("maplibre:", event && event.error ? event.error.message : event);
    });

    setStatus("probing", "checking demo.honua.io…");
    var mapReady = new Promise(function (resolve) {
      map.on("load", resolve);
    });

    Promise.all([mapReady, shared, loadManifest()]).then(function (results) {
      var manifestOk = results[2];
      return addBasemap(map, results[1]).then(function (basemapOk) {
        renderCapabilities();
        applyGating();
        wireButtons();
        attachPopups(map);
        var baseReady = addBaseLayer(map);
        var h3Ready = probeH3();
        function refreshStatus() {
          if (!manifestOk) return;
          var unavailable = CAPABILITY_ROWS.filter(function (row) {
            return entitlementState(row.key) === "inactive" || state.providerBlocked[row.key];
          }).length;
          setStatus(
            basemapOk && !unavailable ? "live" : "degraded",
            "demo.honua.io live" +
              (unavailable ? " · " + unavailable + " analysis unavailable" : "") +
              (basemapOk ? "" : " · basemap unavailable")
          );
        }
        h3Ready.then(refreshStatus);
        if (manifestOk) {
          var inactive = CAPABILITY_ROWS.filter(function (row) {
            return entitlementState(row.key) === "inactive";
          }).map(function (row) {
            return row.key;
          });
          setChip(
            "sa-manifest-chip",
            inactive.length ? "degraded" : "live",
            inactive.length ? "entitlements: " + inactive.join(", ") + " off" : "entitlements: all on"
          );
          refreshStatus();
        } else {
          setChip("sa-manifest-chip", "absent", "entitlements: manifest unreachable");
          setStatus("waiting", "capability manifest unreachable — buttons will report server errors as they happen");
        }
        // Headless-verification hook (read-only; not part of the page API).
        window.__sa = { map: map, state: state, ops: OPS };

        // First frame: run "Cluster inspections" once (~0.5 s) so the map is
        // never empty. Skipped when the entitlement is inactive; Clear still
        // bumps the generation, so a clear during this run discards it.
        var clusterButton = document.querySelector('.sa-action[data-op="cluster"]');
        return baseReady.then(function () {
          if (clusterButton && !clusterButton.disabled && !state.results.cluster) {
            state.autoRun = run("cluster", clusterButton, { auto: true });
          }
        });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();

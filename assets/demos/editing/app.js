/*
 * honua.io Inspection & Editing demo — live feature editing over OData v4.
 *
 * The story: full feature editing ships on the OPEN protocols — this page's
 * Save button is a plain OData PATCH and "Add inspection" is a plain POST,
 * with the literal request shown in the code strip every time. The Esri
 * FeatureServer applyEdits surface (Pro) exists on the same server and is
 * deliberately NOT used here.
 *
 * Everything edits a SCRATCH layer of synthetic inspection points at real
 * Maui parks, trailheads, and harbors (service `maui-inspections` on
 * demo.honua.io — see config.json + README.md for the seeding contract).
 * No real inspection program is represented.
 *
 * Lanes (graceful absence, same conventions as assets/demo/demo.js):
 *   data lane   — live OData reads when the layer probe succeeds, otherwise
 *                 the bundled inspections.geojson fixture.
 *   write lane  — the page never ships a credential. When the data lane is
 *                 live, Save sends the real anonymous OData PATCH (Add sends
 *                 the POST) and the server's answer decides: 2xx = saved on
 *                 the server and re-read; 401/403 = the layer's access policy
 *                 refuses anonymous writes; 402 = license; 405/501 = the
 *                 server does not accept writes on this layer; network =
 *                 unreachable. Refusals keep the edit in the browser,
 *                 clearly chipped. Writes are governed by the layer's access
 *                 policy; the capability manifest is read only as a hint
 *                 (it reports anonymous callers as `insufficient-policy`
 *                 whatever the layer allows).
 *
 * SDK-controls rule: the only map chrome beyond MapLibre's own controls is
 * the SDK's native <honua-basemap-switcher> and <honua-legend>
 * (@honua/sdk-js/controls via the shared vendored bundle).
 */
(function () {
  "use strict";

  var CONFIG_URL = "assets/demos/editing/config.json";

  /* Opt-in backend override (assets/demos/backend-override.js). Identity when no
   * ?apiBase= / window.HONUA_DEMO_BASE_URL override is active, so the default lane
   * is byte-identical; the fallback keeps the page working if the shim is absent. */
  var BACKEND = window.HonuaDemoBackend || {
    resolve: function (pageDefault) { return pageDefault; },
    rebase: function (value) { return value; },
  };

  var S = {
    config: null,
    shared: null, // assets/demo/layers.json
    map: null,
    switcher: null,
    dataLane: "probing", // "live" | "fixture"
    backendFailure: null, // classified probe/read failure; named only while an override is active
    writeState: "untested", // "untested" | "live" | "refused" — set by the server's answer to a real write
    writeRefusal: null, // classifyWriteResponse() outcome of the last refused write
    writeHint: null, // capability-manifest `edit.features` row — informational, never a gate
    odata: null, // { layerKey, layerName, featuresUrl } when the live layer resolved
    features: [], // GeoJSON features; properties carry __key (+ __objectId when live)
    byKey: {},
    localSeq: 0,
    addMode: false,
    openPopup: null,
  };

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
    var pill = el("ed-status");
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

  function fetchWithTimeout(url, options, timeoutMs) {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var opts = options || {};
    if (controller) opts.signal = controller.signal;
    var timer = controller
      ? setTimeout(function () {
          controller.abort();
        }, timeoutMs)
      : null;
    return fetch(url, opts)
      .catch(function (error) {
        if (error && (error.name === "AbortError" || error.name === "TimeoutError")) {
          try {
            error.honuaTimeoutMs = timeoutMs;
          } catch (_assign) {
            /* A frozen error still classifies as a timeout; the limit comes from the caller. */
          }
        } else if (error && error.name === "TypeError") {
          try {
            error.honuaNetwork = true;
          } catch (_assign) {
            /* A frozen fetch TypeError still matches a Failed to fetch message. */
          }
        }
        throw error;
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  /* honua-override-cause:start */
  function classifyBackendFailure(error, timeoutMs) {
    var limit = timeoutMs;
    if (error && (error.honuaTimeoutMs || error.honuaTimeoutMs === 0)) limit = error.honuaTimeoutMs;
    if (error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      return { kind: "timeout", timeoutMs: limit };
    }
    if (error && (error.httpStatus || error.httpStatus === 0)) {
      return { kind: "http", status: String(error.httpStatus) };
    }
    var message = error && error.message ? String(error.message) : "";
    var http = /HTTP (\d{3})/.exec(message);
    if (http) return { kind: "http", status: http[1] };
    if (error && error.name === "TypeError" && error.honuaNetwork) return { kind: "network" };
    if (/failed to fetch|networkerror|cors/i.test(message)) return { kind: "network" };
    return { kind: "other", message: message || "request failed" };
  }

  function describeOverrideFailure(failure, host) {
    if (failure && failure.kind === "http") return failure.status + " from " + host;
    if (failure && failure.kind === "timeout") return "timed out after " + failure.timeoutMs + "ms contacting " + host;
    if (failure && failure.kind === "network") return "network or CORS refusal from " + host;
    if (failure && failure.kind === "other" && failure.message) return failure.message + " from " + host;
    return "backend unavailable from " + host;
  }

  function editingStatusText(dataLane, writeState, count, host, failure, overrideOn) {
    if (dataLane === "live" && writeState === "live") {
      return host + " · " + count + " inspections · live editing over OData";
    }
    if (dataLane === "live" && writeState === "refused") {
      return host + " · " + count + " inspections · the server refused the last write, so edits stay in your browser";
    }
    if (dataLane === "live") {
      return host + " · " + count + " inspections · Save sends a live OData write";
    }
    if (overrideOn) return describeOverrideFailure(failure, host) + " — sample fixture, not live";
    return "demo server unreachable — sample inspections, edits stay local";
  }

  function editingDataChipText(dataLane, count, host, failure, overrideOn) {
    if (dataLane === "live") return "data: live · " + count + " inspections";
    if (overrideOn) return "data: sample fixture · " + count + " inspections · " + describeOverrideFailure(failure, host);
    return "data: sample fixture · " + count + " inspections";
  }

  function editingProbeText(host) {
    return "checking " + host + "…";
  }

  function editingOfflineNote(overrideOn, failure, host) {
    if (overrideOn) {
      return "// (" + describeOverrideFailure(failure, host) + " — showing the bundled synthetic fixture, not live data)";
    }
    return "// (offline right now — showing the bundled synthetic fixture instead)";
  }

  function hostFromBase(base) {
    if (!base) return "demo.honua.io";
    try {
      return new URL(base).host;
    } catch (_error) {
      return String(base);
    }
  }
  /* honua-override-cause:end */

  function overrideActive() {
    return Boolean(BACKEND && BACKEND.base);
  }

  function backendHost() {
    return hostFromBase(overrideActive() ? BACKEND.base : null);
  }

  function rememberBackendFailure(error, timeoutMs) {
    S.backendFailure = classifyBackendFailure(error, timeoutMs);
  }

  function httpFailure(message, status) {
    var error = new Error(message);
    error.httpStatus = status;
    return error;
  }

  /* ── Code strip (same minimal highlighter as assets/demo/demo.js, plus
   * HTTP verbs — the strip here shows literal wire requests). ─────── */

  var ACCENT_RE = /\b(GET|POST|PATCH|PUT|DELETE|Content-Type|If-Match|HonuaSDK|fetch)\b/g;

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
        html += '<span class="ed-code-str">' + escapeHtml(segments[i]) + "</span>";
      } else {
        html += escapeHtml(segments[i]).replace(ACCENT_RE, '<span class="ed-code-accent">$1</span>');
      }
    }
    if (parts[1]) {
      html += '<span class="ed-code-comment">' + escapeHtml(parts[1]) + "</span>";
    }
    return html;
  }

  var codeStrip = {
    raw: "",
    set: function (title, code) {
      this.raw = code;
      var titleEl = el("ed-code-title");
      var blockEl = el("ed-code-block");
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
    var btn = el("ed-code-copy");
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

  /* ── OData lane ─────────────────────────────────────────────────── */

  function serviceRoot() {
    return S.shared.server.baseUrl + S.config.odata.serviceRootPath;
  }

  /* The server emits absolute @odata.nextLink values with its internal host
   * (localhost:8080 behind the Lambda) — re-root them onto the public base. */
  function rerootLink(link) {
    var m = /^https?:\/\/[^/]+(\/.*)$/.exec(link || "");
    return m ? S.shared.server.baseUrl + m[1] : null;
  }

  function statusDef(value) {
    var statuses = S.config.statuses;
    for (var i = 0; i < statuses.length; i++) {
      if (statuses[i].value === value) return statuses[i];
    }
    return null;
  }

  /* OData feature row → GeoJSON Feature. Attributes arrive flattened on the
   * row beside ObjectId/LayerId/Geometry; runtime bookkeeping lives in
   * double-underscore properties that the UI filters back out. */
  function rowToFeature(row) {
    var properties = {};
    Object.keys(row).forEach(function (key) {
      if (key === "ObjectId" || key === "LayerId" || key === "Geometry") return;
      if (key.charAt(0) === "@") {
        if (key === "@odata.etag") properties.__etag = row[key];
        return;
      }
      properties[key] = row[key];
    });
    properties.__key = "o" + row.ObjectId;
    properties.__objectId = row.ObjectId;
    var geometry = row.Geometry ? { type: row.Geometry.type, coordinates: row.Geometry.coordinates } : null;
    return { type: "Feature", geometry: geometry, properties: properties };
  }

  function layerCandidates() {
    var odata = S.config.odata;
    if (Array.isArray(odata.layerNames) && odata.layerNames.length) return odata.layerNames;
    return [odata.layerName];
  }

  function probeODataLayer() {
    var timeout = S.config.odata.probeTimeoutMs;
    return fetchWithTimeout(serviceRoot() + "Layers", { headers: { Accept: "application/json" } }, timeout)
      .then(function (res) {
        if (!res.ok) throw httpFailure("odata layers HTTP " + res.status, res.status);
        return res.json();
      })
      .then(function (body) {
        var rows = body && Array.isArray(body.value) ? body.value : [];
        var wanted = layerCandidates();
        // Candidates are in preference order: the editable scratch copy first,
        // then the original read-only seed layer.
        for (var w = 0; w < wanted.length; w++) {
          for (var i = 0; i < rows.length; i++) {
            var name = rows[i].Name || rows[i].name || rows[i].Title;
            if (name === wanted[w] && rows[i].Id !== undefined) {
              return {
                layerKey: rows[i].Id,
                layerName: name,
                featuresUrl: serviceRoot() + "Layers(" + rows[i].Id + ")/Features",
              };
            }
          }
        }
        throw new Error("layer " + wanted.join(" / ") + " not published");
      });
  }

  function loadLiveFeatures() {
    var collected = [];
    var first = S.odata.featuresUrl + "?$top=" + S.config.odata.maxFeatures;
    function page(url, depth) {
      return fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 15000)
        .then(function (res) {
          if (!res.ok) throw httpFailure("odata read HTTP " + res.status, res.status);
          return res.json();
        })
        .then(function (body) {
          (body.value || []).forEach(function (row) {
            collected.push(rowToFeature(row));
          });
          var next = rerootLink(body["@odata.nextLink"]);
          if (next && depth < 5 && collected.length < S.config.odata.maxFeatures) {
            return page(next, depth + 1);
          }
          return collected;
        });
    }
    return page(first, 0);
  }

  function loadFixtureFeatures() {
    return fetch(S.config.fixtureUrl)
      .then(function (res) {
        if (!res.ok) throw new Error("failed to load fixture");
        return res.json();
      })
      .then(function (collection) {
        return (collection.features || []).map(function (feature) {
          var properties = {};
          Object.keys(feature.properties || {}).forEach(function (key) {
            properties[key] = feature.properties[key];
          });
          properties.__key = "f" + (feature.id !== undefined ? feature.id : ++S.localSeq);
          return { type: "Feature", geometry: feature.geometry, properties: properties };
        });
      });
  }

  /* Write hint: the capability manifest is informational only (the server says
   * so in `authorizationNotice`). `edit.features` reports `insufficient-policy`
   * for every anonymous caller whatever the layer's access policy is, so it can
   * never be the gate for a public demo. The page records it for the chip
   * tooltip and lets the real write decide. */
  function probeWriteHint() {
    var url = S.shared.server.baseUrl + S.config.capabilities.manifestPath;
    return fetchWithTimeout(url, { headers: { Accept: "application/json" } }, S.config.odata.probeTimeoutMs)
      .then(function (res) {
        if (!res.ok) throw new Error("manifest HTTP " + res.status);
        return res.json();
      })
      .then(function (manifest) {
        var caps = manifest.capabilities || [];
        for (var i = 0; i < caps.length; i++) {
          if (caps[i].id === S.config.capabilities.editCapabilityId) {
            return { available: caps[i].available === true, reason: caps[i].reasonCode || null };
          }
        }
        return { available: false, reason: "not-advertised" };
      })
      .catch(function () {
        return { available: false, reason: "manifest-unreachable" };
      });
  }

  /* honua-write-classify:start */
  /* Classifies the server's answer to a live OData write. `status` is the HTTP
   * status (0 / null for a network failure), `code` the OData/problem error
   * code when the body carried one. Returns the card result state:
   *   live  — the server stored the edit
   *   local — the server (or the network) refused; the edit stays in this browser
   *   error — the edit itself was rejected (validation, conflict); rolled back
   * `networkKind` qualifies a status-0 failure: "preflight" when fetch threw a
   * TypeError although the data lane read this server moments ago (the browser's
   * CORS preflight refused the write: the demo's allow-list omits If-Match and
   * the OData-Version headers, so this page sends neither), "timeout" otherwise. */
  function classifyWriteResponse(status, code, layerName, networkKind) {
    var layer = layerName || "this layer";
    var suffix = code ? " " + code : "";
    if (status === 200 || status === 201 || status === 204) {
      return { state: "live", kind: "saved", text: "saved on the server · HTTP " + status };
    }
    if (status === 401 || status === 403) {
      return {
        state: "local",
        kind: "policy",
        chip: "access policy refuses anonymous writes",
        text: "this server's access policy does not allow anonymous writes on " + layer + " (HTTP " + status + ")",
      };
    }
    if (status === 402) {
      return {
        state: "local",
        kind: "license",
        chip: "server license refuses edits (402)",
        text: "this server's license does not include feature editing (HTTP 402" + suffix + ")",
      };
    }
    if (status === 405 || status === 501) {
      return {
        state: "local",
        kind: "unsupported",
        chip: "server does not accept writes on this layer (" + status + ")",
        text: "this server does not accept OData writes on " + layer + " yet (HTTP " + status + suffix + ")",
      };
    }
    if (!status && networkKind === "preflight") {
      return {
        state: "local",
        kind: "preflight",
        chip: "write blocked by browser preflight",
        text: "blocked by browser preflight — the server's CORS policy did not admit this write request, so the edit stays in your browser",
      };
    }
    if (status === 428) {
      return {
        state: "local",
        kind: "precondition-required",
        chip: "server requires If-Match (428)",
        text: "the server requires an If-Match precondition (HTTP 428" + suffix + "), which this page does not send until the demo's CORS policy admits If-Match",
      };
    }
    if (!status) {
      return {
        state: "local",
        kind: "unreachable",
        chip: "server unreachable",
        text: "the demo server could not be reached, so the edit stays in your browser",
      };
    }
    if (status === 412) {
      return {
        state: "error",
        kind: "conflict",
        text: "HTTP 412" + suffix + " — precondition failed although this page sends no If-Match; reload to pick up the latest",
      };
    }
    if (status === 429) {
      return { state: "error", kind: "rate-limited", text: "HTTP 429 — the demo server is rate limiting writes; try again shortly" };
    }
    return { state: "error", kind: "rejected", text: "HTTP " + status + suffix + " — edit rejected by the server" };
  }

  function editingWritesChipText(dataLane, writeState, refusal) {
    if (dataLane !== "live") return "writes: local — demo server unreachable";
    if (writeState === "live") return "writes: live (OData CRUD)";
    if (writeState === "refused" && refusal && refusal.chip) return "writes: local — " + refusal.chip;
    return "writes: sent to the server on Save";
  }
  /* honua-write-classify:end */

  /* A fetch TypeError ("Failed to fetch") on a write, right after reads from the
   * same origin succeeded, is the browser refusing the CORS preflight; an abort is
   * a timeout. The browser does not expose which, so this is the honest best read. */
  function writeNetworkKind(error) {
    if (error && (error.name === "AbortError" || error.name === "TimeoutError")) return "timeout";
    if (error && error.name === "TypeError" && S.dataLane === "live") return "preflight";
    return "unreachable";
  }

  /* Reads the OData/problem error code out of a refusal body, if any. */
  function readErrorCode(res) {
    return res
      .json()
      .then(function (body) {
        if (body && body.error && body.error.code) return String(body.error.code);
        if (body && body.title) return String(body.title);
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  /* Records a classified outcome on the lane state and repaints the chips. */
  function recordWriteOutcome(outcome) {
    if (outcome.state === "live") {
      S.writeState = "live";
      S.writeRefusal = null;
    } else if (outcome.state === "local") {
      S.writeState = "refused";
      S.writeRefusal = outcome;
    }
    renderLaneChips();
    renderStatusPill();
  }

  /* Re-reads one feature after a successful write so the map shows what the
   * server stored, not what the browser sent. */
  function rereadFeature(feature) {
    var objectId = feature.properties.__objectId;
    return fetchWithTimeout(S.odata.featuresUrl + "(" + objectId + ")", { headers: { Accept: "application/json" } }, 15000)
      .then(function (res) {
        if (!res.ok) throw httpFailure("odata re-read HTTP " + res.status, res.status);
        return res.json();
      })
      .then(function (row) {
        var stored = rowToFeature(row);
        Object.keys(stored.properties).forEach(function (key) {
          if (key === "__key") return;
          feature.properties[key] = stored.properties[key];
        });
        if (stored.geometry) feature.geometry = stored.geometry;
        feature.properties.__savedOnServer = true;
        refreshSource();
        return true;
      });
  }

  function appendResponseToStrip(title, requestText, status, code) {
    codeStrip.set(title, requestText + "\n// → " + (status ? "HTTP " + status + (code ? " " + code : "") : "network error (no response)"));
  }

  /* ── Literal wire requests (the code strip contract) ────────────── */

  function readRequestText(count) {
    return [
      "// the read that just populated this map — plain OData v4",
      "GET " + S.odata.featuresUrl + "?$top=" + S.config.odata.maxFeatures,
      "Accept: application/json",
      "// → " + count + " features · attributes + GeoJSON-style Geometry per row",
      "// same layer over GeoServices REST:",
      "//   GET " + S.shared.server.baseUrl + S.config.geoservices.queryPath + "?where=1=1&f=geojson",
    ].join("\n");
  }

  function patchRequestText(feature, changes) {
    var target = S.odata
      ? S.odata.featuresUrl + "(" + (feature.properties.__objectId || "{objectId}") + ")"
      : S.shared.server.baseUrl + S.config.odata.serviceRootPath + "Layers({id})/Features({objectId})";
    return [
      "// Save = one OData PATCH; only the changed attributes travel",
      "PATCH " + target,
      "Content-Type: application/json",
      "",
      JSON.stringify({ Attributes: changes }),
      "// no If-Match / OData-Version headers: the demo's CORS allow-list does not admit them yet",
      "// (optimistic concurrency: If-Match: <@odata.etag> → 412 on conflict, once it does)",
    ].join("\n");
  }

  function postRequestText(lngLat, attributes) {
    var target = S.odata
      ? S.odata.featuresUrl
      : S.shared.server.baseUrl + S.config.odata.serviceRootPath + "Layers({id})/Features";
    var body = {
      Geometry: { type: "Point", coordinates: [round6(lngLat.lng), round6(lngLat.lat)] },
      Attributes: attributes,
    };
    return [
      "// Add inspection = one OData POST — geometry + attributes, 201 back",
      "POST " + target,
      "Content-Type: application/json",
      "",
      JSON.stringify(body),
    ].join("\n");
  }

  function round6(value) {
    return Math.round(value * 1000000) / 1000000;
  }

  /* ── Map plumbing ───────────────────────────────────────────────── */

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

  function findBaseDef(baseId) {
    var bases = S.shared.bases || [];
    for (var i = 0; i < bases.length; i++) {
      if (bases[i].id === baseId) return bases[i];
    }
    return null;
  }

  /* Two exclusive bases (Map / Imagery) on the SDK's native switcher —
   * the same shared archives demo.html uses; the terrain composite is
   * deliberately out of scope for this page. */
  function buildBaseDefinitions(availability) {
    var bm = S.shared.basemap || {};
    var backgroundLayer = {
      id: "background",
      type: "background",
      paint: { "background-color": S.config.map.background },
    };
    var definitions = [];
    if (availability.basemap) {
      var vectorLayers = ((bm.style && bm.style.layers) || []).map(function (layer) {
        return JSON.parse(JSON.stringify(layer));
      });
      definitions.push({
        id: "map",
        label: "Map",
        kind: "vector",
        sources: {
          basemap: { type: "vector", url: "pmtiles://" + bm.proxyUrl, attribution: bm.attribution || "" },
        },
        layers: [backgroundLayer].concat(vectorLayers),
      });
    }
    var imagery = findBaseDef("imagery");
    if (availability.imagery && imagery && imagery.pmtiles) {
      definitions.push({
        id: "imagery",
        label: "Imagery",
        kind: "raster",
        sources: {
          "imagery-base": {
            type: "raster",
            url: "pmtiles://" + imagery.pmtiles.proxyUrl,
            tileSize: 256,
            attribution: imagery.attribution || "",
          },
        },
        layers: [backgroundLayer, { id: "base-imagery", type: "raster", source: "imagery-base", paint: imagery.paint || {} }],
      });
    }
    return definitions;
  }

  function setupBasemapSwitcher(availability) {
    var switcher = el("ed-basemap-switcher");
    if (!switcher || typeof switcher.connect !== "function") return null;
    var definitions = buildBaseDefinitions(availability);
    if (definitions.length === 0) {
      switcher.style.display = "none";
      return null;
    }
    switcher.connect(S.map);
    switcher.bases = definitions;
    return switcher;
  }

  function statusMatchExpression() {
    var expr = ["match", ["get", S.config.fields.status]];
    S.config.statuses.forEach(function (status) {
      expr.push(status.value);
      expr.push(status.color);
    });
    expr.push("#8b97a0");
    return expr;
  }

  function addInspectionsLayer() {
    S.map.addSource("src-inspections", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      attribution: "Synthetic demo data — no real inspections",
    });
    S.map.addLayer({
      id: "lyr-inspections",
      type: "circle",
      source: "src-inspections",
      paint: {
        "circle-color": statusMatchExpression(),
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4.5, 12, 7.5, 16, 11],
        "circle-stroke-color": "#04151a",
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.94,
      },
    });
  }

  /* <honua-legend> — explicit sections from the SAME status palette the
   * circle paint uses (one constant, two consumers). */
  function setupLegend() {
    var legend = el("ed-legend");
    if (!legend || typeof legend.connect !== "function") return;
    legend.entries = [
      {
        title: "Inspection status",
        layer: "lyr-inspections",
        entries: S.config.statuses.map(function (status) {
          return { label: status.label, color: status.color, shape: "circle" };
        }),
      },
    ];
    legend.connect(S.map);
  }

  function refreshSource() {
    var src = S.map.getSource("src-inspections");
    if (src) src.setData({ type: "FeatureCollection", features: S.features });
  }

  function indexFeatures() {
    S.byKey = {};
    S.features.forEach(function (feature) {
      S.byKey[feature.properties.__key] = feature;
    });
  }

  /* ── Editing actions ────────────────────────────────────────────── */

  function applyResult(resultEl, state, text) {
    if (!resultEl) return;
    resultEl.dataset.state = state;
    resultEl.textContent = text;
  }

  function localReason() {
    if (S.dataLane !== "live" || !S.odata) return "the demo server is unreachable, so edits stay in your browser";
    return "this point exists only in your browser, so the edit stays local";
  }

  function saveEdit(feature, changes, resultEl, onDone) {
    var previous = {};
    Object.keys(changes).forEach(function (key) {
      previous[key] = feature.properties[key];
    });

    // Optimistic: paint the change immediately, then reconcile with the server.
    Object.keys(changes).forEach(function (key) {
      feature.properties[key] = changes[key];
    });
    refreshSource();
    var stripTitle = "// OData v4 — the request behind this Save";
    var requestText = patchRequestText(feature, changes);
    codeStrip.set(stripTitle, requestText);

    // Only a feature the server served can be PATCHed; fixture and browser-only
    // points have no server row to write to.
    if (!S.odata || S.dataLane !== "live" || feature.properties.__objectId === undefined) {
      applyResult(resultEl, "local", "applied locally — " + localReason());
      if (onDone) onDone(true);
      return;
    }

    function rollback() {
      Object.keys(previous).forEach(function (key) {
        feature.properties[key] = previous[key];
      });
      refreshSource();
    }

    applyResult(resultEl, "pending", "PATCH …");
    fetchWithTimeout(
      S.odata.featuresUrl + "(" + feature.properties.__objectId + ")",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ Attributes: changes }),
      },
      15000
    )
      .then(
        function (res) {
          var ok = res.status === 200 || res.status === 201 || res.status === 204;
          return (ok ? Promise.resolve(null) : readErrorCode(res)).then(function (code) {
            return { status: res.status, code: code };
          });
        },
        function (error) {
          return { status: 0, code: null, networkKind: writeNetworkKind(error) };
        }
      )
      .then(function (answer) {
        var outcome = classifyWriteResponse(answer.status, answer.code, S.odata.layerName, answer.networkKind);
        appendResponseToStrip(stripTitle, requestText, answer.status, answer.code);
        recordWriteOutcome(outcome);
        if (outcome.state === "live") {
          applyResult(resultEl, "ok", outcome.text + " · re-reading…");
          return rereadFeature(feature).then(
            function () {
              applyResult(resultEl, "ok", outcome.text + " · re-read from the server");
            },
            function () {
              applyResult(resultEl, "ok", outcome.text + " · re-read failed; reload to confirm");
            }
          );
        }
        if (outcome.state === "local") {
          applyResult(resultEl, "local", "applied locally — " + outcome.text);
          return null;
        }
        rollback();
        applyResult(resultEl, "error", outcome.text + " · edit rolled back");
        return null;
      })
      .finally(function () {
        if (onDone) onDone(true);
      });
  }

  function createInspection(lngLat, attributes, resultEl, onCreated) {
    var feature = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [round6(lngLat.lng), round6(lngLat.lat)] },
      properties: {},
    };
    Object.keys(attributes).forEach(function (key) {
      feature.properties[key] = attributes[key];
    });
    feature.properties.__key = "l" + ++S.localSeq;

    // Optimistic: the point exists the moment you click Create.
    S.features.push(feature);
    indexFeatures();
    refreshSource();
    renderLaneChips();
    var stripTitle = "// OData v4 — the request behind this Create";
    var requestText = postRequestText(lngLat, attributes);
    codeStrip.set(stripTitle, requestText);

    if (!S.odata || S.dataLane !== "live") {
      applyResult(resultEl, "local", "added locally — " + localReason());
      if (onCreated) onCreated(feature);
      return;
    }

    function removePoint() {
      S.features = S.features.filter(function (f) {
        return f !== feature;
      });
      indexFeatures();
      refreshSource();
      renderLaneChips();
    }

    applyResult(resultEl, "pending", "POST …");
    fetchWithTimeout(
      S.odata.featuresUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ Geometry: feature.geometry, Attributes: attributes }),
      },
      15000
    )
      .then(
        function (res) {
          var ok = res.status === 200 || res.status === 201;
          var body = ok
            ? res.json().catch(function () {
                return null;
              })
            : Promise.resolve(null);
          return Promise.all([body, ok ? null : readErrorCode(res)]).then(function (parts) {
            return { status: res.status, body: parts[0], code: parts[1] };
          });
        },
        function (error) {
          return { status: 0, body: null, code: null, networkKind: writeNetworkKind(error) };
        }
      )
      .then(function (answer) {
        var outcome = classifyWriteResponse(answer.status, answer.code, S.odata.layerName, answer.networkKind);
        appendResponseToStrip(stripTitle, requestText, answer.status, answer.code);
        recordWriteOutcome(outcome);
        if (outcome.state === "live") {
          var body = answer.body;
          var objectId = body && (body.ObjectId !== undefined ? body.ObjectId : body.objectId);
          if (objectId === undefined || objectId === null) {
            applyResult(resultEl, "ok", outcome.text + " · no ObjectId returned; reload to see the stored row");
            return null;
          }
          delete S.byKey[feature.properties.__key];
          feature.properties.__key = "o" + objectId;
          feature.properties.__objectId = objectId;
          indexFeatures();
          refreshSource();
          applyResult(resultEl, "ok", outcome.text + " · ObjectId " + objectId + " · re-reading…");
          return rereadFeature(feature).then(
            function () {
              applyResult(resultEl, "ok", outcome.text + " · ObjectId " + objectId + " · re-read from the server");
            },
            function () {
              applyResult(resultEl, "ok", outcome.text + " · ObjectId " + objectId + " · re-read failed; reload to confirm");
            }
          );
        }
        if (outcome.state === "local") {
          applyResult(resultEl, "local", "added locally — " + outcome.text);
          return null;
        }
        removePoint();
        applyResult(resultEl, "error", outcome.text + " · point removed");
        return null;
      })
      .finally(function () {
        if (onCreated) onCreated(feature);
      });
  }

  /* ── Popup cards (DOM-built; editable) ──────────────────────────── */

  function closePopup() {
    if (S.openPopup) {
      S.openPopup.remove();
      S.openPopup = null;
    }
  }

  function showPopup(lngLat, content) {
    closePopup();
    S.openPopup = new window.maplibregl.Popup({ closeButton: true, maxWidth: "320px", className: "ed-popup-host" })
      .setLngLat(lngLat)
      .setDOMContent(content)
      .addTo(S.map);
    return S.openPopup;
  }

  function buildStatusChips(initial) {
    var wrap = document.createElement("div");
    wrap.className = "ed-status-chips";
    wrap.dataset.value = initial || "";
    S.config.statuses.forEach(function (status) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ed-status-chip";
      chip.dataset.value = status.value;
      chip.style.setProperty("--chip-color", status.color);
      chip.setAttribute("aria-pressed", status.value === initial ? "true" : "false");
      chip.textContent = status.label;
      chip.addEventListener("click", function () {
        wrap.dataset.value = status.value;
        var chips = wrap.querySelectorAll(".ed-status-chip");
        for (var i = 0; i < chips.length; i++) {
          chips[i].setAttribute("aria-pressed", chips[i].dataset.value === status.value ? "true" : "false");
        }
      });
      wrap.appendChild(chip);
    });
    return wrap;
  }

  function buildCardShell(kicker, title) {
    var card = document.createElement("article");
    card.className = "ed-card";
    var kickerEl = document.createElement("p");
    kickerEl.className = "ed-card-kicker mono";
    kickerEl.textContent = kicker;
    card.appendChild(kickerEl);
    if (title !== null) {
      var titleEl = document.createElement("h3");
      titleEl.className = "ed-card-title";
      titleEl.textContent = title;
      card.appendChild(titleEl);
    }
    return card;
  }

  function buildNoteInput(initial) {
    var note = document.createElement("textarea");
    note.className = "ed-note-input";
    note.rows = 3;
    note.maxLength = S.config.noteMaxLength;
    note.placeholder = "inspection note…";
    note.value = initial || "";
    return note;
  }

  function buildResultLine() {
    var result = document.createElement("p");
    result.className = "ed-card-result mono";
    result.dataset.state = "idle";
    return result;
  }

  function openEditCard(feature, lngLat) {
    var fields = S.config.fields;
    var props = feature.properties;
    var card = buildCardShell(
      String(props[fields.category] || "inspection") +
        (props.__objectId !== undefined ? " · ObjectId " + props.__objectId : " · local") +
        (props.__savedOnServer ? " · saved on the server" : ""),
      String(props[fields.name] || "Unnamed inspection")
    );

    var statusLabel = document.createElement("p");
    statusLabel.className = "ed-card-label mono";
    statusLabel.textContent = "status";
    card.appendChild(statusLabel);
    var chips = buildStatusChips(props[fields.status]);
    card.appendChild(chips);

    var noteLabel = document.createElement("p");
    noteLabel.className = "ed-card-label mono";
    noteLabel.textContent = "note";
    card.appendChild(noteLabel);
    var note = buildNoteInput(props[fields.note]);
    card.appendChild(note);

    var meta = document.createElement("p");
    meta.className = "ed-card-meta mono";
    var reported = props[fields.reportedAt];
    meta.textContent = reported ? "reported " + String(reported).slice(0, 10) : "";
    card.appendChild(meta);

    var actions = document.createElement("div");
    actions.className = "ed-card-actions";
    var save = document.createElement("button");
    save.type = "button";
    save.className = "ed-btn ed-btn-primary";
    save.textContent = "Save";
    actions.appendChild(save);
    card.appendChild(actions);

    var result = buildResultLine();
    card.appendChild(result);

    save.addEventListener("click", function () {
      var changes = {};
      var nextStatus = chips.dataset.value;
      if (nextStatus && nextStatus !== props[fields.status]) changes[fields.status] = nextStatus;
      var nextNote = note.value.trim();
      if (nextNote !== String(props[fields.note] || "")) changes[fields.note] = nextNote;
      if (Object.keys(changes).length === 0) {
        applyResult(result, "idle", "nothing changed");
        return;
      }
      save.disabled = true;
      saveEdit(feature, changes, result, function () {
        save.disabled = false;
      });
    });

    showPopup(lngLat, card);
  }

  function openAddCard(lngLat) {
    var fields = S.config.fields;
    var card = buildCardShell("new inspection · " + round6(lngLat.lng) + ", " + round6(lngLat.lat), null);

    var nameLabel = document.createElement("p");
    nameLabel.className = "ed-card-label mono";
    nameLabel.textContent = "name";
    card.appendChild(nameLabel);
    var name = document.createElement("input");
    name.type = "text";
    name.className = "ed-text-input";
    name.maxLength = 200;
    name.placeholder = "e.g. Kahului Breakwater";
    card.appendChild(name);

    var catLabel = document.createElement("p");
    catLabel.className = "ed-card-label mono";
    catLabel.textContent = "category";
    card.appendChild(catLabel);
    var category = document.createElement("select");
    category.className = "ed-select-input";
    S.config.categories.forEach(function (value) {
      var option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      category.appendChild(option);
    });
    card.appendChild(category);

    var statusLabel = document.createElement("p");
    statusLabel.className = "ed-card-label mono";
    statusLabel.textContent = "status";
    card.appendChild(statusLabel);
    var chips = buildStatusChips(S.config.statuses[0].value);
    card.appendChild(chips);

    var noteLabel = document.createElement("p");
    noteLabel.className = "ed-card-label mono";
    noteLabel.textContent = "note";
    card.appendChild(noteLabel);
    var note = buildNoteInput("");
    card.appendChild(note);

    var actions = document.createElement("div");
    actions.className = "ed-card-actions";
    var create = document.createElement("button");
    create.type = "button";
    create.className = "ed-btn ed-btn-primary";
    create.textContent = "Create";
    actions.appendChild(create);
    card.appendChild(actions);

    var result = buildResultLine();
    card.appendChild(result);

    create.addEventListener("click", function () {
      var trimmedName = name.value.trim();
      if (!trimmedName) {
        applyResult(result, "error", "a name is required");
        name.focus();
        return;
      }
      var attributes = {};
      attributes[fields.name] = trimmedName;
      attributes[fields.category] = category.value;
      attributes[fields.status] = chips.dataset.value || S.config.statuses[0].value;
      attributes[fields.note] = (note.value.trim() + " Demo data — synthetic inspection.").trim();
      attributes[fields.reportedAt] = new Date().toISOString();
      create.disabled = true;
      createInspection(lngLat, attributes, result, function () {
        create.disabled = false;
      });
    });

    showPopup(lngLat, card);
  }

  /* ── Add-inspection mode ────────────────────────────────────────── */

  function setAddMode(on) {
    S.addMode = on;
    var btn = el("ed-add-btn");
    var hint = el("ed-add-hint");
    if (btn) btn.setAttribute("aria-pressed", on ? "true" : "false");
    if (hint) hint.style.display = on ? "" : "none";
    S.map.getCanvas().style.cursor = on ? "crosshair" : "";
  }

  function attachInteractions() {
    var btn = el("ed-add-btn");
    if (btn) {
      btn.addEventListener("click", function () {
        setAddMode(!S.addMode);
      });
    }

    S.map.on("click", function (event) {
      if (S.addMode) {
        setAddMode(false);
        openAddCard(event.lngLat);
        return;
      }
      var hits = S.map.queryRenderedFeatures(event.point, { layers: ["lyr-inspections"] });
      if (hits.length === 0) return;
      var key = hits[0].properties && hits[0].properties.__key;
      var feature = key ? S.byKey[key] : null;
      if (!feature) return;
      var anchor = feature.geometry && feature.geometry.coordinates ? feature.geometry.coordinates : event.lngLat;
      openEditCard(feature, anchor);
    });

    S.map.on("mouseenter", "lyr-inspections", function () {
      if (!S.addMode) S.map.getCanvas().style.cursor = "pointer";
    });
    S.map.on("mouseleave", "lyr-inspections", function () {
      if (!S.addMode) S.map.getCanvas().style.cursor = "";
    });
  }

  /* ── Bootstrap ──────────────────────────────────────────────────── */

  function collapsePanelsOnSmallScreens() {
    if (window.innerWidth >= 900) return;
    var codeStripEl = el("ed-code-strip");
    var capabilitiesEl = el("ed-capabilities");
    if (codeStripEl) codeStripEl.open = false;
    if (capabilitiesEl) capabilitiesEl.open = false;
  }

  function renderLaneChips() {
    var host = backendHost();
    var overrideOn = overrideActive();
    if (S.dataLane === "live") {
      setChip("ed-data-chip", "live", editingDataChipText("live", S.features.length, host, null, overrideOn));
    } else {
      setChip(
        "ed-data-chip",
        "fixture",
        editingDataChipText("fixture", S.features.length, host, S.backendFailure, overrideOn),
      );
    }
    setChip(
      "ed-writes-chip",
      S.dataLane === "live" && S.writeState === "live" ? "live" : "pending",
      editingWritesChipText(S.dataLane, S.writeState, S.writeRefusal),
    );
    var writesChip = el("ed-writes-chip");
    if (writesChip && S.writeHint) {
      writesChip.title =
        "capability manifest hint (informational): edit.features " +
        (S.writeHint.available ? "available" : "unavailable · " + (S.writeHint.reason || "no reason")) +
        " — the server's answer to the real write decides";
    }
  }

  function renderStatusPill() {
    setStatus(
      S.dataLane === "live" ? "live" : "offline",
      editingStatusText(S.dataLane, S.writeState, S.features.length, backendHost(), S.backendFailure, overrideActive()),
    );
  }

  function bootstrap() {
    if (!window.maplibregl || !window.HonuaSDK) {
      setStatus("error", "demo assets failed to load");
      return;
    }
    collapsePanelsOnSmallScreens();
    attachCopyButton();

    fetch(CONFIG_URL)
      .then(function (response) {
        if (!response.ok) throw new Error("Failed to load " + CONFIG_URL);
        return response.json();
      })
      .then(function (config) {
        S.config = config;
        return fetch(config.sharedLayersConfig).then(function (response) {
          if (!response.ok) throw new Error("Failed to load " + config.sharedLayersConfig);
          return response.json();
        });
      })
      .then(function (shared) {
        // layers.json is the canonical server contract (baseUrl + glyphs); rebase it
        // onto the override backend when one is active, unchanged otherwise.
        S.shared = BACKEND.rebase(shared);
        shared = S.shared;

        S.map = new window.maplibregl.Map({
          container: "ed-map",
          style: {
            version: 8,
            glyphs: shared.server.glyphs,
            sources: {},
            layers: [{ id: "background", type: "background", paint: { "background-color": S.config.map.background } }],
          },
          center: S.config.map.center,
          zoom: S.config.map.zoom,
          minZoom: S.config.map.minZoom,
          maxZoom: S.config.map.maxZoom,
          attributionControl: { compact: false },
        });
        S.map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: false }), "bottom-right");
        S.map.addControl(new window.maplibregl.ScaleControl({ unit: "imperial" }));
        S.map.on("error", function (event) {
          if (console && console.debug) {
            console.debug("maplibre:", event && event.error ? event.error.message : event);
          }
        });

        setStatus("probing", editingProbeText(backendHost()));
        ensurePMTilesProtocol();

        var imagery = findBaseDef("imagery");
        var probes = Promise.all([
          probeODataLayer().then(
            function (odata) {
              return odata;
            },
            function (error) {
              rememberBackendFailure(error, S.config.odata.probeTimeoutMs);
              return null;
            }
          ),
          probeWriteHint(),
          probeArchive(shared.basemap && shared.basemap.proxyUrl),
          probeArchive(imagery && imagery.pmtiles && imagery.pmtiles.proxyUrl),
          new Promise(function (resolve) {
            S.map.on("load", resolve);
          }),
        ]);

        return probes;
      })
      .then(function (results) {
        S.odata = results[0];
        S.writeHint = results[1];

        S.switcher = setupBasemapSwitcher({ basemap: results[2], imagery: results[3] });
        addInspectionsLayer();
        setupLegend();
        attachInteractions();

        var dataPromise = S.odata
          ? loadLiveFeatures().then(
              function (features) {
                S.dataLane = "live";
                return features;
              },
              function (error) {
                rememberBackendFailure(error, 15000);
                S.dataLane = "fixture";
                return loadFixtureFeatures();
              }
            )
          : loadFixtureFeatures().then(function (features) {
              S.dataLane = "fixture";
              return features;
            });

        return dataPromise;
      })
      .then(function (features) {
        S.features = features;
        indexFeatures();
        refreshSource();
        renderLaneChips();
        renderStatusPill();
        if (S.odata && S.dataLane === "live") {
          codeStrip.set("// OData v4 — the read behind this map", readRequestText(features.length));
        } else {
          codeStrip.set(
            "// OData v4 — the read this page runs when the server is up",
            [
              "GET " + S.shared.server.baseUrl + S.config.odata.serviceRootPath + "Layers({id})/Features?$top=" + S.config.odata.maxFeatures,
              "Accept: application/json",
              "// {id} = the OData layer named " + layerCandidates().join(" or "),
              editingOfflineNote(overrideActive(), S.backendFailure, backendHost()),
            ].join("\n")
          );
        }
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

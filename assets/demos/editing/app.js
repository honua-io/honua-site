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
 *   write lane  — the page never ships a credential. It probes
 *                 GET /api/v1/capabilities/manifest and lights LIVE writes
 *                 only when `edit.features` is available. While the demo
 *                 server runs Community (honua-server gates all protocol
 *                 writes behind the Pro `editing.feature-edits` entitlement),
 *                 edits apply locally — optimistic UI, clearly chipped — and
 *                 the page lights up with zero code changes once a license
 *                 lands on the server.
 *
 * SDK-controls rule: the only map chrome beyond MapLibre's own controls is
 * the SDK's native <honua-basemap-switcher> and <honua-legend>
 * (@honua/sdk-js/controls via the shared vendored bundle).
 */
(function () {
  "use strict";

  var CONFIG_URL = "assets/demos/editing/config.json";

  var S = {
    config: null,
    shared: null, // assets/demo/layers.json
    map: null,
    switcher: null,
    dataLane: "probing", // "live" | "fixture"
    writesLive: false,
    writeBlock: null, // { reason: "license-required" | "unreachable" | "disabled", edition: "Community" }
    odata: null, // { layerKey, featuresUrl } when the live layer resolved
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
    return fetch(url, opts).finally(function () {
      if (timer) clearTimeout(timer);
    });
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

  function probeODataLayer() {
    var timeout = S.config.odata.probeTimeoutMs;
    return fetchWithTimeout(serviceRoot() + "Layers", { headers: { Accept: "application/json" } }, timeout)
      .then(function (res) {
        if (!res.ok) throw new Error("odata layers HTTP " + res.status);
        return res.json();
      })
      .then(function (body) {
        var rows = body && Array.isArray(body.value) ? body.value : [];
        for (var i = 0; i < rows.length; i++) {
          var name = rows[i].Name || rows[i].name || rows[i].Title;
          if (name === S.config.odata.layerName && rows[i].Id !== undefined) {
            return {
              layerKey: rows[i].Id,
              featuresUrl: serviceRoot() + "Layers(" + rows[i].Id + ")/Features",
            };
          }
        }
        throw new Error("layer " + S.config.odata.layerName + " not published");
      });
  }

  function loadLiveFeatures() {
    var collected = [];
    var first = S.odata.featuresUrl + "?$top=" + S.config.odata.maxFeatures;
    function page(url, depth) {
      return fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 15000)
        .then(function (res) {
          if (!res.ok) throw new Error("odata read HTTP " + res.status);
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

  /* Write availability: the capability manifest is the contract — the page
   * never assumes; `edit.features` flips `available` when the server holds a
   * license with the `editing.feature-edits` entitlement. */
  function probeWriteCapability() {
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
            return {
              available: caps[i].available === true,
              reason: caps[i].reasonCode || null,
              edition: manifest.policies && manifest.policies.currentEdition,
            };
          }
        }
        return { available: false, reason: "not-advertised", edition: null };
      })
      .catch(function () {
        return { available: false, reason: "unreachable", edition: null };
      });
  }

  function writeBlockText() {
    var block = S.writeBlock || {};
    if (block.reason === "license-required") {
      return (
        "live sandbox writes are pending a server license — this server runs " +
        (block.edition || "Community") +
        " and honua-server gates protocol writes behind the Pro editing.feature-edits entitlement"
      );
    }
    if (block.reason === "unreachable") {
      return "the demo server is unreachable, so edits stay in your browser";
    }
    return "live writes are not enabled on this server, so edits stay in your browser";
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
      "// optimistic concurrency: include If-Match: <@odata.etag> to get 412 on conflict",
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

  function saveEdit(feature, changes, resultEl, onDone) {
    var previous = {};
    Object.keys(changes).forEach(function (key) {
      previous[key] = feature.properties[key];
    });

    // Optimistic: paint the change immediately, then reconcile per-row.
    Object.keys(changes).forEach(function (key) {
      feature.properties[key] = changes[key];
    });
    refreshSource();
    codeStrip.set("// OData v4 — the request behind this Save", patchRequestText(feature, changes));

    if (!S.writesLive || !S.odata || feature.properties.__objectId === undefined) {
      applyResult(resultEl, "local", "applied locally — " + writeBlockText());
      if (onDone) onDone(true);
      return;
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
      .then(function (res) {
        if (res.status === 200 || res.status === 204) {
          applyResult(resultEl, "ok", "saved · HTTP " + res.status);
          return res
            .json()
            .then(function (body) {
              if (body && body["@odata.etag"]) feature.properties.__etag = body["@odata.etag"];
            })
            .catch(function () {});
        }
        if (res.status === 412) {
          applyResult(resultEl, "error", "HTTP 412 — edited elsewhere; reload to pick up the latest");
        } else {
          applyResult(resultEl, "error", "HTTP " + res.status + " — edit rejected by the server");
        }
        Object.keys(previous).forEach(function (key) {
          feature.properties[key] = previous[key];
        });
        refreshSource();
        return null;
      })
      .catch(function () {
        Object.keys(previous).forEach(function (key) {
          feature.properties[key] = previous[key];
        });
        refreshSource();
        applyResult(resultEl, "error", "network error — edit rolled back");
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
    codeStrip.set("// OData v4 — the request behind this Create", postRequestText(lngLat, attributes));

    if (!S.writesLive || !S.odata) {
      applyResult(resultEl, "local", "added locally — " + writeBlockText());
      if (onCreated) onCreated(feature);
      return;
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
      .then(function (res) {
        if (res.status === 201 || res.status === 200) {
          return res
            .json()
            .catch(function () {
              return null;
            })
            .then(function (body) {
              var objectId = body && (body.ObjectId !== undefined ? body.ObjectId : body.objectId);
              if (objectId !== undefined && objectId !== null) {
                delete S.byKey[feature.properties.__key];
                feature.properties.__key = "o" + objectId;
                feature.properties.__objectId = objectId;
                indexFeatures();
                refreshSource();
              }
              applyResult(resultEl, "ok", "created · HTTP " + res.status + (objectId !== undefined && objectId !== null ? " · ObjectId " + objectId : ""));
            });
        }
        S.features = S.features.filter(function (f) {
          return f !== feature;
        });
        indexFeatures();
        refreshSource();
        applyResult(resultEl, "error", "HTTP " + res.status + " — create rejected by the server");
        return null;
      })
      .catch(function () {
        S.features = S.features.filter(function (f) {
          return f !== feature;
        });
        indexFeatures();
        refreshSource();
        applyResult(resultEl, "error", "network error — point removed");
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
      String(props[fields.category] || "inspection") + (props.__objectId !== undefined ? " · ObjectId " + props.__objectId : " · local"),
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
    if (S.dataLane === "live") {
      setChip("ed-data-chip", "live", "data: live · " + S.features.length + " inspections");
    } else {
      setChip("ed-data-chip", "fixture", "data: sample fixture · " + S.features.length + " inspections");
    }
    if (S.writesLive) {
      setChip("ed-writes-chip", "live", "writes: live (OData CRUD)");
    } else if (S.writeBlock && S.writeBlock.reason === "license-required") {
      setChip("ed-writes-chip", "pending", "writes: local — sandbox writes pending server license");
    } else {
      setChip("ed-writes-chip", "pending", "writes: local — server " + (S.dataLane === "live" ? "write surface disabled" : "unreachable"));
    }
  }

  function renderStatusPill() {
    if (S.dataLane === "live" && S.writesLive) {
      setStatus("live", "demo.honua.io · " + S.features.length + " inspections · live editing over OData");
    } else if (S.dataLane === "live") {
      setStatus("live", "demo.honua.io · " + S.features.length + " inspections · edits apply locally (license pending)");
    } else {
      setStatus("offline", "demo server unreachable — sample inspections, edits stay local");
    }
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
        S.shared = shared;

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

        setStatus("probing", "checking demo.honua.io…");
        ensurePMTilesProtocol();

        var imagery = findBaseDef("imagery");
        var probes = Promise.all([
          probeODataLayer().then(
            function (odata) {
              return odata;
            },
            function () {
              return null;
            }
          ),
          probeWriteCapability(),
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
        var writeCap = results[1];
        S.writesLive = Boolean(S.odata) && writeCap.available === true;
        if (!S.writesLive) {
          S.writeBlock = {
            reason: S.odata ? writeCap.reason || "disabled" : "unreachable",
            edition: writeCap.edition,
          };
        }

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
              function () {
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
              "GET " + S.shared.server.baseUrl + S.config.odata.serviceRootPath + "Layers('" + S.config.odata.layerName + "')/Features?$top=" + S.config.odata.maxFeatures,
              "Accept: application/json",
              "// (offline right now — showing the bundled synthetic fixture instead)",
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

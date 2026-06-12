/* Honua for Excel — taskpane logic.
 *
 * Loads a Honua layer over OData v4 into an Excel table, tracks edits, and
 * writes them back with a $batch of PATCH requests (sequential PATCH
 * fallback). Plain JS, no build step; Office.js is the global `Office`/`Excel`
 * loaded from Microsoft's CDN in taskpane.html.
 *
 * Server surface (honua-server OData v4):
 *   GET   /odata                                  service document
 *   GET   /odata/Layers                           layer list {Id, Name, ...}
 *   GET   /odata/Layers({id})/Features?$top=N     features (attrs flattened)
 *   PATCH /odata/Features(LayerId=L,ObjectId=O)   body {"Attributes":{...}}
 *   POST  /odata/$batch                           JSON batch {"requests":[...]}
 * Writes require auth: X-API-Key header. ETags via @odata.etag / If-Match
 * (optional; omitted = last-write-wins, mismatch = 412).
 */

(function () {
  "use strict";

  var ROW_CAP = 1000;
  var CELL_TEXT_CAP = 32000; // Excel hard limit is 32767 chars per cell
  var GEOMETRY_HEADER = "Geometry (read-only)";
  var KEY_HEADER = "ObjectId";
  var SETTINGS_KEY_API = "honuaApiKey";
  var SETTINGS_KEY_SERVER = "honuaServerUrl";

  var state = {
    excelReady: false,
    serverUrl: "https://demo.honua.io",
    layers: [],
    // Per loaded layer:
    layerId: null,
    layerName: null,
    tableName: null,
    headers: [],          // table headers, in column order
    attributeNames: [],   // editable attribute headers (subset of headers)
    snapshot: {},         // ObjectId -> { attr -> last saved/loaded cell value }
    geoSnapshot: {},      // ObjectId -> geometry summary cell as loaded
    etags: {},            // ObjectId -> @odata.etag (when the server sent one)
    dirty: [],            // [{ objectId, changes: { attr -> value } }]
    notices: [],          // non-blocking warnings from the last diff
  };

  var el = {};

  // ── boot ───────────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    ["server-url", "api-key", "connect-form", "layer-section", "layer-select",
     "load-btn", "save-section", "save-btn", "save-results", "status",
     "standalone-notice"].forEach(function (id) {
      el[id] = document.getElementById(id);
    });

    el["connect-form"].addEventListener("submit", function (e) {
      e.preventDefault();
      connect();
    });
    el["load-btn"].addEventListener("click", loadIntoSheet);
    el["save-btn"].addEventListener("click", saveChanges);
    el["api-key"].addEventListener("change", persistSettings);
    el["server-url"].addEventListener("change", persistSettings);

    if (typeof Office === "undefined") {
      // Office.js failed to load entirely (offline / blocked CDN).
      showStandalone();
      return;
    }

    Office.onReady(function (info) {
      if (info && info.host === Office.HostType.Excel) {
        state.excelReady = true;
        restoreSettings();
      } else {
        showStandalone();
      }
    });
  });

  function showStandalone() {
    el["standalone-notice"].hidden = false;
  }

  // ── document settings (API key lives in the workbook, never in code) ───

  function documentSettings() {
    try {
      if (typeof Office !== "undefined" && Office.context &&
          Office.context.document && Office.context.document.settings) {
        return Office.context.document.settings;
      }
    } catch (e) { /* standalone */ }
    return null;
  }

  function restoreSettings() {
    var settings = documentSettings();
    if (!settings) { return; }
    var savedKey = settings.get(SETTINGS_KEY_API);
    var savedServer = settings.get(SETTINGS_KEY_SERVER);
    if (savedKey) { el["api-key"].value = savedKey; }
    if (savedServer) { el["server-url"].value = savedServer; }
  }

  function persistSettings() {
    var settings = documentSettings();
    if (!settings) { return; }
    settings.set(SETTINGS_KEY_API, el["api-key"].value || "");
    settings.set(SETTINGS_KEY_SERVER, el["server-url"].value || "");
    settings.saveAsync(function () { /* best effort */ });
  }

  // ── status helpers ─────────────────────────────────────────────────────

  function setStatus(message, kind) {
    el["status"].textContent = message || "";
    el["status"].dataset.kind = kind || "info";
  }

  function describeNetworkError(url) {
    var hint = "";
    try {
      var origin = new URL(url).origin;
      if (origin !== "https://demo.honua.io" && origin !== window.location.origin) {
        hint = " Note: this build's Content-Security-Policy only allows " +
               "https://demo.honua.io — other servers need a CSP change " +
               "(see the README).";
      }
    } catch (e) { /* ignore */ }
    return "Could not reach the server." + hint +
           " Check the URL, your network, and that the server allows CORS from this origin.";
  }

  // ── HTTP ───────────────────────────────────────────────────────────────

  function baseUrl() {
    var raw = (el["server-url"].value || "").trim().replace(/\/+$/, "");
    return raw;
  }

  function authHeaders() {
    var headers = { "Accept": "application/json" };
    var key = (el["api-key"].value || "").trim();
    if (key) { headers["X-API-Key"] = key; }
    return headers;
  }

  function fetchJson(url, options) {
    return fetch(url, options).catch(function () {
      throw new Error(describeNetworkError(url));
    }).then(function (resp) {
      if (resp.status === 204) { return null; }
      return resp.text().then(function (text) {
        var body = null;
        try { body = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON */ }
        if (!resp.ok) {
          var detail = extractErrorMessage(body) || (text || "").slice(0, 200);
          var err = new Error("HTTP " + resp.status + (detail ? " — " + detail : ""));
          err.status = resp.status;
          throw err;
        }
        return body;
      });
    });
  }

  function extractErrorMessage(body) {
    if (!body) { return ""; }
    if (body.error && body.error.message) { return body.error.message; }
    if (typeof body.message === "string") { return body.message; }
    return "";
  }

  // ── connect: service document + layer list ────────────────────────────

  function connect() {
    var server = baseUrl();
    if (!/^https?:\/\//i.test(server)) {
      setStatus("Enter a server URL starting with https://", "error");
      return;
    }
    state.serverUrl = server;
    persistSettings();
    setStatus("Connecting to " + server + " …");
    el["layer-section"].hidden = true;

    // Service document first: cheap reachability + "is this an OData v4
    // endpoint" check. Then the Layers entity set drives the picker.
    fetchJson(server + "/odata", { headers: authHeaders() })
      .then(function (doc) {
        var sets = (doc && doc.value) || [];
        var hasLayers = sets.some(function (s) { return s && s.name === "Layers"; });
        if (!hasLayers) {
          throw new Error("This server's OData service document does not list a " +
                          "'Layers' entity set — is it a Honua Server?");
        }
        return fetchJson(server + "/odata/Layers", { headers: authHeaders() });
      })
      .then(function (body) {
        var layers = (body && body.value) || [];
        state.layers = layers;
        if (layers.length === 0) {
          setStatus("Connected, but no layers are published yet on this server. " +
                    "Once demo data is seeded, hit Connect again and they will " +
                    "show up here.", "warn");
          return;
        }
        el["layer-select"].innerHTML = "";
        layers.forEach(function (layer) {
          var opt = document.createElement("option");
          opt.value = String(layer.Id);
          opt.textContent = (layer.Name || ("Layer " + layer.Id)) +
            (layer.GeometryType ? " — " + layer.GeometryType : "");
          el["layer-select"].appendChild(opt);
        });
        el["layer-section"].hidden = false;
        setStatus("Connected. " + layers.length + " layer" +
                  (layers.length === 1 ? "" : "s") + " available.", "success");
      })
      .catch(function (err) {
        setStatus(err.message, "error");
      });
  }

  // ── load: features → Excel table ──────────────────────────────────────

  function isReservedProperty(name) {
    var lower = String(name).toLowerCase();
    return lower === "objectid" || lower === "layerid" || lower === "geometry" ||
           lower === "attributes" || lower.indexOf("@odata") === 0;
  }

  function toCellValue(value) {
    if (value === null || value === undefined) { return ""; }
    var t = typeof value;
    if (t === "number" || t === "boolean") { return value; }
    var text = t === "string" ? value : JSON.stringify(value);
    if (text.length > CELL_TEXT_CAP) { text = text.slice(0, CELL_TEXT_CAP); }
    return text;
  }

  function geometrySummary(geometry) {
    if (!geometry) { return ""; }
    return geometry.type || "geometry";
  }

  function loadIntoSheet() {
    if (!state.excelReady) {
      setStatus("Excel is not available here — open this taskpane inside Excel " +
                "to load a layer into a sheet.", "error");
      return;
    }
    var layerId = parseInt(el["layer-select"].value, 10);
    var layer = state.layers.filter(function (l) { return l.Id === layerId; })[0];
    if (!layer) { setStatus("Pick a layer first.", "error"); return; }
    var server = state.serverUrl;

    setStatus("Loading features for “" + (layer.Name || layerId) + "” …");
    el["load-btn"].disabled = true;

    fetchJson(server + "/odata/Layers(" + layerId + ")/Features?$top=" + ROW_CAP,
              { headers: authHeaders() })
      .then(function (body) {
        var rows = (body && body.value) || [];
        return buildTable(layer, rows);
      })
      .then(function (rowCount) {
        el["save-section"].hidden = false;
        renderDirty();
        el["save-results"].innerHTML = "";
        setStatus("Loaded " + rowCount + " row" + (rowCount === 1 ? "" : "s") +
                  (rowCount >= ROW_CAP ? " (capped at " + ROW_CAP + ")" : "") +
                  ". Edit attribute cells, then Save changes. Geometry is read-only.",
                  "success");
      })
      .catch(function (err) {
        setStatus(err.message, "error");
      })
      .then(function () { el["load-btn"].disabled = false; });
  }

  function buildTable(layer, rows) {
    // Column order: ObjectId, attributes in first-encountered order, geometry.
    var attributeNames = [];
    var seen = {};
    rows.forEach(function (row) {
      Object.keys(row).forEach(function (key) {
        if (isReservedProperty(key) || seen[key.toLowerCase()]) { return; }
        seen[key.toLowerCase()] = true;
        attributeNames.push(key);
      });
    });

    var headers = [KEY_HEADER].concat(attributeNames, [GEOMETRY_HEADER]);
    var snapshot = {};
    var geoSnapshot = {};
    var etags = {};
    var values = rows.map(function (row) {
      var oid = row.ObjectId;
      var cells = [toCellValue(oid)];
      var snap = {};
      attributeNames.forEach(function (name) {
        var cell = toCellValue(row[name]);
        snap[name] = cell;
        cells.push(cell);
      });
      var geomCell = geometrySummary(row.Geometry);
      cells.push(geomCell);
      snapshot[String(oid)] = snap;
      geoSnapshot[String(oid)] = geomCell;
      if (row["@odata.etag"]) { etags[String(oid)] = row["@odata.etag"]; }
      return cells;
    });

    var sheetBase = ("Honua " + (layer.Name || ("Layer " + layer.Id)))
      .replace(/[\\\/\?\*\[\]:]/g, " ").trim().slice(0, 28);
    var tableName = ("Honua_" + (layer.Name || "Layer") + "_" + layer.Id)
      .replace(/[^A-Za-z0-9_]/g, "_").slice(0, 240) + "_" + Date.now().toString(36);

    return Excel.run(function (context) {
      var sheets = context.workbook.worksheets;
      sheets.load("items/name");
      return context.sync().then(function () {
        var names = sheets.items.map(function (s) { return s.name; });
        var sheetName = sheetBase;
        var n = 2;
        while (names.indexOf(sheetName) !== -1) {
          sheetName = sheetBase + " " + n;
          n += 1;
        }

        var sheet = sheets.add(sheetName);
        var headerRange = sheet.getRangeByIndexes(0, 0, 1, headers.length);
        headerRange.values = [headers];
        if (values.length > 0) {
          sheet.getRangeByIndexes(1, 0, values.length, headers.length).values = values;
        }
        var table = sheet.tables.add(
          sheet.getRangeByIndexes(0, 0, Math.max(values.length, 1) + 1, headers.length),
          true /* hasHeaders */);
        table.name = tableName;
        sheet.getUsedRange().format.autofitColumns();
        table.onChanged.add(onTableChanged);
        sheet.activate();
        return context.sync();
      });
    }).then(function () {
      state.layerId = layer.Id;
      state.layerName = layer.Name || String(layer.Id);
      state.tableName = tableName;
      state.headers = headers;
      state.attributeNames = attributeNames;
      state.snapshot = snapshot;
      state.geoSnapshot = geoSnapshot;
      state.etags = etags;
      state.dirty = [];
      state.notices = [];
      return rows.length;
    });
  }

  // ── change tracking: onChanged marks the table dirty; the actual diff is
  //    snapshot-based so it survives sorting and multi-cell edits ─────────

  var diffTimer = null;

  function onTableChanged() {
    if (diffTimer) { clearTimeout(diffTimer); }
    diffTimer = setTimeout(function () {
      diffTimer = null;
      recomputeDirty().catch(function (err) {
        setStatus("Change tracking failed: " + err.message, "error");
      });
    }, 250);
    return Promise.resolve();
  }

  function recomputeDirty() {
    if (!state.excelReady || !state.tableName) { return Promise.resolve(); }
    return Excel.run(function (context) {
      var table = context.workbook.tables.getItem(state.tableName);
      var body = table.getDataBodyRange();
      body.load("values");
      return context.sync().then(function () { return body.values || []; });
    }).then(function (rows) {
      var dirty = [];
      var notices = [];
      var geometryEdited = false;
      var geometryCol = state.headers.indexOf(GEOMETRY_HEADER);

      rows.forEach(function (cells) {
        var oid = cells[0];
        var key = String(oid);
        if (oid === "" || oid === null) { return; } // blank/new row — ignored
        var snap = state.snapshot[key];
        if (!snap) {
          notices.push("Row with ObjectId “" + key + "” isn't from this load " +
                       "(new row or edited key) — it will not be saved.");
          return;
        }
        var changes = {};
        var changed = false;
        state.attributeNames.forEach(function (name, i) {
          var current = cells[i + 1];
          if (current === undefined) { return; }
          if (!cellEquals(current, snap[name])) {
            changes[name] = current === "" ? null : current;
            changed = true;
          }
        });
        if (geometryCol !== -1 && !cellEquals(cells[geometryCol], state.geoSnapshot[key])) {
          geometryEdited = true;
        }
        if (changed) { dirty.push({ objectId: key, changes: changes }); }
      });

      if (geometryEdited) {
        notices.push("Geometry is read-only in this preview — geometry cells are not saved.");
      }

      state.dirty = dirty;
      state.notices = notices;
      renderDirty();
    });
  }

  function cellEquals(a, b) {
    if (a === b) { return true; }
    // Excel may hand back 1 for "1": compare numerics loosely.
    if (a !== "" && b !== "" && !isNaN(a) && !isNaN(b)) {
      return Number(a) === Number(b);
    }
    return false;
  }

  function renderDirty() {
    var n = state.dirty.length;
    el["save-btn"].textContent = "Save changes (" + n + ")";
    el["save-btn"].disabled = n === 0;
    if (state.notices.length > 0) {
      setStatus(state.notices.join("\n"), "warn");
    } else if (n > 0) {
      setStatus(n + " row" + (n === 1 ? "" : "s") + " modified — not saved yet.", "warn");
    }
  }

  // ── save: $batch of PATCH, sequential PATCH fallback ──────────────────

  function patchUrlFor(objectId) {
    return "Features(LayerId=" + state.layerId + ",ObjectId=" + objectId + ")";
  }

  function patchHeadersFor(objectId) {
    var headers = { "Content-Type": "application/json" };
    if (state.etags[objectId]) { headers["If-Match"] = state.etags[objectId]; }
    return headers;
  }

  function saveChanges() {
    var dirty = state.dirty.slice();
    if (dirty.length === 0) { return; }
    var key = (el["api-key"].value || "").trim();
    if (!key) {
      setStatus("Saving needs an API key — writes to Honua Server require " +
                "authentication (X-API-Key). Enter one above and try again.", "error");
      return;
    }

    el["save-btn"].disabled = true;
    el["save-results"].innerHTML = "";
    setStatus("Saving " + dirty.length + " row" + (dirty.length === 1 ? "" : "s") + " …");

    saveViaBatch(dirty)
      .catch(function (batchErr) {
        setStatus("$batch failed (" + batchErr.message + ") — retrying row by row …", "warn");
        return saveSequentially(dirty);
      })
      .then(function (results) {
        applySaveResults(dirty, results);
      })
      .catch(function (err) {
        setStatus("Save failed: " + err.message, "error");
        el["save-btn"].disabled = state.dirty.length === 0;
      });
  }

  // Returns [{objectId, status, body}] in the same order as `dirty`.
  function saveViaBatch(dirty) {
    var requests = dirty.map(function (d, i) {
      return {
        id: String(i + 1),
        method: "PATCH",
        url: patchUrlFor(d.objectId),
        headers: patchHeadersFor(d.objectId),
        body: { Attributes: d.changes },
      };
    });
    var headers = authHeaders();
    headers["Content-Type"] = "application/json";

    return fetchJson(state.serverUrl + "/odata/$batch", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ requests: requests }),
    }).then(function (body) {
      var responses = (body && body.responses) || null;
      if (!responses) { throw new Error("unexpected $batch response shape"); }
      var byId = {};
      responses.forEach(function (r) { byId[String(r.id)] = r; });
      return dirty.map(function (d, i) {
        var r = byId[String(i + 1)] || {};
        return { objectId: d.objectId, status: r.status || 0, body: r.body || null };
      });
    });
  }

  function saveSequentially(dirty) {
    var results = [];
    var chain = Promise.resolve();
    dirty.forEach(function (d) {
      chain = chain.then(function () {
        var headers = authHeaders();
        // No If-Match here: the server's CORS allowlist does not include the
        // If-Match request header, so a preflighted PATCH carrying it would be
        // blocked by the browser. Inside $batch the ETag travels in the JSON
        // body, so the primary save path still gets conditional updates.
        headers["Content-Type"] = "application/json";
        return fetch(state.serverUrl + "/odata/" + patchUrlFor(d.objectId), {
          method: "PATCH",
          headers: headers,
          body: JSON.stringify({ Attributes: d.changes }),
        }).then(function (resp) {
          return resp.text().then(function (text) {
            var body = null;
            try { body = text ? JSON.parse(text) : null; } catch (e) { /* ignore */ }
            results.push({ objectId: d.objectId, status: resp.status, body: body });
          });
        }).catch(function () {
          results.push({ objectId: d.objectId, status: 0, body: null });
        });
      });
    });
    return chain.then(function () { return results; });
  }

  function applySaveResults(dirty, results) {
    var okCount = 0;
    el["save-results"].innerHTML = "";

    results.forEach(function (result, i) {
      var d = dirty[i];
      var ok = result.status >= 200 && result.status < 300;
      var li = document.createElement("li");
      li.dataset.ok = String(ok);
      li.textContent = "ObjectId " + d.objectId + " — " + describeResult(result);
      el["save-results"].appendChild(li);

      if (ok) {
        okCount += 1;
        var snap = state.snapshot[d.objectId] || {};
        Object.keys(d.changes).forEach(function (name) {
          snap[name] = d.changes[name] === null ? "" : d.changes[name];
        });
        state.snapshot[d.objectId] = snap;
        if (result.body && result.body["@odata.etag"]) {
          state.etags[d.objectId] = result.body["@odata.etag"];
        } else {
          delete state.etags[d.objectId]; // stale etag would 412 next save
        }
      }
    });

    recomputeDirty().then(function () {
      var failed = results.length - okCount;
      if (failed === 0) {
        setStatus("Saved " + okCount + " row" + (okCount === 1 ? "" : "s") +
                  " to " + state.serverUrl + ". Open the map to see it live.", "success");
      } else {
        setStatus("Saved " + okCount + ", failed " + failed +
                  " — see per-row results below.", "error");
      }
    });
  }

  function describeResult(result) {
    if (result.status >= 200 && result.status < 300) { return "saved"; }
    if (result.status === 401) { return "unauthorized (401) — check the API key"; }
    if (result.status === 403) { return "forbidden (403) — key lacks write access to this layer"; }
    if (result.status === 412) {
      return "conflict (412) — changed on the server since you loaded it; reload the layer";
    }
    if (result.status === 0) { return "network error"; }
    var detail = extractErrorMessage(result.body);
    return "failed (" + result.status + ")" + (detail ? " — " + detail : "");
  }
})();

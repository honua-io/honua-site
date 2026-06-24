/*
 * Geoprocessing / OGC API Processes runner — live demo (honua-sdk-js#288/#289).
 *
 * Drives the live OGC API Processes surface on demo.honua.io:
 *   1. GET  /ogc/processes/processes         — list the catalog (anonymous; public)
 *   2. GET  /ogc/processes/processes/{id}     — load a process input schema (anonymous)
 *   3. GET  /odata/Layers                     — resolve friendly layer name -> integer Id (anonymous)
 *   4. POST /ogc/processes/processes/{id}/execution   — requires an X-API-Key
 *        - 401 : no key                     -> "provide a key to execute" state (not an error wall)
 *        - 400 : plan rejected by catalog    -> live validation feedback (bad layer / missing param)
 *        - 202/201 + job : accepted          -> poll /ogc/processes/jobs/{id} -> results -> render GeoJSON
 *        - 200 : synchronous result          -> render GeoJSON
 *        - 503 : durable job store missing    -> plan ACCEPTED & validated, but the public demo has no
 *                                                Redis-backed job store, so it can't persist the job
 *        - 402 : Pro entitlement required     -> honest gate for analytics.* even with a key
 *
 * The catalog, schemas and layer registry are public and load anonymously. Execution is X-API-Key
 * gated; the key lives in memory only (never stored, never committed). Every server response is shown
 * verbatim — nothing is mocked.
 *
 * No build step / no web-components: plain maplibre-gl for the result map.
 */
(function () {
  "use strict";

  var BASE = "https://demo.honua.io";
  var PROCESSES_URL = BASE + "/ogc/processes/processes";
  var JOBS_URL = BASE + "/ogc/processes/jobs";
  var LAYERS_URL = BASE + "/odata/Layers";
  var MAUI_VIEW = { center: [-156.62, 20.86], zoom: 9 };
  // A Community process that exercises a real layer end-to-end when an exec key is present.
  var DEFAULT_PROCESS = "generalization.simplify-layer";
  var POLL_INTERVAL_MS = 1500;
  var POLL_TIMEOUT_MS = 90000;

  // Sensible live defaults so a submit is one click. layerId is resolved to an INTEGER id from
  // /odata/Layers (the server requires a non-negative integer layer identifier, not a service name).
  var DEFAULT_LAYER_NAME = "maui-zoning";
  var INPUT_DEFAULTS = {
    targetSrid: 3857,
    tolerance: 0.001,
    distance: 100,
    preserveTopology: true,
  };

  var state = { processes: [], layers: [], selected: null, map: null, apiKey: "" };

  function el(id) { return document.getElementById(id); }
  function setStatus(s, t) { var n = el("gp-status"); if (n) { n.dataset.state = s; n.textContent = t; } }
  function isPro(id) { return /^analytics\./.test(String(id || "")); }
  function hasKey() { return !!state.apiKey; }

  // Merge the X-API-Key header in only when a key is present; harmless when absent.
  function withKey(headers) {
    var h = headers || {};
    if (state.apiKey) h["X-API-Key"] = state.apiKey;
    return h;
  }

  function fetchJson(url, opts) {
    return fetch(url, opts).then(function (r) {
      return r.text().then(function (text) {
        var body = null;
        try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
        return { ok: r.ok, status: r.status, statusText: r.statusText, body: body, location: r.headers.get("Location") };
      });
    });
  }

  // ---- API key wiring ------------------------------------------------------

  function refreshKeyState() {
    var node = el("gp-key-state");
    if (node) {
      if (hasKey()) {
        node.dataset.on = "live";
        node.textContent = "Key set — executions run live against demo.honua.io.";
      } else {
        node.dataset.on = "anon";
        node.textContent = "Anonymous — catalog & schemas only. Add a key to execute.";
      }
    }
    var runBtn = el("gp-run");
    if (runBtn && state.selected) {
      var pro = isPro(state.selected);
      runBtn.textContent = hasKey()
        ? (pro ? "Execute live (Pro)" : "Execute live")
        : "Provide a key to execute";
    }
  }

  function wireKeyInput() {
    var input = el("gp-key");
    var clear = el("gp-key-clear");
    if (input) {
      input.addEventListener("input", function () {
        state.apiKey = input.value.trim();
        refreshKeyState();
      });
    }
    if (clear) {
      clear.addEventListener("click", function () {
        state.apiKey = "";
        if (input) input.value = "";
        refreshKeyState();
      });
    }
  }

  // ---- layer registry ------------------------------------------------------

  // Resolve the live layer registry so a friendly name maps to its integer Id.
  function loadLayers() {
    return fetchJson(LAYERS_URL, { headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok || !res.body) return [];
        var rows = (res.body && res.body.value) || (Array.isArray(res.body) ? res.body : []);
        return rows
          .map(function (r) { return { id: r.Id, name: r.Name, geometry: r.GeometryType }; })
          .filter(function (r) { return typeof r.id === "number" && r.name; });
      })
      .catch(function () { return []; });
  }

  function defaultLayerId() {
    var match = state.layers.filter(function (l) { return l.name === DEFAULT_LAYER_NAME; })[0];
    return match ? match.id : (state.layers[0] ? state.layers[0].id : 2);
  }

  // ---- catalog ------------------------------------------------------------

  function loadCatalog() {
    return fetchJson(PROCESSES_URL, { headers: { Accept: "application/json" } }).then(function (res) {
      if (!res.ok) throw new Error("processes catalog " + res.status);
      var list = (res.body && res.body.processes) || [];
      if (!list.length) throw new Error("empty process catalog");
      return list;
    });
  }

  function renderCatalog(list) {
    var wrap = el("gp-proc-list");
    wrap.textContent = "";
    list.forEach(function (p) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gp-proc";
      btn.setAttribute("role", "option");
      btn.setAttribute("data-id", p.id);
      btn.setAttribute("aria-selected", "false");
      var pro = isPro(p.id);
      var badge = '<span class="gp-badge ' + (pro ? "pro" : "comm") + '">' + (pro ? "Pro" : "Community") + "</span>";
      btn.innerHTML = "<strong>" + escapeHtml(p.title || p.id) + "</strong> " + badge +
        '<span class="id">' + escapeHtml(p.id) + "</span>";
      btn.addEventListener("click", function () { selectProcess(p.id); });
      wrap.appendChild(btn);
    });
  }

  function markSelected(id) {
    var nodes = el("gp-proc-list").querySelectorAll(".gp-proc");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].setAttribute("aria-selected", nodes[i].getAttribute("data-id") === id ? "true" : "false");
    }
  }

  // ---- process detail + input form ----------------------------------------

  function selectProcess(id) {
    state.selected = id;
    markSelected(id);
    el("gp-detail-title").textContent = "Loading…";
    el("gp-detail-desc").textContent = "GET /ogc/processes/processes/" + id;
    el("gp-inputs").textContent = "";
    el("gp-actions").style.display = "none";
    el("gp-exec-out").textContent = "No execution yet.";
    el("gp-exec-pill").innerHTML = "";
    hideSummary();

    fetchJson(PROCESSES_URL + "/" + encodeURIComponent(id), { headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok || !res.body) throw new Error("process detail " + res.status);
        renderDetail(res.body);
      })
      .catch(function (e) {
        el("gp-detail-title").textContent = id;
        el("gp-detail-desc").textContent = "Could not load schema: " + (e && e.message ? e.message : e);
      });
  }

  // Build a <select> of live layers (friendly Name -> integer Id value), optionally filtered.
  function buildLayerSelect(key, preselectId) {
    var input = document.createElement("select");
    input.id = "gp-in-" + key;
    input.setAttribute("data-key", key);
    input.setAttribute("data-type", "integer");
    if (!state.layers.length) {
      // Registry unavailable: fall back to a numeric input so layerId is still an integer.
      var num = document.createElement("input");
      num.type = "number"; num.id = "gp-in-" + key;
      num.setAttribute("data-key", key); num.setAttribute("data-type", "integer");
      num.value = String(preselectId != null ? preselectId : 2);
      return num;
    }
    state.layers.forEach(function (l) {
      var o = document.createElement("option");
      o.value = String(l.id);
      o.textContent = l.name + " · id " + l.id + (l.geometry ? " · " + l.geometry : "");
      input.appendChild(o);
    });
    input.value = String(preselectId != null ? preselectId : defaultLayerId());
    return input;
  }

  function renderDetail(proc) {
    var pro = isPro(proc.id);
    el("gp-detail-title").innerHTML = escapeHtml(proc.title || proc.id) + " " +
      '<span class="gp-badge ' + (pro ? "pro" : "comm") + '">' + (pro ? "Pro" : "Community") + "</span>";
    el("gp-detail-desc").textContent = proc.description || "";

    var inputs = proc.inputs || {};
    var form = el("gp-inputs");
    form.textContent = "";

    // Order: layerId first (it is the spine of every process), then known defaults, then the rest.
    var keys = Object.keys(inputs);
    var ordered = [];
    if (keys.indexOf("layerId") !== -1) ordered.push("layerId");
    keys.forEach(function (k) {
      if (k !== "layerId" && INPUT_DEFAULTS[k] !== undefined && ordered.indexOf(k) === -1) ordered.push(k);
    });
    keys.forEach(function (k) { if (ordered.indexOf(k) === -1) ordered.push(k); });

    ordered.forEach(function (key) {
      var def = inputs[key] || {};
      var schema = def.schema || {};
      var field = document.createElement("div");
      field.className = "gp-field";
      var label = document.createElement("label");
      var required = /required/i.test(def.description || "");
      label.textContent = (def.title || key) + (required ? " *" : "");
      label.setAttribute("for", "gp-in-" + key);
      field.appendChild(label);

      var input;
      if (key === "layerId") {
        // Always a live layer dropdown -> integer id, regardless of the schema's declared string type.
        input = buildLayerSelect(key, defaultLayerId());
      } else if (schema.type === "boolean") {
        input = document.createElement("select");
        ["true", "false"].forEach(function (v) {
          var o = document.createElement("option"); o.value = v; o.textContent = v; input.appendChild(o);
        });
        input.value = String(INPUT_DEFAULTS[key] !== undefined ? INPUT_DEFAULTS[key] : false);
        input.id = "gp-in-" + key;
        input.setAttribute("data-key", key);
        input.setAttribute("data-type", "boolean");
      } else {
        input = document.createElement("input");
        input.type = (schema.type === "number" || schema.type === "integer") ? "number" : "text";
        if (schema.type === "number") input.step = "any";
        if (INPUT_DEFAULTS[key] !== undefined) input.value = String(INPUT_DEFAULTS[key]);
        input.id = "gp-in-" + key;
        input.setAttribute("data-key", key);
        input.setAttribute("data-type", schema.type || "string");
      }
      field.appendChild(input);

      if (def.description) {
        var d = document.createElement("div"); d.className = "desc"; d.textContent = def.description; field.appendChild(d);
      }
      form.appendChild(field);
    });

    if (!ordered.length) {
      var none = document.createElement("p");
      none.className = "gp-note";
      none.textContent = "This process declares no JSON inputs in its schema.";
      form.appendChild(none);
    }

    el("gp-actions").style.display = "flex";
    var runBtn = el("gp-run");
    runBtn.disabled = false;
    runBtn.onclick = function () { runExecution(proc); };
    refreshKeyState();
  }

  function collectInputs() {
    var out = {};
    var nodes = el("gp-inputs").querySelectorAll("[data-key]");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var key = node.getAttribute("data-key");
      var type = node.getAttribute("data-type");
      var raw = node.value;
      if (raw === "" || raw == null) continue; // omit empty optionals
      if (type === "boolean") out[key] = raw === "true";
      else if (type === "number" || type === "integer") {
        var n = Number(raw); if (!isNaN(n)) out[key] = type === "integer" ? Math.trunc(n) : n;
      } else out[key] = raw;
    }
    return out;
  }

  // ---- execution lifecycle (execute -> poll -> results) -------------------

  function setExecPill(kind, text) {
    var cls = kind === "live" ? "live" : kind === "gate" ? "gate" : "err";
    el("gp-exec-pill").innerHTML = '<span class="gp-pill ' + cls + '">' + escapeHtml(text) + "</span>";
  }

  function writeExec(text) { el("gp-exec-out").textContent = text; }
  function pretty(obj) { try { return JSON.stringify(obj, null, 2); } catch (_) { return String(obj); } }

  function hideSummary() { var s = el("gp-result-summary"); if (s) { s.style.display = "none"; s.innerHTML = ""; } }
  function showSummary(html) { var s = el("gp-result-summary"); if (s) { s.style.display = "block"; s.innerHTML = html; } }

  function runExecution(proc) {
    var runBtn = el("gp-run");
    var inputs = collectInputs();
    var payload = { inputs: inputs };
    hideSummary();

    if (!hasKey()) {
      // No scary 401 wall: surface the request that *would* run, and prompt for a key.
      setExecPill("gate", "key required");
      showSummary("Add a demo <span class=\"k\">X-API-Key</span> in the panel on the left to execute this live. " +
        "The catalog, schema and layer registry above are already live and anonymous.");
      writeExec("POST " + PROCESSES_URL + "/" + proc.id + "/execution\n" +
        "(no key set — this request is not sent)\n\nwould send:\n" + pretty(payload));
      return;
    }

    runBtn.disabled = true;
    setExecPill("live", "submitting…");
    writeExec("POST " + PROCESSES_URL + "/" + proc.id + "/execution\nX-API-Key: ••••••••\n\n" + pretty(payload));

    fetchJson(PROCESSES_URL + "/" + encodeURIComponent(proc.id) + "/execution", {
      method: "POST",
      headers: withKey({ "Content-Type": "application/json", Accept: "application/json", Prefer: "respond-async" }),
      body: JSON.stringify(payload),
    })
      .then(function (res) { return handleExecResponse(proc, payload, res); })
      .catch(function (e) {
        setExecPill("err", "request failed");
        writeExec("Execution request failed (network/CORS):\n" + (e && e.message ? e.message : e));
      })
      .finally(function () { runBtn.disabled = false; });
  }

  function handleExecResponse(proc, payload, res) {
    var header = "POST .../" + proc.id + "/execution\nrequest: " + pretty(payload) + "\n\n-> HTTP " + res.status + "\n\n";

    // Auth gate — only happens if a key was removed mid-flight.
    if (res.status === 401) {
      setExecPill("gate", "401 · auth required");
      showSummary("The server requires a valid <span class=\"k\">X-API-Key</span> to execute. Paste one on the left.");
      writeExec(header + pretty(res.body));
      return;
    }
    // Pro entitlement gate.
    if (res.status === 402) {
      setExecPill("gate", "402 · requires Pro");
      showSummary("This is a <span class=\"k\">Pro</span> process and needs a Pro entitlement on the key — gated honestly even with a valid key.");
      writeExec(header + pretty(res.body));
      return;
    }
    if (res.status === 403) {
      setExecPill("gate", "403 · forbidden");
      writeExec(header + (isPro(proc.id) ? "Pro entitlement / permission required.\n\n" : "") + pretty(res.body));
      return;
    }
    // Durable job store not provisioned on the public demo. The plan PASSED auth + catalog validation
    // to get here — that is the live success signal we surface.
    if (res.status === 503 && res.body && /redis|durable|job/i.test(JSON.stringify(res.body))) {
      setExecPill("live", "plan accepted · 503 job store");
      showSummary("<span class=\"k\">Plan validated &amp; accepted live.</span> Auth passed and the catalog accepted the execution plan " +
        "(correct integer <span class=\"k\">layerId</span> and parameters). The public demo does not provision durable async job " +
        "storage, so the accepted plan stops here instead of running to a GeoJSON result; a fully-provisioned deployment continues " +
        "to a job and result.");
      writeExec(header + "The execution plan passed authentication and catalog validation.\n" +
        "Job persistence is unavailable on the public demo (no Redis-backed durable store),\n" +
        "so the accepted plan cannot be enqueued. Verbatim server response:\n\n" + pretty(res.body));
      return;
    }
    // Validation rejection — proves the live catalog is really checking inputs.
    if (res.status === 400) {
      setExecPill("err", "400 · plan rejected");
      var detail = res.body && (res.body.detail || res.body.title);
      showSummary("Live catalog validation rejected the plan" + (detail ? ": <span class=\"k\">" + escapeHtml(String(detail)) + "</span>" : ".") +
        " Adjust the inputs and resubmit.");
      writeExec(header + pretty(res.body));
      return;
    }
    if (!res.ok) {
      setExecPill("err", "HTTP " + res.status);
      writeExec(header + pretty(res.body));
      return;
    }

    // Async: a job was created. Body is a statusInfo or Location points at the job.
    var body = res.body || {};
    var jobId = body.jobID || body.jobId;
    var isJob = jobId || res.status === 201 || res.status === 202 ||
      (body && (body.status === "accepted" || body.status === "running"));
    if (isJob) {
      if (!jobId && res.location) { var m = res.location.match(/jobs\/([^/?#]+)/); if (m) jobId = m[1]; }
      if (!jobId) {
        setExecPill("live", "accepted");
        writeExec(header + "Job accepted but no jobID returned:\n" + pretty(body));
        return;
      }
      setExecPill("live", "job " + jobId + " · running");
      writeExec(header + "Job accepted: " + jobId + "\nPolling /ogc/processes/jobs/" + jobId + " …");
      return pollJob(proc, jobId, Date.now());
    }

    // Sync result document.
    setExecPill("live", "200 · result");
    renderResult(proc, body);
    writeExec(header + "Synchronous result:\n" + pretty(body));
  }

  function pollJob(proc, jobId, startedAt) {
    return fetchJson(JOBS_URL + "/" + encodeURIComponent(jobId), { headers: withKey({ Accept: "application/json" }) })
      .then(function (res) {
        if (!res.ok) { setExecPill("err", "job " + res.status); writeExec("Job status HTTP " + res.status + "\n" + pretty(res.body)); return; }
        var job = res.body || {};
        var status = (job.status || "").toLowerCase();
        setExecPill("live", "job " + jobId + " · " + (status || "?") + (job.progress != null ? " " + job.progress + "%" : ""));
        if (status === "successful" || status === "succeeded") { return fetchResults(proc, jobId, job); }
        if (status === "failed" || status === "dismissed") {
          setExecPill("err", "job " + status);
          writeExec("Job " + jobId + " " + status + ":\n" + pretty(job));
          return;
        }
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          setExecPill("err", "poll timeout");
          writeExec("Job " + jobId + " did not reach a terminal state within " + (POLL_TIMEOUT_MS / 1000) + "s.\nLast status:\n" + pretty(job));
          return;
        }
        return new Promise(function (resolve) { setTimeout(resolve, POLL_INTERVAL_MS); })
          .then(function () { return pollJob(proc, jobId, startedAt); });
      });
  }

  function fetchResults(proc, jobId, job) {
    return fetchJson(JOBS_URL + "/" + encodeURIComponent(jobId) + "/results", { headers: withKey({ Accept: "application/json" }) })
      .then(function (res) {
        if (!res.ok) { setExecPill("gate", "results " + res.status); writeExec("Results HTTP " + res.status + "\n" + pretty(res.body)); return; }
        setExecPill("live", "job " + jobId + " · done");
        renderResult(proc, res.body);
        writeExec("Job " + jobId + " successful. Results:\n" + pretty(res.body));
      });
  }

  // ---- result rendering ----------------------------------------------------

  // Best-effort: pull a GeoJSON FeatureCollection out of an OGC result document.
  function findGeoJson(obj, depth) {
    if (!obj || typeof obj !== "object" || (depth || 0) > 4) return null;
    if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) return obj;
    if (obj.type === "Feature" && obj.geometry) return { type: "FeatureCollection", features: [obj] };
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var v = obj[keys[i]];
      if (v && typeof v === "object") { var found = findGeoJson(v, (depth || 0) + 1); if (found) return found; }
    }
    return null;
  }

  function renderResult(proc, result) {
    var fc = findGeoJson(result, 0);
    if (fc) {
      showSummary("<span class=\"k\">Result:</span> GeoJSON FeatureCollection · " +
        (fc.features ? fc.features.length : 0) + " feature(s) rendered on the map.");
    }
    if (!fc || !state.map) return;
    try {
      var map = state.map;
      var src = map.getSource("gp-result");
      if (src) { src.setData(fc); }
      else {
        map.addSource("gp-result", { type: "geojson", data: fc });
        map.addLayer({ id: "gp-result-fill", type: "fill", source: "gp-result", paint: { "fill-color": "#38bdf8", "fill-opacity": 0.25 }, filter: ["==", ["geometry-type"], "Polygon"] });
        map.addLayer({ id: "gp-result-line", type: "line", source: "gp-result", paint: { "line-color": "#38bdf8", "line-width": 1.2 } });
        map.addLayer({ id: "gp-result-pt", type: "circle", source: "gp-result", paint: { "circle-radius": 4, "circle-color": "#f59e0b", "circle-stroke-color": "#0b1622", "circle-stroke-width": 1 }, filter: ["==", ["geometry-type"], "Point"] });
      }
    } catch (_) { /* result has no renderable geometry; the JSON output still shows it */ }
  }

  // ---- map (optional; result canvas) --------------------------------------

  function initMap() {
    if (!window.maplibregl) return null;
    try {
      var map = new window.maplibregl.Map({
        container: "gp-map",
        style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0a1520" } }] },
        center: MAUI_VIEW.center, zoom: MAUI_VIEW.zoom, attributionControl: false,
      });
      map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), "top-right");
      return map;
    } catch (_) { return null; }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function boot() {
    state.map = initMap();
    wireKeyInput();
    refreshKeyState();
    setStatus("boot", "loading process catalog…");
    Promise.all([loadCatalog(), loadLayers()])
      .then(function (results) {
        var list = results[0];
        state.layers = results[1] || [];
        state.processes = list;
        renderCatalog(list);
        var community = list.filter(function (p) { return !isPro(p.id); }).length;
        var pro = list.length - community;
        var layerNote = state.layers.length ? " · " + state.layers.length + " layers" : "";
        setStatus("ok", "demo.honua.io · " + list.length + " processes (" + community + " Community · " + pro + " Pro)" + layerNote);
        var def = list.filter(function (p) { return p.id === DEFAULT_PROCESS; })[0] ||
          list.filter(function (p) { return !isPro(p.id); })[0] || list[0];
        if (def) selectProcess(def.id);
      })
      .catch(function (e) {
        setStatus("error", "catalog unavailable: " + (e && e.message ? e.message : e));
        el("gp-proc-list").innerHTML = '<p class="gp-note">Could not reach the OGC Processes catalog on demo.honua.io.</p>';
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

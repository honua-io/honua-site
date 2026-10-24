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
 *        - 503 : durable job store missing    -> typed capability-unavailable refusal (missingDependency=redis):
 *                                                execution REFUSED, nothing enqueued; shown verbatim
 *        - 402 : Pro entitlement required     -> honest gate for analytics.* even with a key
 *
 * The catalog, schemas and layer registry are public and load anonymously. Execution is X-API-Key
 * gated; the key lives in memory only (never stored, never committed). Every live server response is
 * shown verbatim — nothing is mocked.
 *
 * NO-KEY STATE. Without a key the page shows a RECORDED execution
 * (fixtures/recorded-buffer-2026-10-24.json): two real exchanges sent once by hand to demo.honua.io on
 * 2026-10-24 and stored verbatim with the key redacted — the OGC geometry.buffer execution (refused
 * with 503, no Redis job store on the demo) and the same buffer on the server's synchronous, anonymous
 * GeometryServer route, whose polygon is drawn on the map. It is labelled "recorded" everywhere it
 * appears and is removed the moment a live execution runs.
 *
 * MAP. The shared Protomaps basemap from assets/demo/layers.json (PMTiles via the Honua range proxy),
 * with the Terrain (hillshade) and Imagery bases from the same contract, the selected process's input
 * layer as live OGC API Tiles MVT, and the execution output as GeoJSON.
 *
 * No build step / no web-components: plain maplibre-gl + the vendored pmtiles protocol.
 */
(function () {
  "use strict";

  /* Opt-in backend override (assets/demos/backend-override.js). Returns the page
   * default unless a validated ?apiBase= / window.HONUA_DEMO_BASE_URL override is
   * active; the fallback keeps the page working if the shim is absent. */
  var BACKEND = window.HonuaDemoBackend || { resolve: function (pageDefault) { return pageDefault; } };
  var BASE = BACKEND.resolve("https://demo.honua.io");
  var PROCESSES_URL = BASE + "/ogc/processes/processes";
  var JOBS_URL = BASE + "/ogc/processes/jobs";
  var LAYERS_URL = BASE + "/odata/Layers";
  var MAUI_VIEW = { center: [-156.62, 20.86], zoom: 9 };
  // A Community process that exercises a real layer end-to-end when an exec key is present.
  var DEFAULT_PROCESS = "generalization.simplify-layer";
  // RFC 9457 problem type the server uses when a required dependency (e.g. Redis) is not provisioned.
  var CAPABILITY_UNAVAILABLE = "https://honua.io/problems/capability-unavailable";
  var LAYERS_CONFIG_URL = "assets/demo/layers.json";
  var RECORDING_URL = "assets/demos/geoprocessing/fixtures/recorded-buffer-2026-10-24.json";
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
  // Per-process defaults that override INPUT_DEFAULTS. geometry.buffer is prefilled with the exact
  // request in the recording (Kahului, EPSG:4326, distance in degrees because the input SRID is
  // geographic — ~1.5 km), so a booth operator with a key can replay it in one click.
  var PROCESS_DEFAULTS = {
    "geometry.buffer": { wkb: '{"type":"Point","coordinates":[-156.4735937,20.8820295]}', srid: 4326, distance: 0.0135 },
  };

  var state = { processes: [], layers: [], selected: null, map: null, apiKey: "", recording: null, mapReady: null, layerConfig: null };

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
        node.textContent = "No key — catalog, schemas and layers are live; the execution shown is the labelled 2026-10-24 recording.";
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
        var had = hasKey();
        state.apiKey = input.value.trim();
        refreshKeyState();
        if (!had && hasKey()) resetExecForLive();
        if (had && !hasKey()) showRecording();
      });
    }
    if (clear) {
      clear.addEventListener("click", function () {
        var had = hasKey();
        state.apiKey = "";
        if (input) input.value = "";
        refreshKeyState();
        if (had) showRecording();
      });
    }
  }

  // A key was pasted: the recording leaves the page so nothing recorded can be read as live.
  function resetExecForLive() {
    clearRecordingFromMap();
    el("gp-exec-pill").innerHTML = "";
    hideSummary();
    el("gp-exec-out").textContent = "Key set — no live execution yet. Submit to run against demo.honua.io.";
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
    if (!hasKey()) showRecording();

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
        // (boolean defaults come from INPUT_DEFAULTS)
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
        var preset = (PROCESS_DEFAULTS[proc.id] || {})[key];
        if (preset === undefined) preset = INPUT_DEFAULTS[key];
        if (preset !== undefined) input.value = String(preset);
        input.id = "gp-in-" + key;
        input.setAttribute("data-key", key);
        // A oneOf schema that admits a GeoJSON object (geometry.* "wkb") accepts either base64 WKB
        // or a GeoJSON geometry typed as JSON; collectInputs parses the JSON form.
        var acceptsObject = Array.isArray(schema.oneOf) && schema.oneOf.some(function (o) { return o && o.type === "object"; });
        input.setAttribute("data-type", acceptsObject ? "json-or-string" : (schema.type || "string"));
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

    var layerInput = el("gp-in-layerId");
    if (layerInput) {
      layerInput.addEventListener("change", function () { showInputLayer(Number(layerInput.value)); });
      showInputLayer(Number(layerInput.value));
    } else {
      showInputLayer(null);
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
      else if (type === "json-or-string") {
        var trimmed = String(raw).trim();
        if (trimmed.charAt(0) === "{") { try { out[key] = JSON.parse(trimmed); } catch (_) { out[key] = raw; } }
        else out[key] = raw;
      }
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
      showSummary("Not sent: execution needs an <span class=\"k\">X-API-Key</span>. The Honua team runs live executions at the booth, " +
        "or run Honua locally with the quickstart, where you are the admin. The catalog, schema and layer registry above are live and anonymous; " +
        "<button type=\"button\" class=\"gp-linkbtn\" id=\"gp-show-recording\">show the recorded 2026-10-24 execution</button>.");
      var again = el("gp-show-recording");
      if (again) again.addEventListener("click", showRecording);
      writeExec("POST " + PROCESSES_URL + "/" + proc.id + "/execution\n" +
        "(no key set — this request is not sent)\n\nwould send:\n" + pretty(payload));
      return;
    }

    clearRecordingFromMap();
    runBtn.disabled = true;
    setExecPill("live", "submitting…");
    writeExec("POST " + PROCESSES_URL + "/" + proc.id + "/execution\nX-API-Key: ••••••••\n\n" + pretty(payload));

    fetchJson(PROCESSES_URL + "/" + encodeURIComponent(proc.id) + "/execution", {
      method: "POST",
      // No Prefer header: demo.honua.io's CORS allow-list (Access-Control-Allow-Headers) does not include
      // Prefer, so a browser preflight carrying it is refused and the POST never leaves the tab. Omitting
      // it is also correct protocol: the server runs a sync-execute process synchronously and an
      // async-only process asynchronously (job + poll below) when no preference is sent.
      headers: withKey({ "Content-Type": "application/json", Accept: "application/json" }),
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
    // Durable job store not provisioned (e.g. a Redis-off deployment). The server refuses the execution
    // up front — typically with the typed 503 capability-unavailable problem (missingDependency=redis).
    // Nothing is accepted or enqueued, so the pill and headline say the execution was REFUSED. The
    // honua-release cloud harness (e2e/drivers/demos/gp-topology.mjs) requires "503" in the pill and
    // "job store" in the pill or headline.
    if (res.status === 503 && res.body && /redis|durable|job/i.test(JSON.stringify(res.body))) {
      var refusal = res.body && typeof res.body === "object" ? res.body : {};
      var typed = refusal.type === CAPABILITY_UNAVAILABLE;
      var missing = refusal.missingDependency ? String(refusal.missingDependency) : "";
      var reason = refusal.detail || refusal.title;
      setExecPill("gate", "execution refused · 503 job store");
      showSummary("<span class=\"k\">Plan validated · execution refused: job store unavailable.</span> " +
        "The server refused to start the job" +
        (typed ? " with a typed <span class=\"k\">503 capability-unavailable</span> response" : " (HTTP 503)") +
        (missing ? " (missing dependency: <span class=\"k\">" + escapeHtml(missing) + "</span>)" : "") +
        ". Durable geoprocessing jobs need a Redis-backed job store, and this deployment does not run one, " +
        "so nothing was enqueued or executed. A deployment with the durable job store continues to a job and GeoJSON result." +
        (reason ? " Server says: <span class=\"k\">" + escapeHtml(String(reason)) + "</span>" : ""));
      writeExec(header + "Execution refused: the durable job store is unavailable on this deployment\n" +
        "(no Redis-backed job store), so no job was created or enqueued. Verbatim server response:\n\n" + pretty(res.body));
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
    if (fc) drawGeoJson("gp-result", fc, "#38bdf8", true);
  }

  // Draw (or replace) a GeoJSON overlay once the map style is ready. `id` names the source and is the
  // prefix of its fill/line/circle layers.
  function drawGeoJson(id, fc, color, fit) {
    if (!state.mapReady) return;
    state.mapReady.then(function (map) {
      if (!map) return;
      try {
        var src = map.getSource(id);
        if (src) { src.setData(fc); }
        else {
          map.addSource(id, { type: "geojson", data: fc });
          map.addLayer({ id: id + "-fill", type: "fill", source: id, paint: { "fill-color": color, "fill-opacity": 0.28 }, filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false] });
          map.addLayer({ id: id + "-line", type: "line", source: id, paint: { "line-color": color, "line-width": 2 }, filter: ["match", ["geometry-type"], ["Point", "MultiPoint"], false, true] });
          map.addLayer({ id: id + "-pt", type: "circle", source: id, paint: { "circle-radius": 5, "circle-color": "#f59e0b", "circle-stroke-color": "#0b1622", "circle-stroke-width": 1.5 }, filter: ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false] });
        }
        if (fit) {
          var b = boundsOf(fc);
          if (b) map.fitBounds(b, { padding: 60, maxZoom: 12, duration: 600 });
        }
      } catch (_) { /* result has no renderable geometry; the JSON output still shows it */ }
    });
  }

  function removeOverlay(map, id) {
    ["-fill", "-line", "-pt", "-label"].forEach(function (suffix) { if (map.getLayer(id + suffix)) map.removeLayer(id + suffix); });
    if (map.getSource(id)) map.removeSource(id);
  }

  function boundsOf(fc) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function walk(c) {
      if (typeof c[0] === "number") {
        if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0];
        if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1];
        return;
      }
      for (var i = 0; i < c.length; i++) walk(c[i]);
    }
    (fc.features || []).forEach(function (f) { if (f && f.geometry && f.geometry.coordinates) walk(f.geometry.coordinates); });
    return isFinite(minX) ? [[minX, minY], [maxX, maxY]] : null;
  }

  // ---- recorded execution (no-key state) -----------------------------------

  function loadRecording() {
    return fetch(RECORDING_URL, { headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("recording " + r.status); return r.json(); })
      .catch(function () { return null; });
  }

  // Esri JSON polygon rings (GeometryServer buffer output) -> GeoJSON Polygon features.
  function esriPolygonsToGeoJson(body) {
    var geoms = (body && body.geometries) || [];
    return {
      type: "FeatureCollection",
      features: geoms.filter(function (g) { return g && Array.isArray(g.rings); }).map(function (g) {
        return { type: "Feature", properties: { kind: "recorded buffer output" }, geometry: { type: "Polygon", coordinates: g.rings } };
      }),
    };
  }

  function showRecording() {
    var rec = state.recording;
    if (!rec || hasKey()) {
      if (!rec && !hasKey()) {
        setExecPill("gate", "key required");
        showSummary("Execution needs an <span class=\"k\">X-API-Key</span>; the recorded example could not be loaded.");
      }
      return;
    }
    var ogc = rec.ogcProcesses, gs = rec.geometryServer;
    var fc = esriPolygonsToGeoJson(gs.response.body);
    var input = { type: "FeatureCollection", features: [{ type: "Feature", properties: { name: rec.subject.name }, geometry: { type: "Point", coordinates: rec.subject.coordinates } }] };
    setExecPill("gate", "recorded " + rec.recordedAt + " · not live");
    showSummary("<span class=\"k\">Recorded " + escapeHtml(rec.recordedAt) + " on demo.honua.io — not a live result.</span> " +
      "Buffer of " + escapeHtml(rec.subject.name) + " by 1.5 km. The OGC <span class=\"k\">geometry.buffer</span> execution was " +
      "<span class=\"k\">refused with 503</span> (this demo runs without the Redis job store), so the polygon on the map is the same buffer " +
      "returned by the server's synchronous GeometryServer route. Paste a key to replace this with a live execution.");
    writeExec("RECORDED " + rec.recordedAt + " on " + rec.server + " (verbatim; key redacted)\n\n" +
      "1) " + ogc.request.method + " " + ogc.request.url + "\n" + pretty(ogc.request.headers) + "\n" + pretty(ogc.request.body) +
      "\n\n-> HTTP " + ogc.response.status + "\n" + pretty(ogc.response.body) +
      "\n\n2) " + gs.request.method + " " + gs.request.url + "\n" + pretty(gs.request.query) +
      "\n\n-> HTTP " + gs.response.status + " · " + fc.features.length + " polygon(s), " +
      ((gs.response.body.geometries[0] || {}).rings || [[]])[0].length + " vertices (drawn on the map)\n" + pretty(gs.response.body));
    drawGeoJson("gp-recorded", fc, "#a78bfa", true);
    drawGeoJson("gp-recorded-input", input, "#f59e0b", false);
    setMapChip("Recorded " + rec.recordedAt + " · buffer of " + rec.subject.name + " (not live)");
  }

  function clearRecordingFromMap() {
    setMapChip("");
    if (!state.mapReady) return;
    state.mapReady.then(function (map) {
      if (!map) return;
      removeOverlay(map, "gp-recorded");
      removeOverlay(map, "gp-recorded-input");
    });
  }

  function setMapChip(text) {
    var chip = el("gp-map-chip");
    if (!chip) return;
    chip.textContent = text;
    chip.hidden = !text;
  }

  // ---- map: shared basemap + bases + selected input layer ----------------

  function loadLayerConfig() {
    return fetch(LAYERS_CONFIG_URL, { headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("layers.json " + r.status); return r.json(); })
      .catch(function () { return null; });
  }

  function ensurePMTilesProtocol() {
    if (ensurePMTilesProtocol.done) return true;
    try {
      if (!window.pmtiles || !window.maplibregl) return false;
      var proto = new window.pmtiles.Protocol();
      window.maplibregl.addProtocol("pmtiles", proto.tile);
      ensurePMTilesProtocol.done = true;
      return true;
    } catch (_) { return false; }
  }

  // Build the style from the layers.json contract: the dark Protomaps vector base, plus the Terrain
  // (hillshade over the vector base) and Imagery bases, toggled by visibility so overlays survive.
  function buildStyle(cfg) {
    var bg = (cfg && cfg.map && cfg.map.background) || "#0a1520";
    var style = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": bg } }] };
    var bm = cfg && cfg.basemap;
    if (!bm || !bm.proxyUrl || !bm.style || !ensurePMTilesProtocol()) return { style: style, bases: {} };
    if (cfg.server && cfg.server.glyphs) style.glyphs = cfg.server.glyphs;
    var bases = { map: [], terrain: [], imagery: [] };
    style.sources.basemap = { type: "vector", url: "pmtiles://" + bm.proxyUrl, attribution: bm.attribution || "" };
    (cfg.bases || []).forEach(function (base) {
      if (base.id === "imagery" && base.pmtiles && base.pmtiles.proxyUrl) {
        style.sources["base-imagery"] = { type: "raster", url: "pmtiles://" + base.pmtiles.proxyUrl, tileSize: 256, attribution: base.attribution || "" };
      }
      if (base.id === "terrain" && base.hillshade && base.hillshade.pmtiles) {
        style.sources["base-hillshade"] = { type: "raster", url: "pmtiles://" + base.hillshade.pmtiles.proxyUrl, tileSize: 256, attribution: base.hillshade.attribution || "" };
      }
    });
    bm.style.layers.forEach(function (layer) {
      var copy = JSON.parse(JSON.stringify(layer));
      // Labels stay above the hillshade; the imagery base hides the vector fills but keeps labels.
      style.layers.push(copy);
      bases.map.push(copy.id); bases.terrain.push(copy.id);
      if (copy.type === "symbol") bases.imagery.push(copy.id);
    });
    if (style.sources["base-hillshade"]) {
      var firstSymbol = -1;
      for (var i = 0; i < style.layers.length; i++) if (style.layers[i].type === "symbol") { firstSymbol = i; break; }
      var hs = { id: "base-hillshade", type: "raster", source: "base-hillshade", layout: { visibility: "none" }, paint: { "raster-opacity": 0.55 } };
      if (firstSymbol < 0) style.layers.push(hs); else style.layers.splice(firstSymbol, 0, hs);
      bases.terrain.push("base-hillshade");
    }
    if (style.sources["base-imagery"]) {
      style.layers.splice(1, 0, { id: "base-imagery", type: "raster", source: "base-imagery", layout: { visibility: "none" }, paint: { "raster-opacity": 1 } });
      bases.imagery.push("base-imagery");
    }
    return { style: style, bases: bases };
  }

  function wireBaseSwitch(map, bases) {
    var wrap = el("gp-bases");
    if (!wrap) return;
    var ids = Object.keys(bases).filter(function (k) { return k === "map" || bases[k].indexOf("base-" + (k === "terrain" ? "hillshade" : k)) !== -1; });
    if (ids.length < 2) { wrap.hidden = true; return; }
    var all = {};
    Object.keys(bases).forEach(function (k) { bases[k].forEach(function (id) { all[id] = true; }); });
    function apply(which) {
      Object.keys(all).forEach(function (id) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", bases[which].indexOf(id) !== -1 ? "visible" : "none");
      });
      var btns = wrap.querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) btns[i].setAttribute("aria-pressed", btns[i].getAttribute("data-base") === which ? "true" : "false");
    }
    var labels = { map: "Map", terrain: "Terrain", imagery: "Imagery" };
    wrap.textContent = "";
    ids.forEach(function (k) {
      var b = document.createElement("button");
      b.type = "button"; b.setAttribute("data-base", k); b.textContent = labels[k];
      b.addEventListener("click", function () { apply(k); });
      wrap.appendChild(b);
    });
    wrap.hidden = false;
    apply("map");
  }

  // The selected process's input layer, drawn live from OGC API Tiles (MVT source-layer "layer").
  function showInputLayer(layerId) {
    if (!state.mapReady) return;
    var layer = state.layers.filter(function (l) { return l.id === layerId; })[0] || null;
    state.mapReady.then(function (map) {
      if (!map) return;
      removeOverlay(map, "gp-input");
      var legend = el("gp-layer-legend");
      if (!layer) { if (legend) legend.hidden = true; return; }
      var tiles = BASE + "/ogc/tiles/collections/" + encodeURIComponent(layer.name) + "/tiles/WebMercatorQuad/{z}/{y}/{x}";
      map.addSource("gp-input", { type: "vector", tiles: [tiles], minzoom: 0, maxzoom: 14, attribution: "Layer: " + layer.name + " · Honua OGC API Tiles" });
      var before = map.getLayer("gp-recorded-fill") ? "gp-recorded-fill" : (map.getLayer("gp-result-fill") ? "gp-result-fill" : undefined);
      var g = String(layer.geometry || "");
      if (/Polygon/i.test(g)) {
        map.addLayer({ id: "gp-input-fill", type: "fill", source: "gp-input", "source-layer": "layer", paint: { "fill-color": "#34d399", "fill-opacity": 0.12 } }, before);
        map.addLayer({ id: "gp-input-line", type: "line", source: "gp-input", "source-layer": "layer", paint: { "line-color": "#34d399", "line-width": 0.8, "line-opacity": 0.8 } }, before);
      } else if (/Line/i.test(g)) {
        map.addLayer({ id: "gp-input-line", type: "line", source: "gp-input", "source-layer": "layer", paint: { "line-color": "#34d399", "line-width": 1.2 } }, before);
      } else {
        map.addLayer({ id: "gp-input-pt", type: "circle", source: "gp-input", "source-layer": "layer", paint: { "circle-radius": 3, "circle-color": "#34d399", "circle-stroke-color": "#0b1622", "circle-stroke-width": 1 } }, before);
      }
      if (legend) { legend.hidden = false; legend.textContent = "Input layer: " + layer.name + " (id " + layer.id + ") · live OGC API Tiles"; }
    });
  }

  function initMap() {
    if (!window.maplibregl) return Promise.resolve(null);
    return loadLayerConfig().then(function (cfg) {
      state.layerConfig = cfg;
      var built = buildStyle(cfg);
      var view = (cfg && cfg.map) || {};
      try {
        var map = new window.maplibregl.Map({
          container: "gp-map",
          style: built.style,
          center: view.center || MAUI_VIEW.center, zoom: view.zoom || MAUI_VIEW.zoom,
          minZoom: view.minZoom, maxZoom: view.maxZoom,
          attributionControl: { compact: true },
        });
        map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), "top-right");
        state.map = map;
        return new Promise(function (resolve) {
          map.on("load", function () {
            wireBaseSwitch(map, built.bases);
            var chip = el("gp-basemap-state");
            if (chip) chip.hidden = !!built.style.sources.basemap;
            resolve(map);
          });
        });
      } catch (_) { return null; }
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function boot() {
    state.mapReady = initMap();
    wireKeyInput();
    refreshKeyState();
    setStatus("boot", "loading process catalog…");
    var recording = loadRecording().then(function (rec) { state.recording = rec; });
    Promise.all([loadCatalog(), loadLayers(), recording])
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

  // Test seam (scripts/demo-geoprocessing-refusal.test.mjs): the response handler, no network.
  window.HonuaGeoprocessingDemo = { handleExecResponse: handleExecResponse, esriPolygonsToGeoJson: esriPolygonsToGeoJson };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

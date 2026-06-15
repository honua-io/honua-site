/*
 * Geoprocessing / OGC API Processes runner — live demo (honua-sdk-js#288/#289).
 *
 * Drives the live OGC API Processes surface on demo.honua.io:
 *   1. GET  /ogc/processes/processes        — list the catalog (anonymous; public)
 *   2. GET  /ogc/processes/processes/{id}    — load a process input schema
 *   3. POST /ogc/processes/processes/{id}/execution
 *        - sync   : 200 with a result document (rendered as GeoJSON / summary)
 *        - async  : 201/202 + a job; poll /ogc/processes/jobs/{jobId} to terminal,
 *                   then GET /ogc/processes/jobs/{jobId}/results
 *        - gated  : 401 (auth/X-API-Key required) or 402 (Pro entitlement) surfaced verbatim
 *
 * Mirrors the OGC Processes job lifecycle from
 * honua-sdk-js/examples/geoprocessing-job-runner (execute -> poll -> results,
 * with explicit unsupported/gated handling). The catalog + schemas are public;
 * execution is admin-key gated on the public demo, and analytics.* are Pro —
 * both are shown honestly rather than mocked.
 *
 * No build step / no web-components: plain maplibre-gl for the result map.
 */
(function () {
  "use strict";

  var BASE = "https://demo.honua.io";
  var PROCESSES_URL = BASE + "/ogc/processes/processes";
  var JOBS_URL = BASE + "/ogc/processes/jobs";
  var MAUI_VIEW = { center: [-156.62, 20.86], zoom: 9 };
  // A Community process that exercises a real layer end-to-end when an exec key is present.
  var DEFAULT_PROCESS = "generalization.simplify-layer";
  var POLL_INTERVAL_MS = 1500;
  var POLL_TIMEOUT_MS = 90000;

  // Sensible live defaults so a submit is one click; layerId targets a seeded Maui service.
  var INPUT_DEFAULTS = {
    layerId: "maui-zoning",
    targetSrid: 3857,
    tolerance: 0.001,
    distance: 100,
    preserveTopology: true,
  };

  var state = { processes: [], selected: null, map: null };

  function el(id) { return document.getElementById(id); }
  function setStatus(s, t) { var n = el("gp-status"); if (n) { n.dataset.state = s; n.textContent = t; } }
  function isPro(id) { return /^analytics\./.test(String(id || "")); }

  function fetchJson(url, opts) {
    return fetch(url, opts).then(function (r) {
      return r.text().then(function (text) {
        var body = null;
        try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
        return { ok: r.ok, status: r.status, statusText: r.statusText, body: body, location: r.headers.get("Location") };
      });
    });
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

  function renderDetail(proc) {
    var pro = isPro(proc.id);
    el("gp-detail-title").innerHTML = escapeHtml(proc.title || proc.id) + " " +
      '<span class="gp-badge ' + (pro ? "pro" : "comm") + '">' + (pro ? "Pro" : "Community") + "</span>";
    el("gp-detail-desc").textContent = proc.description || "";

    var inputs = proc.inputs || {};
    var form = el("gp-inputs");
    form.textContent = "";
    // Show the most relevant inputs first; keep the form compact but real.
    var keys = Object.keys(inputs);
    var primary = keys.filter(function (k) { return INPUT_DEFAULTS[k] !== undefined; });
    var ordered = primary.concat(keys.filter(function (k) { return primary.indexOf(k) === -1; }));

    ordered.forEach(function (key) {
      var def = inputs[key] || {};
      var schema = def.schema || {};
      var field = document.createElement("div");
      field.className = "gp-field";
      var label = document.createElement("label");
      label.textContent = (def.title || key) + (def.description && /required/i.test(def.description) ? " *" : "");
      label.setAttribute("for", "gp-in-" + key);
      field.appendChild(label);

      var input;
      if (schema.type === "boolean") {
        input = document.createElement("select");
        ["true", "false"].forEach(function (v) {
          var o = document.createElement("option"); o.value = v; o.textContent = v; input.appendChild(o);
        });
        input.value = String(INPUT_DEFAULTS[key] !== undefined ? INPUT_DEFAULTS[key] : false);
      } else {
        input = document.createElement("input");
        input.type = (schema.type === "number" || schema.type === "integer") ? "number" : "text";
        if (schema.type === "number") input.step = "any";
        if (INPUT_DEFAULTS[key] !== undefined) input.value = String(INPUT_DEFAULTS[key]);
      }
      input.id = "gp-in-" + key;
      input.setAttribute("data-key", key);
      input.setAttribute("data-type", schema.type || "string");
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
    runBtn.textContent = pro ? "Submit execution (Pro)" : "Submit execution";
    runBtn.onclick = function () { runExecution(proc); };
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

  function runExecution(proc) {
    var runBtn = el("gp-run");
    runBtn.disabled = true;
    var inputs = collectInputs();
    var payload = { inputs: inputs };
    setExecPill("live", "submitting…");
    writeExec("POST " + PROCESSES_URL + "/" + proc.id + "/execution\n\n" + pretty(payload));

    fetchJson(PROCESSES_URL + "/" + encodeURIComponent(proc.id) + "/execution", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Prefer: "respond-async" },
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

    // Entitlement / auth gates — surface honestly.
    if (res.status === 401) {
      setExecPill("gate", "401 · auth required");
      writeExec(header + "Execution requires a server X-API-Key. The public demo exposes the\n" +
        "catalog and schemas anonymously, but not an execution credential, so a live\n" +
        "submit returns 401. This is the real server response:\n\n" + pretty(res.body));
      return;
    }
    if (res.status === 402 || (res.body && /pro|entitle|licen/i.test(JSON.stringify(res.body)) && isPro(proc.id))) {
      setExecPill("gate", "402 · requires Pro");
      writeExec(header + "This is a Pro (analytics.*) process and requires a Pro entitlement.\n\n" + pretty(res.body));
      return;
    }
    if (res.status === 403) {
      setExecPill("gate", "403 · forbidden");
      writeExec(header + (isPro(proc.id) ? "Pro entitlement / permission required.\n\n" : "") + pretty(res.body));
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
    return fetchJson(JOBS_URL + "/" + encodeURIComponent(jobId), { headers: { Accept: "application/json" } })
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
    return fetchJson(JOBS_URL + "/" + encodeURIComponent(jobId) + "/results", { headers: { Accept: "application/json" } })
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
    setStatus("boot", "loading process catalog…");
    loadCatalog()
      .then(function (list) {
        state.processes = list;
        renderCatalog(list);
        var community = list.filter(function (p) { return !isPro(p.id); }).length;
        var pro = list.length - community;
        setStatus("ok", "demo.honua.io · " + list.length + " processes (" + community + " Community · " + pro + " Pro)");
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

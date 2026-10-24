/*
 * endpoints.html: one row per protocol on demo.honua.io, with a live status check.
 *
 * Rows come from data/demo-endpoints.v1.json. Rows that declare a demoServices source take their
 * path from the server's own /demo-services.v1.json at load time, and each row's on/off state comes
 * from /api/v1/capabilities/manifest. Every check is one bounded fetch (8 s AbortController
 * timeout, small GET, Range read, or a single small POST) and the verdict is shown as it came back:
 * nothing is cached and nothing is assumed. A surface a browser cannot reach is labelled
 * "not browser-probeable" instead of guessed.
 *
 * All dynamic text is written with textContent; no data is ever parsed as HTML.
 */
(function () {
  "use strict";

  var DATA_URL = "data/demo-endpoints.v1.json";
  var DEMO_SERVICES_PATH = "/demo-services.v1.json";
  var MANIFEST_PATH = "/api/v1/capabilities/manifest";
  var DEFAULT_TIMEOUT_MS = 8000;

  var LABELS = { pending: "Checking", ok: "Live", warn: "Degraded", bad: "Not live", off: "Off on demo", np: "Not browser-probeable" };

  var state = { data: null, base: "https://demo.honua.io", demoServices: null, manifest: null, rows: [], running: false };

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (name) {
        if (attrs[name] !== undefined && attrs[name] !== null) node.setAttribute(name, attrs[name]);
      });
    }
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function timeoutMs() {
    var t = state.data && state.data.probeTimeoutMs;
    return typeof t === "number" && t > 0 && t <= DEFAULT_TIMEOUT_MS ? t : DEFAULT_TIMEOUT_MS;
  }

  /*
   * One bounded request, body included. consume(r) reads the body; the 8 s timer and the
   * AbortSignal stay armed until consume settles, so a server that sends headers and then stalls
   * the body is still cut off. Resolves with consume's result or rejects with a readable error.
   */
  function boundedFetch(url, init, consume) {
    var controller = new AbortController();
    var limit = timeoutMs();
    var timer = setTimeout(function () { controller.abort(); }, limit);
    var started = performance.now();
    var headersArrived = false;
    var options = Object.assign({ cache: "no-store", mode: "cors", credentials: "omit", signal: controller.signal }, init || {});
    return fetch(url, options).then(function (res) {
      headersArrived = true;
      return consume({ res: res, ms: Math.round(performance.now() - started) });
    }).then(
      function (value) { clearTimeout(timer); return value; },
      function (error) {
        clearTimeout(timer);
        var ms = Math.round(performance.now() - started);
        var message;
        if (controller.signal.aborted) {
          message = "no answer within " + Math.round(limit / 1000) + " s" + (headersArrived ? " (headers arrived, body stalled)" : "");
        } else if (!headersArrived) {
          message = "network or CORS failure (" + ((error && error.message) || error) + ")";
        } else {
          message = "could not read the response (" + ((error && error.message) || error) + ")";
        }
        var wrapped = new Error(message);
        wrapped.ms = ms;
        throw wrapped;
      }
    );
  }

  function readPath(obj, path) {
    if (!path) return obj;
    return path.split(".").reduce(function (value, part) {
      return value === null || value === undefined ? undefined : value[part];
    }, obj);
  }

  function checkJson(json, expect) {
    if (json && typeof json === "object" && json.error && typeof json.error === "object" && json.error.code) {
      var message = json.error.message || "error";
      var details = Array.isArray(json.error.details) && json.error.details.length ? ": " + json.error.details[0] : "";
      return { status: "bad", detail: "GeoServices error " + json.error.code + " behind HTTP 200 (" + message + details + ")" };
    }
    if (!expect) return { status: "ok", detail: "JSON body" };
    if (expect.arrayAt) {
      var arr = readPath(json, expect.arrayAt);
      if (!Array.isArray(arr)) return { status: "warn", detail: "JSON without a " + expect.arrayAt + " array" };
      return { status: arr.length ? "ok" : "warn", detail: expect.arrayAt + ": " + arr.length + (arr.length === 1 ? " entry" : " entries") };
    }
    if (expect.numberAt) {
      var n = readPath(json, expect.numberAt);
      return typeof n === "number"
        ? { status: "ok", detail: expect.numberAt + " = " + (Math.round(n * 100) / 100) }
        : { status: "warn", detail: "JSON without a numeric " + expect.numberAt };
    }
    if (expect.objectAt) {
      var o = readPath(json, expect.objectAt);
      return o && typeof o === "object"
        ? { status: "ok", detail: expect.objectAt + " present" }
        : { status: "warn", detail: "JSON without " + expect.objectAt };
    }
    if (expect.stringAt) {
      var s = readPath(json, expect.stringAt);
      return typeof s === "string" && s
        ? { status: "ok", detail: expect.stringAt + " present" }
        : { status: "warn", detail: "JSON without " + expect.stringAt };
    }
    return { status: "ok", detail: "JSON body" };
  }

  function problemDetail(text) {
    try {
      var j = JSON.parse(text);
      if (j && (j.type || j.detail || j.title)) {
        return [j.type && j.type !== "about:blank" ? j.type : null, j.detail || j.title].filter(Boolean).join(": ");
      }
    } catch (_) { /* not JSON */ }
    return text ? text.slice(0, 160) : "";
  }

  /* A 2xx answer in the wrong format: surface a GeoServices error envelope if that is what it is. */
  function notWhatWasAsked(text, ctype, wanted) {
    try {
      var verdict = checkJson(JSON.parse(text), null);
      if (verdict.status === "bad") return verdict;
    } catch (_) { /* not JSON */ }
    return { status: "bad", detail: "expected " + wanted + ", got " + (ctype || "no content-type") };
  }

  /* Decode a PNG/JPEG and count drawn pixels, so a blank export is not reported as live. */
  function inspectImage(blob) {
    if (typeof createImageBitmap !== "function") return Promise.resolve({ status: "ok", detail: blob.size + " bytes (pixels not inspected)" });
    return createImageBitmap(blob).then(function (bitmap) {
      var w = Math.min(bitmap.width, 256);
      var h = Math.min(bitmap.height, 256);
      var canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, w, h);
      var px = ctx.getImageData(0, 0, w, h).data;
      var drawn = 0;
      var colors = new Set();
      for (var i = 0; i < px.length; i += 4) {
        if (px[i + 3] > 0) {
          drawn += 1;
          if (colors.size < 64) colors.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
        }
      }
      var size = bitmap.width + "x" + bitmap.height;
      if (bitmap.close) bitmap.close();
      if (drawn === 0) return { status: "warn", detail: size + " image is fully transparent" };
      if (colors.size < 2) return { status: "warn", detail: size + " image is a single colour" };
      return { status: "ok", detail: size + " image, " + Math.round((drawn / (w * h)) * 100) + "% drawn" };
    }, function () {
      return { status: "warn", detail: "image did not decode" };
    });
  }

  function parseMcpBody(text) {
    var trimmed = (text || "").trim();
    if (trimmed.charAt(0) === "{") return JSON.parse(trimmed);
    var lines = trimmed.split(/\r?\n/).filter(function (line) { return line.indexOf("data:") === 0; });
    if (!lines.length) throw new Error("no JSON-RPC message in the response");
    return JSON.parse(lines.map(function (line) { return line.slice(5).trim(); }).join(""));
  }

  /* Returns a promise of {status, code, ms, detail}. */
  function runProbe(row) {
    var probe = row.def.probe || { kind: "none" };
    var url = state.base + row.path;
    var kind = probe.kind;

    if (kind === "none") return Promise.resolve({ status: "np", detail: probe.reason || "Not reachable from a browser." });

    var init = {};
    if (kind === "range") init.headers = { Range: "bytes=0-127" };
    if (kind === "post-json") {
      init.method = "POST";
      init.headers = { "Content-Type": "application/json", Accept: "application/geo+json, application/json" };
      init.body = JSON.stringify(probe.body || {});
    }
    if (kind === "mcp") {
      init.method = "POST";
      init.headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
      init.body = JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "honua.io endpoints page", version: "1" } }
      });
    }
    if (kind === "grpc-web") {
      init.method = "POST";
      init.headers = { "Content-Type": "application/grpc-web+proto" };
      init.body = new Uint8Array([0, 0, 0, 0, 0]);
    }

    return boundedFetch(url, init, function (r) {
      var res = r.res;
      var code = res.status;
      var ctype = res.headers.get("content-type") || "";
      var base = { code: code, ms: r.ms };
      if (code === 429) return Object.assign(base, { status: "warn", detail: "rate limited by the demo server; re-run in a minute" });

      if (kind === "grpc-web") {
        return res.arrayBuffer().then(function () {
          var framed = res.ok && ctype.indexOf("application/grpc-web") === 0;
          return Object.assign(base, framed
            ? { status: "ok", detail: "answered with gRPC-Web framing (" + ctype + ")" }
            : { status: "bad", detail: "no gRPC-Web response (content-type " + (ctype || "none") + ")" });
        });
      }

      if (!res.ok) {
        return res.text().then(function (text) {
          return Object.assign(base, { status: "bad", detail: "HTTP " + code + (text ? " " + problemDetail(text) : "") });
        });
      }

      if (kind === "image") {
        if (ctype.indexOf("image/") !== 0) {
          return res.text().then(function (text) {
            return Object.assign(base, notWhatWasAsked(text, ctype, "an image"));
          });
        }
        return res.blob().then(inspectImage).then(function (v) { return Object.assign(base, v); });
      }

      if (kind === "mvt") {
        return res.arrayBuffer().then(function (buf) {
          if (code === 204 || buf.byteLength === 0) return Object.assign(base, { status: "warn", detail: "empty tile (HTTP " + code + ")" });
          var isMvt = ctype.indexOf("vnd.mapbox-vector-tile") >= 0 || ctype.indexOf("x-protobuf") >= 0;
          return Object.assign(base, isMvt
            ? { status: "ok", detail: buf.byteLength + " byte vector tile" }
            : { status: "warn", detail: "tile with content-type " + (ctype || "none") });
        });
      }

      if (kind === "range") {
        return res.arrayBuffer().then(function (buf) {
          var magic = (probe.expect && probe.expect.magic) || "";
          var head = String.fromCharCode.apply(null, new Uint8Array(buf.slice(0, magic.length)));
          if (magic && head !== magic) return Object.assign(base, { status: "bad", detail: "first bytes are not a " + magic + " header" });
          return Object.assign(base, {
            status: code === 206 ? "ok" : "warn",
            detail: code === 206 ? "range read served (" + buf.byteLength + " bytes)" : "header present but Range was ignored (HTTP " + code + ")"
          });
        });
      }

      if (kind === "xml") {
        return res.text().then(function (text) {
          var needle = probe.expect && probe.expect.contains;
          if (!text.trim()) return Object.assign(base, { status: "bad", detail: "HTTP " + code + " with an empty body" });
          if (text.trim().charAt(0) === "{") return Object.assign(base, notWhatWasAsked(text, ctype, "an XML document"));
          return Object.assign(base, needle && text.indexOf(needle) < 0
            ? { status: "warn", detail: "XML without " + needle }
            : { status: "ok", detail: text.length + " byte XML document" + (needle ? " with " + needle : "") });
        });
      }

      if (kind === "mcp") {
        return res.text().then(function (text) {
          var msg = parseMcpBody(text);
          var info = msg && msg.result && msg.result.serverInfo;
          return Object.assign(base, info
            ? { status: "ok", detail: "initialize answered by " + info.name + " (protocol " + msg.result.protocolVersion + ")" }
            : { status: "warn", detail: msg && msg.error ? "JSON-RPC error " + msg.error.code + ": " + msg.error.message : "no serverInfo in the reply" });
        });
      }

      return res.text().then(function (text) {
        var json;
        try { json = JSON.parse(text); } catch (_) {
          return Object.assign(base, { status: "warn", detail: "expected JSON, got " + (ctype || "no content-type") });
        }
        return Object.assign(base, checkJson(json, probe.expect));
      });
    }).catch(function (error) {
      return { status: "bad", code: "ERR", ms: error && error.ms, detail: (error && error.message) || String(error) };
    });
  }

  /* ---- manifests ---------------------------------------------------------------------------- */

  function fetchJson(path) {
    return boundedFetch(state.base + path, { headers: { Accept: "application/json" } }, function (r) {
      if (!r.res.ok) throw new Error("HTTP " + r.res.status);
      return r.res.json();
    });
  }

  function manifestState(id) {
    var m = state.manifest;
    if (!m) return null;
    var caps = Array.isArray(m.capabilities) ? m.capabilities : [];
    for (var i = 0; i < caps.length; i += 1) if (caps[i].id === id) return caps[i];
    if (id.indexOf("transport.") === 0) {
      var items = (m.transports && m.transports.items) || [];
      var tid = id.slice("transport.".length);
      for (var j = 0; j < items.length; j += 1) if (items[j].id === tid) return items[j];
    }
    return null;
  }

  function resolveFromDemoServices(def) {
    var src = def.source && def.source.demoServices;
    if (!src) return null;
    var services = state.demoServices && Array.isArray(state.demoServices.services) ? state.demoServices.services : null;
    if (!services) return { path: def.example, note: "demo-services.v1.json unavailable; committed path shown" };
    var withProtocol = services.filter(function (s) { return s.protocols && s.protocols[src.protocol]; });
    var service = withProtocol.filter(function (s) { return s.id === src.service; })[0] || withProtocol[0];
    if (!service) return { path: def.example, note: "demo-services.v1.json no longer lists " + src.protocol + "; committed path shown" };
    var value = service.protocols[src.protocol][src.field];
    if (typeof value !== "string" || value.charAt(0) !== "/") return { path: def.example, note: "demo-services.v1.json has no " + src.field + " for " + src.protocol };
    if (src.tile) {
      value = value.replace("{z}", src.tile.z).replace("{x}", src.tile.x).replace("{y}", src.tile.y);
    }
    var count = withProtocol.length;
    return {
      path: value + (src.suffix || ""),
      note: "Path from demo-services.v1.json (" + service.id + "); " + count + (count === 1 ? " service exposes " : " services expose ") + src.protocol + "."
    };
  }

  /* ---- rendering ---------------------------------------------------------------------------- */

  function setStatus(row, verdict) {
    row.verdict = verdict;
    row.pill.setAttribute("data-status", verdict.status);
    row.pill.textContent = LABELS[verdict.status] || verdict.status;
    var bits = [];
    if (verdict.code !== undefined && verdict.code !== null) bits.push(verdict.code === "ERR" ? "no response" : "HTTP " + verdict.code);
    if (typeof verdict.ms === "number") bits.push(verdict.ms + " ms");
    if (verdict.detail) bits.push(verdict.detail);
    row.detail.textContent = bits.join(" · ");
    if (row.gapCheck) row.gapCheck.textContent = gapRecheckText(row);
  }

  function gapRecheckText(row) {
    var v = row.verdict;
    if (!v || v.status === "pending") return "This page's check: running.";
    if (v.status === "np") return "This page's check: not browser-probeable (" + v.detail + ").";
    var stillOff = v.status === "bad" || v.status === "off" || v.status === "warn";
    return stillOff
      ? "This page's check, just now: still not live (" + row.detail.textContent + ")."
      : "This page's check, just now: answering (" + row.detail.textContent + "). This list is out of date for this row.";
  }

  function copyText(text, button) {
    function done(label) {
      button.textContent = label;
      setTimeout(function () { button.textContent = "Copy URL"; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done("Copied"); }, function () { done("Select and copy"); });
    } else {
      done("Select and copy");
    }
  }

  function renderRow(def, tbody) {
    var tr = el("tr", { id: "ep-" + def.id });
    var resolved = resolveFromDemoServices(def);
    var path = resolved ? resolved.path : def.example;
    var isTarget = Boolean(def.exampleIsTarget);
    var fullUrl = isTarget ? def.example : state.base + path;

    var th = el("th", { scope: "row" }, def.title);
    if (def.method && def.method !== "GET") {
      th.appendChild(el("br"));
      th.appendChild(el("span", { class: "ep-method" }, def.method));
    }
    tr.appendChild(th);

    var keysTd = el("td", { "data-label": "Capability keys" });
    var keys = el("div", { class: "ep-keys" });
    (def.capabilityKeys || []).forEach(function (key) { keys.appendChild(el("code", { class: "ep-key" }, key)); });
    (def.manifestIds || []).forEach(function (id) {
      if ((def.capabilityKeys || []).indexOf(id) < 0) keys.appendChild(el("code", { class: "ep-key" }, id));
    });
    keysTd.appendChild(keys);
    if (def.keyNote) keysTd.appendChild(el("span", { class: "ep-meta" }, def.keyNote));
    var manifestLine = el("span", { class: "ep-meta" });
    keysTd.appendChild(manifestLine);
    tr.appendChild(keysTd);

    var urlTd = el("td", { class: "ep-url-cell", "data-label": "Example URL" });
    urlTd.appendChild(el("code", { class: "ep-url" }, fullUrl));
    var copy = el("button", { type: "button", class: "ep-copy", "aria-label": "Copy the " + def.title + " URL" }, "Copy URL");
    copy.addEventListener("click", function () { copyText(fullUrl, copy); });
    urlTd.appendChild(copy);
    if (resolved && resolved.note) urlTd.appendChild(el("span", { class: "ep-meta" }, resolved.note));
    if (def.note) urlTd.appendChild(el("span", { class: "ep-meta" }, def.note));
    var contractLine = null;
    var contract = state.demoServices && state.demoServices.releaseContracts && state.demoServices.releaseContracts[def.id];
    if (contract && contract.status) {
      contractLine = el("span", { class: "ep-meta" }, "Demo manifest release contract for " + def.id + ": " + contract.status + ".");
      urlTd.appendChild(contractLine);
    }
    tr.appendChild(urlTd);

    tr.appendChild(el("td", { "data-label": "Client" }, (def.clients || []).join(", ")));

    var usedTd = el("td", { "data-label": "Used by" });
    if (def.usedBy && def.usedBy.href) {
      var external = /^https:\/\//.test(def.usedBy.href);
      var link = el("a", external ? { href: def.usedBy.href, target: "_blank", rel: "noopener noreferrer" } : { href: def.usedBy.href }, def.usedBy.label);
      if (external) link.appendChild(document.createTextNode(" ↗"));
      usedTd.appendChild(link);
    }
    tr.appendChild(usedTd);

    var statusTd = el("td", { class: "ep-status-cell", "data-label": "Status" });
    var pill = el("span", { class: "ep-pill", "data-status": "pending" }, LABELS.pending);
    var detail = el("span", { class: "ep-detail" });
    statusTd.appendChild(pill);
    statusTd.appendChild(detail);
    tr.appendChild(statusTd);

    tbody.appendChild(tr);
    return { def: def, path: path, pill: pill, detail: detail, manifestLine: manifestLine, verdict: null, gapCheck: null };
  }

  function renderFamilies() {
    var host = document.getElementById("ep-families");
    host.replaceChildren();
    var protocols = state.data.demoServicesProtocols || [];
    if (state.demoServices && Array.isArray(state.demoServices.services)) {
      var seen = new Set();
      state.demoServices.services.forEach(function (s) { Object.keys(s.protocols || {}).forEach(function (p) { seen.add(p); }); });
      var unmapped = Array.from(seen).filter(function (p) { return protocols.indexOf(p) < 0; });
      if (unmapped.length) {
        host.appendChild(el("p", { class: "ep-banner", role: "note" },
          "demo-services.v1.json lists protocols this page has no row for yet: " + unmapped.join(", ") + "."));
      }
    } else {
      host.appendChild(el("p", { class: "ep-banner", role: "note" },
        "Could not read demo-services.v1.json from demo.honua.io, so manifest-derived rows show their committed paths."));
    }

    state.rows = [];
    state.data.families.forEach(function (family) {
      var defs = state.data.endpoints.filter(function (e) { return e.family === family.id; });
      if (!defs.length) return;
      var section = el("section", { class: "ep-family", id: family.id, "aria-labelledby": family.id + "-heading" });
      section.appendChild(el("h2", { id: family.id + "-heading" }, family.title));
      if (family.blurb) section.appendChild(el("p", null, family.blurb));
      var scroll = el("div", { class: "ep-scroll", tabindex: "0", role: "region", "aria-label": family.title + " endpoints (scrollable)" });
      var table = el("table", { class: "ep-table" });
      table.appendChild(el("caption", { class: "sr-only" }, family.title + ": one row per surface on demo.honua.io"));
      var thead = el("thead");
      var hr = el("tr");
      ["Surface", "Capability keys", "Example URL", "Client", "Used by", "Status"].forEach(function (label) {
        hr.appendChild(el("th", { scope: "col" }, label));
      });
      thead.appendChild(hr);
      table.appendChild(thead);
      var tbody = el("tbody");
      defs.forEach(function (def) { state.rows.push(renderRow(def, tbody)); });
      table.appendChild(tbody);
      scroll.appendChild(table);
      section.appendChild(scroll);
      host.appendChild(section);
    });
  }

  function renderGaps() {
    var advertised = document.getElementById("ep-gaps-advertised");
    var disabled = document.getElementById("ep-gaps-disabled");
    advertised.replaceChildren();
    disabled.replaceChildren();
    state.rows.forEach(function (row) {
      var def = row.def;
      if (def.expectation !== "gap" && def.expectation !== "disabled") return;
      var li = el("li");
      var title = el("a", { href: "#ep-" + def.id });
      title.appendChild(el("strong", null, def.title));
      li.appendChild(title);
      li.appendChild(document.createTextNode(" "));
      li.appendChild(el("code", null, (def.capabilityKeys || []).concat(def.manifestIds || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(", ")));
      if (def.gap) {
        li.appendChild(el("p", null, def.gap.reason));
        var observed = el("p");
        observed.appendChild(document.createTextNode("Recorded " + state.data.observedAt + ": "));
        observed.appendChild(el("code", null, def.gap.observed));
        li.appendChild(observed);
      }
      row.gapCheck = el("p", null, "This page's check: running.");
      li.appendChild(row.gapCheck);
      // Group by the live manifest where it has an answer, the committed expectation otherwise.
      var live = liveOffState(row);
      var switchedOff = live.fromManifest ? live.off : def.expectation === "disabled";
      (switchedOff ? disabled : advertised).appendChild(li);
    });
    document.getElementById("ep-observed").textContent =
      "Gap evidence was recorded against demo.honua.io at " + state.data.observedAt + ". The status column and the check lines above are live.";
  }

  function applyManifest() {
    state.rows.forEach(function (row) {
      var ids = row.def.manifestIds || [];
      if (!ids.length) { row.manifestLine.textContent = ""; return; }
      if (!state.manifest) { row.manifestLine.textContent = "Capability manifest unavailable."; return; }
      row.manifestLine.textContent = ids.map(function (id) {
        var entry = manifestState(id);
        if (!entry) return id + ": not in manifest";
        return id + ": " + (entry.available ? "available" : "off (" + (entry.reasonCode || "unavailable") + ")");
      }).join("; ");
    });
  }

  /*
   * The live manifest decides whether a surface is switched off: true when every manifest entry
   * the row names reports available:false, false when any reports available:true. Only when the
   * manifest is unreachable or names none of the row's ids does the committed expectation stand in.
   */
  function liveOffState(row) {
    var entries = (row.def.manifestIds || []).map(manifestState).filter(Boolean);
    if (entries.length) return { off: entries.every(function (e) { return e.available === false; }), fromManifest: true, entries: entries };
    return { off: row.def.expectation === "disabled", fromManifest: false, entries: [] };
  }

  function interpret(row, verdict) {
    var live = liveOffState(row);
    var reason = live.entries.map(function (e) { return e.reasonCode; }).filter(Boolean)[0];
    if (live.off && (verdict.status === "bad" || verdict.status === "np")) {
      var source = live.fromManifest ? "manifest: " + (reason || "unavailable") : "manifest unavailable; committed expectation: disabled";
      return Object.assign({}, verdict, { status: "off", detail: source + "; " + verdict.detail });
    }
    if (live.fromManifest && !live.off && row.def.expectation === "disabled" && (verdict.status === "bad" || verdict.status === "np")) {
      // Enabled on the server but not answering: advertised, not switched off.
      return Object.assign({}, verdict, { detail: "manifest reports available, but " + verdict.detail });
    }
    return verdict;
  }

  function runAll() {
    if (state.running) return;
    state.running = true;
    var button = document.getElementById("ep-rerun");
    var summary = document.getElementById("ep-summary");
    button.disabled = true;
    summary.textContent = "Reading the demo manifests…";

    Promise.all([
      fetchJson(DEMO_SERVICES_PATH).catch(function () { return null; }),
      fetchJson(MANIFEST_PATH).catch(function () { return null; })
    ]).then(function (results) {
      state.demoServices = results[0];
      state.manifest = results[1];
      renderFamilies();
      renderGaps();
      applyManifest();
      state.rows.forEach(function (row) { setStatus(row, { status: "pending" }); });

      var queue = state.rows.slice();
      var total = queue.length;
      var finished = 0;
      var counts = { ok: 0, warn: 0, bad: 0, off: 0, np: 0 };
      function report(final) {
        summary.textContent = (final ? "" : "Checked " + finished + " of " + total + ": ") +
          counts.ok + " live · " + counts.warn + " degraded · " + counts.bad + " not live · " +
          counts.off + " off on demo · " + counts.np + " not browser-probeable" +
          (final ? " (" + total + " surfaces, " + new Date().toLocaleTimeString() + ")" : "");
      }
      function worker() {
        var row = queue.shift();
        if (!row) return Promise.resolve();
        return runProbe(row).then(function (verdict) {
          var v = interpret(row, verdict);
          setStatus(row, v);
          counts[v.status] = (counts[v.status] || 0) + 1;
          finished += 1;
          report(false);
        }).then(worker);
      }
      var lanes = Math.max(1, Math.min(state.data.probeConcurrency || 6, 6));
      var workers = [];
      for (var i = 0; i < lanes; i += 1) workers.push(worker());
      return Promise.all(workers).then(function () { report(true); });
    }).catch(function (error) {
      summary.textContent = "Checks stopped: " + ((error && error.message) || error);
    }).then(function () {
      state.running = false;
      button.disabled = false;
    });
  }

  function init() {
    var summary = document.getElementById("ep-summary");
    fetch(DATA_URL, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status + " for " + DATA_URL);
      return res.json();
    }).then(function (data) {
      state.data = data;
      if (typeof data.baseUrl === "string" && /^https:\/\/demo\.honua\.io$/.test(data.baseUrl)) state.base = data.baseUrl;
      document.getElementById("ep-rerun").addEventListener("click", runAll);
      runAll();
    }).catch(function (error) {
      summary.textContent = "Could not load the endpoint list: " + ((error && error.message) || error);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

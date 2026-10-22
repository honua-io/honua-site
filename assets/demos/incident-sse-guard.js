/*
 * The published incident-dashboard bundle dispatches every EventSource payload
 * through `payload.trim()`. Its default event list includes "error", which is
 * also the browser's native connection-error event and has no data, so the
 * listener throws. On the live lane its reconnect and refresh controls are
 * no-ops. This script runs before that bundle: it drops events that are not
 * string data (and comment/retry lines), and the Reconnect and Refresh clicks
 * reopen the current stream instead of reaching those no-ops.
 */
(function (scope) {
  "use strict";

  var OPERATIONAL_CONTROL_IDS = ["reconnect-stream", "manual-refresh"];
  var SCENARIO_ONLY_TITLE = "Scenario controls are available only in deterministic lanes.";
  var RESUME_PARAMS = ["cursor", "watermark", "timestamp", "deltaToken", "sequence"];
  var openStreams = [];

  function ssePayloadText(data) {
    if (typeof data !== "string") return undefined;
    var trimmed = data.trim();
    if (trimmed === "") return "";
    if (isCommentOrRetryOnly(trimmed)) return undefined;
    return data;
  }

  function isCommentOrRetryOnly(trimmed) {
    var lines = trimmed.split(/\r?\n/);
    for (var index = 0; index < lines.length; index += 1) {
      var line = lines[index];
      if (line === "" || line.charAt(0) === ":") continue;
      var colon = line.indexOf(":");
      var field = (colon === -1 ? line : line.slice(0, colon)).trim().toLowerCase();
      if (field === "retry") continue;
      return false;
    }
    return true;
  }

  function shouldForwardSseEvent(event) {
    if (!event || typeof event !== "object") return false;
    return ssePayloadText(event.data) !== undefined;
  }

  function releaseOperationalControls(doc) {
    if (!doc || typeof doc.getElementById !== "function") return;
    for (var index = 0; index < OPERATIONAL_CONTROL_IDS.length; index += 1) {
      var button = doc.getElementById(OPERATIONAL_CONTROL_IDS[index]);
      if (!button) continue;
      if (button.disabled) button.disabled = false;
      if (button.title === SCENARIO_ONLY_TITLE) button.title = "";
    }
  }

  function viewUrl(url) {
    var URLCtor = scope.URL;
    if (typeof URLCtor !== "function") return url;
    var absolute = typeof url === "string" && (url.indexOf("http://") === 0 || url.indexOf("https://") === 0);
    var parsed;
    try {
      parsed = absolute ? new URLCtor(url) : new URLCtor(url, "http://honua.local");
    } catch (error) {
      return url;
    }
    for (var index = 0; index < RESUME_PARAMS.length; index += 1) parsed.searchParams.delete(RESUME_PARAMS[index]);
    if (absolute) return parsed.toString();
    return parsed.pathname + parsed.search + parsed.hash;
  }

  function detach(record) {
    var inner = record.inner;
    inner.onopen = null;
    inner.onmessage = null;
    inner.onerror = null;
    for (var index = 0; index < record.listeners.length; index += 1) {
      var entry = record.listeners[index];
      inner.removeEventListener(entry.type, entry.wrapped, entry.options);
    }
  }

  function attach(record) {
    var inner = record.inner;
    inner.onopen = record.onopen;
    inner.onmessage = record.onmessage;
    inner.onerror = record.onerror;
    for (var index = 0; index < record.listeners.length; index += 1) {
      var entry = record.listeners[index];
      inner.addEventListener(entry.type, entry.wrapped, entry.options);
    }
  }

  function reopen(record, freshView) {
    if (record.closed) return;
    detach(record);
    try {
      record.inner.close();
    } catch (error) {
      /* The replacement socket is what the page keeps. */
    }
    var nextUrl = freshView ? viewUrl(record.url) : record.url;
    record.url = nextUrl;
    record.inner = new record.Native(nextUrl, record.init);
    attach(record);
  }

  function replayStreams(freshView) {
    for (var index = 0; index < openStreams.length; index += 1) reopen(openStreams[index], freshView);
  }

  function stopBundleClick(event, action) {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    if (event && typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    action();
  }

  function bindOperationalActions(doc) {
    if (!doc || typeof doc.getElementById !== "function") return;
    var reconnect = doc.getElementById("reconnect-stream");
    var refresh = doc.getElementById("manual-refresh");
    if (reconnect && !reconnect.__honuaLiveAction && typeof reconnect.addEventListener === "function") {
      reconnect.__honuaLiveAction = true;
      reconnect.addEventListener(
        "click",
        function (event) {
          stopBundleClick(event, function () {
            replayStreams(false);
          });
        },
        true,
      );
    }
    if (refresh && !refresh.__honuaLiveAction && typeof refresh.addEventListener === "function") {
      refresh.__honuaLiveAction = true;
      refresh.addEventListener(
        "click",
        function (event) {
          stopBundleClick(event, function () {
            replayStreams(true);
          });
        },
        true,
      );
    }
  }

  function createStream(Native, url, init) {
    var record = {
      Native: Native,
      url: url,
      init: init,
      inner: new Native(url, init),
      listeners: [],
      onopen: null,
      onmessage: null,
      onerror: null,
      closed: false,
    };
    openStreams.push(record);
    var facade = {
      get url() {
        return record.url;
      },
      get readyState() {
        return record.inner.readyState;
      },
      close: function () {
        if (record.closed) return;
        record.closed = true;
        var index = openStreams.indexOf(record);
        if (index >= 0) openStreams.splice(index, 1);
        detach(record);
        record.inner.close();
      },
      addEventListener: function (type, listener, options) {
        if (typeof listener !== "function") return record.inner.addEventListener(type, listener, options);
        var wrapped = function (event) {
          if (!shouldForwardSseEvent(event)) return undefined;
          return listener.call(this, event);
        };
        record.listeners.push({ type: type, listener: listener, wrapped: wrapped, options: options });
        record.inner.addEventListener(type, wrapped, options);
        return undefined;
      },
      removeEventListener: function (type, listener, options) {
        var wrapped = listener;
        record.listeners = record.listeners.filter(function (entry) {
          var drop = entry.type === type && entry.listener === listener;
          if (drop) wrapped = entry.wrapped;
          return !drop;
        });
        record.inner.removeEventListener(type, wrapped, options);
      },
    };
    function setHandler(name, filter) {
      Object.defineProperty(facade, name, {
        configurable: true,
        enumerable: true,
        get: function () {
          return record[name];
        },
        set: function (listener) {
          record[name] =
            filter && typeof listener === "function"
              ? function (event) {
                  if (!shouldForwardSseEvent(event)) return undefined;
                  return listener.call(this, event);
                }
              : listener;
          record.inner[name] = record[name];
        },
      });
    }
    setHandler("onopen", false);
    setHandler("onmessage", true);
    setHandler("onerror", false);
    return facade;
  }

  function install(target) {
    var host = target || scope;
    var doc = host.document;
    releaseOperationalControls(doc);
    bindOperationalActions(doc);
    if (typeof host.MutationObserver === "function" && doc && doc.body) {
      var observer = new host.MutationObserver(function () {
        releaseOperationalControls(doc);
      });
      observer.observe(doc.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ["disabled", "title"],
      });
    }
    var Native = host.EventSource;
    if (typeof Native !== "function" || Native.__honuaIncidentSseGuard) return;
    function GuardedEventSource(url, init) {
      if (!new.target) {
        throw new TypeError("Failed to construct 'EventSource': Please use the 'new' operator.");
      }
      return createStream(Native, url, init);
    }
    GuardedEventSource.prototype = Native.prototype;
    if ("CONNECTING" in Native) GuardedEventSource.CONNECTING = Native.CONNECTING;
    if ("OPEN" in Native) GuardedEventSource.OPEN = Native.OPEN;
    if ("CLOSED" in Native) GuardedEventSource.CLOSED = Native.CLOSED;
    GuardedEventSource.__honuaIncidentSseGuard = true;
    host.EventSource = GuardedEventSource;
  }

  scope.HonuaIncidentSseGuard = {
    OPERATIONAL_CONTROL_IDS: OPERATIONAL_CONTROL_IDS,
    SCENARIO_ONLY_TITLE: SCENARIO_ONLY_TITLE,
    ssePayloadText: ssePayloadText,
    shouldForwardSseEvent: shouldForwardSseEvent,
    releaseOperationalControls: releaseOperationalControls,
    viewUrl: viewUrl,
    install: install,
  };

  if (scope.document && scope.document.getElementById && scope.document.getElementById("reconnect-stream")) {
    install(scope);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

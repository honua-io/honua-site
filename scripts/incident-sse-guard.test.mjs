import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../assets/demos/incident-sse-guard.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../demo-public-safety.html", import.meta.url), "utf8");

function legacyDispatch(payload) {
  if (payload.trim() === "") return "empty";
  return payload;
}

const openedSources = [];

class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  constructor(url, init) {
    this.url = url;
    this.init = init;
    this.listeners = new Map();
    this._onmessage = null;
    this.onopen = null;
    this.onerror = null;
    this.closed = false;
    this.readyState = 0;
    openedSources.push(this);
  }

  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type, listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
    );
  }

  close() {
    this.closed = true;
    this.readyState = 2;
  }

  emit(type, event) {
    if (type === "message" && this.onmessage) this.onmessage(event);
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    if (type === "error" && this.onerror) this.onerror(event);
  }
}

Object.defineProperty(FakeEventSource.prototype, "onmessage", {
  configurable: true,
  enumerable: true,
  get() {
    return this._onmessage;
  },
  set(value) {
    this._onmessage = value;
  },
});

function loadGuard(buttons, observers) {
  class RecordingObserver {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }

    observe() {}
  }

  const sandbox = {
    URL,
    document: {
      body: {},
      getElementById(id) {
        return buttons[id] ?? null;
      },
    },
    EventSource: FakeEventSource,
    MutationObserver: RecordingObserver,
  };
  const context = createContext(sandbox);
  runInContext(source, context);
  return context;
}

test("representative SSE events no longer throw on trim or leave operational buttons disabled", () => {
  const title = "Scenario controls are available only in deterministic lanes.";
  const buttons = {
    "reconnect-stream": { disabled: true, title },
    "manual-refresh": { disabled: true, title },
    "step-event": { disabled: true, title },
  };
  const observers = [];
  const context = loadGuard(buttons, observers);
  const api = context.HonuaIncidentSseGuard;

  assert.equal(buttons["reconnect-stream"].disabled, false);
  assert.equal(buttons["manual-refresh"].disabled, false);
  assert.equal(buttons["reconnect-stream"].title, "");
  assert.equal(buttons["step-event"].disabled, true, "scenario-only controls stay disabled");

  const crashing = [
    { name: "missing data", event: { type: "error" } },
    { name: "undefined data", event: { data: undefined } },
    { name: "null data", event: { data: null } },
    { name: "non-string object", event: { data: { type: "heartbeat" } } },
    { name: "non-string number", event: { data: 1 } },
  ];
  const ignoredText = [
    { name: "comment line", event: { data: ": keep-alive" } },
    { name: "retry line", event: { data: "retry: 3000" } },
    { name: "comment and retry block", event: { data: ": ping\nretry: 1500\n" } },
  ];

  for (const sample of crashing) {
    assert.throws(() => legacyDispatch(sample.event.data), TypeError, sample.name);
    assert.equal(api.shouldForwardSseEvent(sample.event), false, sample.name);
  }
  for (const sample of ignoredText) {
    assert.doesNotThrow(() => legacyDispatch(sample.event.data), sample.name);
    assert.equal(api.shouldForwardSseEvent(sample.event), false, sample.name);
  }

  const accepted = [];
  const before = openedSources.length;
  const sourceEvents = new context.EventSource("/api/v1/streaming/features");
  const inner = openedSources[before];
  let errorEvents = 0;
  sourceEvents.onmessage = (event) => {
    accepted.push(legacyDispatch(event.data));
  };
  sourceEvents.addEventListener("error", (event) => {
    accepted.push(legacyDispatch(event.data));
  });
  sourceEvents.onerror = () => {
    errorEvents += 1;
  };

  inner.emit("error", { type: "error" });
  inner.emit("message", { data: undefined });
  inner.emit("message", { data: null });
  inner.emit("message", { data: { type: "status" } });
  inner.emit("message", { data: ": keep-alive" });
  inner.emit("message", { data: "retry: 3000" });
  inner.emit("message", { data: "" });
  inner.emit("message", { data: '{"type":"heartbeat"}' });
  inner.emit("error", { data: '{"type":"error","code":"transport-gap"}' });

  assert.equal(errorEvents, 2);
  assert.deepEqual(accepted, ["empty", '{"type":"heartbeat"}', '{"type":"error","code":"transport-gap"}']);
  assert.equal(buttons["reconnect-stream"].disabled, false);
  assert.equal(buttons["manual-refresh"].disabled, false);

  buttons["reconnect-stream"].disabled = true;
  buttons["manual-refresh"].disabled = true;
  buttons["reconnect-stream"].title = title;
  buttons["manual-refresh"].title = title;
  observers[0].callback();
  assert.equal(buttons["reconnect-stream"].disabled, false);
  assert.equal(buttons["manual-refresh"].disabled, false);
  assert.equal(buttons["step-event"].disabled, true);
});

function clickable(disabled = false) {
  const handlers = { capture: [], bubble: [] };
  return {
    disabled,
    title: "",
    __honuaLiveAction: false,
    addEventListener(type, listener, capture) {
      if (type !== "click") return;
      (capture === true ? handlers.capture : handlers.bubble).push(listener);
    },
    click() {
      const event = {
        prevented: false,
        stopped: false,
        preventDefault() {
          this.prevented = true;
        },
        stopImmediatePropagation() {
          this.stopped = true;
        },
      };
      for (const listener of handlers.capture) {
        listener(event);
        if (event.stopped) return { event, bubble: false };
      }
      for (const listener of handlers.bubble) {
        listener(event);
        if (event.stopped) return { event, bubble: false };
      }
      return { event, bubble: true };
    },
  };
}

test("reconnect and refresh reopen the current stream and do not reach the bundle no-op", () => {
  const buttons = {
    "reconnect-stream": clickable(true),
    "manual-refresh": clickable(true),
    "step-event": clickable(true),
  };
  const context = loadGuard(buttons, []);
  const url = "/api/v1/streaming/features?serviceId=maui-incidents&layers=0&cursor=stale-cursor";
  const before = openedSources.length;
  const stream = new context.EventSource(url, { withCredentials: false });
  const first = openedSources[before];
  let messages = 0;
  let bundleClicks = 0;
  stream.onmessage = () => {
    messages += 1;
  };
  for (const button of [buttons["reconnect-stream"], buttons["manual-refresh"]]) {
    button.addEventListener("click", () => {
      bundleClicks += 1;
    });
  }

  const reconnected = buttons["reconnect-stream"].click();
  assert.equal(reconnected.event.stopped, true);
  assert.equal(bundleClicks, 0);
  assert.equal(first.closed, true);
  assert.equal(openedSources.at(-1).url, url);
  assert.notEqual(openedSources.at(-1), first);
  openedSources.at(-1).emit("message", { data: '{"type":"snapshot"}' });
  assert.equal(messages, 1);

  const refreshed = buttons["manual-refresh"].click();
  assert.equal(refreshed.event.stopped, true);
  assert.equal(bundleClicks, 0);
  assert.equal(openedSources.at(-2).closed, true);
  assert.equal(
    openedSources.at(-1).url,
    "/api/v1/streaming/features?serviceId=maui-incidents&layers=0",
  );
  assert.equal(openedSources.at(-1).init.withCredentials, false);
  openedSources.at(-1).emit("message", { data: '{"type":"snapshot"}' });
  assert.equal(messages, 2);
  assert.equal(context.HonuaIncidentSseGuard.viewUrl(url), openedSources.at(-1).url);
});

test("demo-public-safety.html installs the guard after the stream controls exist", () => {
  const guardAt = page.indexOf('src="/assets/demos/incident-sse-guard.js"');
  const bundleAt = page.indexOf("realtime-incident-dashboard/assets/index-BbVEb41S.js");
  assert.ok(guardAt > page.indexOf('id="reconnect-stream"'));
  assert.ok(guardAt > page.indexOf('id="manual-refresh"'));
  assert.ok(guardAt > bundleAt);
  assert.ok(guardAt < page.lastIndexOf("</body>"));
  assert.match(page, /<script src="\/assets\/demos\/incident-sse-guard\.js"><\/script>/);
  assert.doesNotMatch(page.slice(Math.max(0, guardAt - 40), guardAt), /defer|type="module"/);
});

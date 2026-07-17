#!/usr/bin/env node

import { accessSync, constants, createReadStream, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function executable(path) {
  if (!path) return false;
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function browserCandidates() {
  const candidates = [
    process.env.HONUA_CHROME_BIN,
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (existsSync(cache)) {
    for (const entry of readdirSync(cache).sort().reverse()) {
      if (!entry.startsWith("chromium")) continue;
      candidates.push(
        join(cache, entry, "chrome-linux64", "chrome"),
        join(cache, entry, "chrome-linux", "chrome"),
        join(cache, entry, "chrome-headless-shell-linux64", "chrome-headless-shell"),
        join(cache, entry, "chrome-headless-shell-linux", "headless_shell"),
      );
    }
  }
  return candidates.filter(Boolean);
}

function findBrowser() {
  const browser = browserCandidates().find(executable);
  invariant(browser, "No Chrome/Chromium executable found; set HONUA_CHROME_BIN");
  return browser;
}

function parseArguments(argv) {
  let projectRoot;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--project") projectRoot = argv[++index];
    else throw new Error(`Unknown browser smoke argument: ${argv[index]}`);
  }
  invariant(projectRoot, "Browser smoke requires --project <built-site-directory>");
  const canonical = resolve(projectRoot);
  invariant(existsSync(canonical) && statSync(canonical).isDirectory(), "Built site directory is missing");
  invariant(existsSync(join(canonical, "samples", "index.html")), "Built SDK gallery index is missing");
  return canonical;
}

function staticServer(root) {
  const server = createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }
    const candidate = resolve(root, `.${pathname}`);
    if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const file = existsSync(candidate) && statSync(candidate).isDirectory() ? join(candidate, "index.html") : candidate;
    if (!existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
    });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolvePromise(server));
  });
}

function cdpConnection(child, diagnostics) {
  const input = child.stdio[3];
  const output = child.stdio[4];
  invariant(input && output, "Chrome debugging pipe did not open");
  let nextId = 1;
  let buffer = Buffer.alloc(0);
  const pending = new Map();
  const eventWaiters = [];

  function settleMessage(message) {
    if (message.id !== undefined) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(`CDP ${request.method}: ${message.error.message}`));
      else request.resolve(message.result ?? {});
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      diagnostics.push(message.params?.exceptionDetails?.text ?? "Runtime exception");
    } else if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
      diagnostics.push(message.params.entry.text);
    }
    for (let index = 0; index < eventWaiters.length; index += 1) {
      const waiter = eventWaiters[index];
      if (waiter.method !== message.method || (waiter.sessionId && waiter.sessionId !== message.sessionId)) continue;
      eventWaiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message.params ?? {});
      break;
    }
  }

  output.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    let boundary = buffer.indexOf(0);
    while (boundary !== -1) {
      const frame = buffer.subarray(0, boundary).toString("utf8");
      buffer = buffer.subarray(boundary + 1);
      if (frame) {
        try {
          settleMessage(JSON.parse(frame));
        } catch (error) {
          diagnostics.push(`Invalid CDP frame: ${error.message}`);
        }
      }
      boundary = buffer.indexOf(0);
    }
  });

  function send(method, params = {}, sessionId) {
    const id = nextId++;
    const message = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    return new Promise((resolvePromise, reject) => {
      pending.set(id, { method, resolve: resolvePromise, reject });
      input.write(`${JSON.stringify(message)}\0`, (error) => {
        if (!error) return;
        pending.delete(id);
        reject(error);
      });
    });
  }

  function waitFor(method, sessionId, timeoutMs = 10_000) {
    return new Promise((resolvePromise, reject) => {
      const waiter = {
        method,
        sessionId,
        resolve: resolvePromise,
        reject,
        timeout: setTimeout(() => {
          const index = eventWaiters.indexOf(waiter);
          if (index !== -1) eventWaiters.splice(index, 1);
          reject(new Error(`Timed out waiting for CDP ${method}`));
        }, timeoutMs),
      };
      eventWaiters.push(waiter);
    });
  }

  function fail(error) {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    for (const waiter of eventWaiters.splice(0)) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
  }

  return { send, waitFor, fail };
}

async function runChrome(browser, url, viewport) {
  const profile = mkdtempSync(join(tmpdir(), "honua-sdk-gallery-chrome-"));
  const child = spawn(
    browser,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-pipe",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] },
  );
  let stderr = "";
  const diagnostics = [];
  child.stderr.on("data", (chunk) => {
    if (stderr.length < 1024 * 1024) stderr += chunk.toString("utf8");
  });
  const cdp = cdpConnection(child, diagnostics);
  const closed = new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      cdp.fail(new Error(`Chrome closed before the browser contract completed (${code ?? signal})`));
      resolvePromise();
    });
  });
  let timer;
  try {
    const work = (async () => {
      const targets = await cdp.send("Target.getTargets");
      const page = targets.targetInfos.find((target) => target.type === "page");
      invariant(page, "Chrome did not create a page target");
      const attached = await cdp.send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
      const sessionId = attached.sessionId;
      await Promise.all([
        cdp.send("Page.enable", {}, sessionId),
        cdp.send("Runtime.enable", {}, sessionId),
        cdp.send("Log.enable", {}, sessionId),
        cdp.send(
          "Emulation.setDeviceMetricsOverride",
          {
            width: viewport.width,
            height: viewport.height,
            screenWidth: viewport.width,
            screenHeight: viewport.height,
            deviceScaleFactor: 1,
            mobile: viewport.id === "mobile",
          },
          sessionId,
        ),
      ]);
      const loaded = cdp.waitFor("Page.loadEventFired", sessionId);
      await cdp.send("Page.navigate", { url }, sessionId);
      await loaded;
      const evaluation = await cdp.send(
        "Runtime.evaluate",
        {
          expression: `new Promise((resolve) => {
            const deadline = performance.now() + 5000;
            const inspect = () => {
              const marker = document.getElementById("sdk-gallery-smoke");
              if (marker && marker.dataset.state !== "idle") {
                resolve({
                  state: marker.dataset.state,
                  message: marker.textContent,
                  error: document.documentElement.dataset.sdkGallerySmokeError || null,
                  innerWidth: window.innerWidth,
                  innerHeight: window.innerHeight,
                  visualWidth: window.visualViewport && window.visualViewport.width,
                  clientWidth: document.documentElement.clientWidth,
                  scrollWidth: document.documentElement.scrollWidth
                });
                return;
              }
              if (performance.now() >= deadline) {
                resolve({ state: marker ? marker.dataset.state : "missing", message: "smoke marker timeout" });
                return;
              }
              setTimeout(inspect, 25);
            };
            inspect();
          })`,
          awaitPromise: true,
          returnByValue: true,
        },
        sessionId,
      );
      invariant(!evaluation.exceptionDetails, `Browser evaluation failed: ${evaluation.exceptionDetails?.text}`);
      return evaluation.result.value;
    })();
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${viewport.id} Chrome smoke timed out`)), 25_000);
    });
    const result = await Promise.race([work, timeout]);
    invariant(result?.state === "passed", `${viewport.id} browser assertions failed: ${result?.error ?? result?.message}`);
    invariant(result.innerWidth === viewport.width, `${viewport.id} viewport drifted to ${result.innerWidth}px`);
    invariant(result.visualWidth === result.clientWidth, `${viewport.id} visual viewport/client width disagree`);
    invariant(result.scrollWidth <= result.clientWidth + 1, `${viewport.id} page has horizontal overflow`);
    invariant(diagnostics.length === 0, `${viewport.id} browser logged errors: ${diagnostics.join("; ")}`);
    return result;
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await Promise.race([closed, new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000))]);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true });
    if (stderr.includes("Remote debugging pipe file descriptors are not open")) {
      throw new Error(`${viewport.id} Chrome debugging pipe failed: ${stderr.slice(-1200)}`);
    }
  }
}

async function main() {
  const projectRoot = parseArguments(process.argv.slice(2));
  const browser = findBrowser();
  const server = await staticServer(projectRoot);
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const viewports = [
    { id: "desktop", width: 1280, height: 720 },
    { id: "mobile", width: 390, height: 844 },
  ];
  try {
    for (const viewport of viewports) {
      await runChrome(browser, `${base}/samples/index.html?__smoke=1`, viewport);
      console.log(`sdk-gallery-browser-smoke: ${viewport.id} ${viewport.width}x${viewport.height} passed`);
    }
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
  console.log("sdk-gallery-browser-smoke: OK");
}

main().catch((error) => {
  console.error(`sdk-gallery-browser-smoke: ${error.message}`);
  process.exitCode = 1;
});

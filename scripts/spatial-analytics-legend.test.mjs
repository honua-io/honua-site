import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../assets/demos/spatial-analytics/spatial-analytics.js", import.meta.url), "utf8");

function loadRamp() {
  const sandbox = {
    console,
    document: { readyState: "loading", addEventListener() {} },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  return sandbox.__saRamp;
}

function legendLabels(html) {
  return [...html.matchAll(/<span class="sa-swatch"[^>]*><\/span>([^<]*)/g)].map((match) => match[1].trim());
}

function expressionStops(expression) {
  const stops = [];
  for (let index = 3; index < expression.length; index += 2) stops.push(expression[index]);
  return stops;
}

test("H3 legend keeps the same fractional stops the colour ramp paints", () => {
  const ramp = loadRamp();
  const labels = legendLabels(ramp.legend("count", 3));
  assert.deepEqual(labels, ["0", "0.75", "1.5", "2.25", "3"]);
  assert.deepEqual(expressionStops(ramp.expression("count", 3)), [0, 0.75, 1.5, 2.25, 3]);
});

test("a max below 1 still uses the same unit ramp as the colour expression", () => {
  const ramp = loadRamp();
  assert.deepEqual(legendLabels(ramp.legend("count", 0)), ["0", "0.25", "0.5", "0.75", "1"]);
  assert.deepEqual(expressionStops(ramp.expression("count", 0)), [0, 0.25, 0.5, 0.75, 1]);
});

test("legend field names are escaped", () => {
  const ramp = loadRamp();
  const html = ramp.legend('a<b "&', 1);
  assert.match(html, /<code>a&lt;b &quot;&amp;<\/code>/);
  assert.equal(html.includes("<b "), false);
});

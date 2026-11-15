import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("published assets do not reference retired SDK examples", () => {
  const retired = [
    "endpoint-to-map",
    "kepler-analytics",
    ["planning", "permitting", "workbench"].join("-"),
    "standalone-quickstart",
    "terrain-rgb-elevation",
  ];
  const stale = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(?:json|js|mjs|html|md|txt|map)$/.test(entry.name)) {
        const text = readFileSync(path, "utf8");
        for (const id of retired) {
          if (text.includes(id)) stale.push(`${relative(root, path)}: ${id}`);
        }
      }
    }
  }
  visit(join(root, "assets"));
  assert.deepEqual(stale, [], `Retired SDK references remain:\n${stale.join("\n")}`);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalogUrl = new URL("../data/capabilities.v1.json", import.meta.url);
const pageUrl = new URL("../capabilities.html", import.meta.url);

test("customer alerting stays Preview across generated site data and catalog", async () => {
  const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
  const alerting = catalog.capabilities.filter(
    (capability) => capability.category === "Alerts" || capability.category === "Channels"
  );

  assert.ok(alerting.length > 0, "customer-alerting capabilities must remain in the catalog");
  assert.deepEqual(
    alerting.filter((capability) => capability.status !== "preview").map((capability) => capability.key),
    [],
    "a future GA claim must carry a reviewed lifecycle change instead of drifting generated site data"
  );

  const page = await readFile(pageUrl, "utf8");
  for (const capability of alerting) {
    const rowPattern = new RegExp(
      `id="cap-${capability.key.replaceAll(".", "-")}"[\\s\\S]*?<\\/tr>`
    );
    const row = page.match(rowPattern)?.[0] ?? "";
    assert.match(row, />Preview<\/span>/, `${capability.key} must display its Preview lifecycle`);
  }
});

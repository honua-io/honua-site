/**
 * Build-time generator for the Imagery & Terrain Studio STAC fixture lane.
 *
 * The live demo server's /stac catalog is valid but EMPTY (zero collections),
 * so /demo-imagery-terrain.html ships a small curated STAC ItemCollection of
 * real Sentinel-2 L2A scenes over Maui as its fixture lane. This script:
 *
 *   1. queries Earth Search (https://earth-search.aws.element84.com/v1) —
 *      Element 84's public STAC API over the Sentinel-2 open data on AWS —
 *      for recent low-cloud scenes whose footprint covers central Maui,
 *   2. keeps the 8 most recent distinct acquisition dates,
 *   3. DOWNLOADS each scene's preview thumbnail into ./thumbs/ (the page CSP
 *      only allows img-src 'self' + demo.honua.io, so thumbnails cannot be
 *      hotlinked from AWS at runtime — they must ship with the site), and
 *   4. writes ./stac-items.json — a valid STAC ItemCollection trimmed to the
 *      fields the demo renders, with each item's original self/thumbnail
 *      hrefs preserved under `honua:` keys for provenance.
 *
 * Run from this directory (network required):  node generate-stac-fixture.mjs
 *
 * Attribution carried into the fixture and shown on the page:
 *   Contains modified Copernicus Sentinel data, processed by ESA.
 *   Catalog: Earth Search by Element 84 (Sentinel-2 on AWS open data).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const API = "https://earth-search.aws.element84.com/v1";
const COLLECTION = "sentinel-2-l2a";
// Central Maui — every returned footprint must cover the island the rest of
// the demo is framed on (a bbox query would also match mostly-ocean tiles).
const MAUI_POINT = { type: "Point", coordinates: [-156.335, 20.8] };
const MAX_CLOUD = 12;
const KEEP = 8;

async function search() {
  const res = await fetch(`${API}/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      collections: [COLLECTION],
      intersects: MAUI_POINT,
      query: { "eo:cloud_cover": { lt: MAX_CLOUD } },
      sortby: [{ field: "properties.datetime", direction: "desc" }],
      limit: 50,
    }),
  });
  if (!res.ok) throw new Error(`Earth Search ${res.status}: ${await res.text()}`);
  return res.json();
}

function pickItems(features) {
  // One scene per acquisition date — the browser UI is a date-spread sampler,
  // not a duplicate-grid dump.
  const byDate = new Map();
  for (const item of features) {
    const date = (item.properties?.datetime ?? "").slice(0, 10);
    if (!date || byDate.has(date)) continue;
    if (!item.assets?.thumbnail?.href) continue;
    byDate.set(date, item);
    if (byDate.size === KEEP) break;
  }
  return [...byDate.values()];
}

function selfHref(item) {
  return (item.links ?? []).find((l) => l.rel === "self")?.href ?? `${API}/collections/${COLLECTION}/items/${item.id}`;
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

function trimItem(item, thumbFile) {
  const p = item.properties ?? {};
  return {
    type: "Feature",
    stac_version: item.stac_version ?? "1.0.0",
    stac_extensions: ["https://stac-extensions.github.io/eo/v1.1.0/schema.json"],
    id: item.id,
    collection: item.collection ?? COLLECTION,
    bbox: (item.bbox ?? []).map(round6),
    geometry: {
      type: item.geometry.type,
      coordinates: item.geometry.coordinates.map((ring) => ring.map(([x, y]) => [round6(x), round6(y)])),
    },
    properties: {
      datetime: p.datetime,
      platform: p.platform,
      constellation: p.constellation,
      "eo:cloud_cover": p["eo:cloud_cover"],
      "grid:code": p["grid:code"],
      "s2:processing_baseline": p["s2:processing_baseline"],
    },
    assets: {
      thumbnail: {
        // Relative to assets/demos/imagery-terrain/ — same-origin, CSP-safe.
        href: `thumbs/${thumbFile}`,
        type: "image/jpeg",
        title: "Preview (true color)",
        roles: ["thumbnail"],
        "honua:source_href": item.assets.thumbnail.href,
      },
    },
    links: [{ rel: "via", href: selfHref(item), type: "application/geo+json", title: "Original item on Earth Search" }],
  };
}

async function downloadThumb(item, file) {
  const res = await fetch(item.assets.thumbnail.href);
  if (!res.ok) throw new Error(`thumbnail ${item.id} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(join(HERE, "thumbs", file), buf);
  return buf.length;
}

const result = await search();
const picked = pickItems(result.features ?? []);
if (picked.length < KEEP) {
  throw new Error(`only ${picked.length} usable scenes (wanted ${KEEP}) — relax MAX_CLOUD?`);
}

await mkdir(join(HERE, "thumbs"), { recursive: true });
const items = [];
for (const item of picked) {
  const file = `${item.id}.jpg`;
  const bytes = await downloadThumb(item, file);
  console.log(`thumb ${file} — ${(bytes / 1024).toFixed(0)} KiB`);
  items.push(trimItem(item, file));
}

const fixture = {
  type: "FeatureCollection",
  "honua:fixture": {
    comment:
      "SAMPLE CATALOG for the /demo-imagery-terrain.html STAC browser. The live demo server's /stac catalog is valid but has zero collections; the page probes it on boot and flips to the live lane automatically once collections exist. Until then it browses these 8 real Sentinel-2 L2A scenes over Maui, fetched at build time from Earth Search. Regenerate with: node generate-stac-fixture.mjs",
    source_api: `${API}/search`,
    source_collection: COLLECTION,
    query: { intersects: "POINT(-156.335 20.8) — central Maui", "eo:cloud_cover": `< ${MAX_CLOUD}`, distinct_dates: KEEP },
    fetched_at: new Date().toISOString(),
    attribution:
      "Contains modified Copernicus Sentinel data, processed by ESA · catalog and previews via Earth Search by Element 84 (Sentinel-2 L2A open data on AWS)",
    license: "Copernicus Sentinel data is free, full and open (Copernicus data policy); previews CC-BY-SA-IGO-3.0-equivalent ESA terms",
  },
  features: items,
};

await writeFile(join(HERE, "stac-items.json"), JSON.stringify(fixture, null, 2) + "\n");
console.log(`wrote stac-items.json — ${items.length} items, ${items.map((i) => i.properties.datetime.slice(0, 10)).join(", ")}`);

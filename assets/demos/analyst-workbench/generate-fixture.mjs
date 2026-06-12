/**
 * Generates assets/demos/analyst-workbench/fixture-parcels.json — the bundled
 * sample-data lane for demo-analyst-workbench.html.
 *
 * The output is SYNTHETIC, Maui-shaped data: parcel rectangles laid out on
 * jittered grids around six real Maui town centers, with zoning / acreage /
 * flood-zone attributes drawn from realistic distributions. It is NOT County
 * of Maui parcel data and the page labels it "sample data — live server
 * pending" everywhere it appears.
 *
 * Deterministic: seeded mulberry32 PRNG, so re-running this script reproduces
 * the committed fixture byte-for-byte.
 *
 *   node assets/demos/analyst-workbench/generate-fixture.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(0x68_6f_6e_75); // "honu"

const round = (v, p) => Math.round(v * 10 ** p) / 10 ** p;
const pick = (weights) => {
  // weights: [[value, weight], ...]
  const total = weights.reduce((s, w) => s + w[1], 0);
  let r = rand() * total;
  for (const [value, weight] of weights) {
    r -= weight;
    if (r <= 0) return value;
  }
  return weights[weights.length - 1][0];
};

/* Town layouts. Each town gets a jittered grid of rectangular parcels around
 * its center. "coast" is the shoreline bearing used to decide which parcels
 * fall in the AE/VE flood zones (those closest to the shore edge). */
const TOWNS = [
  {
    name: "Kahului",
    center: [-156.466, 20.883],
    rows: 11,
    cols: 13,
    pitch: 0.0035,
    coastEdge: "north",
    zoning: [["R-2", 30], ["R-3", 18], ["B-2", 16], ["M-1", 14], ["A-1", 8], ["PK", 4], ["AG", 2]],
    acres: () => 0.12 + rand() * 0.55,
  },
  {
    name: "Wailuku",
    center: [-156.504, 20.885],
    rows: 9,
    cols: 9,
    pitch: 0.0032,
    coastEdge: "east",
    zoning: [["R-1", 26], ["R-2", 24], ["B-2", 10], ["A-1", 8], ["PK", 3], ["AG", 4]],
    acres: () => 0.1 + rand() * 0.45,
  },
  {
    name: "Kihei",
    center: [-156.452, 20.737],
    rows: 16,
    cols: 7,
    pitch: 0.0034,
    coastEdge: "west",
    zoning: [["R-2", 22], ["R-3", 18], ["A-2", 14], ["H-M", 10], ["B-2", 8], ["PK", 4]],
    acres: () => 0.1 + rand() * 0.4,
  },
  {
    name: "Lahaina",
    center: [-156.674, 20.878],
    rows: 12,
    cols: 7,
    pitch: 0.0033,
    coastEdge: "west",
    zoning: [["R-2", 20], ["R-3", 14], ["H-M", 16], ["B-2", 12], ["A-2", 8], ["PK", 3]],
    acres: () => 0.09 + rand() * 0.42,
  },
  {
    name: "Makawao",
    center: [-156.318, 20.852],
    rows: 7,
    cols: 8,
    pitch: 0.006,
    coastEdge: null, // upcountry — no coastal flood exposure
    zoning: [["R-1", 16], ["AG", 30], ["R-2", 8], ["B-2", 4], ["PK", 2]],
    acres: () => (rand() < 0.55 ? 0.4 + rand() * 1.8 : 2 + rand() * 18),
  },
  {
    name: "Hana",
    center: [-155.99, 20.758],
    rows: 6,
    cols: 6,
    pitch: 0.0045,
    coastEdge: "east",
    zoning: [["R-1", 14], ["AG", 22], ["R-2", 6], ["B-2", 3], ["PK", 2], ["H-M", 2]],
    acres: () => (rand() < 0.6 ? 0.3 + rand() * 1.4 : 2 + rand() * 12),
  },
];

/* Coarse Maui coastline — context ring only, drawn as a faint outline under
 * the synthetic parcels so the sample lane still reads as "Maui". */
const MAUI_OUTLINE = [
  [-156.697, 20.95], [-156.68, 21.0], [-156.62, 21.028], [-156.535, 21.03],
  [-156.48, 20.99], [-156.473, 20.93], [-156.51, 20.9], [-156.473, 20.9],
  [-156.45, 20.93], [-156.38, 20.94], [-156.27, 20.945], [-156.14, 20.91],
  [-156.0, 20.83], [-155.978, 20.78], [-155.99, 20.73], [-156.06, 20.66],
  [-156.18, 20.62], [-156.3, 20.585], [-156.39, 20.58], [-156.435, 20.62],
  [-156.46, 20.69], [-156.45, 20.755], [-156.475, 20.8], [-156.52, 20.78],
  [-156.6, 20.81], [-156.665, 20.86], [-156.697, 20.95],
];

const FLOOD_BY_DEPTH = (coastDepth) => {
  // coastDepth: 0 = nearest the shore … 1 = furthest inland
  if (coastDepth < 0.16) return pick([["VE", 45], ["AE", 45], ["X", 10]]);
  if (coastDepth < 0.38) return pick([["AE", 55], ["X", 45]]);
  return pick([["X", 94], ["AE", 6]]);
};

const features = [];
let serial = 1;

for (const town of TOWNS) {
  const [cx, cy] = town.center;
  const w = (town.cols - 1) * town.pitch;
  const h = (town.rows - 1) * town.pitch;
  for (let r = 0; r < town.rows; r++) {
    for (let c = 0; c < town.cols; c++) {
      if (rand() < 0.14) continue; // gaps — streets, parks, vacant blocks
      const jx = (rand() - 0.5) * town.pitch * 0.35;
      const jy = (rand() - 0.5) * town.pitch * 0.35;
      const x = cx - w / 2 + c * town.pitch + jx;
      const y = cy - h / 2 + r * town.pitch + jy;
      const acres = round(town.acres(), 2);
      // Parcel footprint scales loosely with acreage (1 acre ≈ 0.0006°²-ish).
      const side = Math.min(0.0085, Math.sqrt(acres) * 0.00062 + 0.0004);
      const sx = side * (0.7 + rand() * 0.6);
      const sy = side * (0.7 + rand() * 0.6);

      let coastDepth = 1;
      if (town.coastEdge === "north") coastDepth = 1 - (y - (cy - h / 2)) / h;
      else if (town.coastEdge === "west") coastDepth = (x - (cx - w / 2)) / w;
      else if (town.coastEdge === "east") coastDepth = 1 - (x - (cx - w / 2)) / w;
      coastDepth = Math.max(0, Math.min(1, coastDepth));

      const zoning = pick(town.zoning);
      const flood = town.coastEdge ? FLOOD_BY_DEPTH(coastDepth) : pick([["X", 97], ["AE", 3]]);
      const tmk = "2-" + String(serial + 39000).padStart(5, "0").slice(0, 1) + "-" +
        String(100 + (serial % 900)).padStart(3, "0") + "-" + String(serial).padStart(3, "0");

      features.push({
        type: "Feature",
        properties: {
          objectid: serial,
          tmk,
          town: town.name,
          zoning,
          gisacres: acres,
          flood_zone: flood,
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [round(x - sx, 5), round(y - sy, 5)],
            [round(x + sx, 5), round(y - sy, 5)],
            [round(x + sx, 5), round(y + sy, 5)],
            [round(x - sx, 5), round(y + sy, 5)],
            [round(x - sx, 5), round(y - sy, 5)],
          ]],
        },
      });
      serial++;
    }
  }
}

const fixture = {
  $comment:
    "SYNTHETIC sample data for demo-analyst-workbench.html (fixture lane). " +
    "Maui-shaped but generated — not County of Maui records. Regenerate with " +
    "node assets/demos/analyst-workbench/generate-fixture.mjs (deterministic seed).",
  generated: "by generate-fixture.mjs, seed 0x686f6e75",
  outline: { type: "Feature", properties: { kind: "coastline-context" }, geometry: { type: "Polygon", coordinates: [MAUI_OUTLINE] } },
  parcels: { type: "FeatureCollection", features },
};

const out = join(dirname(fileURLToPath(import.meta.url)), "fixture-parcels.json");
writeFileSync(out, JSON.stringify(fixture));
console.log("wrote " + out + " — " + features.length + " synthetic parcels");

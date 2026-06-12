#!/usr/bin/env node
/*
 * generate-scenario.mjs — builds scenario.json for honua.io/demo-public-safety.html.
 *
 * SIMULATED SCENARIO GENERATOR. Every incident, unit, and advisory zone in the
 * output is synthetic training-style data authored in this file. Real Maui
 * geography (Kahului, Wailuku, Kīhei, Pāʻia, Huelo, Keʻanae) is used only as a
 * plausible backdrop; nothing here describes a real event.
 *
 * The output is fully deterministic: no Date.now(), no randomness. The replay
 * engine in app.js drives everything off elapsed-time-since-page-load and
 * loops every `meta.durationSeconds` (10 minutes).
 *
 * Regenerate with:   node generate-scenario.mjs
 * (writes scenario.json next to this file; commit both together)
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DURATION = 600; // seconds — 10-minute loop

/* ── geometry helpers (deterministic, lng/lat degrees) ──────────────── */

function segLen(a, b) {
  // Equirectangular approximation — plenty for keyframe spacing.
  const kx = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (b[0] - a[0]) * kx;
  const dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

function roundT(t) {
  return Math.round(t * 10) / 10;
}

/** Keyframes along a polyline between t0..t1, spaced by distance. */
function legKeyframes(t0, t1, line) {
  const lengths = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const d = segLen(line[i - 1], line[i]);
    lengths.push(d);
    total += d;
  }
  const frames = [{ t: roundT(t0), c: line[0].map(round6) }];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    acc += lengths[i - 1];
    frames.push({ t: roundT(t0 + ((t1 - t0) * acc) / total), c: line[i].map(round6) });
  }
  return frames;
}

function rev(line) {
  return line.slice().reverse();
}

/* ── road polylines (approximate, plausible Maui road alignments) ───── */

const HI32_E1_TO_UNDERPASS = [
  [-156.4663, 20.8845],
  [-156.47, 20.8852],
  [-156.474, 20.8862],
  [-156.478, 20.887],
];

const MOKULELE_E1_TO_KIHEI = [
  [-156.4663, 20.8845],
  [-156.463, 20.876],
  [-156.453, 20.864],
  [-156.443, 20.845],
  [-156.44, 20.82],
  [-156.444, 20.79],
  [-156.452, 20.765],
  [-156.46, 20.748],
];

const E3_TO_IAO = [
  [-156.505, 20.891],
  [-156.5085, 20.8895],
  [-156.512, 20.888],
];

const M2_TO_WARMEM = [
  [-156.469, 20.887],
  [-156.479, 20.8872],
  [-156.489, 20.8878],
  [-156.499, 20.8865],
];

const WARMEM_TO_HOSPITAL = [
  [-156.499, 20.8865],
  [-156.494, 20.89],
  [-156.4895, 20.8935],
];

const HOSPITAL_TO_M2_HOME = [
  [-156.4895, 20.8935],
  [-156.479, 20.89],
  [-156.469, 20.887],
];

const M6_TO_SKIHEI = [
  [-156.4565, 20.743],
  [-156.455, 20.73],
  [-156.453, 20.715],
];

const SKIHEI_TO_HOSPITAL = [
  [-156.453, 20.715],
  [-156.4565, 20.743],
  [-156.452, 20.765],
  [-156.444, 20.79],
  [-156.44, 20.82],
  [-156.443, 20.845],
  [-156.453, 20.864],
  [-156.463, 20.876],
  [-156.47, 20.885],
  [-156.4895, 20.8935],
];

const HOSPITAL_TO_M6_HOME = rev(SKIHEI_TO_HOSPITAL).slice(0, -1).concat([[-156.4565, 20.743]]);

const U1_TO_WAILUKU_HEIGHTS = [
  [-156.472, 20.88],
  [-156.485, 20.878],
  [-156.498, 20.874],
  [-156.508, 20.87],
];

const R10_TO_MOKULELE_X = [
  [-156.435, 20.893],
  [-156.44, 20.87],
  [-156.44, 20.845],
  [-156.443, 20.82],
];

const R10_HANA_HWY_TO_KEANAE = [
  [-156.435, 20.893],
  [-156.404, 20.91],
  [-156.371, 20.915],
  [-156.33, 20.92],
  [-156.29, 20.918],
  [-156.245, 20.908],
  [-156.205, 20.898],
  [-156.17, 20.873],
  [-156.146, 20.862],
];

/* ── units: plan = ordered segments; hold segments have no line ─────── */
/* status vocabulary: available | responding | on scene | transporting | returning */

function buildUnit(def) {
  const path = [];
  const statusTimeline = [];
  let lastCoord = def.home.map(round6);
  let lastStatus = null;
  let cursorT = 0;

  function pushFrame(frame) {
    const prev = path[path.length - 1];
    if (prev && prev.t === frame.t && prev.c[0] === frame.c[0] && prev.c[1] === frame.c[1]) return;
    path.push(frame);
  }

  function pushStatus(t, status) {
    if (status === lastStatus) return;
    statusTimeline.push({ t: roundT(t), status });
    lastStatus = status;
  }

  pushFrame({ t: 0, c: lastCoord });
  for (const seg of def.plan) {
    if (seg.t0 > cursorT) {
      // implicit hold between segments
      pushFrame({ t: roundT(seg.t0), c: lastCoord });
    }
    pushStatus(seg.t0, seg.status);
    if (seg.line) {
      for (const frame of legKeyframes(seg.t0, seg.t1, seg.line)) pushFrame(frame);
      lastCoord = seg.line[seg.line.length - 1].map(round6);
    }
    cursorT = seg.t1;
  }
  if (cursorT < DURATION) pushFrame({ t: DURATION, c: lastCoord });
  return {
    id: def.id,
    name: def.name,
    kind: def.kind,
    path,
    statusTimeline,
  };
}

const UNITS = [
  buildUnit({
    id: "E1",
    name: "Engine 1",
    kind: "engine",
    home: [-156.4663, 20.8845],
    plan: [
      { t0: 0, t1: 15, status: "available" },
      { t0: 15, t1: 22, status: "responding", line: HI32_E1_TO_UNDERPASS },
      { t0: 22, t1: 180, status: "on scene" },
      { t0: 180, t1: 188, status: "returning", line: rev(HI32_E1_TO_UNDERPASS) },
      { t0: 188, t1: 270, status: "available" },
      { t0: 270, t1: 300, status: "responding", line: MOKULELE_E1_TO_KIHEI },
      { t0: 300, t1: 540, status: "on scene" },
      { t0: 540, t1: 570, status: "returning", line: rev(MOKULELE_E1_TO_KIHEI) },
      { t0: 570, t1: DURATION, status: "available" },
    ],
  }),
  buildUnit({
    id: "E3",
    name: "Engine 3",
    kind: "engine",
    home: [-156.505, 20.891],
    plan: [
      { t0: 0, t1: 110, status: "available" },
      { t0: 110, t1: 116, status: "responding", line: E3_TO_IAO },
      { t0: 116, t1: 470, status: "on scene" },
      { t0: 470, t1: 476, status: "returning", line: rev(E3_TO_IAO) },
      { t0: 476, t1: DURATION, status: "available" },
    ],
  }),
  buildUnit({
    id: "M2",
    name: "Medic 2",
    kind: "medic",
    home: [-156.469, 20.887],
    plan: [
      { t0: 0, t1: 230, status: "available" },
      { t0: 230, t1: 240, status: "responding", line: M2_TO_WARMEM },
      { t0: 240, t1: 318, status: "on scene" },
      { t0: 318, t1: 326, status: "transporting", line: WARMEM_TO_HOSPITAL },
      { t0: 326, t1: 360, status: "on scene" },
      { t0: 360, t1: 368, status: "returning", line: HOSPITAL_TO_M2_HOME },
      { t0: 368, t1: DURATION, status: "available" },
    ],
  }),
  buildUnit({
    id: "M6",
    name: "Medic 6",
    kind: "medic",
    home: [-156.4565, 20.743],
    plan: [
      { t0: 0, t1: 75, status: "available" },
      { t0: 75, t1: 82, status: "responding", line: M6_TO_SKIHEI },
      { t0: 82, t1: 150, status: "on scene" },
      { t0: 150, t1: 195, status: "transporting", line: SKIHEI_TO_HOSPITAL },
      { t0: 195, t1: 210, status: "on scene" },
      { t0: 210, t1: 252, status: "returning", line: HOSPITAL_TO_M6_HOME },
      { t0: 252, t1: DURATION, status: "available" },
    ],
  }),
  buildUnit({
    id: "U1",
    name: "Utility 1",
    kind: "utility",
    home: [-156.472, 20.88],
    plan: [
      { t0: 0, t1: 370, status: "available" },
      { t0: 370, t1: 382, status: "responding", line: U1_TO_WAILUKU_HEIGHTS },
      { t0: 382, t1: 560, status: "on scene" },
      { t0: 560, t1: 572, status: "returning", line: rev(U1_TO_WAILUKU_HEIGHTS) },
      { t0: 572, t1: DURATION, status: "available" },
    ],
  }),
  buildUnit({
    id: "R10",
    name: "Rescue 10",
    kind: "rescue",
    home: [-156.435, 20.893],
    plan: [
      { t0: 0, t1: 150, status: "available" },
      { t0: 150, t1: 160, status: "responding", line: R10_TO_MOKULELE_X },
      { t0: 160, t1: 250, status: "on scene" },
      { t0: 250, t1: 260, status: "returning", line: rev(R10_TO_MOKULELE_X) },
      { t0: 260, t1: 320, status: "available" },
      { t0: 320, t1: 360, status: "responding", line: R10_HANA_HWY_TO_KEANAE },
      { t0: 360, t1: 520, status: "on scene" },
      { t0: 520, t1: 560, status: "returning", line: rev(R10_HANA_HWY_TO_KEANAE) },
      { t0: 560, t1: DURATION, status: "available" },
    ],
  }),
];

/* ── simulated flood advisory zones (synthetic polygons, EPSG:4326) ─── */

const ZONES = [
  {
    id: "sim-zone-kahului",
    name: "Simulated flood advisory — Kahului lowlands",
    ring: [
      [-156.494, 20.883],
      [-156.455, 20.883],
      [-156.45, 20.893],
      [-156.47, 20.901],
      [-156.494, 20.897],
      [-156.494, 20.883],
    ],
  },
  {
    id: "sim-zone-wailuku",
    name: "Simulated flood advisory — ʻĪao Stream corridor",
    ring: [
      [-156.516, 20.884],
      [-156.504, 20.884],
      [-156.5, 20.892],
      [-156.508, 20.896],
      [-156.517, 20.891],
      [-156.516, 20.884],
    ],
  },
  {
    id: "sim-zone-kihei",
    name: "Simulated flood advisory — Kīhei makai",
    ring: [
      [-156.47, 20.742],
      [-156.452, 20.742],
      [-156.45, 20.755],
      [-156.468, 20.757],
      [-156.47, 20.742],
    ],
  },
];

/* ── incident timeline ──────────────────────────────────────────────── */
/* Each entry expands to one event per step; versions increase per id. */

const INCIDENTS = [
  {
    id: "INC-1001",
    type: "flooding",
    severity: "critical",
    title: "Roadway flooding — Kaʻahumanu Ave underpass",
    area: "Kahului",
    location: [-156.478, 20.887],
    units: ["E1"],
    steps: [
      { t: 15, status: "reported" },
      { t: 22, status: "units on scene" },
      { t: 180, status: "contained" },
    ],
    clearAt: 560,
  },
  {
    id: "INC-1002",
    type: "road closure",
    severity: "major",
    title: "Hāna Hwy closed — debris across both lanes",
    area: "Huelo",
    location: [-156.205, 20.898],
    units: [],
    steps: [
      { t: 45, status: "reported" },
      { t: 300, status: "one lane open — alternating traffic" },
    ],
    clearAt: 590,
  },
  {
    id: "INC-1003",
    type: "medical",
    severity: "moderate",
    title: "Medical call — S Kīhei Rd",
    area: "Kīhei",
    location: [-156.453, 20.715],
    units: ["M6"],
    steps: [
      { t: 75, status: "reported" },
      { t: 82, status: "units on scene" },
      { t: 150, status: "transporting" },
    ],
    clearAt: 185,
  },
  {
    id: "INC-1004",
    type: "flooding",
    severity: "major",
    title: "ʻĪao Stream running high — banks overtopping",
    area: "Wailuku",
    location: [-156.512, 20.888],
    units: ["E3"],
    steps: [
      { t: 110, status: "reported" },
      { t: 116, status: "units on scene" },
      { t: 470, status: "contained" },
    ],
    clearAt: 580,
  },
  {
    id: "INC-1005",
    type: "rescue",
    severity: "critical",
    title: "Vehicle stalled in running water — Mokulele Hwy",
    area: "Central Maui",
    location: [-156.443, 20.82],
    units: ["R10"],
    steps: [
      { t: 150, status: "reported" },
      { t: 160, status: "rescue in progress" },
    ],
    clearAt: 250,
  },
  {
    id: "INC-1006",
    type: "road closure",
    severity: "moderate",
    title: "Baldwin Ave ponding — local closure",
    area: "Pāʻia",
    location: [-156.371, 20.912],
    units: [],
    steps: [{ t: 190, status: "reported" }],
    clearAt: 520,
  },
  {
    id: "INC-1007",
    type: "medical",
    severity: "moderate",
    title: "Medical assist — War Memorial shelter",
    area: "Wailuku",
    location: [-156.499, 20.8865],
    units: ["M2"],
    steps: [
      { t: 230, status: "reported" },
      { t: 240, status: "units on scene" },
    ],
    clearAt: 330,
  },
  {
    id: "INC-1008",
    type: "flooding",
    severity: "major",
    title: "Gulch overflow crossing S Kīhei Rd",
    area: "Kīhei",
    location: [-156.46, 20.748],
    units: ["E1"],
    steps: [
      { t: 270, status: "reported" },
      { t: 300, status: "units on scene" },
      { t: 540, status: "contained" },
    ],
    clearAt: 575,
  },
  {
    id: "INC-1009",
    type: "rescue",
    severity: "major",
    title: "Hiker assist — Keʻanae section, Hāna Hwy",
    area: "Keʻanae",
    location: [-156.146, 20.862],
    units: ["R10"],
    steps: [
      { t: 320, status: "reported" },
      { t: 360, status: "units on scene" },
    ],
    clearAt: 560,
  },
  {
    id: "INC-1010",
    type: "utility",
    severity: "moderate",
    title: "Utility line down — Wailuku Heights",
    area: "Wailuku",
    location: [-156.508, 20.87],
    units: ["U1"],
    steps: [
      { t: 370, status: "reported" },
      { t: 382, status: "crew on scene" },
    ],
    clearAt: 555,
  },
];

function buildEvents() {
  const events = [];
  for (const inc of INCIDENTS) {
    let version = 0;
    for (const step of inc.steps) {
      version += 1;
      events.push({
        t: roundT(step.t),
        op: "upsert",
        id: inc.id,
        version,
        incident: {
          id: inc.id,
          type: inc.type,
          severity: inc.severity,
          title: inc.title,
          area: inc.area,
          status: step.status,
          units: inc.units,
          location: inc.location.map(round6),
        },
      });
    }
    version += 1;
    events.push({ t: roundT(inc.clearAt), op: "delete", id: inc.id, version });
  }
  events.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return events;
}

/* ── output ─────────────────────────────────────────────────────────── */

const scenario = {
  $comment:
    "SIMULATED SCENARIO — synthetic public-safety training-style data generated by generate-scenario.mjs. No real events, units, or advisories are described. Deterministic replay: app.js applies events by elapsed-seconds-since-load and loops every meta.durationSeconds.",
  meta: {
    simulated: true,
    title: "Simulated storm scenario — Central & East Maui",
    durationSeconds: DURATION,
    generatedBy: "assets/demos/public-safety/generate-scenario.mjs",
  },
  thresholdAlert: {
    $comment:
      "Replay stand-in for a server-side attribute-threshold alert rule (Enterprise channels). Fires once per loop when active incidents reach `count`.",
    field: "active_incidents",
    operator: ">=",
    count: 6,
  },
  zones: ZONES,
  units: UNITS,
  events: buildEvents(),
};

const outPath = join(dirname(fileURLToPath(import.meta.url)), "scenario.json");
writeFileSync(outPath, JSON.stringify(scenario, null, 2) + "\n", "utf8");
console.log(
  "wrote " +
    outPath +
    " — " +
    scenario.units.length +
    " units, " +
    scenario.events.length +
    " events, " +
    scenario.zones.length +
    " zones, " +
    DURATION +
    "s loop"
);

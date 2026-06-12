#!/usr/bin/env node
/**
 * Deterministic generator for inspections.geojson — the synthetic inspection
 * fixture behind /demo-editing.html.
 *
 * Every feature is SYNTHETIC demo data placed at a real, publicly named Maui
 * location (county beach parks, state trailheads, small-boat harbors). No real
 * inspection programs, findings, or conditions are represented; every note
 * carries the "Demo data — synthetic inspection." marker.
 *
 * The same file is used two ways:
 *  1. Seeded into the demo server's `maui-inspections` scratch layer
 *     (FlatGeobuf via the admin import API — see README.md).
 *  2. Shipped as the page's local fallback lane when the live server is
 *     unreachable or sandbox writes are disabled.
 *
 * Run: node generate-inspections.mjs   (rewrites inspections.geojson in place)
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Fixed epoch so reruns are byte-identical: 2026-06-10T18:00:00Z.
const BASE_MS = Date.UTC(2026, 5, 10, 18, 0, 0);
const HOURS = 3600 * 1000;

// [name, category, lon, lat, status, daysAgo, flavor]
const SITES = [
  ["Waiheʻe Ridge Trailhead", "trail", -156.5498, 20.9421, "ok", 2, "Boardwalk sections dry, signage intact."],
  ["Pīpīwai Trailhead (Kīpahulu)", "trail", -156.0448, 20.6622, "needs_attention", 5, "Bamboo debris across upper switchback."],
  ["Lahaina Pali Trailhead (Māʻalaea side)", "trail", -156.5223, 20.7905, "ok", 9, "Trailhead kiosk map weathered but legible."],
  ["Kapalua Coastal Trail", "trail", -156.6671, 20.9988, "ok", 1, "Footpath clear end to end."],
  ["Hoapili Trail (La Pérouse Bay)", "trail", -156.4214, 20.6011, "needs_attention", 12, "Cairn markers displaced near lava field entry."],
  ["Twin Falls Trailhead", "trail", -156.2391, 20.9118, "urgent", 3, "Stream crossing rope frayed; flagged for replacement."],
  ["Waihou Spring Trailhead", "trail", -156.2877, 20.8016, "ok", 16, "Pine litter raked back from junction."],
  ["Keoneheʻeheʻe (Sliding Sands) Trailhead", "trail", -156.2502, 20.714, "ok", 7, "Summit-district signage in good order."],
  ["Hosmer Grove Trailhead", "trail", -156.2357, 20.7686, "needs_attention", 21, "Picnic shelter roof panel loose."],
  ["Kanahā Beach Park", "park", -156.4447, 20.9, "ok", 4, "Restrooms serviced, showers operational."],
  ["H.A. Baldwin Beach Park", "park", -156.3946, 20.9148, "needs_attention", 6, "Pavilion B picnic tables need refinishing."],
  ["Kamaʻole Beach Park III", "park", -156.4497, 20.7066, "ok", 2, "Lifeguard tower equipment check complete."],
  ["Mākena State Park (Big Beach)", "park", -156.4493, 20.6321, "urgent", 1, "Erosion undercutting the south access stairs."],
  ["D.T. Fleming Beach Park", "park", -156.6537, 21.0057, "ok", 10, "Parking lot restriped last cycle."],
  ["Hoʻokipa Beach Park", "park", -156.3587, 20.9337, "needs_attention", 8, "Overlook railing bolts corroding."],
  ["Keōpūolani Regional Park", "park", -156.4867, 20.8896, "ok", 13, "Irrigation timers reset after outage."],
  ["Waiʻānapanapa State Park", "park", -156.0022, 20.7888, "ok", 5, "Cabin-loop path swept; cave signage fine."],
  ["ʻĪao Valley State Monument", "park", -156.5444, 20.8808, "needs_attention", 3, "Streamside guardrail dented by rockfall."],
  ["Launiupoko Beach Park", "park", -156.6623, 20.8468, "ok", 18, "Keiki pool wall inspected, no cracks."],
  ["Kahului Harbor (Pier 2)", "harbor", -156.4767, 20.8984, "ok", 6, "Fender lines within wear tolerance."],
  ["Lahaina Small Boat Harbor", "harbor", -156.6792, 20.8718, "needs_attention", 4, "Loading-dock cleat loose on slip row C."],
  ["Māʻalaea Small Boat Harbor", "harbor", -156.511, 20.791, "ok", 11, "Fuel-dock spill kit restocked."],
  ["Hāna Wharf (Hāna Bay)", "harbor", -155.9842, 20.7572, "urgent", 2, "Ladder rung cracked at mid-tide mark."],
  ["Mala Wharf Boat Ramp", "harbor", -156.6867, 20.8868, "needs_attention", 15, "Ramp algae buildup beyond service threshold."],
  ["Haleakalā Park Headquarters Visitor Center", "facility", -156.248, 20.7598, "ok", 9, "Exhibit hall and lot in good order."],
  ["Kīhei Boat Ramp", "facility", -156.4477, 20.7041, "ok", 7, "Wash-down hose pressure nominal."],
  ["Kepaniwai Park & Heritage Gardens", "facility", -156.5346, 20.8847, "needs_attention", 14, "Pavilion lighting circuit intermittent."],
];

const features = SITES.map(([name, category, lon, lat, status, daysAgo, flavor], i) => ({
  type: "Feature",
  id: i + 1,
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: {
    name,
    category,
    status,
    note: `${flavor} Demo data — synthetic inspection.`,
    reported_at: new Date(BASE_MS - daysAgo * 24 * HOURS - (i % 7) * HOURS).toISOString(),
  },
}));

const collection = {
  type: "FeatureCollection",
  name: "maui-inspections",
  description:
    "Synthetic inspection points at real Maui parks, trailheads, and harbors. Demo data only — no real inspections are represented.",
  features,
};

const out = join(dirname(fileURLToPath(import.meta.url)), "inspections.geojson");
writeFileSync(out, JSON.stringify(collection, null, 2) + "\n");
console.log(`wrote ${out} (${features.length} features)`);

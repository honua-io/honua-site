/*
 * Browser bundle entry for demo-webmap-app.html.
 *
 * Every import below is a PUBLIC @honua/sdk-js 0.2.9 subpath export, resolved
 * from the published npm tarball (gitHead d46ee8955c8aa061249aafae5ca5f004ce17018c).
 * Nothing reaches into src/ or dist/ internals. The published root browser
 * bundle (dist/browser/honua-sdk.min.js) only carries the root entry, so this
 * page needs its own bundle for the subpath kits. Rebuild recipe: README.md in
 * this directory. Exposed as window.HonuaWebMap.
 */

// MUST stay the first import: claims <honua-legend> for the controls kit
// before the web-components entry auto-registers the rest of its tags.
import "./claim-legend.mjs";

// App framework: the controller-driven web-components kit (importing it
// registers <honua-map>, <honua-layer-list>, <honua-search>, <honua-measurement>,
// <honua-time-slider>, map chrome, ...) and the framework-free controls kit
// (<honua-swipe-control>, <honua-legend> derive mode).
export { createHonuaWebComponentController } from "@honua/sdk-js/web-components";
export { HonuaSwipeControlElement, deriveLegendEntries } from "@honua/sdk-js/controls";

// Interactions: multi-layer hit-testing, popup detail models, share-state codecs.
export {
  hitTestMap,
  preparePrimaryDetailModel,
  serializeSelection,
  parseSelection,
} from "@honua/sdk-js/interactions";

// Filters: one registry -> server where clause + MapLibre runtime filter + URL state.
export {
  createFilterRegistry,
  projectFilterRegistryToQuery,
  serializeFilterRegistry,
  parseFilterRegistry,
} from "@honua/sdk-js/filter-registry";

// Typed MapLibre expression builder (paint + legend share one expression).
export { get, matchExpr, slice, coalesce, interpolate, linear, zoom, exprToString } from "@honua/sdk-js/expr";

// Geocoding client (structurally satisfies <honua-search>'s geocoder slot).
export { HonuaGeocodingClient } from "@honua/sdk-js/geocoding";

// Temporal playback controller behind <honua-time-slider>.
export { createTemporalPlayback } from "@honua/sdk-js/map";

// Root: protocol-neutral connect() for the live filter count.
export { connect } from "@honua/sdk-js";

/**
 * Browser bundle entry for @honua/sdk-js used by honua.io/demo.html.
 *
 * The SDK ships ESM + TypeScript only (no UMD/browser bundle), so this file
 * cherry-picks the surface the demo needs and esbuild compiles it into a
 * single IIFE exposed as `window.HonuaSDK`.
 *
 * Rebuild instructions live in assets/vendor/README.md in the honua-site repo.
 */

// Native control kit (custom elements) — MUST stay the FIRST import in this
// file. Importing the controls module registers <honua-basemap-switcher> and
// <honua-legend> as a side effect, and those registrations are if-missing
// guarded: whichever module is bundled/executed first owns the tag names
// (the SDK's `web-components` entry registers its own controller-driven
// `honua-legend`). Keeping controls first guarantees the controls-entry
// elements own the tags in this bundle.
export {
  HonuaBasemapStyleBinding,
  HonuaBasemapSwitcherElement,
  HonuaLegendElement,
  defineHonuaControls,
  deriveLegendEntries,
} from "../honua-sdk-js/src/controls/index.js";
export type {
  HonuaBasemapDefinition,
  HonuaBasemapKind,
  HonuaBasemapLayerSpecification,
  HonuaBasemapSwitcherChangeDetail,
  HonuaBasemapSwitcherMap,
  HonuaLegendEntry,
  HonuaLegendMap,
  HonuaLegendSection,
  HonuaLegendSwatchColor,
  HonuaLegendSwatchShape,
} from "../honua-sdk-js/src/controls/index.js";

// Core client + errors + spatial filter helpers
export { HonuaClient, HONUA_MINIMUM_SUPPORTED_SERVER_VERSION } from "../honua-sdk-js/src/core/client.js";
export {
  HonuaHttpError,
  HonuaNetworkError,
  HonuaTimeoutError,
  HonuaAbortError,
  HonuaCapabilityNotSupportedError,
  isHonuaError,
} from "../honua-sdk-js/src/core/errors.js";
export { envelope, point, spatialIntersects } from "../honua-sdk-js/src/core/spatial-filter.js";

// Protocol-neutral dataset/source contract (feature queries)
export { createDataset } from "../honua-sdk-js/src/contract/source.js";
export { PROTOCOL_DEFAULT_CAPABILITIES } from "../honua-sdk-js/src/contract/types.js";

// MapLibre style/source helpers
export {
  createHonuaFeatureServiceLayer,
  createHonuaMapServiceLayer,
  createHonuaTileServiceLayer,
  createHonuaMapLibreStyle,
  createHonuaMapLibreMapOptions,
} from "../honua-sdk-js/src/map/maplibre-target.js";

// esri-compat (migration lane) — exercised live by /demo-sdk-controls.html's
// "Esri-compat" station: API-compatible ArcGIS widget shims (state + events,
// no DOM). Only the three the station demos are bundled; the full 79-class
// surface lives in @honua/sdk-js/esri-compat.
export { HomeCompat } from "../honua-sdk-js/src/esri-compat/controls.js";
export { BookmarksCompat } from "../honua-sdk-js/src/esri-compat/bookmarks.js";
export { SwipeCompat } from "../honua-sdk-js/src/esri-compat/swipe.js";
export { CompatEventBus } from "../honua-sdk-js/src/esri-compat/event-bus.js";

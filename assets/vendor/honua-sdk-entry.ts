/**
 * Browser bundle entry for @honua/sdk-js used by honua.io/demo.html.
 *
 * The SDK ships ESM + TypeScript only (no UMD/browser bundle), so this file
 * cherry-picks the surface the demo needs and esbuild compiles it into a
 * single IIFE exposed as `window.HonuaSDK`.
 *
 * Rebuild instructions live in assets/vendor/README.md in the honua-site repo.
 */

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

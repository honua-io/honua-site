/**
 * Browser bundle entry for the @honua/sdk-js `web-components` kit, used by the
 * reworked controls gallery (demo-sdk-controls.html). Separate from
 * honua-sdk-entry.ts so the gallery gets the full controller-driven control set
 * (~15 custom elements) without disturbing the older `controls`-kit bundle the
 * other demos use. esbuild compiles the SDK TypeScript directly via the
 * assets/honua-sdk-js junction; see assets/vendor/README.md.
 *
 * Exposed as window.HonuaWC.
 */
export {
  createHonuaWebComponentController,
  createHonuaWebComponentControllerFromRuntime,
  defineHonuaWebComponents,
} from "../honua-sdk-js/src/web-components/index.js";

// Core client + spatial helpers so the gallery can pull live demo.honua.io data.
export { HonuaClient } from "../honua-sdk-js/src/core/client.js";
export { isHonuaError } from "../honua-sdk-js/src/core/errors.js";
export { envelope } from "../honua-sdk-js/src/core/spatial-filter.js";

// esri-compat migration lane: unmodified ArcGIS widget shims (state + events,
// duck-typed on a {goTo} view) driving the same honua-map.
export { HomeCompat } from "../honua-sdk-js/src/esri-compat/controls.js";
export { BookmarksCompat } from "../honua-sdk-js/src/esri-compat/bookmarks.js";
export { CompatEventBus } from "../honua-sdk-js/src/esri-compat/event-bus.js";

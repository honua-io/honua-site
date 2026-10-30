// esbuild aliases "maplibre-gl" to this file so the SDK's renderer (dynamic
// import) and map-chrome elements (named control imports) resolve to the page's
// vendored MapLibre global (assets/vendor/maplibre-gl.js, loaded first with
// `defer`) instead of an unresolvable bare specifier.
const g = (typeof globalThis !== "undefined" && globalThis.maplibregl) || {};
export default g;
export const Map = g.Map;
export const AttributionControl = g.AttributionControl;
export const FullscreenControl = g.FullscreenControl;
export const NavigationControl = g.NavigationControl;
export const ScaleControl = g.ScaleControl;

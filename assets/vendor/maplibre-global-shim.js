// esbuild aliases "maplibre-gl" to this so the web-components bundle's dynamic
// import resolves to the page's vendored global (assets/vendor/maplibre-gl.js)
// instead of an unresolvable bare specifier. The SDK only needs the Map ctor.
const g = (typeof globalThis !== "undefined" && globalThis.maplibregl) ||
          (typeof window !== "undefined" && window.maplibregl) || {};
export default g;
export const Map = g.Map;

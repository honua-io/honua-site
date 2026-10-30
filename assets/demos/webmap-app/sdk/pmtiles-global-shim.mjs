// esbuild aliases "pmtiles" to this file: the SDK runtime registers the
// pmtiles:// MapLibre protocol itself and imports { Protocol } from the
// optional `pmtiles` peer. This resolves it to the page's vendored global
// (assets/vendor/pmtiles.js, loaded first with `defer`).
const g = (typeof globalThis !== "undefined" && globalThis.pmtiles) || {};
export default g;
export const Protocol = g.Protocol;
export const PMTiles = g.PMTiles;

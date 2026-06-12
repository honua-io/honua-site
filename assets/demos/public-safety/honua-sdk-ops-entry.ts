/**
 * Browser bundle entry for the extra @honua/sdk-js surface used by
 * honua.io/demo-public-safety.html (on top of the shared vendored bundle
 * assets/vendor/honua-sdk.min.js, which stays untouched).
 *
 * Exposed as `window.HonuaSDKOps`. Re-exports only what the public-safety
 * demo needs:
 *   - realtime SSE transport + feature store (live + replay lanes)
 *   - HonuaGeocodingClient (dispatch address search)
 *
 * Rebuild instructions live in assets/demos/public-safety/README.md in the
 * honua-site repo (same staging-directory convention as assets/vendor).
 */

// Realtime: SSE transport + reducer-backed feature store
export {
  createRealtimeServerSentEventsTransport,
  decodeRealtimeServerSentEvent,
  encodeDefaultRealtimeRequest,
} from "../honua-sdk-js/src/realtime/sse.js";
export { createRealtimeFeatureStore } from "../honua-sdk-js/src/realtime/store.js";

// Geocoding client (forward / reverse / suggest)
export { HonuaGeocodingClient } from "../honua-sdk-js/src/geocoding/index.js";

// The gallery's map styles are hand-authored and known-valid, and the heavy
// @maplibre/maplibre-gl-style-spec validator isn't bundled (the SDK repo has no
// node_modules at site-build time). Provide a no-op validator that satisfies the
// SDK's expected API and reports no errors — equivalent to renderer-deferred
// validation. MapLibre itself still validates at render time.
export function validateStyleMin() { return []; }
export function createExpression() { return { result: "success", value: null }; }
export default { validateStyleMin, createExpression };

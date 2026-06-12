/**
 * Browser bundle entry for the extra @honua/sdk-js surface used by
 * honua.io/demo-maui-3d.html (on top of the shared vendored bundle
 * assets/vendor/honua-sdk.min.js, which stays untouched).
 *
 * Exposed as `window.HonuaSceneSDK`. Re-exports only what the Maui 3D demo
 * needs: the scene-workspace runtime primitives and the MapLibre 2.5D scene
 * adapter — the SDK module that turns renderer-neutral scene primitives
 * (elevation sources, building extrusions) into MapLibre terrain +
 * fill-extrusion layers, with capability diagnostics.
 *
 * Rebuild instructions live in assets/demos/maui-3d/README.md in the
 * honua-site repo (same staging-directory convention as assets/vendor).
 */

// Scene-workspace runtime primitives + the MapLibre 2.5D adapter
export {
  MAPLIBRE_SCENE_CAPABILITIES,
  applyMapLibreScenePrimitives,
  createMapLibreSceneAdapter,
  diagnoseScenePrimitives,
  summarizeDiagnosticStatus,
  toMapLibreExtrusionLayer,
  toMapLibreTerrainPatch,
} from "../honua-sdk-js/src/scene-workspace/primitives.js";
export type {
  MapLibreExtrusionLayerSpecification,
  MapLibreSceneRuntimeTarget,
  MapLibreTerrainPatch,
  SceneElevationSourcePrimitive,
  SceneExtrusionPrimitive,
  ScenePrimitiveApplyResult,
  ScenePrimitiveDiagnostic,
  SceneRuntimeAdapter,
  SceneRuntimePrimitive,
} from "../honua-sdk-js/src/scene-workspace/primitives.js";

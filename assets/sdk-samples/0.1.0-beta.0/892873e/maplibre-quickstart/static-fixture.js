(function installHonuaQuickstartStaticFixture() {
  "use strict";

  var releaseRoot = "/assets/sdk-samples/0.1.0-beta.0/892873e/maplibre-quickstart/fixtures/";
  var fixtures = {
    "/api/v1/admin/capabilities": "capabilities.json",
    "/rest/services/natural-earth/FeatureServer/0": "layer-metadata.json",
    "/rest/services/natural-earth/FeatureServer/0/query": "query-features.json"
  };
  var nativeFetch = window.fetch.bind(window);

  window.fetch = function honuaQuickstartStaticFetch(input, init) {
    var requested = input instanceof Request ? input.url : String(input);
    var url = new URL(requested, window.location.href);
    var fixture = url.origin === window.location.origin ? fixtures[url.pathname] : null;
    if (!fixture) return nativeFetch(input, init);
    return nativeFetch(releaseRoot + fixture, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin"
    });
  };
})();

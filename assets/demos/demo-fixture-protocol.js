/*
 * demo.html can only load the bundled GeoServices fixture. The published
 * quickstart assigns the protocol select from its build default ("auto") and
 * would otherwise accept an OGC Features selection against that fixture.
 */
(function (scope) {
  "use strict";

  var FIXTURE_PROTOCOL = "geoservices-feature-service";

  function lockFixtureProtocol(select) {
    if (!select) return;
    var owner = scope.HTMLSelectElement;
    var prototype = owner && Object.getOwnPropertyDescriptor(owner.prototype, "value");
    if (prototype && typeof prototype.set === "function") {
      Object.defineProperty(select, "value", {
        configurable: true,
        enumerable: true,
        get: function () {
          return FIXTURE_PROTOCOL;
        },
        set: function () {
          prototype.set.call(select, FIXTURE_PROTOCOL);
        },
      });
    }
    select.disabled = true;
  }

  scope.HonuaDemoFixtureProtocol = {
    FIXTURE_PROTOCOL: FIXTURE_PROTOCOL,
    lockFixtureProtocol: lockFixtureProtocol,
  };

  if (scope.document && scope.document.getElementById) {
    lockFixtureProtocol(scope.document.getElementById("endpoint-protocol"));
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

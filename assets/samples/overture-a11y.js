(function () {
  "use strict";

  function labelPoints(root) {
    root.querySelectorAll("circle.place-point[aria-label]:not([role])").forEach(function (point) {
      point.setAttribute("role", "img");
    });
  }

  labelPoints(document);
  new MutationObserver(function () {
    labelPoints(document);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();

(function () {
  function init() {
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.querySelector(".nav-groups");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", function () {
      var expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      nav.classList.toggle("nav-open");
    });

    // Close nav when a link is clicked on mobile
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        toggle.setAttribute("aria-expanded", "false");
        nav.classList.remove("nav-open");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();

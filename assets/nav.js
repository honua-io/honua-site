(function () {
  function init() {
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.querySelector(".nav-groups");
    if (!toggle || !nav) return;

    if (!nav.id) nav.id = "primary-navigation";
    toggle.setAttribute("aria-controls", nav.id);
    toggle.setAttribute("type", "button");

    function closeNav(returnFocus) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open navigation");
      nav.classList.remove("nav-open");
      if (returnFocus) toggle.focus();
    }

    toggle.addEventListener("click", function () {
      var expanded = toggle.getAttribute("aria-expanded") === "true";
      if (expanded) {
        closeNav(false);
        return;
      }
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close navigation");
      nav.classList.add("nav-open");
      var firstLink = nav.querySelector("a");
      if (firstLink) firstLink.focus();
    });

    // Close nav when a link is clicked on mobile
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        closeNav(false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && nav.classList.contains("nav-open")) {
        closeNav(true);
      }
    });

    document.addEventListener("click", function (event) {
      if (!nav.classList.contains("nav-open")) return;
      if (!event.target.closest(".bed-nav")) closeNav(false);
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 1080 && nav.classList.contains("nav-open")) {
        closeNav(false);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();

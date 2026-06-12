(function () {
  var raw = document.getElementById("demos-gallery-config").textContent;
  var entries = JSON.parse(raw);
  var live = entries.filter(function (e) { return e.status === "live"; });
  var grid = document.getElementById("demos-gallery-grid");

  live.forEach(function (entry) {
    var card = document.createElement("div");
    card.className = "card";

    var label = document.createElement("span");
    label.className = "lbl";
    label.textContent = entry.title;

    var desc = document.createElement("div");
    desc.className = "bd";
    desc.textContent = entry.description;

    var linkWrap = document.createElement("div");
    linkWrap.style.cssText = "margin-top: 16px;";

    var link = document.createElement("a");
    link.href = entry.href;
    link.className = "text-link";
    link.target = "_blank";
    link.rel = "noopener";
    link.setAttribute("data-analytics-event", "cta_click");
    link.setAttribute("data-analytics-label", "demos_" + entry.id + "_open");
    link.setAttribute("data-analytics-destination", entry.href);
    link.textContent = "Open ↗";

    linkWrap.appendChild(link);
    card.appendChild(label);
    card.appendChild(desc);
    card.appendChild(linkWrap);
    grid.appendChild(card);
  });

  if (live.length > 0) {
    document.getElementById("demos-more-line").style.display = "";
  }
})();

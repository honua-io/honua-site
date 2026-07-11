/*
 * Task-first Honua SDK capability gallery (honua-site#121).
 * The manifest is site curation metadata, not the executable SDK artifact
 * catalog tracked by honua-sdk-js#401. Keep this renderer tolerant of future
 * additive projection fields so #120 can replace the catalog input cleanly.
 */
(function () {
  "use strict";

  var goalLabels = {
    connect: "Connect existing GIS",
    build: "Build a map workflow",
    analyze: "Analyze spatial data",
    operate: "Run live operations",
    visualize: "Use imagery + 3D",
    migrate: "Migrate ArcGIS",
    automate: "Automate safely"
  };
  var selectedGoal = "all";
  var manifestData = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function safeHref(href) {
    try {
      var url = new URL(href, window.location.href);
      if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    } catch (_error) {
      // Invalid and non-web URLs deliberately become inert.
    }
    return "#";
  }

  function linkTo(href, cls, text) {
    var link = el("a", cls, text);
    var resolved = safeHref(href);
    link.href = resolved;
    try {
      var target = new URL(resolved, window.location.href);
      if (target.origin !== window.location.origin) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
    } catch (_error) {
      // safeHref already constrained the value.
    }
    return link;
  }

  function stateById(id) {
    var states = (manifestData && manifestData.executionStates) || [];
    for (var i = 0; i < states.length; i += 1) {
      if (states[i].id === id) return states[i];
    }
    return { id: id, label: id, tone: "" };
  }

  function stateBadge(id, prefix) {
    var state = stateById(id);
    var text = prefix ? prefix + ": " + state.label.toLowerCase() : state.label;
    var badge = el("span", "sg-badge " + (state.tone || ""), text);
    badge.title = state.description || state.label;
    return badge;
  }

  function fact(label, value) {
    var wrap = el("div");
    wrap.appendChild(el("dt", null, label));
    wrap.appendChild(el("dd", null, value));
    return wrap;
  }

  function journeyCard(journey, index) {
    var card = el("article", "sg-journey");
    if (journey.support === "experimental") card.classList.add("is-experimental");
    card.dataset.goal = journey.goal;
    card.dataset.search = [
      journey.title,
      journey.userProblem,
      journey.outcome,
      goalLabels[journey.goal],
      (journey.sdkConcepts || []).join(" "),
      (journey.protocols || []).join(" "),
      (journey.renderers || []).join(" "),
      (journey.differentiators || []).join(" "),
      journey.execution && journey.execution.mode,
      journey.execution && journey.execution.fallback,
      journey.support
    ].join(" ").toLowerCase();

    var head = el("div", "sg-card-head");
    var kicker = el("div", "sg-card-kicker");
    kicker.appendChild(el("span", null, String(index + 1).padStart(2, "0") + " · " + journey.kicker));
    kicker.appendChild(el("span", null, journey.support.replace(/-/g, " ")));
    head.appendChild(kicker);
    head.appendChild(el("h3", null, journey.title));
    card.appendChild(head);

    var story = el("div", "sg-story");
    var problem = el("div");
    problem.appendChild(el("strong", null, "Your problem"));
    problem.appendChild(el("p", null, journey.userProblem));
    story.appendChild(problem);
    var outcome = el("div");
    outcome.appendChild(el("strong", null, "Visible outcome"));
    outcome.appendChild(el("p", null, journey.outcome));
    story.appendChild(outcome);
    card.appendChild(story);

    var facts = el("dl", "sg-facts");
    facts.appendChild(fact("Time", journey.duration));
    facts.appendChild(fact("Renderer", (journey.renderers || []).join(" + ")));
    facts.appendChild(fact("Auth", journey.execution.auth));
    card.appendChild(facts);

    var badges = el("div", "sg-badges");
    badges.appendChild(stateBadge(journey.execution.mode));
    if (journey.execution.fallback) badges.appendChild(stateBadge(journey.execution.fallback, "fallback"));
    (journey.protocols || []).slice(0, 2).forEach(function (protocol) {
      badges.appendChild(el("span", "sg-badge", protocol));
    });
    card.appendChild(badges);
    card.appendChild(el("p", "sg-runtime", journey.execution.runtimeState));

    var diffs = el("div", "sg-diffs");
    (journey.differentiators || []).forEach(function (item) {
      diffs.appendChild(el("span", null, item));
    });
    card.appendChild(diffs);

    var actions = el("div", "sg-actions");
    actions.appendChild(linkTo(journey.href, "sg-primary", journey.support === "experimental" ? "Inspect the lab ↗" : "Start journey →"));
    actions.appendChild(linkTo(journey.source.href, "sg-link", "View source ↗"));
    if (journey.publication) actions.appendChild(linkTo(journey.publication, "sg-link", "Verify artifact ↗"));
    if (journey.next) actions.appendChild(linkTo(journey.next.href, "sg-link", journey.next.label + " →"));
    card.appendChild(actions);
    return card;
  }

  function recipeCard(recipe) {
    var card = linkTo(recipe.href, "sg-recipe", "");
    card.dataset.goal = (manifestData.journeys.find(function (journey) {
      return journey.id === recipe.journey;
    }) || {}).goal || "";
    card.dataset.search = [
      recipe.title,
      recipe.blurb,
      recipe.journey,
      (recipe.tags || []).join(" "),
      recipe.execution.mode,
      recipe.execution.fallback,
      recipe.support
    ].join(" ").toLowerCase();
    card.appendChild(el("h3", null, recipe.title));
    card.appendChild(el("p", null, recipe.blurb));
    var meta = el("div", "sg-recipe-meta");
    meta.appendChild(stateBadge(recipe.execution.mode));
    if (recipe.execution.fallback) meta.appendChild(stateBadge(recipe.execution.fallback, "fallback"));
    (recipe.tags || []).slice(0, 1).forEach(function (tag) {
      meta.appendChild(el("span", "sg-badge", tag));
    });
    card.appendChild(meta);
    return card;
  }

  function renderStateKey() {
    var root = byId("sg-state-key");
    root.innerHTML = "";
    manifestData.executionStates.forEach(function (state) {
      var item = el("span");
      item.title = state.description;
      item.appendChild(el("i", state.tone));
      item.appendChild(document.createTextNode(state.label));
      root.appendChild(item);
    });
  }

  function renderGoals() {
    var root = byId("sg-goals");
    root.innerHTML = "";
    var goals = [{ id: "all", label: "All outcomes" }];
    manifestData.journeys.forEach(function (journey) {
      if (!goals.some(function (goal) { return goal.id === journey.goal; })) {
        goals.push({ id: journey.goal, label: goalLabels[journey.goal] || journey.goal });
      }
    });
    goals.forEach(function (goal) {
      var button = el("button", "sg-goal", goal.label);
      button.type = "button";
      button.dataset.goal = goal.id;
      button.setAttribute("aria-pressed", goal.id === selectedGoal ? "true" : "false");
      button.addEventListener("click", function () {
        selectedGoal = goal.id;
        root.querySelectorAll("button").forEach(function (candidate) {
          candidate.setAttribute("aria-pressed", candidate.dataset.goal === selectedGoal ? "true" : "false");
        });
        applyFilters();
      });
      root.appendChild(button);
    });
  }

  function renderCatalog() {
    var journeysRoot = byId("sg-journeys");
    journeysRoot.innerHTML = "";
    manifestData.journeys.forEach(function (journey, index) {
      journeysRoot.appendChild(journeyCard(journey, index));
    });
    var recipesRoot = byId("sg-recipes");
    recipesRoot.innerHTML = "";
    manifestData.recipes.forEach(function (recipe) {
      recipesRoot.appendChild(recipeCard(recipe));
    });
  }

  function applyFilters() {
    var query = (byId("sg-filter").value || "").trim().toLowerCase();
    var journeyVisible = 0;
    var recipeVisible = 0;
    document.querySelectorAll(".sg-journey, .sg-recipe").forEach(function (card) {
      var goalMatch = selectedGoal === "all" || card.dataset.goal === selectedGoal;
      var queryMatch = !query || (card.dataset.search || "").indexOf(query) !== -1;
      card.hidden = !(goalMatch && queryMatch);
      if (!card.hidden && card.classList.contains("sg-journey")) journeyVisible += 1;
      if (!card.hidden && card.classList.contains("sg-recipe")) recipeVisible += 1;
    });
    byId("sg-journey-count").textContent = journeyVisible + " of " + manifestData.journeys.length;
    byId("sg-recipe-count").textContent = recipeVisible + " of " + manifestData.recipes.length;
  }

  function renderArtifact() {
    var artifact = manifestData.currentArtifact;
    var note = byId("sg-artifact-note");
    note.innerHTML = "";
    note.appendChild(el("strong", null, artifact.status.replace(/-/g, " ")));
    note.appendChild(el("span", null, artifact.package + " " + artifact.version + " · " + artifact.notice));
  }

  function render(manifest) {
    manifestData = manifest;
    renderArtifact();
    renderStateKey();
    renderGoals();
    renderCatalog();
    byId("sg-filter").addEventListener("input", applyFilters);
    applyFilters();
  }

  fetch("assets/samples/manifest.json", { headers: { Accept: "application/json" } })
    .then(function (response) {
      if (!response.ok) throw new Error("manifest " + response.status);
      return response.json();
    })
    .then(render)
    .catch(function (error) {
      var root = byId("sg-journeys");
      if (root) root.innerHTML = "";
      if (root) root.appendChild(el("p", "sg-empty", "Could not load capability journeys (" + String(error.message || error) + ")."));
      byId("sg-journey-count").textContent = "Unavailable";
      byId("sg-recipe-count").textContent = "Unavailable";
    });
})();

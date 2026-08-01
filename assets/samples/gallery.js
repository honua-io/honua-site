/*
 * Task-first Honua SDK capability gallery. Narrative and ordering remain
 * site-owned; support, version, source, data, freshness, and evidence are
 * resolved from the SDK publication or the explicit site-exception contract.
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
  var sdkPublication = null;
  var siteExceptions = null;

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
    wrap.appendChild(el("dd", null, value || "Not stated"));
    return wrap;
  }

  function findSample(samples, id) {
    for (var i = 0; i < samples.length; i += 1) {
      if (samples[i].id === id) return samples[i];
    }
    return null;
  }

  function latestEvidence(evidence) {
    var candidates = (evidence || []).slice().sort(function (left, right) {
      return String(right.observedAt || "").localeCompare(String(left.observedAt || ""));
    });
    var live = candidates.find(function (item) { return item.lane === "live"; });
    return live || candidates[0] || null;
  }

  function isStale(observedAt) {
    if (!observedAt) return false;
    var observed = Date.parse(observedAt);
    if (!Number.isFinite(observed)) return false;
    var maxAge = manifestData.projection.evidenceStaleAfterHours * 60 * 60 * 1000;
    return Date.now() - observed > maxAge;
  }

  function evidenceTone(evidence) {
    if (!evidence) return "unavailable";
    if (evidence.status === "failed") return "degraded";
    if (evidence.status === "skipped" || evidence.status === "unavailable") return "unavailable";
    return evidence.lane === "fixture" ? "fixture" : "public-live";
  }

  function sdkSourceLinks(record) {
    var commit = record.producer.gitCommit || sdkPublication.producer.gitCommit;
    var repository = record.source.repository;
    var source = "https://github.com/" + repository + "/tree/" + commit + "/" + record.source.path;
    var guide = record.source.docsPath
      ? "https://github.com/" + repository + "/blob/" + commit + "/" + record.source.docsPath
      : manifestData.projection.links.guides;
    return {
      source: source,
      guide: guide,
      apiReference: manifestData.projection.links.apiReference,
      proof: manifestData.projection.links.compatibility
    };
  }

  function resolveContract(contractRef) {
    var parts = String(contractRef || "").split(":");
    var kind = parts[0];
    var id = parts[1];
    var record = kind === "sdk"
      ? findSample(sdkPublication.samples, id)
      : findSample(siteExceptions.samples, id);
    if (!record) throw new Error("Missing catalog record " + contractRef);

    var evidence = latestEvidence(record.evidence);
    var stale = isStale(evidence && evidence.observedAt);
    var links = kind === "sdk" ? sdkSourceLinks(record) : record.links;
    var evidenceUrl = kind === "sdk" && evidence ? evidence.path : links.evidence;
    var runtimeVersion = kind === "sdk" ? sdkPublication.producer.version : record.sdk.version;
    var version = runtimeVersion || "No SDK bundle";
    if (kind === "sdk" && record.sdk.version && record.sdk.version !== runtimeVersion) {
      version += " runtime · " + record.sdk.version + " projection";
    }
    var degradation = evidence && evidence.degradation;
    var degradationReason = degradation && Array.isArray(degradation.reasons) ? degradation.reasons[0] : null;
    return {
      kind: kind,
      id: id,
      support: record.supportStatus,
      sdkVersion: version,
      capabilities: record.capabilities || [],
      protocols: record.protocols || [],
      renderers: record.renderers || [],
      data: record.data,
      expectedDegradation: record.expectedDegradation,
      evidence: evidence,
      evidenceTone: evidenceTone(evidence),
      stale: stale,
      reason: (evidence && evidence.reason) || degradationReason || record.expectedDegradation,
      links: links,
      evidenceUrl: evidenceUrl
    };
  }

  function evidenceSummary(contract) {
    if (!contract.evidence) return "No retained evidence observation";
    var label = contract.evidence.lane + " " + contract.evidence.status;
    if (contract.stale) label += " · stale";
    if (contract.evidence.observedAt) {
      label += " · observed " + new Date(contract.evidence.observedAt).toLocaleString();
    } else {
      label += " · no live observation retained";
    }
    return label;
  }

  function appendEvidence(parent, contract, compact) {
    var details = el("div", compact ? "sg-contract is-compact" : "sg-contract");
    var facts = el("dl", "sg-contract-facts");
    facts.appendChild(fact("SDK", contract.sdkVersion));
    facts.appendChild(fact("Support", contract.support.replace(/-/g, " ")));
    facts.appendChild(fact("Data", contract.data.mode));
    facts.appendChild(fact("Health", evidenceSummary(contract)));
    details.appendChild(facts);
    details.appendChild(el("p", "sg-contract-line", "Provenance — " + contract.data.provenance));
    details.appendChild(el("p", "sg-contract-line", "Freshness — " + contract.data.freshness));
    details.appendChild(el("p", "sg-contract-line", "Attribution — " + contract.data.attribution));
    details.appendChild(el("p", "sg-contract-line sg-health-reason", "Health detail — " + contract.reason));
    parent.appendChild(details);
  }

  function appendContractActions(parent, contract) {
    parent.appendChild(linkTo(contract.links.source, "sg-link", "Source ↗"));
    parent.appendChild(linkTo(contract.links.guide, "sg-link", "Guide ↗"));
    parent.appendChild(linkTo(contract.links.apiReference, "sg-link", "API reference ↗"));
    parent.appendChild(linkTo(contract.evidenceUrl, "sg-link", "Evidence ↗"));
  }

  function journeyCard(journey, index) {
    var contract = journey.contract;
    var card = el("article", "sg-journey");
    if (contract.support === "experimental") card.classList.add("is-experimental");
    card.dataset.goal = journey.goal;
    card.dataset.search = [
      journey.title,
      journey.userProblem,
      journey.outcome,
      goalLabels[journey.goal],
      (journey.sdkConcepts || []).join(" "),
      contract.capabilities.join(" "),
      contract.protocols.join(" "),
      contract.renderers.join(" "),
      (journey.differentiators || []).join(" "),
      journey.execution && journey.execution.mode,
      journey.execution && journey.execution.fallback,
      contract.support,
      contract.sdkVersion,
      contract.data.provenance
    ].join(" ").toLowerCase();

    var head = el("div", "sg-card-head");
    var kicker = el("div", "sg-card-kicker");
    kicker.appendChild(el("span", null, String(index + 1).padStart(2, "0") + " · " + journey.kicker));
    kicker.appendChild(el("span", null, contract.support.replace(/-/g, " ")));
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
    facts.appendChild(fact("Renderer", contract.renderers.join(" + ")));
    facts.appendChild(fact("Auth", contract.data.authMode));
    card.appendChild(facts);

    var badges = el("div", "sg-badges");
    badges.appendChild(stateBadge(journey.execution.mode));
    if (journey.execution.fallback) badges.appendChild(stateBadge(journey.execution.fallback, "fallback"));
    if (journey.execution.liveMode) badges.appendChild(stateBadge(journey.execution.liveMode, "opt-in"));
    badges.appendChild(stateBadge(contract.evidenceTone, "evidence"));
    if (contract.stale) badges.appendChild(stateBadge("stale"));
    contract.protocols.slice(0, 2).forEach(function (protocol) {
      badges.appendChild(el("span", "sg-badge", protocol));
    });
    card.appendChild(badges);
    card.appendChild(el("p", "sg-runtime", journey.execution.runtimeState));
    appendEvidence(card, contract, false);

    var diffs = el("div", "sg-diffs");
    (journey.differentiators || []).forEach(function (item) {
      diffs.appendChild(el("span", null, item));
    });
    card.appendChild(diffs);

    var actions = el("div", "sg-actions");
    actions.appendChild(linkTo(journey.href, "sg-primary", contract.support === "experimental" ? "Inspect the lab ↗" : "Start journey →"));
    appendContractActions(actions, contract);
    if (journey.next) actions.appendChild(linkTo(journey.next.href, "sg-link", journey.next.label + " →"));
    card.appendChild(actions);
    return card;
  }

  function recipeCard(recipe) {
    var contract = recipe.contract;
    var card = el("article", "sg-recipe");
    card.dataset.goal = (manifestData.journeys.find(function (journey) {
      return journey.id === recipe.journey;
    }) || {}).goal || "";
    card.dataset.search = [
      recipe.title,
      recipe.blurb,
      recipe.journey,
      (recipe.tags || []).join(" "),
      contract.capabilities.join(" "),
      recipe.execution.mode,
      recipe.execution.fallback,
      contract.support,
      contract.sdkVersion,
      contract.data.provenance
    ].join(" ").toLowerCase();
    card.appendChild(linkTo(recipe.href, "sg-recipe-title", recipe.title));
    card.appendChild(el("p", null, recipe.blurb));
    var meta = el("div", "sg-recipe-meta");
    meta.appendChild(stateBadge(recipe.execution.mode));
    if (recipe.execution.fallback) meta.appendChild(stateBadge(recipe.execution.fallback, "fallback"));
    meta.appendChild(stateBadge(contract.evidenceTone, "evidence"));
    if (contract.stale) meta.appendChild(stateBadge("stale"));
    (recipe.tags || []).slice(0, 1).forEach(function (tag) {
      meta.appendChild(el("span", "sg-badge", tag));
    });
    card.appendChild(meta);
    appendEvidence(card, contract, true);
    var actions = el("div", "sg-recipe-actions");
    actions.appendChild(linkTo(recipe.href, "sg-primary", /^https:/.test(recipe.href) ? "Open source ↗" : "Open recipe →"));
    appendContractActions(actions, contract);
    card.appendChild(actions);
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
      journey.contract = resolveContract(journey.contractRef);
      journeysRoot.appendChild(journeyCard(journey, index));
    });
    var recipesRoot = byId("sg-recipes");
    recipesRoot.innerHTML = "";
    manifestData.recipes.forEach(function (recipe) {
      recipe.contract = resolveContract(recipe.contractRef);
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

  function fetchJson(path) {
    return fetch(path, { headers: { Accept: "application/json" } }).then(function (response) {
      if (!response.ok) throw new Error(path + " " + response.status);
      return response.json();
    });
  }

  function render(manifest, sdk, exceptions) {
    manifestData = manifest;
    sdkPublication = sdk;
    siteExceptions = exceptions;
    renderArtifact();
    renderStateKey();
    renderGoals();
    renderCatalog();
    byId("sg-filter").addEventListener("input", applyFilters);
    applyFilters();
  }

  fetchJson("assets/samples/manifest.json")
    .then(function (manifest) {
      return Promise.all([
        Promise.resolve(manifest),
        fetchJson(manifest.projection.publication),
        fetchJson(manifest.projection.siteExceptions)
      ]);
    })
    .then(function (catalogs) { render(catalogs[0], catalogs[1], catalogs[2]); })
    .catch(function (error) {
      var root = byId("sg-journeys");
      if (root) root.innerHTML = "";
      if (root) root.appendChild(el("p", "sg-empty", "Could not load the versioned sample contracts (" + String(error.message || error) + ")."));
      byId("sg-journey-count").textContent = "Unavailable";
      byId("sg-recipe-count").textContent = "Unavailable";
    });
})();

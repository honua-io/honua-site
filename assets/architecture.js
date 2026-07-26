(function () {
  "use strict";

  var TAB_IDS = ["overview", "esri", "ops", "azure", "aws"];
  var AUTOPLAY_DELAY = 5000;
  var TRACE_DELAY = 700;
  var motionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

  function toArray(collection) {
    return Array.prototype.slice.call(collection);
  }

  function setButtonType(button) {
    if (button.tagName === "BUTTON" && !button.hasAttribute("type")) {
      button.setAttribute("type", "button");
    }
  }

  function directDescendants(root, selector, boundarySelector) {
    return toArray(root.querySelectorAll(selector)).filter(function (element) {
      return element.closest(boundarySelector) === root;
    });
  }

  function addMediaListener(query, listener) {
    if (!query) return;

    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", listener);
      return;
    }

    if (typeof query.addListener === "function") {
      query.addListener(listener);
    }
  }

  function hashPanelId() {
    var value = window.location.hash.replace(/^#/, "");

    try {
      value = decodeURIComponent(value);
    } catch (error) {
      return "";
    }

    return TAB_IDS.indexOf(value) === -1 ? "" : value;
  }

  function updateHash(panelId) {
    if (window.location.hash === "#" + panelId) return;

    try {
      window.history.replaceState(null, "", "#" + panelId);
    } catch (error) {
      window.location.hash = panelId;
    }
  }

  function initArchitectureTabs() {
    var tabs = toArray(document.querySelectorAll("[data-architecture-tab]"));
    var panels = toArray(document.querySelectorAll("[data-architecture-panel]"));

    if (!tabs.length || !panels.length) return;

    var tabsByPanel = {};
    var panelsById = {};

    panels.forEach(function (panel) {
      if (TAB_IDS.indexOf(panel.id) === -1) return;
      panelsById[panel.id] = panel;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("tabindex", "0");
    });

    tabs.forEach(function (tab, index) {
      var panelId = tab.getAttribute("aria-controls");

      if (!panelsById[panelId]) return;

      setButtonType(tab);
      tab.setAttribute("role", "tab");
      if (!tab.id) tab.id = "architecture-tab-" + panelId + "-" + index;
      panelsById[panelId].setAttribute("aria-labelledby", tab.id);
      tabsByPanel[panelId] = tab;
    });

    var validTabs = tabs.filter(function (tab) {
      return Boolean(tabsByPanel[tab.getAttribute("aria-controls")]);
    });

    if (!validTabs.length) return;

    var tabList = validTabs[0].parentElement;
    if (tabList && !tabList.hasAttribute("role")) {
      tabList.setAttribute("role", "tablist");
    }

    function activate(panelId, options) {
      var tab = tabsByPanel[panelId];
      var panel = panelsById[panelId];

      if (!tab || !panel) return false;

      validTabs.forEach(function (candidate) {
        var isActive = candidate === tab;
        candidate.setAttribute("aria-selected", String(isActive));
        candidate.setAttribute("tabindex", isActive ? "0" : "-1");
      });

      panels.forEach(function (candidate) {
        candidate.hidden = candidate !== panel;
      });

      if (options && options.updateHash) updateHash(panelId);
      if (options && options.focus) tab.focus();
      return true;
    }

    validTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        activate(tab.getAttribute("aria-controls"), {
          focus: false,
          updateHash: true
        });
      });

      tab.addEventListener("keydown", function (event) {
        var currentIndex = validTabs.indexOf(tab);
        var nextIndex = currentIndex;

        if (event.key === "ArrowRight") {
          nextIndex = (currentIndex + 1) % validTabs.length;
        } else if (event.key === "ArrowLeft") {
          nextIndex = (currentIndex - 1 + validTabs.length) % validTabs.length;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = validTabs.length - 1;
        } else {
          return;
        }

        event.preventDefault();
        activate(validTabs[nextIndex].getAttribute("aria-controls"), {
          focus: true,
          updateHash: true
        });
      });
    });

    function activateFromHash(shouldFocus) {
      var panelId = hashPanelId();
      if (panelId) activate(panelId, { focus: shouldFocus, updateHash: false });
    }

    window.addEventListener("hashchange", function () {
      activateFromHash(true);
    });
    window.addEventListener("popstate", function () {
      activateFromHash(true);
    });

    var initialPanelId = hashPanelId();
    if (!initialPanelId) {
      var selected = validTabs.filter(function (tab) {
        return tab.getAttribute("aria-selected") === "true";
      })[0];
      initialPanelId = selected
        ? selected.getAttribute("aria-controls")
        : validTabs[0].getAttribute("aria-controls");
    }

    // Apply deep links without moving focus away from the browser's natural
    // initial focus target.
    activate(initialPanelId, { focus: false, updateHash: false });
  }

  function editionTokens(element) {
    return (element.getAttribute("data-editions") || "")
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);
  }

  function editionIsVisible(tokens, edition) {
    if (tokens.indexOf("all") !== -1 || edition === "all") return true;
    if (edition === "community") return tokens.indexOf("community") !== -1;
    if (edition === "pro") {
      return tokens.indexOf("community") !== -1 || tokens.indexOf("pro") !== -1;
    }
    if (edition === "enterprise") {
      return (
        tokens.indexOf("community") !== -1 ||
        tokens.indexOf("pro") !== -1 ||
        tokens.indexOf("enterprise") !== -1
      );
    }
    return false;
  }

  function initEditionFilter() {
    var buttons = toArray(document.querySelectorAll("[data-architecture-edition]"));
    var items = toArray(document.querySelectorAll("[data-editions]"));
    var descriptions = toArray(document.querySelectorAll("[data-edition-description]"));
    var descriptionText = {
      all: "Showing documented capabilities across all editions. Maturity labels still apply.",
      community: "Showing Community source-evaluation capabilities. Operation-level coverage still applies.",
      pro: "Showing Community and Pro capabilities. Preview labels and evidence boundaries still apply.",
      enterprise: "Showing Community, Pro, and Enterprise capabilities. Maturity labels still apply."
    };

    if (!buttons.length || !items.length) return;

    function selectEdition(edition) {
      var selectedButton = null;

      buttons.forEach(function (button) {
        var isSelected =
          button.getAttribute("data-architecture-edition") === edition;
        button.setAttribute("aria-pressed", String(isSelected));
        if (isSelected) selectedButton = button;
      });

      if (!selectedButton) return;

      items.forEach(function (item) {
        var visible = editionIsVisible(editionTokens(item), edition);
        item.hidden = !visible;
        item.setAttribute("data-edition-visible", String(visible));
      });

      var customDescription =
        selectedButton.getAttribute("data-edition-description-text") ||
        selectedButton.getAttribute("data-description");
      descriptions.forEach(function (description) {
        description.textContent =
          customDescription || descriptionText[edition] || descriptionText.all;
      });
    }

    buttons.forEach(function (button) {
      setButtonType(button);
      button.addEventListener("click", function () {
        selectEdition(button.getAttribute("data-architecture-edition"));
      });
    });

    var initiallySelected = buttons.filter(function (button) {
      return button.getAttribute("aria-pressed") === "true";
    })[0];
    var defaultButton =
      initiallySelected ||
      buttons.filter(function (button) {
        return button.getAttribute("data-architecture-edition") === "community";
      })[0] ||
      buttons[0];

    selectEdition(defaultButton.getAttribute("data-architecture-edition"));
  }

  function initStepper(stepper, index) {
    var controls = directDescendants(
      stepper,
      "[data-step-target]",
      "[data-stepper]"
    );
    var steps = directDescendants(stepper, "[data-step]", "[data-stepper]");
    var playButton = directDescendants(
      stepper,
      "[data-step-play]",
      "[data-stepper]"
    )[0];
    var timer = null;
    var playing = false;
    var activeTarget = "";

    if (!controls.length || !steps.length) return;

    function targetFor(control) {
      return (control.getAttribute("data-step-target") || "").replace(/^#/, "");
    }

    function stepTarget(step) {
      return (step.getAttribute("data-step") || step.id || "").replace(/^#/, "");
    }

    function hasTarget(target) {
      return steps.some(function (step) {
        return stepTarget(step) === target;
      });
    }

    function clearTimer() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    function canAutoplay() {
      return (
        playing &&
        controls.length > 1 &&
        !(motionQuery && motionQuery.matches) &&
        document.visibilityState !== "hidden"
      );
    }

    function updatePlayButton() {
      if (!playButton) return;

      var reduced = Boolean(motionQuery && motionQuery.matches);
      var unavailable = reduced || controls.length < 2;
      var playLabel =
        playButton.getAttribute("data-play-label") || "Play step animation";
      var pauseLabel =
        playButton.getAttribute("data-pause-label") || "Pause step animation";
      var label = playing ? pauseLabel : playLabel;
      var text = playButton.querySelector("[data-step-play-text]");

      playButton.setAttribute("aria-pressed", String(playing));
      playButton.setAttribute("aria-label", label);
      playButton.setAttribute("aria-disabled", String(unavailable));
      playButton.disabled = unavailable;
      playButton.setAttribute("data-playing", String(playing));
      if (text) text.textContent = playing ? "Pause" : "Play";
    }

    function pause() {
      playing = false;
      clearTimer();
      updatePlayButton();
    }

    function activate(target, pausePlayback, focusControl) {
      if (!hasTarget(target)) return false;
      if (pausePlayback) pause();

      activeTarget = target;
      controls.forEach(function (control) {
        var isActive = targetFor(control) === target;
        control.setAttribute("aria-selected", String(isActive));
        control.setAttribute("tabindex", isActive ? "0" : "-1");
        if (isActive && focusControl) control.focus();
      });

      steps.forEach(function (step) {
        step.hidden = stepTarget(step) !== target;
      });

      return true;
    }

    function schedule() {
      clearTimer();
      if (!canAutoplay()) return;

      timer = window.setTimeout(function () {
        var currentIndex = controls.findIndex(function (control) {
          return targetFor(control) === activeTarget;
        });
        var nextIndex = (currentIndex + 1) % controls.length;

        activate(targetFor(controls[nextIndex]), false, false);
        schedule();
      }, AUTOPLAY_DELAY);
    }

    controls.forEach(function (control) {
      setButtonType(control);
      control.addEventListener("click", function () {
        activate(targetFor(control), true, false);
      });

      control.addEventListener("keydown", function (event) {
        var currentIndex = controls.indexOf(control);
        var nextIndex = currentIndex;

        if (event.key === "ArrowRight") {
          nextIndex = (currentIndex + 1) % controls.length;
        } else if (event.key === "ArrowLeft") {
          nextIndex = (currentIndex - 1 + controls.length) % controls.length;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = controls.length - 1;
        } else {
          return;
        }

        event.preventDefault();
        activate(targetFor(controls[nextIndex]), true, true);
      });
    });

    if (playButton) {
      setButtonType(playButton);
      if (!playButton.id) playButton.id = "step-play-" + index;
      playButton.addEventListener("click", function () {
        if (motionQuery && motionQuery.matches) return;
        playing = !playing;
        updatePlayButton();
        if (playing) schedule();
        else clearTimer();
      });
    }

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        clearTimer();
      } else if (playing) {
        schedule();
      }
    });

    addMediaListener(motionQuery, function (event) {
      if (event.matches) pause();
      else updatePlayButton();
    });

    var selectedControl = controls.filter(function (control) {
      return control.getAttribute("aria-selected") === "true";
    })[0];
    var initialTarget = targetFor(selectedControl || controls[0]);

    activate(initialTarget, false, false);
    updatePlayButton();
  }

  function traceContainer(button) {
    return (
      button.closest("[data-trace]") ||
      button.closest("[data-architecture-panel]") ||
      button.parentElement ||
      document
    );
  }

  function traceNodeLabel(node, index) {
    var label =
      node.getAttribute("data-trace-label") ||
      node.getAttribute("aria-label") ||
      node.textContent;
    label = (label || "").replace(/\s+/g, " ").trim();
    return label || "step " + (index + 1);
  }

  function initTrace(button) {
    var root = traceContainer(button);
    var nodes = toArray(root.querySelectorAll("[data-trace-node]"));
    var status = root.querySelector("[data-trace-status]");
    var timer = null;
    var runId = 0;
    var running = false;

    if (!nodes.length) return;

    setButtonType(button);
    if (status) {
      status.setAttribute("aria-live", "polite");
      status.setAttribute("aria-atomic", "true");
    }

    function clearTimer() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    function setNodeState(node, state) {
      node.classList.toggle("is-active", state === "active");
      node.classList.toggle("is-complete", state === "complete");
      node.setAttribute("data-trace-state", state);
      if (state === "active") node.setAttribute("aria-current", "step");
      else node.removeAttribute("aria-current");
    }

    function updateRunningState(isRunning) {
      running = isRunning;
      button.setAttribute("aria-pressed", String(isRunning));
      button.setAttribute("data-tracing", String(isRunning));
      root.setAttribute("aria-busy", String(isRunning));
    }

    function finish(currentRun) {
      if (currentRun !== runId) return;

      nodes.forEach(function (node) {
        setNodeState(node, "complete");
      });
      updateRunningState(false);
      if (status) status.textContent = "Request trace complete.";
    }

    function showStep(stepIndex, currentRun) {
      if (currentRun !== runId) return;
      if (stepIndex >= nodes.length) {
        finish(currentRun);
        return;
      }

      nodes.forEach(function (node, nodeIndex) {
        if (nodeIndex < stepIndex) setNodeState(node, "complete");
        else if (nodeIndex === stepIndex) setNodeState(node, "active");
        else setNodeState(node, "idle");
      });

      if (status) {
        status.textContent =
          "Request at " +
          traceNodeLabel(nodes[stepIndex], stepIndex) +
          " (" +
          (stepIndex + 1) +
          " of " +
          nodes.length +
          ").";
      }

      timer = window.setTimeout(function () {
        showStep(stepIndex + 1, currentRun);
      }, TRACE_DELAY);
    }

    function start() {
      clearTimer();
      runId += 1;
      var currentRun = runId;

      nodes.forEach(function (node) {
        setNodeState(node, "idle");
      });
      updateRunningState(true);

      if (motionQuery && motionQuery.matches) {
        finish(currentRun);
        return;
      }

      showStep(0, currentRun);
    }

    button.addEventListener("click", start);

    addMediaListener(motionQuery, function (event) {
      if (!event.matches || !running) return;
      clearTimer();
      finish(runId);
    });

    window.addEventListener("pagehide", function () {
      clearTimer();
      runId += 1;
      updateRunningState(false);
    });
  }

  function init() {
    initArchitectureTabs();
    initEditionFilter();
    toArray(document.querySelectorAll("[data-stepper]")).forEach(initStepper);
    toArray(document.querySelectorAll("[data-trace-request]")).forEach(initTrace);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

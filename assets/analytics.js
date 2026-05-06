(function () {
  const consentKey = "honua_cookie_consent";
  const accepted = "accepted";
  const declined = "declined";
  const bannerId = "honua-cookie-banner";
  const analyticsId = "G-V7YTZL98ML";
  const attributionKey = "honua_lead_attribution";
  const utmFields = ["source", "medium", "campaign", "term", "content"];
  let analyticsLoaded = false;

  function readConsent() {
    try {
      return window.localStorage.getItem(consentKey);
    } catch {
      return null;
    }
  }

  function writeConsent(value) {
    try {
      window.localStorage.setItem(consentKey, value);
    } catch {
      // Ignore storage failures and keep the site usable.
    }
  }

  function clearConsent() {
    try {
      window.localStorage.removeItem(consentKey);
    } catch {
      // Ignore storage failures and keep the site usable.
    }
  }

  function readAttribution() {
    try {
      return JSON.parse(window.sessionStorage.getItem(attributionKey)) || {};
    } catch {
      return {};
    }
  }

  function writeAttribution(value) {
    try {
      window.sessionStorage.setItem(attributionKey, JSON.stringify(value));
    } catch {
      // Attribution is best-effort and must not interfere with navigation or forms.
    }
  }

  function currentPage() {
    return window.location.href;
  }

  function readUtmParams() {
    const values = {};
    const params = new URLSearchParams(window.location.search);

    utmFields.forEach(function (field) {
      const value = params.get("utm_" + field);
      if (value) {
        values["utm_" + field] = value;
      }
    });

    return values;
  }

  function initAttribution() {
    const existing = readAttribution();
    const next = Object.assign({}, existing);

    if (!next.landing_page) {
      next.landing_page = currentPage();
    }

    if (!next.referrer) {
      next.referrer = document.referrer || "";
    }

    const utmParams = readUtmParams();
    utmFields.forEach(function (field) {
      const key = "utm_" + field;
      if (!next[key] && utmParams[key]) {
        next[key] = utmParams[key];
      }
    });

    writeAttribution(next);
    return next;
  }

  function gtag() {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(arguments);
  }

  function loadAnalytics() {
    if (analyticsLoaded) {
      return;
    }

    analyticsLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = gtag;
    window.gtag("js", new Date());
    window.gtag("config", analyticsId, { anonymize_ip: true });

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(analyticsId);
    document.head.appendChild(script);
  }

  function sendAnalyticsEvent(eventName, params) {
    if (readConsent() !== accepted) {
      return;
    }

    if (!analyticsLoaded) {
      loadAnalytics();
    }

    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, params);
    }
  }

  function ctaLabel(link) {
    if (link.dataset.analyticsLabel) {
      return link.dataset.analyticsLabel;
    }

    const text = link.textContent.trim().toLowerCase().replace(/\s+/g, "_");
    return text || "site_cta";
  }

  function ctaDestination(link) {
    return link.dataset.analyticsDestination || link.getAttribute("href") || link.href || "";
  }

  function rememberCta(link) {
    const next = Object.assign({}, readAttribution(), {
      cta_label: ctaLabel(link),
      cta_page: currentPage(),
      cta_href: ctaDestination(link)
    });

    writeAttribution(next);
    return next;
  }

  function bindCtaTracking() {
    const selector = [
      "a[data-analytics-event]",
      'a[href="docs.html#quickstart"]',
      'a[href="#quickstart"]',
      'a[href="index.html#contact"]',
      'a[href="#contact"]'
    ].join(",");

    document.querySelectorAll(selector).forEach(function (link) {
      link.addEventListener("click", function () {
        const attribution = rememberCta(link);
        sendAnalyticsEvent(link.dataset.analyticsEvent || "cta_click", {
          event_category: "conversion",
          event_label: attribution.cta_label,
          destination: attribution.cta_href,
          page_location: attribution.cta_page
        });
      });
    });
  }

  function setField(form, name, value) {
    const field = form.elements[name];
    if (field) {
      field.value = value || "";
    }
  }

  function populateContactAttribution(form) {
    const attribution = readAttribution();
    const utmParams = readUtmParams();

    setField(form, "lead_landing_page", attribution.landing_page || currentPage());
    setField(form, "lead_current_page", currentPage());
    setField(form, "lead_referrer", attribution.referrer || document.referrer || "");
    utmFields.forEach(function (field) {
      const key = "utm_" + field;
      setField(form, "lead_" + key, attribution[key] || utmParams[key] || "");
    });
    setField(form, "lead_cta_label", attribution.cta_label || "");
    setField(form, "lead_cta_page", attribution.cta_page || "");
    setField(form, "lead_cta_href", attribution.cta_href || "");
  }

  function bindContactForms() {
    document.querySelectorAll("form[data-contact-form], form.contact-form").forEach(function (form) {
      populateContactAttribution(form);
      form.addEventListener("submit", function () {
        populateContactAttribution(form);
        sendAnalyticsEvent("contact_submit", {
          event_category: "conversion",
          event_label: form.elements.lead_cta_label ? form.elements.lead_cta_label.value || "contact_form" : "contact_form",
          lead_current_page: currentPage(),
          transport_type: "beacon"
        });
      });
    });
  }

  function removeBanner() {
    const banner = document.getElementById(bannerId);
    if (banner) {
      banner.remove();
    }
  }

  function setConsent(value) {
    writeConsent(value);
    if (value === accepted) {
      loadAnalytics();
    }
    removeBanner();
  }

  function renderBanner() {
    const consent = readConsent();
    if (consent === accepted || consent === declined || !document.body || document.getElementById(bannerId)) {
      return;
    }

    const banner = document.createElement("section");
    banner.id = bannerId;
    banner.className = "cookie-banner";
    banner.setAttribute("aria-label", "Cookie consent");
    banner.innerHTML =
      '<div class="cookie-banner-copy">' +
      '<strong>Cookie choice</strong>' +
      "<p>Honua only loads analytics after consent. Declining keeps the site functional and skips analytics cookies. See <a href=\"privacy.html#cookies\">cookie details</a>.</p>" +
      "</div>" +
      '<div class="cookie-banner-actions">' +
      '<button class="button button-secondary" type="button" data-cookie-accept>Accept analytics</button>' +
      '<button class="button button-ghost" type="button" data-cookie-decline>Decline</button>' +
      "</div>";

    banner.querySelector("[data-cookie-accept]").addEventListener("click", function () {
      setConsent(accepted);
    });

    banner.querySelector("[data-cookie-decline]").addEventListener("click", function () {
      setConsent(declined);
    });

    document.body.appendChild(banner);
  }

  function bindResetButtons() {
    document.querySelectorAll("[data-cookie-reset]").forEach(function (button) {
      button.addEventListener("click", function () {
        clearConsent();
        removeBanner();
        renderBanner();
      });
    });
  }

  function init() {
    initAttribution();

    if (readConsent() === accepted) {
      loadAnalytics();
    }

    renderBanner();
    bindResetButtons();
    bindCtaTracking();
    bindContactForms();
  }

  document.addEventListener("DOMContentLoaded", init);
})();

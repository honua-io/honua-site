(function () {
  const consentKey = "honua_cookie_consent";
  const accepted = "accepted";
  const declined = "declined";
  const bannerId = "honua-cookie-banner";
  const analyticsId = "G-V7YTZL98ML";
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
    if (readConsent() === accepted) {
      loadAnalytics();
    }

    renderBanner();
    bindResetButtons();
  }

  document.addEventListener("DOMContentLoaded", init);
})();

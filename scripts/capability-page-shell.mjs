// Shared chrome for the capability hub and generated reference pages.
export const escapeHtml = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export const navigation = "<header class=\"bed-nav h-nav\"><a aria-label=\"Honua home\" class=\"brand h-brand\" href=\"index.html\"><img alt=\"\" height=\"34\" src=\"assets/honua-logo.svg\" width=\"34\"/><span>honua</span></a><button aria-controls=\"primary-navigation\" aria-expanded=\"false\" aria-label=\"Open navigation\" class=\"nav-toggle\" type=\"button\"><span></span><span></span><span></span></button><nav aria-label=\"Primary\" class=\"nav-groups\" id=\"primary-navigation\"><a href=\"architecture.html\">How it works</a><a href=\"editions.html\">Editions</a><a href=\"blog.html\">Blog</a><a href=\"https://docs.honua.io/\">Docs</a><a href=\"https://github.com/honua-io\">GitHub</a><a class=\"h-button\" data-analytics-destination=\"index.html#contact\" data-analytics-event=\"cta_click\" data-analytics-label=\"nav_contact\" href=\"index.html#contact\">Talk to us<span aria-hidden=\"true\">\u2197</span></a></nav></header>";
export const footer = "<footer class=\"h-footer\"><div class=\"h-footer-top\"><a class=\"h-brand\" href=\"index.html\"><img alt=\"\" height=\"34\" src=\"assets/honua-logo.svg\" width=\"34\"/><span>honua</span></a><p>Spatial systems, reimagined.</p><a href=\"mailto:info@honua.io\">info@honua.io \u2197</a></div><div class=\"h-footer-links\"><a href=\"capabilities.html\">Capabilities &amp; evidence</a><a href=\"security.html\">Security</a><a href=\"trust.html\">Trust</a><a href=\"https://github.com/honua-io/honua-server/releases\">Releases</a><a href=\"https://github.com/honua-io/honua-server/discussions\">Community</a><a href=\"privacy.html\">Privacy &amp; cookies</a><a href=\"terms.html\">Terms</a><button data-cookie-reset=\"\" type=\"button\">Cookie settings</button></div><div class=\"h-footer-bottom\"><p>Server &amp; Collect: ELv2. Other platform components: Apache 2.0.<br/>Mobile SDK and Collect are experimental.</p></div></footer>";
export function documentPage(title, file, body, extra = '') {
  const e = escapeHtml;
  const description = `Explore ${title.toLowerCase()} with documentation and release details.`;
  return normalizeCapabilityMetadata(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)} | Honua</title><meta name="description" content="${e(description)}">
<link rel="canonical" href="https://honua.io/${e(file)}">
<meta property="og:title" content="${e(title)} | Honua"><meta property="og:type" content="website"><meta property="og:url" content="https://honua.io/${e(file)}"><meta property="og:image" content="https://honua.io/assets/og-image.png"><meta name="twitter:card" content="summary_large_image">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' https://www.googletagmanager.com https://www.google-analytics.com; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https://www.google-analytics.com https://honua.io; form-action 'self' https://formsubmit.co; upgrade-insecure-requests">
<link rel="icon" href="assets/favicon-32.png"><link rel="preload" href="assets/fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="assets/fonts/geist-mono-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/remodel.css"><link rel="stylesheet" href="assets/capability-hub.css">
<script defer src="assets/nav.js"></script><script defer src="assets/analytics.js"></script>${extra}</head>
<body class="h-site"><a class="skip-link" href="#main-content">Skip to content</a>${navigation}<main id="main-content" tabindex="-1">${body}</main>${footer}</body></html>
`);
}

// Match the site's canonical metadata contract without changing page content.
export function normalizeCapabilityMetadata(html) {
  return html.replace(/<head>([\s\S]*?)<\/head>/i, (_match, head) => {
    const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    head = head.replace(/<meta\b[^>]*>/gi, tag => {
      const a = attrs(tag);
      const kind = a.name ? 'name' : a.property ? 'property' : a['http-equiv'] ? 'http-equiv' : null;
      if (kind) return `<meta ${kind}="${a[kind]}" content="${a.content ?? ''}" />`;
      return a.charset ? `<meta charset="${a.charset}" />` : tag;
    }).replace(/<link\b[^>]*>/gi, tag => {
      const a = attrs(tag);
      return a.rel === 'canonical' ? `<link rel="canonical" href="${a.href}" />` : tag;
    });
    const title = head.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || 'Honua';
    const description = head.match(/<meta name="description" content="([^"]*)"/i)?.[1] || '';
    const image = 'https://honua.io/assets/og-image.png';
    const alt = 'Honua social preview: Open geospatial infrastructure. One server. Open standards. Your cloud.';
    for (const [kind,key,value] of [
      ['property','og:description',description], ['property','og:site_name','Honua'],
      ['property','og:image:alt',alt], ['property','og:image:width','1200'], ['property','og:image:height','630'],
      ['name','twitter:title',title], ['name','twitter:description',description],
      ['name','twitter:image',image], ['name','twitter:image:alt',alt],
    ]) if (!head.includes(`${kind}="${key}"`)) head += `\n<meta ${kind}="${key}" content="${value}" />`;
    return '<head>' + head + '</head>';
  });
}

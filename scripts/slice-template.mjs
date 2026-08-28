// The capability-slice page template (#218), map-shaped and reference-shaped.
//
// One entry point: `renderConceptPage(markdown)` takes the bytes of an OKF
// concept file and returns the bytes of its HTML projection. Nothing else goes
// in — no manifest, no options — because the D0.7 inversion (#213) only means
// something if the page really is derivable from the concept alone. Where the
// page needs to know something structural (which shape the slice is, whether it
// carries a preview label, how deep the page sits under the site root) it reads
// it back out of the concept's own frontmatter.
//
// The template's opinions, from the design brief:
//
//   - Seven panels in a fixed order; the concept's `##` sections are the panels.
//   - Panels 3 and 4 are tab groups, and they are deliberately *not* the same
//     control: Set it up gets pill tabs above its panel, Use it gets underlined
//     tabs on a rule. Any `##` section with two or more `###` children becomes a
//     tab group; one child stays a plain labelled block.
//   - Switching a tab must not move the page, so every panel in a group shares
//     one grid cell and the group is as tall as its tallest panel.
//   - A code block is an object: language, copy affordance, contained scroll,
//     and the one line you are meant to edit marked.
//   - The honest-gap sentence is a designed component, rendered from the
//     concept's blockquotes — one sentence, one issue link, no apology and no
//     empty tab behind it.
//   - Panel 6 is recessive fine print.
//
// No inline <script> or <style>: the site's CSP is `script-src 'self'` /
// `style-src 'self'`, and the slice pages keep it that way.

import { parseConcept, tagValue } from "./slice-concept.mjs";

/** `## Set it up` deep-links as `#setup=cli`, not `#set-it-up=cli`. */
const TAB_GROUP_KEYS = { "set-it-up": "setup", "use-it": "use" };

/** Panels whose tab control is the pill row rather than the underlined row. */
const PILL_GROUPS = new Set(["setup"]);

const NAV = [
  ["docs.html", "Docs"],
  ["samples.html", "Samples"],
  ["demos.html", "Demos"],
  ["architecture.html", "Architecture"],
];

const CSP =
  "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' https://www.googletagmanager.com https://www.google-analytics.com; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com; style-src 'self'; font-src 'self'; img-src 'self' data: https://www.google-analytics.com https://honua.io; form-action 'self' https://formsubmit.co; upgrade-insecure-requests";

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * How far the page sits below the site root, read off its own `resource` URL.
 * `https://honua.io/docs/geoprocessing/` is two levels down, so its assets are
 * at `../../assets/…`; the bundle index is one.
 */
export function assetPrefix(resource) {
  let path = "/";
  try {
    path = new URL(String(resource)).pathname;
  } catch {
    path = "/";
  }
  const depth = path.split("/").filter(Boolean).length;
  return depth === 0 ? "./" : "../".repeat(depth);
}

const isExternal = (href) => /^https?:\/\//.test(href);

/**
 * Rewrite a concept edge into a page edge. Inside the bundle the edges point at
 * concept files (`../first-map/index.md`) because that is what makes the
 * directory traversable for an agent; the reader of the HTML wants the HTML.
 */
export function pageHref(target) {
  if (isExternal(target) || target.startsWith("#") || target.startsWith("mailto:")) return target;
  if (target.endsWith("/index.md")) return target.slice(0, -"index.md".length);
  if (target === "index.md") return "./";
  if (target.endsWith(".md")) return `${target.slice(0, -3)}.html`;
  return target;
}

const INLINE_RE = /(`[^`]+`)|(\[[^\]]*\]\([^)\s]+\))|(\*\*[^*]+\*\*)/g;

/** Inline markdown: code spans, links, bold. Everything else is text. */
export function renderInline(text) {
  let out = "";
  let last = 0;
  for (const match of String(text).matchAll(INLINE_RE)) {
    out += escapeHtml(String(text).slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      out += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    } else if (token.startsWith("[")) {
      const split = token.indexOf("](");
      const label = token.slice(1, split);
      const target = token.slice(split + 2, -1);
      const href = pageHref(target);
      const attrs = isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : "";
      out += `<a href="${escapeHtml(href)}"${attrs}>${renderInline(label)}</a>`;
    } else {
      out += `<strong>${renderInline(token.slice(2, -2))}</strong>`;
    }
    last = match.index + token.length;
  }
  out += escapeHtml(String(text).slice(last));
  return out;
}

/**
 * The one line a reader is meant to change — the host they point the snippet
 * at — marked rather than explained. Nothing is marked when a snippet has no
 * such line, which is the honest outcome for most of them.
 */
function renderCode(code) {
  return code
    .split("\n")
    .map((line) => (/https?:\/\//.test(line) ? `<span class="code-editable">${escapeHtml(line)}</span>` : escapeHtml(line)))
    .join("\n");
}

const LANG_LABEL = {
  js: "JavaScript",
  python: "Python",
  csharp: "C#",
  bash: "Shell",
  http: "HTTP",
  json: "JSON",
};

function renderBlock(block) {
  if (block.kind === "paragraph") return `<p>${renderInline(block.text)}</p>`;
  if (block.kind === "quote") {
    // The honest-gap component. One sentence, one issue link, and it reads as
    // confidence rather than an error state — so it is a designed element with
    // its own mark, not a warning box.
    return `<p class="slice-gap"><span class="slice-gap-mark" aria-hidden="true">&rarr;</span>${renderInline(block.text)}</p>`;
  }
  if (block.kind === "list") {
    return `<ul class="slice-list">${block.items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`;
  }
  if (block.kind === "code") {
    const label = LANG_LABEL[block.lang] ?? (block.lang || "Code");
    const cls = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : "";
    return [
      '<figure class="code-card">',
      `<figcaption><span class="code-lang">${escapeHtml(label)}</span>`,
      '<button type="button" class="code-copy" data-code-copy>Copy</button></figcaption>',
      `<pre tabindex="0"><code${cls}>${renderCode(block.code)}</code></pre>`,
      "</figure>",
    ].join("");
  }
  return "";
}

const renderBlocks = (blocks) => blocks.map(renderBlock).join("");

function renderTabGroup(section, groupKey) {
  const pill = PILL_GROUPS.has(groupKey);
  const tabs = section.children.map((child) => {
    const value = child.slug;
    return {
      value,
      label: child.heading,
      tabId: `${groupKey}-${value}-tab`,
      panelId: `${groupKey}-${value}-panel`,
      blocks: child.blocks,
    };
  });

  const tablist = tabs
    .map(
      (tab, i) =>
        `<button type="button" role="tab" id="${tab.tabId}" aria-controls="${tab.panelId}"` +
        ` aria-selected="${i === 0 ? "true" : "false"}" tabindex="${i === 0 ? "0" : "-1"}"` +
        ` data-tab-value="${escapeHtml(tab.value)}">${escapeHtml(tab.label)}</button>`
    )
    .join("");

  const panels = tabs
    .map(
      (tab, i) =>
        `<div role="tabpanel" id="${tab.panelId}" aria-labelledby="${tab.tabId}"` +
        ` data-tab-value="${escapeHtml(tab.value)}" tabindex="0" aria-hidden="${i === 0 ? "false" : "true"}">` +
        `<h3 class="tab-heading" id="${escapeHtml(tab.value)}">${escapeHtml(tab.label)}</h3>` +
        `${renderBlocks(tab.blocks)}</div>`
    )
    .join("");

  return (
    `<div class="slice-tabs ${pill ? "tabs-pill" : "tabs-rule"}" data-tab-group="${escapeHtml(groupKey)}">` +
    `<div class="tablist" role="tablist" aria-label="${escapeHtml(section.heading)}">${tablist}</div>` +
    `<div class="tabpanels">${panels}</div></div>`
  );
}

function renderPanel(section, order) {
  const groupKey = TAB_GROUP_KEYS[section.slug] ?? section.slug;
  const isTabGroup = section.children.length >= 2;
  const isSample = section.slug === "see-it-run";
  const isUnderneath = section.slug === "underneath";

  const classes = ["hub-section", "slice-panel", `panel-${section.slug}`];
  if (isUnderneath) classes.push("slice-underneath");

  let body = renderBlocks(section.blocks);
  if (isSample) body = `<div class="slice-sample">${body}</div>`;
  if (isTabGroup) {
    body += renderTabGroup(section, groupKey);
  } else {
    for (const child of section.children) {
      body +=
        `<div class="slice-subpanel"><h3 class="tab-heading" id="${escapeHtml(child.slug)}">` +
        `${escapeHtml(child.heading)}</h3>${renderBlocks(child.blocks)}</div>`;
    }
  }

  return (
    `<section class="${classes.join(" ")}" id="${escapeHtml(section.slug)}" aria-labelledby="${escapeHtml(section.slug)}-heading">` +
    '<div class="section-head"><div>' +
    `<span class="section-kicker">${String(order).padStart(2, "0")}</span>` +
    `<h2 id="${escapeHtml(section.slug)}-heading">${escapeHtml(section.heading)}</h2>` +
    `</div></div>${body}</section>`
  );
}

function head({ title, description, resource, prefix, keywords }) {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '    <meta name="theme-color" content="#f3eedc" />',
    `    <title>${escapeHtml(title)} | Honua</title>`,
    `    <meta name="description" content="${escapeHtml(description)}" />`,
    keywords.length ? `    <meta name="keywords" content="${escapeHtml(keywords.join(", "))}" />` : null,
    `    <meta property="og:title" content="${escapeHtml(title)}" />`,
    `    <meta property="og:description" content="${escapeHtml(description)}" />`,
    '    <meta property="og:type" content="article" />',
    `    <meta property="og:url" content="${escapeHtml(resource)}" />`,
    '    <meta name="twitter:card" content="summary" />',
    `    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
    `    <link rel="canonical" href="${escapeHtml(resource)}" />`,
    `    <link rel="icon" type="image/png" sizes="32x32" href="${prefix}assets/favicon-32.png" />`,
    `    <link rel="preload" href="${prefix}assets/fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin />`,
    `    <link rel="preload" href="${prefix}assets/fonts/geist-mono-latin.woff2" as="font" type="font/woff2" crossorigin />`,
    `    <link rel="stylesheet" href="${prefix}assets/learning-hub.css" />`,
    `    <link rel="stylesheet" href="${prefix}assets/slice.css" />`,
    `    <script defer src="${prefix}assets/analytics.js"></script>`,
    `    <script defer src="${prefix}assets/slice-tabs.js"></script>`,
    "  </head>",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function chrome(prefix, current) {
  const links = NAV.map(
    ([href, label]) =>
      `<a href="${prefix}${href}"${href === current ? ' aria-current="page"' : ""}>${label}</a>`
  ).join("");
  return [
    "  <body>",
    '    <a class="skip-link" href="#main-content">Skip to content</a>',
    '    <header class="hub-nav">',
    `      <a class="hub-brand" href="${prefix}index.html"><img src="${prefix}assets/honua-logo.svg" alt="" /><span>Honua</span><small>Documentation</small></a>`,
    `      <nav aria-label="Documentation navigation">${links}<a class="nav-cta" href="${prefix}claims.html">Claims</a></nav>`,
    "    </header>",
  ].join("\n");
}

function footer(prefix, note) {
  return [
    `    <footer class="hub-footer"><span>${note}</span><a href="${prefix}docs.html">All documentation&nbsp;&rarr;</a></footer>`,
    "  </body>",
    "</html>",
    "",
  ].join("\n");
}

/** Render one OKF concept file to its HTML projection. */
export function renderConceptPage(markdown) {
  const concept = parseConcept(markdown);
  const fields = concept.fields;
  const title = typeof fields.title === "string" && fields.title ? fields.title : concept.title;
  const description = typeof fields.description === "string" ? fields.description : "";
  const resource = typeof fields.resource === "string" ? fields.resource : "";
  const prefix = assetPrefix(resource);
  const keywords = Array.isArray(fields.tags) ? fields.tags : [];
  const shape = tagValue(fields, "shape") ?? "map";
  const label = tagValue(fields, "label");
  const isIndex = fields.type === "index";

  const heroClasses = ["hub-hero", "hero-wide", "slice-hero"];
  const mainClasses = ["hub-main", isIndex ? "slice-index" : "slice-page", `slice-shape-${shape}`];

  const hero = [
    `      <section class="${heroClasses.join(" ")}">`,
    "        <div>",
    `          <p class="kicker">${isIndex ? "Capability slices" : "Capability slice"}</p>`,
    `          <h1>${escapeHtml(title)}</h1>`,
    label ? `          <p class="slice-label">${escapeHtml(label)}</p>` : null,
    ...concept.lead.map((block) => `          ${renderBlock(block).replace("<p>", '<p class="lede">')}`),
    "        </div>",
    "      </section>",
  ].filter((line) => line !== null);

  const panels = concept.sections.map((section, index) => `      ${renderPanel(section, index + 1)}`);

  const note = isIndex
    ? "Every page here renders from the concept file beside it, so an agent and a reader see the same page."
    : "This page renders from <code>index.md</code> in the same directory — the file an agent reads.";

  return [
    head({ title, description, resource, prefix, keywords }),
    chrome(prefix, isIndex ? "docs.html" : null),
    `    <main id="main-content" class="${mainClasses.join(" ")}">`,
    ...hero,
    ...panels,
    "    </main>",
    footer(prefix, note),
  ].join("\n");
}

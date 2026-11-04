// The trademark policy (honua-release docs/THIRD-PARTY-TRADEMARKS.md) requires this
// attribution, verbatim, in the source of every page that names an Esri mark.
export const TRADEMARK_NOTICE =
  "Esri, ArcGIS, and the Esri product names used here are trademarks, registered trademarks, or service " +
  "marks of Esri in the United States and other countries. They identify the products Honua is compatible " +
  "with; Honua is not affiliated with, sponsored by, or endorsed by Esri.";

const MARK = /\b(?:esri|arcgis)\b/i;
const NON_PROSE = /<(script|style|code|pre)\b[\s\S]*?<\/\1>|<!--[\s\S]*?-->/gi;
const FOOTER_BOTTOM_END = /(<div class="h-footer-bottom">[\s\S]*?)(<\/div>\s*<\/footer>)/;

export function namesTrademark(html) {
  return MARK.test(html.replace(NON_PROSE, " ").replace(/<[^>]+>/g, " "));
}

export function hasTrademarkNotice(html) {
  return html.replace(/\s+/g, " ").includes(TRADEMARK_NOTICE);
}

export function withTrademarkNotice(html) {
  if (!namesTrademark(html) || hasTrademarkNotice(html)) return html;
  return html.replace(FOOTER_BOTTOM_END, `$1<p>${TRADEMARK_NOTICE}</p>$2`);
}

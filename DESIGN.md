---
name: Honua marketing site
description: A geodetic control network on dark ocean ground; the server is the datum, every client is a station tied to it.
colors:
  ocean-ground: "#08131a"
  ocean-surface: "#0e1e27"
  ocean-surface-2: "#162a34"
  ocean-surface-3: "#1f3a47"
  chart-line: "#22343f"
  chart-line-soft: "#172730"
  chart-ink: "#e6efee"
  chart-muted: "#8ea7a6"
  teal-bright: "#5fc4a6"
  teal: "#3aa088"
  blue-bright: "#85c9f4"
  blue: "#5fa1cc"
  blue-deep: "#3a7aa0"
  amber-bright: "#f2aa78"
  amber: "#d9824a"
  cream: "#e6efee"
  accent-hover: "#7fd3b9"
  field-line: "#5f7a87"
  danger: "#f29c95"
  on-accent: "#04151a"
typography:
  display:
    fontFamily: "Geist, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(44px, 6vw, 96px)"
    fontWeight: 600
    lineHeight: 0.98
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Geist, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(44px, 4.4vw, 70px)"
    fontWeight: 600
    lineHeight: 0.96
    letterSpacing: "-0.03em"
  section:
    fontFamily: "Geist, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(32px, 3.6vw, 52px)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Geist, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(24px, 2.3vw, 32px)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  lede:
    fontFamily: "Geist, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  body:
    fontFamily: "Geist, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  body-secondary:
    fontFamily: "Geist, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  control:
    fontFamily: "Geist Mono, JetBrains Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.1em"
  label:
    fontFamily: "Geist Mono, JetBrains Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.6
    letterSpacing: "0.12em"
rounded:
  none: "0px"
  sm: "4px"
  md: "6px"
  lg: "10px"
spacing:
  cell-y: "7px"
  xs: "8px"
  sm: "16px"
  cell-x: "16px"
  md: "22px"
  lg: "32px"
  row: "34px"
  heading: "40px"
  net-gap: "44px"
  section-mobile: "64px"
  section: "88px"
components:
  button-primary:
    backgroundColor: "{colors.teal-bright}"
    textColor: "{colors.on-accent}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.on-accent}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.chart-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "transparent"
    textColor: "{colors.chart-ink}"
  text-link:
    backgroundColor: "transparent"
    textColor: "{colors.teal-bright}"
    typography: "{typography.control}"
    padding: "0"
  text-link-hover:
    textColor: "{colors.chart-ink}"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.chart-muted}"
    typography: "{typography.control}"
    padding: "10px 0"
  nav-link-current:
    textColor: "{colors.chart-ink}"
  input:
    backgroundColor: "{colors.ocean-ground}"
    textColor: "{colors.chart-ink}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
    height: "48px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.chart-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "9px 10px"
  badge-preview:
    backgroundColor: "transparent"
    textColor: "{colors.amber-bright}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 7px"
  datasheet-cell:
    backgroundColor: "{colors.ocean-surface}"
    textColor: "{colors.chart-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    padding: "7px 16px"
  datasheet-action:
    backgroundColor: "{colors.teal-bright}"
    textColor: "{colors.on-accent}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    padding: "13px 18px"
    height: "50px"
  strip-entry:
    backgroundColor: "{colors.ocean-ground}"
    textColor: "{colors.chart-muted}"
    typography: "{typography.label}"
    padding: "16px 10px 16px 0"
  strip-entry-lit:
    backgroundColor: "{colors.ocean-surface}"
    textColor: "{colors.chart-ink}"
---

# Design System: Honua marketing site

## Overview

**Creative North Star: "The Geodetic Control Network"**

The site is drawn the way a survey office draws a control network: a USC&GS triangulation diagram on top, an NGS datasheet underneath. Honua Server is the datum at the centre; every client the visitor already runs (desktop GIS, field apps, QGIS, web maps, Power BI, SDKs, AI agents) is a station tied to it by a protocol baseline. Nothing is decorative: every line is a tie, every tint names a protocol, every label is a designation. The page reads as an instrument, not a brochure.

The ground is one continuous dark teal ocean (`ocean-ground`) with no light bands anywhere; the ruled chart collar (one-pixel `chart-line` hairlines with 80px graticule ticks) frames the header, the main column, section openings and the footer, so each page sits inside a plate. Type is two voices only: Geist, tightly tracked, for headlines and prose, and Geist Mono in tracked caps for everything that is a designation, a control, a reading, or a number. Density is high and calm: cells, rules and 11-to-12px caps carry most of the information; large type is reserved for a few sentences.

State is two-valued. A tie, a station, a strip entry or a button is lit or unlit, and the change is a hard cut with no transition. The only motion in the world is the one-time draw of the baselines on load. Corners use the three shared radii and nothing else; there are no glows, no lifted cards, no kickers above headings.

**Key Characteristics:**
- Continuous `ocean-ground` with hairline chart collar; depth comes from one surface step and rules, never from shadow.
- Protocol tints are a legend, used identically on the net, the strip, tables and links.
- Controls, chips and panels take the shared radii (6px, 4px, 10px); borders are one pixel. Cells inside a panel stay square.
- Geist display (600, -0.03em) against Geist Mono caps (500, 11 to 12px, 0.1 to 0.12em).
- Two-state interaction with a hard cut; one draw animation on load, honoured by reduced motion.

## Colors

A dark teal ocean carried by one surface step and hairline chart lines, with four protocol tints used as a legend rather than as decoration. The palette is a binding brand commitment recorded in `assets/theme.css`.

### Primary
- **Teal Bright** (`teal-bright`): the accent and the GeoServices REST tint. The Honua monument, the primary button fill, selection, caret, accent-color, the current-nav underline, the selected tab bar, code in prose, and the featured-edition top rule. It also marks `em` in the big statement headings.
- **Teal** (`teal`): the tile-protocol tint and the second colour in editorial art; a quieter sibling, never the button fill.

### Secondary
- **Blue Bright** (`blue-bright`): the OGC tint, the second line of the H1 and the highlighted span in page-hero H1s.
- **Blue** (`blue`): the OData and STAC tint.
- **Blue Deep** (`blue-deep`): defined in the palette; not consumed by the world stylesheet today.

### Tertiary
- **Amber Bright** (`amber-bright`): the MCP tint and the Preview badge. Anything Preview reads amber; nothing else does.
- **Amber** (`amber`): palette sibling, not consumed by the world stylesheet today.
- **Cream** (`cream`): the gRPC and Samples tint; the same value as `chart-ink`.
- **Accent Hover** (`accent-hover`): the primary button's hover fill.
- **Danger** (`danger`): palette-reserved for error states; not consumed by the world stylesheet today.

### Neutral
- **Ocean Ground** (`ocean-ground`): the page, the net, inputs, the nav collar, the strip, nodes and editions. The one continuous ground.
- **Ocean Surface** (`ocean-surface`): the datasheet panel, the tiers table, callouts, selected tabs, lit strip entries, capability-table headers, article code, the next-article and cookie panels. The only surface step used on the homepage.
- **Ocean Surface 2 / 3** (`ocean-surface-2`, `ocean-surface-3`): surface-3 is the stronger rule (`--h-rule`): panel borders, the top rule of a ledger, secondary button borders, input borders, the scrollbar thumb, the dotted frame of the net. Surface-2 is defined and unused by the world stylesheet.
- **Chart Line** (`chart-line`): hairline dividers, cell borders, the collar, graticule ticks, section borders.
- **Chart Line Soft** (`chart-line-soft`): the 48px grid under the control net.
- **Chart Ink** (`chart-ink`): primary text, headings, station marks and labels, button text on secondary.
- **Field Line** (`field-line`): input, select and textarea borders, which need 3:1 against the ground.
- **Chart Muted** (`chart-muted`): placeholders, ledes, body-secondary, designations, nav links at rest, tie labels, `dt` cells, readouts.
- **On Accent** (`on-accent`): text on teal fills (buttons, skip link, selection).

### Named Rules
**The Legend Rule.** A protocol tint means one protocol wherever it appears: teal-bright GeoServices, blue-bright OGC, blue OData and STAC, cream gRPC, amber-bright MCP and anything Preview. The net, the strip, the station list, tables and links share the same assignment; a tint is never reused for mood.

**The One Step Rule.** Depth is `ocean-ground` and one step to `ocean-surface`, separated by a `chart-line` or `ocean-surface-3` hairline. No gradients, no light bands, no third surface on a marketing page.

## Typography

**Display and Body Font:** Geist (variable, self-hosted `assets/fonts/geist-latin.woff2`; fallback Inter, system sans), exposed as `--font-sans`
**Label/Mono Font:** Geist Mono (variable, self-hosted `assets/fonts/geist-mono-latin.woff2`; fallback JetBrains Mono, system mono), exposed as `--font-mono`

This is the family pair of the shared Honua design system, so the site, the legacy demo pages and the product set the same type.

**Character:** A tightly tracked grotesk for the few sentences that persuade, and a tracked-caps mono for every reading, designation, control and number. The mono does the datasheet's work; the sans does the headline's. Tabular numerals are on everywhere (`font-variant-numeric: tabular-nums` at the root). Fonts are self-hosted only (CSP `font-src 'self'`), with `font-display: swap` and preloads for the two roman faces.

### Hierarchy
- **Display** (600, `clamp(44px, 6vw, 96px)`, 0.98, -0.03em): the full-width statement headings (`.h-statement`, `.h-control`). 96px is the ceiling; nothing in the world is set larger. An `em` inside takes `teal-bright`.
- **Headline** (600, `clamp(44px, 4.4vw, 70px)` on the homepage, `--h-h1` `clamp(40px, 4.8vw, 72px)` on every other page, `--h-h1-doc` `clamp(36px, 4.4vw, 64px)` on document pages: legal, reference, articles and evidence; 0.96, -0.03em): the H1, balanced and capped at 11 to 16ch. The second line or key span takes `blue-bright`.
- **Section** (600, `clamp(32px, 3.6vw, 52px)`, 1.02, -0.03em): H2 at the top of each ledger section; the contact H2 runs to `clamp(40px, 4.8vw, 68px)`. Hub and catalogue sections use `--h-h2-hub` `clamp(28px, 3vw, 42px)`; document pages use `--h-h2-doc` 30px.
- **Title** (600, `clamp(24px, 2.3vw, 32px)` in ledgers, base H3 `clamp(22px, 2vw, 28px)`, 1.1, -0.02em): ledger rows and story cards. Cards use `--h-h3-card` 24px, compact cards and document sub-headings `--h-h3-compact` 20px.
- **Promise line** (600, 19px, 1.4, -0.015em): the one sans sub-heading under a section H2. The hero promise (`.h-net-promise`) is the same voice at 20px / 1.35 in `chart-ink`, max 40ch, 10px above the lede.
- **Lede** (400, 19px, 1.55, `chart-muted`, max 60ch; 16px / 56ch in the hero): the sentence under a heading.
- **Body** (400, 16px, 1.6): base. Secondary body in ledgers, stories and contact is 15px; notes and small text 13 to 14px; article prose 17px / 1.75 / max 70ch.
- **Control** (Geist Mono 500, 12px, 1, 0.1em, uppercase): buttons, nav links, text links, station labels, tie labels, datasheet `dd` cells (0.04em). The datasheet action sub-line (`.h-sheet-sub`) is the one setting below it: 11px / 1.4 at 0.03em, uppercase, 78% opacity, wrapping inside the button.
- **Label** (Geist Mono 500, 11px, 1.6, 0.12em, uppercase): designations (`.h-desig`), `dt` cells, net head and readout, strip entries (0.04em), form labels, footer links, badges (0.08em), table headers.

### Named Rules
**The Two Voices Rule.** Sans for sentences, mono caps for designations, controls and readings. A mono label is 11 or 12px, weight 500, uppercase, tracked 0.04 to 0.12em; it never grows into a heading, and a sans heading never shrinks into a label.

**The Six-Rem Ceiling Rule.** Display type stops at 96px. Headlines are weight 600 with -0.03em tracking; no lighter weight, no italics in headings.

## Layout

The page is a plate. The content column is `min(1320px, 100% - 64px)`, centred, and `main` carries one-pixel `chart-line` borders on both sides so the collar runs the full height; inner sections inset a further 32px each side (`calc(100% - 64px)`). The header band is a 72px collar (64px below 900px) with a hairline bottom border and an 80px-pitch graticule tick strip drawn as a repeating gradient; the footer repeats the same tick strip at its top. Sections that open with `.h-rule` draw a 7px tick band plus a one-pixel `ocean-surface-3` rule bleeding 32px past the column edge.

The first viewport is a two-column grid, 47fr copy to 53fr net, with a 44px gutter, 20px top and 24px bottom padding, and the two columns stretched to equal height. The net figure is a flex column whose SVG (viewBox 800 x 720) grows to fill whatever height the copy column takes (`flex: 1 1 auto`, `width: 100%`, no max-height); the drawing keeps its aspect and sits centred while the 48px grid fills the frame. The 548px cap of the 2026-10-30 build is gone, so at 1440 and 1600 by 900 the strip sits just below the fold. Above 900px the strip is one unbroken flex line of equal-growth entries with hairline right borders; it narrows its inset below 1340px, scrolls horizontally below about 1240px with the "All capabilities" link pinned sticky-right over a ground-coloured fade, and does not wrap. At or below 900px it becomes a two-column grid with no overflow: entries take bottom and right hairlines (the right one dropped on even entries), and "All capabilities" is a static full-width last row with 14px by 10px padding, no sticky and no fade.

Sections use 88px vertical padding (64px at or below 900px, 52px at or below 600px) and a 40px heading-to-content gap (28px at 600px). The ledger is a bordered list of rows, each a `0.9fr / 1.1fr / 220px` grid with 32px gaps and 34px vertical padding; story cards are three equal columns separated by hairlines; the contact section is two equal columns with an 80px gutter. Datasheet cells are 7px by 16px inside, with a 130px (112px on mobile) designation column; the panel is 600px wide at most (640px once the hero stacks) and sits 14px under the lede.

Breakpoints as built: 1340px (strip inset), 1180px (hero stacks to one column, ledger loses its aside column, nav tightens), 900px (net SVG, readout and soft grid replaced by the station list with 44px-tall inline-flex link targets, strip wraps to a two-column grid, hamburger nav, single-column ledgers and stories, 40px column inset), 600px (32px column inset, single-column sheet actions, 11px datasheet text). Spacing steps observed: 7, 8, 9, 10, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 34, 40, 44, 64, 88.

## Elevation & Depth

Flat. The world has no elevation shadows: depth is a single tonal step from `ocean-ground` to `ocean-surface` bounded by a hairline, and the net sits on a 48px `chart-line-soft` grid rather than on a raised panel. The one-pixel inset "shadows" in the stylesheet are marks, not lifts: the current nav item's 1px `teal-bright` underline, the selected tab's 2px bar, and the featured edition's 2px top rule. Above 900px the sticky "All capabilities" link in the strip carries `-20px 0 16px -6px ocean-ground`, a fade mask in the ground colour so scrolled entries disappear under it; it is not a drop shadow, and it is removed at or below 900px where the strip wraps instead of scrolling. The only true drop shadow in the stylesheet is on the fixed cookie banner (`0 18px 40px -10px #00000080`), a legacy overlay owned by the unchanged analytics script; it is recorded here as the single exception, not as a vocabulary.

### Named Rules
**The No-Lift Rule.** Panels sit in the ground; they do not float. New surfaces use a border and, at most, one step to `ocean-surface`. Box-shadow is reserved for one-pixel inset marks and ground-coloured fades.

## Shapes

Corners come from three shared radii: 6px (`--radius-md`) for buttons, inputs and the menu button, 4px (`--radius-sm`) for badges, chips and inline code, and 10px (`--radius-lg`) for panels, cards, code blocks and the cookie banner. Cells inside a panel stay square, including the two action buttons at the foot of the homepage datasheet; the panel clips them. No other radius is used. Borders are one pixel: `chart-line` for dividers and ordinary cells, `ocean-surface-3` for the stronger panel outline, button border, input border and the dotted net frame (`stroke-dasharray 3 5`). Marks are geometric: station marks are stroked triangles (1.5px `chart-ink`, filled with ground at rest and with their tint when lit), the Honua monument is a triangle inside a 2px `teal-bright` circle with a 3px centre point, and list and strip bullets are 7 to 8px squares rotated 45 degrees (`.h-dot`) coloured by tint. The outbound-link icon is an 11px stroked SVG arrow with square caps (`.h-ico`, 1.6px stroke), never a text glyph. Ties are 1.25px lines at 75% opacity, 2.5px at full opacity when lit, with unlit ties dimming to 22% while any tie is focused.

## Components

### Buttons
- **Shape:** 6px radius, one-pixel border, 48px minimum height, 18px horizontal padding, content spread with `space-between` and a 24px gap so the arrow icon sits at the far edge.
- **Primary:** `teal-bright` fill and border, `on-accent` text, Geist Mono 500 12px uppercase 0.1em. In the nav it shrinks to 40px tall, 14px padding, 11px type. Inside the datasheet action row it is borderless, at least 50px tall, fills a `minmax(0, 1fr)` cell, and wraps (13px block padding, 5px row gap, left-aligned) so an optional sub-line can sit under the label: `<small class="h-sheet-sub">`, Geist Mono 500 11px / 1.4, 0.03em, uppercase, 78% opacity, taking the full row and allowed to break lines while the label stays on one.
- **Hover / Focus:** Hard cut to `accent-hover` fill and border, same `on-accent` text; `transition: none`. Focus-visible adds the global 2px `teal-bright` outline at 2px offset.
- **Secondary:** Transparent, `chart-ink` text, `ocean-surface-3` border; hover and focus cut the border to `chart-ink`. In the sheet action row it is separated from the primary by a one-pixel `ocean-surface-3` left border (top border when stacked at 600px).

### Text links
- **Style:** Geist Mono 500 12px uppercase 0.1em, `teal-bright` (`--c-link`), underlined in `ocean-surface-3` with a 6px offset, followed by the 11px arrow icon; 22px top margin by default, 0 inside ledgers.
- **Hover:** Colour cuts to `chart-ink` and the underline takes the current colour. Links inside paragraphs, list items, `dd` cells and figcaptions are ink-coloured with a resting 1px underline in `ocean-surface-3` at 4px offset that cuts to the current colour on hover; links elsewhere (nav, footer rows) underline only on hover (1px, 6px offset). The `.h-nb` utility (`white-space: nowrap`) keeps an identifier such as a licence code on one line inside a wrapping cell.

### Chips
- **Style:** Geist Mono 500 11px uppercase 0.1em, `chart-ink`, one-pixel `chart-line` border, 9px by 10px padding, transparent fill, 8px gaps in a wrapping row. Used for the tiers table (`.h-tiers li`) and protocol rows on other routes.
- **State:** Static labels; no selected state.

### Badge
- **Preview:** Geist Mono 11px uppercase 0.08em, `amber-bright` text, one-pixel `ocean-surface-3` border, 2px by 7px padding. Amber is the Preview signal and nothing else.

### Cards / Containers
- **Corner Style:** 10px radius on the panel; cells inside it square.
- **Background:** The datasheet panel, tiers table, callouts and next-article block sit on `ocean-surface`; nodes, editions, the net and the explorer sit on `ocean-ground`. Story cards have no background at all: they are hairline-separated columns whose title cuts to `blue-bright` on hover.
- **Shadow Strategy:** None (see Elevation & Depth).
- **Border:** One-pixel `ocean-surface-3` for the panel outline, `chart-line` for internal cell dividers.
- **Internal Padding:** 7px by 16px for datasheet cells; 10px by 16px for the net head and readout; 18px by 16px for tier designations; 30px by 28px for stories; 22px by 26px for callouts.

### Datasheet panel (signature)
A `dl` rendered as a two-column grid (130px designation column) of bordered cells, 7px by 16px inside: `dt` in `chart-muted` label caps (0.12em) with a right hairline, `dd` in `chart-ink` mono 12px uppercase (0.04em) with rule-coloured underlined links. On the homepage the designations are the manager's questions: What stays, What changes, Where it runs, Proof, Licence, Get started; each value is a two-line reading of middle-dot-separated items. The final row is a two-cell `minmax(0, 1fr)` action grid holding the primary and secondary buttons at 50px minimum, each carrying a sub-line beneath its label (see Buttons); a foot line in 11px label caps closes the panel. The panel is 600px wide at most and sits 14px under the lede. On the homepage it is the only calm surface and the one place the two buttons sit side by side.

### Inputs / Fields
- **Style:** One-pixel `field-line` stroke on `ocean-ground`, 12px by 14px padding, 48px minimum height, Geist 15px (16px at or below 600px), 6px radius. Labels are Geist Mono label caps in `chart-muted` with 8px above the field; placeholders are `chart-faint`.
- **Focus:** Border cuts to `teal-bright`, outline removed. Textareas resize vertically only.
- **Error / Disabled:** Not styled in the world stylesheet; `danger` is reserved in the palette.

### Navigation
- **Style:** 72px collar with a hairline bottom border and 80px graticule ticks; wordmark lowercase "honua" beside the 28px logo in Geist 600 21px, -0.04em. Links are Geist Mono 500 12px uppercase 0.1em in `chart-muted`, 26px apart (18px below 1180px), cutting to `chart-ink` on hover with no underline; the current page carries a 1px `teal-bright` inset underline. The "Talk to us" primary button closes the row.
- **Mobile:** At or below 900px a 44px hamburger (one-pixel `ocean-surface-3` border, three 2px ink bars) opens a full-width panel on `ocean-ground` under the collar, links at 13px with hairline separators and the button beneath. Without JS the links wrap inline.

### Protocol strip (signature)
One hairline-bordered line under the first viewport: each entry is an inline-flex row (9px gap, 16px 10px 16px 0 padding, 10px right margin) of an 8px tinted diamond and a protocol name in `chart-ink`, Geist Mono 11px at 80% width, equal-growth with right hairlines. No maturity word is printed (owner decision, 2026-10-30; the `small` style remains in the stylesheet unused). Hover or `.is-lit` cuts the entry to `ocean-surface`. Above 900px the last entry, "All capabilities", is sticky-right on ground with a left hairline, the arrow icon and the ground-coloured fade; at or below 900px the line wraps into a two-column grid of 13px by 10px cells with bottom and right hairlines (right hairline dropped on even entries) and "All capabilities" becomes a static full-width last row, 14px by 10px, with no fade.

### Control net (signature)
An 800 by 720 SVG on a 48px soft grid, headed by a label-caps caption bar (items aligned to the top, title cell fixed-width) and footed by a live readout (`aria-live="polite"`). The figure is a flex column and the SVG takes all the height between head and readout, so the net fills the hero column at whatever height the copy sets; there is no height cap. Five stations (stroked triangles with mono labels and a muted sub-label: legacy GIS clients on GeoServices REST, AI agents on MCP, QGIS on OGC, Power BI and Excel on OData, SDK applications on gRPC-Web and gRPC) tie to the monument by protocol-tinted 1.25px baselines labelled in rotated label caps. Hovering or focusing a station, or a strip entry, lights the matching ties and station (2.5px, tint fill, other ties at 22%) and writes the datasheet line into the readout: tinted diamond, client, protocol, maturity, evidence link. Stations are anchors, so the net is keyboard-navigable; focus thickens the mark to 3px. On load each baseline draws once over 1.6s with `cubic-bezier(.16, 1, .3, 1)` and an 80ms stagger; under `prefers-reduced-motion` the net renders complete. At or below 900px the SVG, readout and soft grid are replaced by `.h-net-list`, the same stations as a bordered list whose evidence links are 44px-tall inline-flex targets with 10px side padding.

**Voice note (2026-10-30).** The survey world is a drawing convention, not a vocabulary. Visitor-facing copy never says datum, station, baseline, tie or control network; it says client, protocol, server, evidence grade. The internal class names (`.h-net`, `.h-tie`, `.h-station`) keep the drawing's terms.

**Build note (2026-11-01).** The 548px net cap was traded back after the finish review: the net now fills its column and the strip sits just below the fold at desktop sizes. The hero tightened to keep the datasheet actions inside 1440 by 900 (47fr copy column, H1 at 70px ceiling, 16px lede, 7px cells, 14px panel gap); the action sub-lines are the one element this build added to the system.

## Do's and Don'ts

### Do:
- **Do** keep every page on continuous `ocean-ground` inside the hairline collar; use `ocean-surface` as the single step for a panel.
- **Do** set anything that names, measures or controls in Geist Mono 500, 11 or 12px, uppercase, 0.04 to 0.12em; set headlines in Geist 600, -0.03em, capped at 96px.
- **Do** assign protocol tints by the Legend Rule and reuse them identically across the net, strip, tables and links.
- **Do** make state two-valued with a hard cut (`transition: none`); the baseline draw on load is the only animation, and reduced motion shows the net complete.
- **Do** use the 11px stroked SVG arrow (`.h-ico`) for outbound and forward links, stroked triangles for stations, and 45-degree squares for tinted bullets.
- **Do** keep the focus ring as the global 2px `teal-bright` outline (`--c-focus`) at 2px offset; inputs swap their border to the same colour instead.

### Don't:
- **Don't** add a radius outside the three shared tokens, or drop shadows, glows, gradients or light bands.
- **Don't** place a kicker or eyebrow above a heading; the headline, lede and datasheet carry the hierarchy.
- **Don't** render arrows or icons as text glyphs (↗, →); use the inline SVG.
- **Don't** use amber for anything other than MCP or a Preview state, and don't use the accent teal as a mood wash; it marks the datum, the primary action and GeoServices.
- **Don't** animate hover, colour or layout; a lit state appears, it does not fade in.
- **Don't** set display type above 96px, lighter than 600, or in italics.

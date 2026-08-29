// The capability-slice concept file: built from a manifest, read back as a
// structured document. This is the canonical half of the D0.7 inversion
// (epic #213, F3 #217): the markdown concept is the source of truth and the
// HTML page is its projection, so everything a page renders has to be *in*
// the concept — nothing is passed around it.
//
// Open Knowledge Format v0.1 (https://github.com/GoogleCloudPlatform/knowledge-catalog):
// one markdown file is one concept, the file path is the concept's identity,
// relative markdown links are graph edges, and frontmatter carries a required
// `type` plus `title` / `description` / `resource` / `tags` / `timestamp`.
//
// Two directions live here:
//
//   buildSliceConcept()/buildIndexConcept()   manifest  -> concept markdown
//   parseConcept()                            markdown  -> document model
//
// and `scripts/slice-template.mjs` renders the document model to HTML. The
// generator writes the concept first and then renders the page from the bytes
// it just wrote, so "the page is a pure function of the concept" is how the
// pipeline is built rather than something asserted about it afterwards.

import { existsSync } from "node:fs";
import { join } from "node:path";

import { parseFrontmatter, slugify } from "./validate-slice-concepts.mjs";

/**
 * Where a rendered slice page lives today: phase A of the front door (#214)
 * mounts the page directory under the marketing host. Phase B moves the bundle
 * to docs.honua.io (#230/#231) and this constant moves with it — `resource` is
 * the concept's pointer at its own HTML projection, so it must always name the
 * URL the page is actually served from.
 */
export const DOCS_BASE_URL = "https://honua.io/docs";

/**
 * The concept `timestamp`, pinned rather than read off the clock.
 *
 * OKF calls this field the concept's build time, but a wall-clock build time
 * makes every regeneration a diff and turns `--check` into a test of what
 * minute CI ran in. So: SOURCE_DATE_EPOCH when the caller sets it (the
 * reproducible-builds convention), and otherwise the date D0.7 was adopted and
 * this bundle format came into being. It is bumped deliberately, by an edit
 * here, never by the passage of time.
 */
export const CONCEPT_EPOCH = "2026-08-27";

export function conceptTimestamp(env = process.env) {
  const epoch = env.SOURCE_DATE_EPOCH;
  if (epoch !== undefined && /^\d+$/.test(String(epoch).trim())) {
    return new Date(Number(String(epoch).trim()) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  return CONCEPT_EPOCH;
}

// --- the surface vocabulary --------------------------------------------------

/** Panel 3, the operator path. Tab order is the rendered tab order. */
export const SETUP_SURFACES = [
  ["console", "Console"],
  ["cli", "CLI"],
  ["adminApi", "Admin API"],
];

/** Panel 4, the developer path. */
export const USE_SURFACES = [
  ["js", "JavaScript"],
  ["python", "Python"],
  ["dotnet", ".NET"],
  ["mobile", "Mobile"],
];

/** The subject of the honest-gap sentence, per surface. */
const GAP_SUBJECT = {
  console: "the Console",
  cli: "the CLI",
  adminApi: "the Admin API",
  js: "the JavaScript SDK",
  python: "the Python SDK",
  dotnet: "the .NET SDK",
  mobile: "the mobile SDKs",
  mcp: "the MCP server",
};

/** Fence language per surface, so a snippet is highlighted as what it is. */
const SNIPPET_LANG = {
  cli: "bash",
  adminApi: "http",
  js: "js",
  python: "python",
  dotnet: "csharp",
  mobile: "csharp",
};

/** Finder facet for a `use` surface. */
const SDK_FACET = { js: "js", python: "python", dotnet: "dotnet", mobile: "mobile" };

/**
 * Facet-token slug. Deliberately not `slugify()` — that one replicates GitHub's
 * heading-anchor algorithm, which turns "OGC API - Processes" into
 * `ogc-api---processes` because it must agree with the anchor a heading really
 * gets. A facet is a filter value, not an anchor, so it collapses runs.
 */
export function facetSlug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The honest-gap sentence (#218): one sentence, an issue link, and no apology.
 * Rendered as a blockquote so the template can recognise the component
 * structurally instead of matching on its words.
 */
export function gapSentence(surface, state, issue) {
  const subject = GAP_SUBJECT[surface] ?? "this surface";
  return state === "partial"
    ? `Partly there in ${subject} — [track the rest here](${issue}).`
    : `Not in ${subject} yet — [track it here](${issue}).`;
}

// --- manifest -> concept -----------------------------------------------------

function yamlString(value) {
  return JSON.stringify(String(value));
}

function yamlList(values) {
  return `[${values.map(yamlString).join(", ")}]`;
}

function joinPhrase(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** `process.ogc-api-processes` -> `evidence-process-ogc-api-processes.html`. */
export function capabilityPagePath(key) {
  return `evidence-${key.replace(/\./g, "-")}.html`;
}

/**
 * The relative link a capability key renders as. Keys point at the generated
 * per-key page at the site root when it exists, and at the catalog otherwise —
 * either way a real edge in the bundle rather than a bare string.
 */
function capabilityHref(key, { siteRoot, upToRoot }) {
  const page = capabilityPagePath(key);
  const target = siteRoot && existsSync(join(siteRoot, page)) ? page : "capabilities.html";
  return `${upToRoot}${target}`;
}

/**
 * What this page covers, without its title: the protocols underneath it and the
 * SDKs it is reachable from. Derived from the manifest, never invented, and
 * never claiming a surface the manifest calls absent.
 */
export function conceptSummary(manifest) {
  const protocols = manifest.underneath?.protocols ?? [];
  const sdks = USE_SURFACES.filter(([key]) => manifest.use?.[key]?.state !== "absent").map(([, label]) => label);
  const clauses = [];
  if (protocols.length) clauses.push(`over ${joinPhrase(protocols)}`);
  if (sdks.length) clauses.push(`from ${joinPhrase(sdks)}`);
  if (!clauses.length) return "";
  const sentence = clauses.join(", ");
  return `${sentence[0].toUpperCase()}${sentence.slice(1)}.`;
}

/** The description line: the title, then what the page covers. */
export function conceptDescription(manifest) {
  const summary = conceptSummary(manifest);
  return summary ? `${manifest.title} — ${summary.charAt(0).toLowerCase()}${summary.slice(1)}` : `${manifest.title}.`;
}

/**
 * The finder facets (#220) as OKF tags. One list, read by the finder, by the
 * template (shape and label are read back from here) and by any agent walking
 * the bundle.
 */
export function conceptTags(manifest) {
  const tags = [`shape:${manifest.variant}`];
  if (manifest.label) tags.push(`label:${manifest.label}`);
  tags.push(`task:${manifest.slug}`);
  for (const protocol of manifest.underneath?.protocols ?? []) tags.push(`protocol:${facetSlug(protocol)}`);
  for (const key of manifest.capabilityKeys ?? []) tags.push(`capability:${key}`);
  for (const [key, label] of SETUP_SURFACES) {
    if (manifest.setup?.[key]?.state !== "absent") tags.push(`surface:${facetSlug(label)}`);
  }
  for (const [key] of USE_SURFACES) {
    if (manifest.use?.[key]?.state !== "absent") tags.push(`sdk:${SDK_FACET[key]}`);
  }
  if (manifest.ask?.mcp?.state !== "absent") tags.push("agent:mcp");
  if (manifest.sample?.id) tags.push(`sample:${manifest.sample.id}`);
  return tags;
}

/**
 * Whether a surface's payload is rendered at all.
 *
 * `available` and `partial` both describe something a reader can use today —
 * "partly there" is a caveat on working code, not a placeholder — so both show
 * their payload under the gap sentence. `absent` shows the sentence alone: a
 * tab that says the surface does not exist and then prints a command for it is
 * telling the reader two different things, and the reader will believe the
 * command. The schema cannot express this (a manifest moved from partial to
 * absent keeps its old snippet until someone deletes it), so the generator
 * refuses to render it rather than trusting the manifest to be tidy.
 */
function rendersPayload(surface) {
  return surface.state === "available" || surface.state === "partial";
}

function surfaceBlocks(key, surface, extra = []) {
  const blocks = [];
  if (surface.state !== "available" && surface.issue) {
    blocks.push(`> ${gapSentence(key, surface.state, surface.issue)}`);
  }
  blocks.push(...extra);
  if (!rendersPayload(surface)) return blocks;
  if (typeof surface.command === "string") blocks.push(fence("bash", surface.command));
  if (typeof surface.snippet === "string") blocks.push(fence(SNIPPET_LANG[key] ?? "", surface.snippet));
  if (Array.isArray(surface.tools) && surface.tools.length) {
    blocks.push(`Tools: ${surface.tools.map((tool) => `\`${tool}\``).join(", ")}`);
  }
  return blocks;
}

function fence(lang, code) {
  return `\`\`\`${lang}\n${code.replace(/\s+$/, "")}\n\`\`\``;
}

function consoleBlocks(surface) {
  // The Console's payload is its route, so it follows the same rule as every
  // other surface: shown for available and partial, withheld for absent. It
  // used to require `available`, which meant a partly-there Console screen
  // rendered the gap sentence and hid the part that already works.
  if (rendersPayload(surface) && surface.route) {
    return [
      `Console route: \`${surface.route}\``,
      "Set this up in the Console at the route above, or make the same change from the [CLI](#cli) or [Admin API](#admin-api) tab.",
    ];
  }
  return [];
}

/**
 * Build the canonical OKF concept for one slice manifest.
 *
 * `context` carries the two committed catalogs the page quotes rather than
 * invents — `capabilities` (data/capabilities.v1.json, for panel 2's prose) and
 * `samples` (the sample catalog, for the hero) — plus `siteRoot`, the directory
 * the emitted bundle sits two levels below, used only to decide whether a
 * capability key has its own page to link at.
 */
export function buildSliceConcept(manifest, context = {}) {
  const { capabilities = new Map(), samples = new Map(), siteRoot = null, timestamp = conceptTimestamp() } = context;
  const upToRoot = "../../";
  const description = conceptDescription(manifest);
  const lines = [];

  lines.push("---");
  lines.push("type: slice");
  lines.push(`title: ${yamlString(manifest.title)}`);
  lines.push(`description: ${yamlString(description)}`);
  lines.push(`resource: ${yamlString(`${DOCS_BASE_URL}/${manifest.slug}/`)}`);
  lines.push(`tags: ${yamlList(conceptTags(manifest))}`);
  lines.push(`timestamp: ${yamlString(timestamp)}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${manifest.title}`);
  lines.push("");
  lines.push(description);

  const sample = manifest.sample?.id ? samples.get(manifest.sample.id) : null;
  if (manifest.variant === "map" && sample) {
    lines.push("");
    lines.push("## See it run");
    lines.push("");
    const blurb = sample.blurb ? ` — ${sample.blurb}` : "";
    lines.push(`[${sample.title ?? manifest.title}](${upToRoot}${sample.href})${blurb}`);
  }

  lines.push("");
  lines.push("## What it is");
  for (const key of manifest.capabilityKeys ?? []) {
    const capability = capabilities.get(key);
    if (!capability) continue;
    lines.push("");
    lines.push(`**${capability.displayName}.** ${capability.summary}`);
  }

  lines.push("");
  lines.push("## Set it up");
  for (const [key, label] of SETUP_SURFACES) {
    const surface = manifest.setup?.[key];
    if (!surface) continue;
    lines.push("");
    lines.push(`### ${label}`);
    for (const block of surfaceBlocks(key, surface, key === "console" ? consoleBlocks(surface) : [])) {
      lines.push("");
      lines.push(block);
    }
  }

  lines.push("");
  lines.push("## Use it");
  for (const [key, label] of USE_SURFACES) {
    const surface = manifest.use?.[key];
    if (!surface) continue;
    lines.push("");
    lines.push(`### ${label}`);
    for (const block of surfaceBlocks(key, surface)) {
      lines.push("");
      lines.push(block);
    }
  }

  lines.push("");
  lines.push("## Ask it");
  lines.push("");
  lines.push("### MCP");
  for (const block of surfaceBlocks("mcp", manifest.ask?.mcp ?? { state: "absent" })) {
    lines.push("");
    lines.push(block);
  }

  lines.push("");
  lines.push("## Underneath");
  const protocols = manifest.underneath?.protocols ?? [];
  if (protocols.length) {
    lines.push("");
    lines.push(`Protocols: ${protocols.map((protocol) => `\`${protocol}\``).join(", ")}`);
  }
  const keys = manifest.capabilityKeys ?? [];
  if (keys.length) {
    lines.push("");
    const links = keys.map((key) => `[${key}](${capabilityHref(key, { siteRoot, upToRoot })})`);
    lines.push(`Capability keys: ${links.join(", ")}`);
  }
  if (manifest.underneath?.evidencePage) {
    lines.push("");
    lines.push(`[How this is checked](${upToRoot}${manifest.underneath.evidencePage})`);
  }

  const related = manifest.related ?? [];
  if (related.length) {
    lines.push("");
    lines.push("## Related");
    lines.push("");
    for (const slug of related) lines.push(`- [${slug}](../${slug}/index.md)`);
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * The bundle entry point: OKF progressive disclosure. An agent that fetches one
 * file gets the whole map of the bundle and the relative edges into it.
 */
export function buildIndexConcept(entries, context = {}) {
  const { timestamp = conceptTimestamp() } = context;
  const description = "One page per capability: set it up, use it from an SDK, ask it from an agent.";
  const lines = [];

  lines.push("---");
  lines.push("type: index");
  lines.push("title: \"Honua capability slices\"");
  lines.push(`description: ${yamlString(description)}`);
  lines.push(`resource: ${yamlString(`${DOCS_BASE_URL}/`)}`);
  lines.push(`tags: ${yamlList(["shape:index", "bundle:honua-capability-slices"])}`);
  lines.push(`timestamp: ${yamlString(timestamp)}`);
  lines.push("---");
  lines.push("");
  lines.push("# Honua capability slices");
  lines.push("");
  lines.push(
    "One page per capability. Each page carries the operator setting it up, the developer calling it, and the agent asking about it — and where a surface is missing it says so in one sentence and links the issue."
  );
  lines.push("");
  lines.push("## Slices");
  lines.push("");
  for (const entry of entries) {
    lines.push(`- [${entry.title}](${entry.slug}/index.md) — ${entry.description}`);
  }
  lines.push("");
  lines.push("## Elsewhere");
  lines.push("");
  lines.push("- [Documentation home](../docs.html)");
  lines.push("- [Capability catalog](../capabilities.html)");
  lines.push("- [API reference](../api-reference.html)");
  lines.push("");
  return lines.join("\n");
}

// --- concept -> document model ----------------------------------------------

const FENCE_OPEN_RE = /^```(\S*)\s*$/;
const HEADING_RE = /^(#{1,3})\s+(.*?)\s*$/;

/**
 * Parse a concept file into the structural model the template renders.
 *
 * Deliberately structural, not semantic: nothing here recovers a manifest
 * field. The template turns `##` sections into panels, two-or-more `###`
 * children into a tab group, a blockquote into the honest-gap component and a
 * fence into a code card — so the markdown a human reads and the HTML a
 * browser renders cannot drift apart in meaning.
 */
export function parseConcept(markdown) {
  const parsed = parseFrontmatter(markdown);
  if (parsed === null || parsed.unterminated) throw new Error("concept has no closed OKF frontmatter");
  const fields = parsed.fields;

  const lines = parsed.body.split("\n");
  let title = "";
  const lead = [];
  const sections = [];
  let section = null;
  let child = null;
  let index = 0;

  const push = (block) => {
    const target = child ? child.blocks : section ? section.blocks : lead;
    target.push(block);
  };

  while (index < lines.length) {
    const line = lines[index];

    const fenceOpen = line.match(FENCE_OPEN_RE);
    if (fenceOpen) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      push({ kind: "code", lang: fenceOpen[1], code: code.join("\n") });
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      if (level === 1) {
        title = text;
        child = null;
        section = null;
      } else if (level === 2) {
        section = { heading: text, slug: slugify(text), blocks: [], children: [] };
        sections.push(section);
        child = null;
      } else if (section) {
        child = { heading: text, slug: slugify(text), blocks: [] };
        section.children.push(child);
      }
      index += 1;
      continue;
    }

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      const quote = [];
      while (index < lines.length && lines[index].startsWith("> ")) {
        quote.push(lines[index].slice(2));
        index += 1;
      }
      push({ kind: "quote", text: quote.join(" ") });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ""));
        index += 1;
      }
      push({ kind: "list", items });
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !HEADING_RE.test(lines[index]) &&
      !FENCE_OPEN_RE.test(lines[index]) &&
      !lines[index].startsWith("> ") &&
      !/^[-*]\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    push({ kind: "paragraph", text: paragraph.join(" ") });
  }

  return { fields, title, lead, sections };
}

/** Read one prefixed facet out of a concept's tags (`shape:map` -> `map`). */
export function tagValue(fields, prefix) {
  const tags = Array.isArray(fields.tags) ? fields.tags : [];
  const hit = tags.find((tag) => tag.startsWith(`${prefix}:`));
  return hit ? hit.slice(prefix.length + 1) : null;
}

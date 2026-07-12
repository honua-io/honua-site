import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const EXPECTED_VIEWPORTS = ["desktop", "mobile"];
const SECRET = /(?:authorization|bearer|cookie|set-cookie|token|api[-_]?key|password|secret|cursor|[?&](?:key|token|auth)=)/i;

export function loadJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

export function catalogRuntimeCommits(manifest) {
  const commits = new Set();
  for (const journey of manifest.journeys ?? []) {
    const version = journey.source?.version;
    const match = typeof version === "string" ? version.match(/[0-9a-f]{7,40}/i) : null;
    if (match) commits.add(match[0].toLowerCase());
    const hrefMatch = journey.source?.href?.match(/\/tree\/([0-9a-f]{7,40})(?:\/|$)/i);
    if (hrefMatch) commits.add(hrefMatch[1].toLowerCase());
  }
  const ordered = [...commits].sort((a, b) => b.length - a.length || a.localeCompare(b));
  return ordered.filter((commit, index) => !ordered.some((candidate, candidateIndex) => candidateIndex < index && candidate.startsWith(commit))).sort();
}

export function validateMatrix(config, manifest) {
  const errors = [];
  const journeys = Array.isArray(manifest.journeys) ? manifest.journeys : [];
  const catalogIds = journeys.map(({ id }) => id).sort();
  const configuredIds = Object.keys(config.routes ?? {}).sort();
  if (JSON.stringify(catalogIds) !== JSON.stringify(configuredIds)) {
    errors.push(`configured routes must exactly match canonical journeys: catalog=${catalogIds.join(",")} config=${configuredIds.join(",")}`);
  }
  if (Object.keys(config.viewports ?? {}).sort().join(",") !== EXPECTED_VIEWPORTS.join(",")) {
    errors.push("matrix must define exactly desktop and mobile viewports");
  }
  for (const journey of journeys) {
    const route = config.routes?.[journey.id];
    if (!/^[a-z0-9-]+\.html$/.test(journey.href ?? "")) errors.push(`${journey.id}: unsafe or missing root HTML route`);
    if (!route?.readiness?.selector) errors.push(`${journey.id}: missing route-owned readiness selector`);
    if (!route?.readiness?.attribute && !route?.readiness?.text) errors.push(`${journey.id}: readiness needs attribute or text assertion`);
    if (!Array.isArray(route?.primaryActions) || route.primaryActions.length === 0) errors.push(`${journey.id}: missing primary actions`);
    for (const metric of ["navigationMs", "readinessMs", "transferredBytes", "renderedAssets"]) {
      const value = route?.budgets?.[metric] ?? config.global?.[metric];
      if (!value || !Number.isFinite(value.local) || !Number.isFinite(value.deployed) || value.local <= 0 || value.deployed <= 0) {
        errors.push(`${journey.id}: invalid local/deployed ${metric} budget`);
      }
    }
  }
  const incident = journeys.find(({ id }) => id === "realtime-operations");
  if (!incident?.execution?.realtime || !incident.execution.liveByDefault || !config.routes?.[incident.id]?.captureState) {
    errors.push("realtime-operations must remain live-first and capture its observed live/degraded state");
  }
  return errors;
}

export function budgetFor(config, route, metric, mode) {
  return (route.budgets?.[metric] ?? config.global[metric])[mode];
}

export function sanitizeDiagnostic(code, input) {
  const message = String(input ?? "").replace(/[\r\n\t]+/g, " ").slice(0, 500);
  return { code: String(code).slice(0, 64), message: SECRET.test(message) ? "[redacted sensitive diagnostic]" : message };
}

export function validateEvidence(evidence, manifest, expectedCommit) {
  const errors = [];
  if (evidence?.version !== 1 || evidence?.kind !== "honua-flagship-quality-evidence") errors.push("invalid evidence version/kind");
  if (!/^[0-9a-f]{40}$/.test(evidence?.siteCommit ?? "")) errors.push("siteCommit must be a full Git commit");
  if (expectedCommit && evidence?.siteCommit !== expectedCommit) errors.push("evidence siteCommit does not match tested revision");
  if (!["local", "deployed"].includes(evidence?.mode)) errors.push("invalid mode");
  const expected = new Set((manifest.journeys ?? []).flatMap(({ id }) => EXPECTED_VIEWPORTS.map((viewport) => `${id}:${viewport}`)));
  const observed = new Set();
  for (const run of evidence?.runs ?? []) {
    const key = `${run.journeyId}:${run.viewport}`;
    if (observed.has(key)) errors.push(`duplicate run ${key}`);
    observed.add(key);
    if (JSON.stringify(run).length > 20000) errors.push(`${key}: run exceeds bounded size`);
    if (SECRET.test(JSON.stringify(run))) errors.push(`${key}: evidence contains a secret-like field/value`);
    if (!Array.isArray(run.diagnostics) || run.diagnostics.length > 100) errors.push(`${key}: diagnostics are unbounded`);
    if ((run.finalUrl ?? "").length > 512) errors.push(`${key}: final URL is unbounded`);
  }
  for (const key of expected) if (!observed.has(key)) errors.push(`missing run ${key}`);
  for (const key of observed) if (!expected.has(key)) errors.push(`unexpected run ${key}`);
  if ((evidence?.runs ?? []).length !== expected.size) errors.push(`evidence must contain exactly ${expected.size} runs`);
  return errors;
}

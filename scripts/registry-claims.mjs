// Reconciles the package claims in data/sdk-availability.v1.json against the
// version each public registry actually serves.
//
// client-compatibility.html promises that "Honua lists a package as publicly
// installable only when its registry endpoint resolves". Until #281 that
// promise was enforced by three bespoke checks, and one of them pinned
// Honua.Sdk to HTTP 404 forever. When the package shipped, trunk itself went
// red and the only exits were to publish the claim or to weaken the check.
// The rule below covers every package in the snapshot in both directions --
// a claimed version must be the version the registry serves, and a package
// claimed as unpublished must actually be absent -- so a future publication
// fails the same way, pointing at the claim rather than at the assertion.
//
// Everything here is pure: the caller performs the HTTP reads and normalizes
// each registry's answer into { present, versions }, so the rule is testable
// against fixtures instead of against whatever the registries serve today.

// NuGet accepts a four-part numeric core (1.2.3.4); npm and PyPI do not, and
// nothing in the snapshot uses one, but parsing it keeps a legal registry
// answer from being reported as malformed.
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(value) {
  if (typeof value !== "string") return null;
  const match = VERSION.exec(value);
  if (!match) return null;
  return {
    core: [match[1], match[2], match[3], match[4] ?? "0"].map(Number),
    prerelease: match[5] === undefined ? [] : match[5].split("."),
  };
}

function comparePrereleaseIdentifier(a, b) {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) return Number(a) - Number(b);
  // Semver 2.0.0 §11.4.3: numeric identifiers always rank lower than alphanumeric ones.
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// Semver 2.0.0 §11 precedence. Returns <0, 0, or >0.
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) throw new Error(`cannot compare unparseable versions ${a} and ${b}`);
  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index];
  }
  // §11.3: a version with a prerelease tag ranks below the same core without one.
  const leftIsStable = left.prerelease.length === 0;
  const rightIsStable = right.prerelease.length === 0;
  if (leftIsStable !== rightIsStable) return leftIsStable ? 1 : -1;
  if (leftIsStable) return 0;
  for (let index = 0; index < Math.min(left.prerelease.length, right.prerelease.length); index += 1) {
    const order = comparePrereleaseIdentifier(left.prerelease[index], right.prerelease[index]);
    if (order !== 0) return order;
  }
  // §11.4.4: a larger set of prerelease identifiers ranks higher when all preceding ones are equal.
  return left.prerelease.length - right.prerelease.length;
}

// The version a consumer installs when they name no version: the highest
// stable release, or the highest prerelease when the package has never had a
// stable one. This is what `npm install <pkg>`, `pip install <pkg>` and
// `dotnet add package <pkg>` each resolve to, so it is the version the site is
// entitled to advertise.
export function latestPublishedVersion(versions) {
  if (!Array.isArray(versions) || versions.length === 0) return null;
  const parsed = versions.map((version) => {
    if (!parseVersion(version)) throw new Error(`registry returned an unparseable version ${version}`);
    return version;
  });
  const stable = parsed.filter((version) => parseVersion(version).prerelease.length === 0);
  return (stable.length ? stable : parsed).reduce((best, version) => (compareVersions(version, best) > 0 ? version : best));
}

// registry is { present, versions } as read from the public registry.
// claimedVersion is null when the site says the package is not published.
// Returns the failure messages for this package; an empty array means the
// published claim and the registry agree.
export function reconcilePackageClaim({ packageName, claimedVersion, installCommand, registry }) {
  const failures = [];
  let latest = null;
  try {
    latest = registry.present ? latestPublishedVersion(registry.versions) : null;
  } catch (error) {
    return [`${packageName}: ${error.message}`];
  }

  if (registry.present && latest === null) {
    failures.push(`${packageName}: registry resolves but publishes no version`);
  } else if (claimedVersion === null || claimedVersion === undefined) {
    if (latest !== null) {
      failures.push(`${packageName}: registry now publishes ${latest}; the site claims it is not published`);
    }
  } else if (latest === null) {
    failures.push(`${packageName}: site says ${claimedVersion} but the registry does not publish the package`);
  } else if (latest !== claimedVersion) {
    failures.push(`${packageName}: registry publishes ${latest}; site says ${claimedVersion}`);
  }

  // An install command is the site's most literal promise: a reader pastes it.
  // It has to name the version the same record claims, or name nothing.
  if (claimedVersion === null || claimedVersion === undefined) {
    if (installCommand !== null && installCommand !== undefined) {
      failures.push(`${packageName}: install command "${installCommand}" is published for a package the site calls unpublished`);
    }
  } else if (installCommand !== undefined) {
    if (typeof installCommand !== "string" || !installCommand.includes(claimedVersion)) {
      failures.push(`${packageName}: install command "${installCommand}" does not pin ${claimedVersion}`);
    }
  }

  return failures;
}

// Every package the snapshot claims, flattened to one reconcilable record per
// package so companions are held to the same rule as their parent SDK.
export function claimedPackages(policy) {
  return (policy.sdks ?? []).flatMap((sdk) => [
    {
      packageName: sdk.packageName,
      registryKind: sdk.registry,
      claimedVersion: sdk.publishedVersion ?? null,
      installCommand: sdk.installCommand ?? null,
    },
    ...(sdk.companionPackages ?? []).map((companion) => ({
      packageName: companion.packageName,
      registryKind: companion.registry ?? sdk.registry,
      claimedVersion: companion.publishedVersion ?? null,
      // Companions are listed as evidence, not as an install path.
      installCommand: undefined,
    })),
  ]);
}

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  claimedPackages,
  compareVersions,
  latestPublishedVersion,
  parseVersion,
  proseVersionFailures,
  reconcilePackageClaim,
} from "./registry-claims.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "sdk-availability.v1.json"), "utf8"));

test("parses the version shapes the three registries actually serve", () => {
  assert.deepEqual(parseVersion("1.7.0"), { core: [1, 7, 0, 0], prerelease: [] });
  assert.deepEqual(parseVersion("0.1.9-beta.0"), { core: [0, 1, 9, 0], prerelease: ["beta", "0"] });
  // NuGet's four-part core, and semver build metadata, are both legal answers.
  assert.deepEqual(parseVersion("1.6.4.2"), { core: [1, 6, 4, 2], prerelease: [] });
  assert.deepEqual(parseVersion("1.7.0+abc.1"), { core: [1, 7, 0, 0], prerelease: [] });
  for (const malformed of ["1.7", "v1.7.0", "latest", "1.7.0-", "", null, undefined, {}]) {
    assert.equal(parseVersion(malformed), null, `${String(malformed)} must not parse`);
  }
});

test("orders versions by semver 2.0.0 precedence", () => {
  // §11.2 numeric core, field by field — not lexicographic, which would put 1.10.0 below 1.9.0.
  assert.ok(compareVersions("1.10.0", "1.9.0") > 0);
  assert.ok(compareVersions("1.7.0", "1.6.4") > 0);
  assert.equal(compareVersions("1.7.0", "1.7.0"), 0);
  assert.equal(compareVersions("1.7.0", "1.7.0.0"), 0);
  // §11.3 a prerelease ranks below the release that shares its core.
  assert.ok(compareVersions("1.7.0-beta.0", "1.7.0") < 0);
  assert.ok(compareVersions("1.7.0-beta.0", "1.6.4") > 0);
  // §11.4.1/11.4.2 identifier comparison is numeric where both sides are numeric,
  // ASCII otherwise: 0.1.10-beta.0 outranks 0.1.9-beta.0, and beta outranks alpha.
  assert.ok(compareVersions("0.1.10-beta.0", "0.1.9-beta.0") > 0);
  assert.ok(compareVersions("0.1.9-beta.10", "0.1.9-beta.9") > 0);
  assert.ok(compareVersions("0.1.9-beta.0", "0.1.9-alpha.0") > 0);
  // §11.4.3 numeric identifiers rank below alphanumeric ones.
  assert.ok(compareVersions("1.0.0-1", "1.0.0-alpha") < 0);
  // §11.4.4 a longer identifier set wins when every shared identifier is equal.
  assert.ok(compareVersions("1.0.0-beta.1", "1.0.0-beta") > 0);
  assert.throws(() => compareVersions("1.7.0", "latest"), /unparseable/);
});

test("reports the version a bare install resolves to", () => {
  // Hand-computed from the ordering above: the highest stable release wins even
  // when a higher prerelease exists, because that is what the install commands
  // the site prints will actually fetch.
  assert.equal(latestPublishedVersion(["1.6.4", "1.7.0"]), "1.7.0");
  assert.equal(latestPublishedVersion(["1.7.0", "1.6.4"]), "1.7.0");
  assert.equal(latestPublishedVersion(["1.9.0", "1.10.0"]), "1.10.0");
  assert.equal(latestPublishedVersion(["1.7.0", "1.8.0-rc.1"]), "1.7.0");
  // Only when nothing stable exists does the highest prerelease become the claim.
  assert.equal(latestPublishedVersion(["0.1.8-beta.0", "0.1.9-beta.0"]), "0.1.9-beta.0");
  assert.equal(latestPublishedVersion([]), null);
  assert.throws(() => latestPublishedVersion(["1.7.0", "nightly"]), /unparseable/);
});

test("passes a claim that matches what the registry serves", () => {
  assert.deepEqual(
    reconcilePackageClaim({
      packageName: "Honua.Sdk",
      claimedVersion: "1.7.0",
      installCommand: "dotnet add package Honua.Sdk --version 1.7.0",
      registry: { present: true, versions: ["1.6.4", "1.7.0"] },
    }),
    []
  );
});

test("fails the exact drift that broke trunk in #281: a package published under a 'not published' claim", () => {
  assert.deepEqual(
    reconcilePackageClaim({
      packageName: "Honua.Sdk",
      claimedVersion: null,
      installCommand: null,
      registry: { present: true, versions: ["1.6.4", "1.7.0"] },
    }),
    ["Honua.Sdk: registry now publishes 1.7.0; the site claims it is not published"]
  );
});

test("fails a claim the registry contradicts, in either direction", () => {
  assert.deepEqual(
    reconcilePackageClaim({
      packageName: "Honua.Sdk",
      claimedVersion: "1.7.0",
      installCommand: "dotnet add package Honua.Sdk --version 1.7.0",
      registry: { present: true, versions: ["1.6.4", "1.7.0", "1.8.0"] },
    }),
    ["Honua.Sdk: registry publishes 1.8.0; site says 1.7.0"]
  );
  assert.deepEqual(
    reconcilePackageClaim({
      packageName: "Honua.Sdk",
      claimedVersion: "1.7.0",
      installCommand: "dotnet add package Honua.Sdk --version 1.7.0",
      registry: { present: false, versions: [] },
    }),
    ["Honua.Sdk: site says 1.7.0 but the registry does not publish the package"]
  );
  // An unpublished claim against an absent package is the one honest silence.
  assert.deepEqual(
    reconcilePackageClaim({
      packageName: "Honua.Sdk.NotReal",
      claimedVersion: null,
      installCommand: null,
      registry: { present: false, versions: [] },
    }),
    []
  );
});

test("fails an install command that does not pin the claimed version", () => {
  assert.deepEqual(
    reconcilePackageClaim({
      packageName: "Honua.Sdk",
      claimedVersion: "1.7.0",
      installCommand: "dotnet add package Honua.Sdk --version 1.6.4",
      registry: { present: true, versions: ["1.7.0"] },
    }),
    ['Honua.Sdk: install command "dotnet add package Honua.Sdk --version 1.6.4" does not pin 1.7.0']
  );
  assert.deepEqual(
    reconcilePackageClaim({
      packageName: "Honua.Sdk",
      claimedVersion: null,
      installCommand: "dotnet add package Honua.Sdk",
      registry: { present: false, versions: [] },
    }),
    ['Honua.Sdk: install command "dotnet add package Honua.Sdk" is published for a package the site calls unpublished']
  );
});

test("routes every package in the committed snapshot, companions included", () => {
  const claims = claimedPackages(policy);
  assert.deepEqual(
    claims.map((claim) => claim.packageName).sort(),
    ["@honua/honua-migrate", "@honua/sdk-esri-compat", "@honua/sdk-js", "Honua.Sdk", "honua-sdk"]
  );
  for (const claim of claims) {
    assert.ok(
      ["npm", "nuget", "pypi"].includes(claim.registryKind),
      `${claim.packageName} has no reconcilable registry`
    );
  }
  // The .NET row is the subject of #281: it must now carry a real NuGet claim.
  const dotnet = claims.find((claim) => claim.packageName === "Honua.Sdk");
  assert.equal(dotnet.registryKind, "nuget");
  assert.match(dotnet.claimedVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(dotnet.installCommand, `dotnet add package Honua.Sdk --version ${dotnet.claimedVersion}`);
});

test("every committed claim reconciles against its own snapshot", () => {
  // Offline half of the CI check: each record is internally consistent, so a
  // remote failure in validate-site-claims.mjs means real registry drift.
  for (const claim of claimedPackages(policy)) {
    assert.deepEqual(
      reconcilePackageClaim({
        ...claim,
        registry: claim.claimedVersion
          ? { present: true, versions: [claim.claimedVersion] }
          : { present: false, versions: [] },
      }),
      [],
      claim.packageName
    );
  }
});

test("catches a page naming a package at a version the snapshot does not claim", () => {
  const claims = [
    { packageName: "@honua/sdk-js", claimedVersion: "0.1.9-beta.0" },
    { packageName: "Honua.Sdk", claimedVersion: "1.7.0" },
    { packageName: "honua-sdk", claimedVersion: "0.1.11" },
  ];
  // The literal sentence trunk carried on claims.html before this change, once
  // it was rewritten to name the package it was dating.
  assert.deepEqual(
    proseVersionFailures(
      "claims.html",
      "JavaScript <code>@honua/sdk-js 0.1.4-beta.0</code> is a public prerelease.",
      claims
    ),
    ["claims.html: names @honua/sdk-js 0.1.4-beta.0; the published claim is 0.1.9-beta.0"]
  );
  assert.deepEqual(
    proseVersionFailures("docs.html", "run <code>dotnet add package Honua.Sdk --version 1.6.4</code>", claims),
    ["docs.html: names Honua.Sdk 1.6.4; the published claim is 1.7.0"]
  );
  assert.deepEqual(proseVersionFailures("docs.html", "pip install honua-sdk==0.1.10", claims), [
    "docs.html: names honua-sdk 0.1.10; the published claim is 0.1.11",
  ]);
});

test("leaves versions that are not package claims alone", () => {
  const claims = [
    { packageName: "@honua/sdk-js", claimedVersion: "0.1.9-beta.0" },
    { packageName: "Honua.Sdk", claimedVersion: "1.7.0" },
    { packageName: "honua-sdk", claimedVersion: "0.1.11" },
    // A package the site calls unpublished has no version to hold prose to.
    { packageName: "Honua.Sdk.Unreleased", claimedVersion: null },
  ];
  assert.deepEqual(
    proseVersionFailures(
      "client-compatibility.html",
      "npm install @honua/sdk-js@0.1.9-beta.0 and dotnet add package Honua.Sdk --version 1.7.0 and" +
        " pip install honua-sdk==0.1.11. The packages target net10.0, Python 3.11, PostgreSQL 16.4" +
        " and pull in every Honua.Sdk.* package. Honua.Sdk.Unreleased 9.9.9 is not claimed.",
      claims
    ),
    []
  );
});

test("holds every core page to the committed claims", () => {
  // The offline half of the same check CI runs: no page in the repo may name a
  // claimed package at a version other than the one the snapshot publishes.
  const claims = claimedPackages(policy);
  const pages = fs
    .readdirSync(ROOT)
    .filter((name) => name.endsWith(".html"))
    .filter((name) => !/^(?:sample-.*|samples\.html|demo-.*|demo\.html|demos\.html)$/.test(name));
  assert.ok(pages.length > 100, "expected the core page set, not an empty glob");
  const failures = pages.flatMap((page) =>
    proseVersionFailures(page, fs.readFileSync(path.join(ROOT, page), "utf8"), claims)
  );
  assert.deepEqual(failures, []);
});

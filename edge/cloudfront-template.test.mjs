import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import template from "./cloudfront-site.template.json" with { type: "json" };
import rules from "./header-rules.json" with { type: "json" };
import productionStatus from "./production-status.json" with { type: "json" };

const resources = template.Resources;
const distribution = resources.SiteDistribution.Properties.DistributionConfig;

function matches(pattern, pathname) {
  if (pattern === "/*") return true;
  const expression = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*");
  return new RegExp(`^${expression}$`).test(pathname);
}

function selectedRule(pathname) {
  return rules.slice(1).find((rule) => matches(rule.match, pathname)) ?? rules[0];
}

function directives(policy) {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name, new Set(values)];
      }),
  );
}

test("CloudFront uses a private versioned S3 origin with OAC", () => {
  assert.equal(resources.SiteBucket.Properties.VersioningConfiguration.Status, "Enabled");
  assert.equal(resources.SiteBucket.Properties.PublicAccessBlockConfiguration.RestrictPublicBuckets, true);
  assert.equal(resources.OriginAccessControl.Properties.OriginAccessControlConfig.SigningBehavior, "always");
  assert.deepEqual(distribution.Origins[0].DomainName, {
    "Fn::GetAtt": ["SiteBucket", "RegionalDomainName"],
  });
});

test("distribution uses modern TLS and both production aliases", () => {
  assert.deepEqual(distribution.Aliases, ["honua.io", "www.honua.io"]);
  assert.equal(distribution.ViewerCertificate.MinimumProtocolVersion, "TLSv1.2_2021");
  assert.equal(distribution.ViewerCertificate.SslSupportMethod, "sni-only");
  assert.equal(distribution.DefaultCacheBehavior.ViewerProtocolPolicy, "redirect-to-https");
});

test("production activation status is explicit and internally consistent", () => {
  assert.ok(
    ["github-pages", "aws-cloudfront"].includes(productionStatus.hostingProvider),
    "unknown production hosting provider",
  );
  assert.equal(typeof productionStatus.liveResponseHeaders, "boolean");
  if (productionStatus.hostingProvider === "github-pages") {
    assert.equal(productionStatus.liveResponseHeaders, false);
  } else {
    assert.equal(productionStatus.liveResponseHeaders, true);
  }
  assert.equal(
    productionStatus.activationIssue,
    "https://github.com/honua-io/honua-site/issues/38",
  );
});

test("every _headers path has an exact generated response policy and cache behavior", () => {
  const behaviors = [distribution.DefaultCacheBehavior, ...distribution.CacheBehaviors];
  assert.equal(behaviors.length, rules.length);
  const policyBySignature = new Map();

  for (const [index, rule] of rules.entries()) {
    const signature = JSON.stringify(rule.headers);
    if (!policyBySignature.has(signature)) {
      policyBySignature.set(signature, policyBySignature.size);
    }
    const policyIndex = policyBySignature.get(signature);
    const policyId = `ResponseHeadersPolicy${String(policyIndex).padStart(2, "0")}`;
    const policy = resources[policyId];
    assert.ok(policy, `missing response policy for ${rule.match}`);
    const config = policy.Properties.ResponseHeadersPolicyConfig;
    const expectedHeaders = new Map(rule.headers);
    assert.equal(
      config.SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy,
      expectedHeaders.get("Content-Security-Policy"),
    );
    assert.equal(
      config.CustomHeadersConfig.Items[0].Value,
      expectedHeaders.get("Permissions-Policy"),
    );
    assert.deepEqual(behaviors[index].ResponseHeadersPolicyId, {
      Ref: policyId,
    });
    if (index > 0) assert.equal(behaviors[index].PathPattern, rule.match);
  }

  const generatedPolicyCount = Object.values(resources).filter(
    ({ Type }) => Type === "AWS::CloudFront::ResponseHeadersPolicy",
  ).length;
  assert.equal(generatedPolicyCount, policyBySignature.size);
  assert.ok(generatedPolicyCount <= 20, "exceeds the default account policy quota");
});

test("template is account-neutral and maps missing S3 keys to the site 404", () => {
  const serialized = JSON.stringify(template);
  assert.doesNotMatch(serialized, /585192672263|E88FYGJVRJF6L/);
  assert.deepEqual(
    distribution.CustomErrorResponses.map(({ ErrorCode, ResponseCode, ResponsePagePath }) => ({
      ErrorCode,
      ResponseCode,
      ResponsePagePath,
    })),
    [
      { ErrorCode: 403, ResponseCode: 404, ResponsePagePath: "/404.html" },
      { ErrorCode: 404, ResponseCode: 404, ResponsePagePath: "/404.html" },
    ],
  );
});

test("edge CSP does not block capabilities allowed by each page meta policy", async () => {
  const htmlFiles = (await readdir(new URL("../", import.meta.url))).filter((name) =>
    name.endsWith(".html"),
  );

  for (const filename of htmlFiles) {
    const html = await readFile(new URL(`../${filename}`, import.meta.url), "utf8");
    const meta = html.match(
      /<meta(?=[^>]*http-equiv="Content-Security-Policy")(?=[^>]*content="([^"]+)")[^>]*>/,
    );
    if (!meta) continue;

    const rule = selectedRule(`/${filename}`);
    const edgePolicy = new Map(rule.headers).get("Content-Security-Policy");
    const edgeDirectives = directives(edgePolicy);
    for (const [name, values] of directives(meta[1])) {
      if (values.has("'none'")) continue;
      const edgeValues = edgeDirectives.get(name);
      assert.ok(edgeValues, `${filename}: edge policy missing ${name}`);
      for (const value of values) {
        assert.ok(edgeValues.has(value), `${filename}: edge ${name} blocks ${value}`);
      }
    }
  }
});

test("directory URLs resolve to an index.html object key on the private origin", () => {
  // DefaultRootObject only covers "/". Without a viewer-request rewrite, a REST
  // origin with OAC answers 403 for the key "docs/geoprocessing/" and
  // CustomErrorResponses turns that into the 404 page — so every page-directory
  // URL in the capability-slice bundle would break on activation.
  const fn = resources.DirectoryIndexFunction;
  assert.equal(fn.Type, "AWS::CloudFront::Function");
  assert.equal(fn.Properties.AutoPublish, true);
  assert.equal(fn.Properties.FunctionConfig.Runtime, "cloudfront-js-2.0");

  // Run the emitted source, so the test exercises the shipped code rather than
  // matching on it.
  const handler = new Function(`${fn.Properties.FunctionCode}; return handler;`)();
  const rewrite = (uri) => handler({ request: { uri } }).uri;
  assert.equal(rewrite("/docs/geoprocessing/"), "/docs/geoprocessing/index.html");
  assert.equal(rewrite("/docs/"), "/docs/index.html");
  assert.equal(rewrite("/"), "/index.html");
  // Real object keys are left alone, including the extensionless case, where a
  // rewrite would hide a genuine 404.
  assert.equal(rewrite("/index.html"), "/index.html");
  assert.equal(rewrite("/assets/slice.css"), "/assets/slice.css");
  assert.equal(rewrite("/docs/geoprocessing/index.md"), "/docs/geoprocessing/index.md");
  assert.equal(rewrite("/no-such-page"), "/no-such-page");
});

test("every cache behaviour carries the directory-index rewrite", () => {
  // A path-pattern behaviour without it would be a directory URL that 404s only
  // under that pattern — the hardest version of this bug to find.
  for (const behavior of [distribution.DefaultCacheBehavior, ...distribution.CacheBehaviors]) {
    assert.deepEqual(
      behavior.FunctionAssociations,
      [{ EventType: "viewer-request", FunctionARN: { "Fn::GetAtt": ["DirectoryIndexFunction", "FunctionARN"] } }],
      `${behavior.PathPattern ?? "default"} is missing the rewrite`
    );
  }
});

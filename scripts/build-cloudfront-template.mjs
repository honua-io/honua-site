#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rulesPath = resolve(repoRoot, "edge/header-rules.json");
const outputPath = resolve(
  process.env.HONUA_CLOUDFRONT_TEMPLATE_OUT ??
    resolve(repoRoot, "edge/cloudfront-site.template.json"),
);

const rules = JSON.parse(await readFile(rulesPath, "utf8"));
if (!Array.isArray(rules) || rules.length === 0 || rules[0]?.match !== "/*") {
  throw new Error("edge/header-rules.json must begin with the /* default rule");
}

const expected = new Set([
  "Content-Security-Policy",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "Strict-Transport-Security",
]);

function logicalId(prefix, index) {
  return `${prefix}${String(index).padStart(2, "0")}`;
}

function headerMap(rule) {
  const headers = new Map(rule.headers);
  for (const name of expected) {
    if (!headers.has(name)) {
      throw new Error(`${rule.match} is missing ${name}`);
    }
  }
  return headers;
}

function responseHeadersPolicy(rule, index) {
  const headers = headerMap(rule);
  const hsts = /^max-age=(\d+)$/.exec(headers.get("Strict-Transport-Security"));
  if (!hsts) {
    throw new Error(`${rule.match} has an unsupported Strict-Transport-Security value`);
  }

  const security = {
    ContentSecurityPolicy: {
      ContentSecurityPolicy: headers.get("Content-Security-Policy"),
      Override: true,
    },
    ContentTypeOptions: { Override: true },
    ReferrerPolicy: {
      ReferrerPolicy: headers.get("Referrer-Policy"),
      Override: true,
    },
    StrictTransportSecurity: {
      AccessControlMaxAgeSec: Number(hsts[1]),
      IncludeSubdomains: false,
      Override: true,
      Preload: false,
    },
  };
  const frameOption = headers.get("X-Frame-Options");
  if (frameOption) {
    security.FrameOptions = { FrameOption: frameOption, Override: true };
  }

  return {
    Type: "AWS::CloudFront::ResponseHeadersPolicy",
    Properties: {
      ResponseHeadersPolicyConfig: {
        Name: { "Fn::Sub": `\${AWS::StackName}-headers-${logicalId("p", index).toLowerCase()}` },
        Comment: `Generated from _headers for ${rule.match}`,
        SecurityHeadersConfig: security,
        CustomHeadersConfig: {
          Items: [
            {
              Header: "Permissions-Policy",
              Value: headers.get("Permissions-Policy"),
              Override: true,
            },
          ],
        },
      },
    },
  };
}

function behavior(rule, policyIndex) {
  const config = {
    TargetOriginId: "site-s3-origin",
    ViewerProtocolPolicy: "redirect-to-https",
    AllowedMethods: ["GET", "HEAD", "OPTIONS"],
    CachedMethods: ["GET", "HEAD", "OPTIONS"],
    Compress: true,
    CachePolicyId: { Ref: "SiteCachePolicy" },
    ResponseHeadersPolicyId: { Ref: logicalId("ResponseHeadersPolicy", policyIndex) },
  };
  if (rule.match !== "/*") config.PathPattern = rule.match;
  return config;
}

const resources = {
  SiteBucket: {
    Type: "AWS::S3::Bucket",
    DeletionPolicy: "Retain",
    UpdateReplacePolicy: "Retain",
    Properties: {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
        ],
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      VersioningConfiguration: { Status: "Enabled" },
    },
  },
  OriginAccessControl: {
    Type: "AWS::CloudFront::OriginAccessControl",
    Properties: {
      OriginAccessControlConfig: {
        Name: { "Fn::Sub": "${AWS::StackName}-site-s3" },
        Description: "Private Honua site S3 origin",
        OriginAccessControlOriginType: "s3",
        SigningBehavior: "always",
        SigningProtocol: "sigv4",
      },
    },
  },
  SiteCachePolicy: {
    Type: "AWS::CloudFront::CachePolicy",
    Properties: {
      CachePolicyConfig: {
        Name: { "Fn::Sub": "${AWS::StackName}-site-cache" },
        Comment: "Short-lived static-site cache; deploys invalidate all paths",
        DefaultTTL: 300,
        MinTTL: 0,
        MaxTTL: 3600,
        ParametersInCacheKeyAndForwardedToOrigin: {
          EnableAcceptEncodingBrotli: true,
          EnableAcceptEncodingGzip: true,
          CookiesConfig: { CookieBehavior: "none" },
          HeadersConfig: { HeaderBehavior: "none" },
          QueryStringsConfig: { QueryStringBehavior: "none" },
        },
      },
    },
  },
};

const uniquePolicyRules = [];
const policyIndexBySignature = new Map();
const policyIndexByRule = rules.map((rule) => {
  const signature = JSON.stringify(rule.headers);
  let index = policyIndexBySignature.get(signature);
  if (index === undefined) {
    index = uniquePolicyRules.length;
    policyIndexBySignature.set(signature, index);
    uniquePolicyRules.push(rule);
  }
  return index;
});

for (const [index, rule] of uniquePolicyRules.entries()) {
  resources[logicalId("ResponseHeadersPolicy", index)] = responseHeadersPolicy(rule, index);
}

resources.SiteDistribution = {
  Type: "AWS::CloudFront::Distribution",
  Properties: {
    DistributionConfig: {
      Aliases: ["honua.io", "www.honua.io"],
      Comment: "Honua public static site",
      DefaultRootObject: "index.html",
      Enabled: true,
      HttpVersion: "http2and3",
      IPV6Enabled: true,
      PriceClass: { Ref: "PriceClass" },
      Origins: [
        {
          Id: "site-s3-origin",
          DomainName: { "Fn::GetAtt": ["SiteBucket", "RegionalDomainName"] },
          OriginAccessControlId: { Ref: "OriginAccessControl" },
          S3OriginConfig: { OriginAccessIdentity: "" },
        },
      ],
      DefaultCacheBehavior: behavior(rules[0], policyIndexByRule[0]),
      CacheBehaviors: rules
        .slice(1)
        .map((rule, offset) => behavior(rule, policyIndexByRule[offset + 1])),
      CustomErrorResponses: [
        {
          ErrorCode: 403,
          ErrorCachingMinTTL: 60,
          ResponseCode: 404,
          ResponsePagePath: "/404.html",
        },
        {
          ErrorCode: 404,
          ErrorCachingMinTTL: 60,
          ResponseCode: 404,
          ResponsePagePath: "/404.html",
        },
      ],
      ViewerCertificate: {
        AcmCertificateArn: { Ref: "CertificateArn" },
        MinimumProtocolVersion: "TLSv1.2_2021",
        SslSupportMethod: "sni-only",
      },
    },
  },
};

resources.SiteBucketPolicy = {
  Type: "AWS::S3::BucketPolicy",
  Properties: {
    Bucket: { Ref: "SiteBucket" },
    PolicyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowCloudFrontReadOnly",
          Effect: "Allow",
          Principal: { Service: "cloudfront.amazonaws.com" },
          Action: "s3:GetObject",
          Resource: { "Fn::Sub": "${SiteBucket.Arn}/*" },
          Condition: {
            StringEquals: {
              "AWS:SourceArn": {
                "Fn::Sub": "arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${SiteDistribution}",
              },
            },
          },
        },
      ],
    },
  },
};

const template = {
  AWSTemplateFormatVersion: "2010-09-09",
  Description: "Private S3 + CloudFront hosting for honua.io, generated from _headers.",
  Parameters: {
    CertificateArn: {
      Type: "String",
      Description: "Issued ACM certificate ARN in us-east-1 covering honua.io and www.honua.io",
      AllowedPattern: "^arn:[^:]+:acm:us-east-1:[0-9]{12}:certificate/.+$",
    },
    PriceClass: {
      Type: "String",
      Default: "PriceClass_100",
      AllowedValues: ["PriceClass_100", "PriceClass_200", "PriceClass_All"],
    },
  },
  Resources: resources,
  Outputs: {
    BucketName: { Value: { Ref: "SiteBucket" } },
    DistributionId: { Value: { Ref: "SiteDistribution" } },
    DistributionDomainName: {
      Value: { "Fn::GetAtt": ["SiteDistribution", "DomainName"] },
    },
  },
};

await writeFile(outputPath, `${JSON.stringify(template, null, 2)}\n`);
console.log(`Generated ${outputPath} from ${rulesPath}`);

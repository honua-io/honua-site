import assert from "node:assert/strict";
import test from "node:test";

import { buildBundle } from "./gen-slice-pages.mjs";

test("launch stack guide names the Studio assistant parameters and their account effects", () => {
  const html = buildBundle().get("guides/deploy/aws-launch-stack/index.html");
  assert.equal(typeof html, "string");
  for (const name of [
    "AiProvider",
    "AiModel",
    "AiInvocationLogBucketName",
    "AiCustomerSecretArn",
    "AiWorkloadDataClassification",
  ]) {
    assert.match(html, new RegExp(`<code>${name}</code>`));
  }
  assert.match(html, /<code>Bedrock<\/code>, <code>OpenAI<\/code> and <code>Anthropic<\/code> are the only other values/);
  const assistant = html.split('id="optional-studio-assistant"')[1].split('id="what-you-pay-aws"')[0];
  assert.doesNotMatch(assistant, /CustomerKey/);
  assert.match(html, /Invocation logging applies to the whole account in that region/);
  assert.match(html, /leaves that logging in place/);
  assert.match(html, /admin\.ai\.admission\.initialize/);
  assert.match(html, /startup does not resume it/);
  assert.match(html, /The default <code>AiProvider=None<\/code> adds neither/);
  assert.doesNotMatch(html, /\$\d/);
});

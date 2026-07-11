#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const schemaPath = `${root}schemas/diagnostic-bundle.v1.json`;
const provenancePath = `${root}schemas/diagnostic-bundle.v1.provenance.json`;
const schemaBytes = await readFile(schemaPath);
const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
const schema = JSON.parse(schemaBytes.toString("utf8"));
const digest = createHash("sha256").update(schemaBytes).digest("hex");

const expected = {
  schema: "honua.public-schema-provenance.v1",
  sourceRepository: "honua-io/honua-support",
  sourcePath: "schemas/diagnostic-bundle.v1.json",
  canonicalUrl: "https://honua.io/schemas/diagnostic-bundle.v1.json",
};

for (const [key, value] of Object.entries(expected)) {
  if (provenance[key] !== value) throw new Error(`provenance.${key} must equal ${JSON.stringify(value)}`);
}
if (!/^[0-9a-f]{40}$/.test(provenance.sourceCommit)) throw new Error("provenance.sourceCommit must be a full commit SHA");
if (provenance.sha256 !== digest) throw new Error(`schema digest ${digest} does not match provenance ${provenance.sha256}`);
if (provenance.bytes !== schemaBytes.byteLength) {
  throw new Error(`schema bytes ${schemaBytes.byteLength} do not match provenance ${provenance.bytes}`);
}
if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") throw new Error("schema must use JSON Schema 2020-12");
if (schema.$id !== provenance.canonicalUrl) throw new Error(`schema $id ${schema.$id} does not match canonical URL`);
if (schema.additionalProperties !== false) throw new Error("diagnostic bundle root must remain fail-closed");

console.log(`Verified ${provenance.canonicalUrl} (${schemaBytes.byteLength} bytes, sha256:${digest})`);

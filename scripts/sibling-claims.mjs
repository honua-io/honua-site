import { readFileSync } from "node:fs";
import { join } from "node:path";

import { forbiddenClaims } from "./forbidden-claims.mjs";

// These source documents are optional in a standalone site checkout.
const documents = [
  "honua-server/README.md",
  "honua-server/docs/reference/compatibility/geoservices-parity.md",
  "honua-migrate/README.md",
];

export function siblingClaimFailures(siteRoot) {
  const failures = [];
  for (const document of documents) {
    let source;
    try {
      source = readFileSync(join(siteRoot, "..", document), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const [pattern, description] of forbiddenClaims) {
      if (pattern.test(source)) failures.push(`${document}: ${description}`);
    }
  }
  return failures;
}

#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectIndex = process.argv.indexOf("--project");
const commitIndex = process.argv.indexOf("--commit");
const project = resolve(root, projectIndex >= 0 ? process.argv[projectIndex + 1] : ".");
const commit = commitIndex >= 0 ? process.argv[commitIndex + 1] : execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("site revision must be a full Git commit");
const target = resolve(project, "data/site-revision.v1.json");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify({ version: 1, kind: "honua-site-revision", siteCommit: commit }, null, 2)}\n`);
console.log(`site-revision: ${commit}`);

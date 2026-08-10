#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = "data/sdk-llms.v1.json";
const FILES = ["llms.txt", "llms-full.txt"];
const REPOSITORY = "honua-io/honua-sdk-js";

function fail(message) {
  throw new Error(`sdk-llms-publication: ${message}`);
}

function bytes(value) {
  return Buffer.from(value, "utf8");
}

function digest(value) {
  const content = bytes(value);
  return {
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function markdownTargets(value) {
  return [...value.matchAll(/\]\((https:\/\/[^\s)]+)\)/g)].map((match) => match[1]);
}

function validateIndex(value, sourceRepo, commit) {
  if (!value.startsWith("# @honua/sdk-js\n")) fail("llms.txt has an unexpected heading");
  const targets = markdownTargets(value);
  if (targets.length === 0) fail("llms.txt contains no documentation links");

  for (const target of targets) {
    const url = new URL(target);
    if (url.origin !== "https://github.com" || !url.pathname.startsWith(`/${REPOSITORY}/blob/trunk/`)) {
      fail(`llms.txt contains an unapproved documentation target: ${target}`);
    }
    if (url.username || url.password || url.search) fail(`llms.txt contains credentials or a query string: ${target}`);

    if (sourceRepo) {
      const path = decodeURIComponent(url.pathname.slice(`/${REPOSITORY}/blob/trunk/`.length));
      try {
        execFileSync("git", ["-C", sourceRepo, "cat-file", "-e", `${commit}:${path}`], { stdio: "ignore" });
      } catch {
        fail(`llms.txt target does not exist at ${commit}: ${path}`);
      }
    }
  }
}

function validateFull(value) {
  if (!value.startsWith("# @honua/sdk-js — full documentation corpus\n")) {
    fail("llms-full.txt has an unexpected heading");
  }
  if (!value.includes("This file concatenates the documents indexed in `llms.txt`")) {
    fail("llms-full.txt does not identify the generated corpus contract");
  }
}

function validateContent(values, sourceRepo, commit) {
  validateIndex(values.get("llms.txt"), sourceRepo, commit);
  validateFull(values.get("llms-full.txt"));
}

function sync() {
  const sourceRepo = option("--sdk-repo");
  const requestedCommit = option("--commit");
  if (!sourceRepo || !requestedCommit) fail("--write requires --sdk-repo and --commit");

  let commit;
  try {
    commit = execFileSync("git", ["-C", sourceRepo, "rev-parse", `${requestedCommit}^{commit}`], {
      encoding: "utf8",
    }).trim();
  } catch {
    fail(`cannot resolve SDK commit ${requestedCommit}`);
  }
  if (!/^[0-9a-f]{40}$/.test(commit)) fail("SDK producer commit is not a full SHA");

  const values = new Map(
    FILES.map((path) => [
      path,
      execFileSync("git", ["-C", sourceRepo, "show", `${commit}:${path}`], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }),
    ]),
  );
  validateContent(values, sourceRepo, commit);

  for (const [path, value] of values) writeFileSync(join(ROOT, path), value);
  const manifest = {
    format: "honua.site.sdk-llms-publication.v1",
    schemaVersion: 1,
    producer: { repository: REPOSITORY, gitCommit: commit },
    files: FILES.map((path) => ({
      path,
      source: `https://github.com/${REPOSITORY}/blob/${commit}/${path}`,
      ...digest(values.get(path)),
    })),
  };
  writeFileSync(join(ROOT, MANIFEST_PATH), stable(manifest));
  console.log(`sdk-llms-publication: wrote ${FILES.length} files from ${commit}`);
}

function check() {
  const manifest = readJson(MANIFEST_PATH);
  if (manifest.format !== "honua.site.sdk-llms-publication.v1" || manifest.schemaVersion !== 1) {
    fail("unsupported publication manifest");
  }
  if (manifest.producer?.repository !== REPOSITORY || !/^[0-9a-f]{40}$/.test(manifest.producer?.gitCommit ?? "")) {
    fail("invalid SDK producer identity");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length !== FILES.length) fail("manifest file set is incomplete");

  const values = new Map(FILES.map((path) => [path, readFileSync(join(ROOT, path), "utf8")]));
  validateContent(values);
  for (const path of FILES) {
    const expected = manifest.files.find((file) => file.path === path);
    if (!expected) fail(`manifest is missing ${path}`);
    const actual = digest(values.get(path));
    const source = `https://github.com/${REPOSITORY}/blob/${manifest.producer.gitCommit}/${path}`;
    if (expected.source !== source || expected.bytes !== actual.bytes || expected.sha256 !== actual.sha256) {
      fail(`${path} differs from its commit-pinned publication record`);
    }
  }
  console.log(`sdk-llms-publication: verified ${FILES.length} files from ${manifest.producer.gitCommit}`);
}

if (process.argv.includes("--write")) sync();
else check();

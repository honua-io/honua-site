import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function command(executable, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env: process.env });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function leadFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "honua-trial-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of ["scripts/validate-lead-capture.sh", "index.html", "cloud.html", "privacy.html", "thanks.html", "pricing.html", "trust.html", "security.html", "README.md", "docs/features/README.md", "_headers", "assets/analytics.js", "docs/lead-capture-handoff.md", ".github/workflows/pages.yml"]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await copyFile(path.join(repo, file), path.join(root, file));
  }
  return root;
}

test("Preview enquiry contract passes and rejects stale event, disclosure and procurement text", async (t) => {
  const root = await leadFixture(t);
  const run = () => command("bash", ["scripts/validate-lead-capture.sh"], root);
  assert.equal((await run()).code, 0);
  for (const [file, before, after] of [
    ["cloud.html", "preview_trial_enquiry_submit", "cloud_waitlist_submit"],
    ["docs/lead-capture-handoff.md", "preview_trial_enquiry_submit", "cloud_waitlist_submit"],
    ["privacy.html", "Preview trial enquiry", "Cloud early-access"],
    ["thanks.html", "Preview trial enquiry", "Honua Cloud early-access list"],
    ["pricing.html", "Pricing and licensing information", "Honua Cloud managed service"],
    ["trust.html", "Preview trial enquiry", "Cloud early-access"],
    ["security.html", "Preview trial enquiries", "early-access inquiries"],
    ["README.md", "Preview trial enquiries", "managed-service waitlist"],
    ["docs/features/README.md", "Preview trial enquiries", "Managed-service waitlist"],
  ]) {
    const target = path.join(root, file), original = await readFile(target, "utf8");
    assert.ok(original.includes(before)); await writeFile(target, original.replace(before, after));
    const result = await run(); assert.notEqual(result.code, 0, `stale ${file} must fail`);
    await writeFile(target, original);
  }
});

#!/usr/bin/env node
/**
 * Verify immutable Clara Core extraction against the source paths recorded in
 * clara-core/extraction-manifest.json.
 *
 * The check compares Git blob IDs, so whitespace/encoding changes are detected.
 * Run from the repository root:
 *   node clara-core/scripts/verify-extraction.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const manifestPath = resolve(root, "clara-core/extraction-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

let failed = 0;
for (const entry of manifest.files ?? []) {
  const source = execFileSync("git", ["rev-parse", `HEAD:${entry.source_path}`], { cwd: root, encoding: "utf8" }).trim();
  const target = execFileSync("git", ["rev-parse", `HEAD:${entry.target_path}`], { cwd: root, encoding: "utf8" }).trim();
  const expected = entry.source_blob_sha;
  const sourceOk = source === expected;
  const targetOk = target === expected;
  const ok = sourceOk && targetOk;
  console.log(`${ok ? "PASS" : "FAIL"} ${entry.source_path} -> ${entry.target_path}`);
  if (!sourceOk) console.log(`  source blob:  ${source} (manifest: ${expected})`);
  if (!targetOk) console.log(`  target blob:  ${target} (manifest: ${expected})`);
  if (!ok) failed++;
}

console.log(`\\nVerified ${manifest.files?.length ?? 0} immutable source entries; failures: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;

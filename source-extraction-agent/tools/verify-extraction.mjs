#!/usr/bin/env node
/**
 * Verify a captured immutable source root against a pinned Git checkout.
 *
 * Usage:
 *   node source-extraction-agent/tools/verify-extraction.mjs \
 *     --source /path/to/upstream-checkout \
 *     --package /path/to/extraction-package \
 *     --manifest /path/to/immutable-source-manifest.json
 *
 * Manifest shape:
 * {
 *   "source_commit": "<commit sha>",
 *   "source_root_tree": "<root tree sha>",
 *   "target_root": "omniroute-source",
 *   "files": [
 *     {"path":"src/a.ts","source_path":"src/a.ts","blob_sha":"...","mode":"100644","type":"blob"}
 *   ],
 *   "trees": [{"path":"src","source_path":"src","tree_sha":"..."}]
 * }
 *
 * No third-party dependencies. This tool verifies integrity, not behavior or license.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}
function git(cwd, args, input) {
  const result = spawnSync("git", args, {
    cwd, input, encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${String(result.stderr || result.stdout || "").trim()}`);
  }
  return result.stdout;
}
function safeRelative(value, label) {
  if (typeof value !== "string" || !value || path.isAbsolute(value)) {
    throw new Error(`${label} must be a non-empty relative path`);
  }
  const normalized = value.replaceAll("\\", "/");
  if (normalized.split("/").some(part => part === ".." || part === "")) {
    throw new Error(`${label} contains an unsafe path: ${value}`);
  }
  return normalized;
}
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) throw new Error(`Unexpected argument: ${argv[i]}`);
    const key = argv[i].slice(2);
    if (!["source", "package", "manifest"].includes(key)) throw new Error(`Unknown option --${key}`);
    if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Missing value for --${key}`);
    out[key] = argv[++i];
  }
  for (const key of ["source", "package", "manifest"]) if (!out[key]) throw new Error(`Required option missing: --${key}`);
  return out;
}
function walk(root, prefix = "") {
  const found = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(root, rel);
    if (entry.isDirectory() && !entry.isSymbolicLink()) found.push(...walk(root, rel));
    else found.push(rel.replaceAll(path.sep, "/"));
  }
  return found;
}
function lsTreeEntry(source, commit, sourcePath) {
  const output = git(source, ["ls-tree", "-z", commit, "--", sourcePath]);
  const rows = output.split("\0").filter(Boolean);
  const row = rows.find(item => item.slice(item.indexOf("\t") + 1) === sourcePath);
  if (!row) return null;
  const [metadata, objectPath] = [row.slice(0, row.indexOf("\t")), row.slice(row.indexOf("\t") + 1)];
  const [mode, type, sha] = metadata.split(" ");
  return { mode, type, sha, path: objectPath };
}
function objectShaForPath(source, commit, sourcePath) {
  return git(source, ["rev-parse", `${commit}:${sourcePath}`]).trim();
}
function actualBlobSha(source, filePath, type) {
  if (type === "symlink") {
    const target = fs.readlinkSync(filePath);
    return git(source, ["hash-object", "--stdin"], target).trim();
  }
  return git(source, ["hash-object", "--no-filters", filePath]).trim();
}

try {
  const args = parseArgs(process.argv.slice(2));
  const source = path.resolve(args.source);
  const packageDir = path.resolve(args.package);
  const manifestPath = path.resolve(args.manifest);
  if (!fs.existsSync(source) || !fs.existsSync(packageDir) || !fs.existsSync(manifestPath)) {
    throw new Error("Source checkout, package directory, and manifest must all exist");
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!manifest.source_commit || !manifest.source_root_tree || !manifest.target_root || !Array.isArray(manifest.files)) {
    throw new Error("Manifest requires source_commit, source_root_tree, target_root, and files[]");
  }
  const commit = String(manifest.source_commit);
  const targetRootRel = safeRelative(manifest.target_root, "target_root");
  const targetRoot = path.resolve(packageDir, targetRootRel);
  if (!targetRoot.startsWith(packageDir + path.sep)) throw new Error("target_root escapes package directory");
  if (!fs.existsSync(targetRoot) || !fs.statSync(targetRoot).isDirectory()) throw new Error(`target_root directory missing: ${targetRootRel}`);

  const actualCommit = git(source, ["rev-parse", `${commit}^{commit}`]).trim();
  if (actualCommit !== commit) throw new Error(`Pinned commit mismatch: expected ${commit}, got ${actualCommit}`);
  const rootTree = git(source, ["rev-parse", `${commit}^{tree}`]).trim();
  if (rootTree !== manifest.source_root_tree) throw new Error(`Source root tree mismatch: expected ${manifest.source_root_tree}, got ${rootTree}`);

  const expectedPaths = new Set();
  let checked = 0;
  const errors = [];
  for (const item of manifest.files) {
    const rel = safeRelative(item.path, "file.path");
    const sourceRel = safeRelative(item.source_path ?? item.path, "file.source_path");
    if (expectedPaths.has(rel)) { errors.push(`Duplicate manifest path: ${rel}`); continue; }
    expectedPaths.add(rel);
    const target = path.resolve(targetRoot, rel);
    if (!target.startsWith(targetRoot + path.sep)) { errors.push(`Path escapes target root: ${rel}`); continue; }
    const sourceEntry = lsTreeEntry(source, commit, sourceRel);
    if (!sourceEntry) { errors.push(`Missing source path at pinned commit: ${sourceRel}`); continue; }
    if (item.blob_sha && sourceEntry.sha !== item.blob_sha) errors.push(`Source blob SHA mismatch for ${sourceRel}: manifest ${item.blob_sha}, Git ${sourceEntry.sha}`);
    if (item.mode && sourceEntry.mode !== item.mode) errors.push(`Source mode mismatch for ${sourceRel}: manifest ${item.mode}, Git ${sourceEntry.mode}`);
    const type = item.type === "symlink" || sourceEntry.mode === "120000" ? "symlink" : "blob";
    let stat;
    try { stat = fs.lstatSync(target); } catch { errors.push(`Missing extracted path: ${rel}`); continue; }
    if (type === "symlink" && !stat.isSymbolicLink()) { errors.push(`Expected symlink: ${rel}`); continue; }
    if (type !== "symlink" && (!stat.isFile() || stat.isSymbolicLink())) { errors.push(`Expected regular file: ${rel}`); continue; }
    const targetSha = actualBlobSha(source, target, type);
    if (targetSha !== sourceEntry.sha) errors.push(`Extracted blob mismatch for ${rel}: expected ${sourceEntry.sha}, got ${targetSha}`);
    checked++;
  }

  for (const tree of manifest.trees ?? []) {
    const sourceRel = safeRelative(tree.source_path ?? tree.path, "tree.source_path");
    const treeSha = objectShaForPath(source, commit, sourceRel);
    if (treeSha !== tree.tree_sha) errors.push(`Tree SHA mismatch for ${sourceRel}: expected ${tree.tree_sha}, got ${treeSha}`);
  }

  const actualPaths = new Set(walk(targetRoot));
  for (const rel of expectedPaths) if (!actualPaths.has(rel)) errors.push(`Missing manifest file in package: ${rel}`);
  for (const rel of actualPaths) if (!expectedPaths.has(rel)) errors.push(`Unexpected file in immutable root: ${rel}`);

  if (errors.length) {
    for (const error of errors) console.error(`FAIL: ${error}`);
    console.error(`Verification FAILED: checked ${checked}/${manifest.files.length} files; ${errors.length} issue(s).`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${checked} files match pinned Git blobs; root tree ${rootTree}; ${(manifest.trees ?? []).length} tree assertion(s); no missing/extra paths.`);
  }
} catch (error) {
  fail(error?.stack || String(error));
}

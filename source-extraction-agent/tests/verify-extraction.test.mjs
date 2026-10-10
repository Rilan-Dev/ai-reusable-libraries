import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const verifier = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../tools/verify-extraction.mjs");
function run(cwd, command, args, input) {
  const result = spawnSync(command, args, { cwd, input, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "extraction-verifier-"));
  const source = path.join(dir, "source");
  const pkg = path.join(dir, "package");
  fs.mkdirSync(path.join(source, "src"), { recursive: true });
  fs.mkdirSync(path.join(pkg, "immutable-source", "src"), { recursive: true });
  run(dir, "git", ["init", source]);
  run(source, "git", ["config", "user.email", "test@example.invalid"]);
  run(source, "git", ["config", "user.name", "Verifier Test"]);
  fs.writeFileSync(path.join(source, "src", "a.txt"), "byte exact\n");
  fs.symlinkSync("a.txt", path.join(source, "src", "link.txt"));
  run(source, "git", ["add", "src"]);
  run(source, "git", ["commit", "-m", "fixture"]);
  const commit = run(source, "git", ["rev-parse", "HEAD"]);
  const rootTree = run(source, "git", ["rev-parse", "HEAD^{tree}"]);
  const entries = run(source, "git", ["ls-tree", "-r", "HEAD"]).split("\n").map(line => {
    const [meta, rel] = line.split("\t");
    const [mode, type, sha] = meta.split(" ");
    return { path: rel, source_path: rel, blob_sha: sha, mode, type };
  });
  fs.copyFileSync(path.join(source, "src", "a.txt"), path.join(pkg, "immutable-source", "src", "a.txt"));
  fs.symlinkSync("a.txt", path.join(pkg, "immutable-source", "src", "link.txt"));
  const manifest = path.join(pkg, "manifest.json");
  fs.writeFileSync(manifest, JSON.stringify({ source_commit: commit, source_root_tree: rootTree, target_root: "immutable-source", files: entries }));
  return { dir, source, pkg, manifest, entries };
}
function verify(f) {
  return spawnSync(process.execPath, [verifier, "--source", f.source, "--package", f.pkg, "--manifest", f.manifest], { encoding: "utf8" });
}

test("passes exact regular files and symlinks from the pinned Git commit", t => {
  const f = fixture(); t.after(() => fs.rmSync(f.dir, { recursive: true, force: true }));
  const result = verify(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS:/);
});

test("fails when an unexpected file appears in the immutable root", t => {
  const f = fixture(); t.after(() => fs.rmSync(f.dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(f.pkg, "immutable-source", "unexpected.txt"), "unexpected");
  const result = verify(f);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unexpected file/);
});

test("fails when a captured file is changed", t => {
  const f = fixture(); t.after(() => fs.rmSync(f.dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(f.pkg, "immutable-source", "src", "a.txt"), "modified\n");
  const result = verify(f);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Extracted blob mismatch/);
});

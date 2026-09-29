#!/usr/bin/env node
/**
 * AI Platform Core extraction verifier.
 *
 * Works in:
 *  1. the Doable extraction Git checkout (strong mode: Git tree/blob identity);
 *  2. a target project after ai-platform-core/ has been copied (structure mode).
 *
 * It never edits immutable source files.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = path.resolve(process.cwd(), "ai-platform-core");
const reportPath = path.join(root, "verification", "completeness-report.json");

const immutableManifestPath = path.join(root, "verification/immutable-source-manifest.json");
const immutableManifest = fs.existsSync(immutableManifestPath)
  ? JSON.parse(fs.readFileSync(immutableManifestPath, "utf8"))
  : {};
const expectedTrees = immutableManifest.capturedRootTrees || {};

const expectedBlobs = {
  "doable-source/services/api/src/routes/integrations-admin.ts": "82538892891afd1cd45368e51abb5f871dab8614",
  "doable-source/services/api/src/routes/integrations-catalog.ts": "ce092eae3e0f2ac96a3725f32a6b83893d9136d9",
  "doable-source/services/api/src/routes/integrations-connections.ts": "748fe5d8afef2e4d2531ae93adba8747f129218a",
  "doable-source/services/api/src/routes/integrations-oauth.ts": "c158bb799e86e658a9cff553db9c8519b02fdb7b",
  "doable-source/services/api/src/routes/integrations.ts": "eb1e5297a630b80aef98c10cbae9bf55b3cff040",
  "doable-source/services/api/src/routes/mcp-apps-data.ts": "f01b197f66b9520eeb8b5417c4ca1cb1d88e0a3f",
  "doable-source/services/api/src/routes/plan.ts": "85ffcc681be6f19b61c32a8c480d4651c7624b26",
  "doable-source/services/api/src/routes/provider-bridge.ts": "0906f6c10213c6224969ac45d10b06785e64d6e7",
  "doable-source/services/api/src/routes/provider-catalog.ts": "ae7f2cc8e456627226466495a348261453c12713",
  "doable-source/services/api/src/routes/skills.ts": "6f93fedd37dc3a8b079c96d9ed57581c9de3baba",
  "doable-source/services/api/src/routes/context.ts": "552ef7c4251d1cb464cb61730097159fe4ed349b",
  "doable-source/services/api/src/routes/sandbox-rules.ts": "267324003df3131c5d76da36d260f5acd9cd7d8d",
  "doable-source/services/api/src/routes/workspaces/sandbox.ts": "51b2515a0c931b02e1ce9caea3aceccbd15f9644",
  "doable-source/services/api/src/routes/compat-proxy.ts": "751590170921d9eb2fe83b4497c7b1a6ef23f427",
  "doable-source/services/api/src/routes/auth/platform-ai-bootstrap.ts": "f318372e194b6f1104cb45c2f74ade5337094fe2"
};

const REQUIRED_CAPABILITIES = [
  "multi-provider","agents","tools","integrations","mcp","skills","chat",
  "context-memory","workspace-sandbox","ui","marketplace","notebooklm",
  "realtime-collaboration","document-builders","mcp-tool-servers",
  "visual-ai-editing","platform-extensions","visual-editing","ai-media-builders","platform-foundation","ai-security"
];

function normalizeManifestFilePath(file) {
  if (typeof file?.destinationPath === "string" && file.destinationPath.length > 0) {
    return file.destinationPath.replace(/^ai-platform-core\//, "");
  }
  if (typeof file?.path === "string" && file.path.length > 0) {
    return `${file.root}/${file.path}`;
  }
  return null;
}

const requiredDirs = Object.keys(expectedTrees);
const requiredFiles = [
  "EXTRACTION_MANIFEST.md",
  "COMPLETE_AI_PLATFORM_COVERAGE.md",
  "COPY_TO_ANY_PROJECT.md",
  "UI_UX_REFERENCE.md",
  "UI_CAPABILITY_MATRIX.md",
  "ADAPTER_ARCHITECTURE.md",
  "verification/source-and-ui-manifest.json",
  "verification/capability-closure.json",
  "verification/immutable-source-manifest.json",
  "verification/verify-extraction.mjs",
  "verification/package-hardening.json",
  "PACKAGE_HARDENING.md",
  "external-dependencies/external-dependencies.json",
  "external-dependencies/generate-external-dependencies.mjs",
  "external-dependencies/verify-external-dependencies.mjs",
  "external-dependencies/README.md",
  "external-dependencies/source-manifests/services-api.package.json",
  "external-dependencies/source-manifests/root.package.json",
  "external-dependencies/source-manifests/pnpm-workspace.yaml",
  "external-dependencies/source-manifests/tsconfig.base.json",
  "external-dependencies/source-manifests/marketplace-bundle.package.json",
  "external-dependencies/source-manifests/notebooklm-mcp-server.package.json",
  "external-dependencies/source-manifests/doable-ws.package.json",
  "external-dependencies/source-manifests/pdf-builder.package.json",
  "external-dependencies/source-manifests/presentation-builder.package.json",
  "external-dependencies/source-manifests/spreadsheet-builder.package.json",
  "external-dependencies/source-manifests/markdown-builder.package.json",
  "external-dependencies/source-manifests/image-generator.package.json",
  "capabilities/multi-provider/MANIFEST.md",
  "capabilities/agents/MANIFEST.md",
  "capabilities/tools/MANIFEST.md",
  "capabilities/integrations/MANIFEST.md",
  "capabilities/mcp/MANIFEST.md",
  "capabilities/skills/MANIFEST.md",
  "capabilities/chat/MANIFEST.md",
  "capabilities/context-memory/MANIFEST.md",
  "capabilities/workspace-sandbox/MANIFEST.md",
  "capabilities/ui/MANIFEST.md",
  "capabilities/marketplace/MANIFEST.md",
  "capabilities/notebooklm/MANIFEST.md",
  "capabilities/realtime-collaboration/MANIFEST.md",
  "capabilities/document-builders/MANIFEST.md",
  "capabilities/mcp-tool-servers/MANIFEST.md",
  "capabilities/visual-ai-editing/MANIFEST.md",
  "capabilities/platform-extensions/MANIFEST.md",
  "capabilities/platform-foundation/MANIFEST.md",
  "capabilities/ai-security/MANIFEST.md",
  "IMPLEMENTATION_PLAYBOOK.md"
];

function exists(rel) { return fs.existsSync(path.join(root, rel)); }

function gitRevParse(spec) {
  try {
    return execFileSync("git", ["rev-parse", spec], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function gitAvailable() {
  return Boolean(gitRevParse("HEAD"));
}

function sha1(data) { return crypto.createHash("sha1").update(data).digest("hex"); }

function gitTreeSha(absDir) {
  const entries = fs.readdirSync(absDir, { withFileTypes: true }).map((entry) => {
    const abs = path.join(absDir, entry.name);
    if (entry.isDirectory()) return { name: entry.name, mode: "40000", sha: gitTreeSha(abs) };
    const stat = fs.lstatSync(abs);
    const mode = (stat.mode & 0o111) ? "100755" : "100644";
    return { name: entry.name, mode, sha: gitBlobSha(path.relative(root, abs)) };
  }).sort((a, b) => Buffer.from(a.name).compare(Buffer.from(b.name)));
  const body = Buffer.concat(entries.map((e) => Buffer.concat([
    Buffer.from(`${e.mode} ${e.name}\0`),
    Buffer.from(e.sha, "hex")
  ])));
  return sha1(Buffer.concat([Buffer.from(`tree ${body.length}\0`), body]));
}

function listFilesystemFiles(relRoot) {
  const absRoot = path.join(root, relRoot);
  const out = [];
  function walk(dir, rel) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const childRel = path.join(rel, entry.name).split(path.sep).join("/");
      const childAbs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(childAbs, childRel);
      else out.push(childRel);
    }
  }
  if (fs.existsSync(absRoot)) walk(absRoot, relRoot);
  return out.sort();
}

function gitListFiles(relRoot) {
  try {
    return execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD", "--", `ai-platform-core/${relRoot}`], { encoding: "utf8" })
      .split("\n").map(x => x.trim()).filter(Boolean).map(x => x.replace(/^ai-platform-core\//, "")).sort();
  } catch { return []; }
}

function gitBlobSha(file) {
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) return null;
  const data = fs.readFileSync(abs);
  const header = Buffer.from(`blob ${data.length}\0`);
  return crypto.createHash("sha1").update(Buffer.concat([header, data])).digest("hex");
}

const report = {
  verifier: "ai-platform-core/verification/verify-extraction.mjs",
  generatedAt: new Date().toISOString(),
  source: {
    repository: "Rilan-Dev/Doable",
    ref: "develop",
    commit: "a6036d1fd6dca83c08ee5affa141e5c85e45f5af"
  },
  mode: gitAvailable() ? "git+filesystem" : "filesystem",
  checks: {},
  featureManifests: {},
  externalDependencyManifest: exists("external-dependencies/source-manifests/services-api.package.json"),
  pass: true
};

const missingDirs = requiredDirs.filter((p) => !exists(p));
const missingFiles = requiredFiles.filter((p) => !exists(p));
report.checks.requiredDirectories = { total: requiredDirs.length, missing: missingDirs, pass: missingDirs.length === 0 };
report.checks.requiredFiles = { total: requiredFiles.length, missing: missingFiles, pass: missingFiles.length === 0 };
report.pass &&= report.checks.requiredDirectories.pass && report.checks.requiredFiles.pass;

if (gitAvailable()) {
  const treeResults = {};
  for (const [rel, expected] of Object.entries(expectedTrees)) {
    const actual = gitRevParse(`HEAD:ai-platform-core/${rel}`);
    treeResults[rel] = { expected, actual, pass: actual === expected };
  }
  report.checks.gitTrees = treeResults;
  report.checks.gitTreesPass = Object.values(treeResults).every((x) => x.pass);
  report.pass &&= report.checks.gitTreesPass;

  const blobResults = {};
  for (const [rel, expected] of Object.entries(expectedBlobs)) {
    const actual = gitRevParse(`HEAD:ai-platform-core/${rel}`);
    blobResults[rel] = { expected, actual, pass: actual === expected };
  }
  report.checks.gitBlobs = blobResults;
  report.checks.gitBlobsPass = Object.values(blobResults).every((x) => x.pass);
  report.pass &&= report.checks.gitBlobsPass;
} else {
  const blobResults = {};
  for (const [rel, expected] of Object.entries(expectedBlobs)) {
    const actual = gitBlobSha(rel);
    blobResults[rel] = { expected, actual, pass: actual === expected };
  }
  report.checks.filesystemKeyBlobs = blobResults;
  report.checks.filesystemKeyBlobsPass = Object.values(blobResults).every((x) => x.pass);
  report.pass &&= report.checks.filesystemKeyBlobsPass;
}

const hardeningPath = path.join(root, "verification/package-hardening.json");
if (fs.existsSync(hardeningPath)) {
  const h = JSON.parse(fs.readFileSync(hardeningPath, "utf8"));
  const expectedCapabilities = REQUIRED_CAPABILITIES;
  const capabilityPass = expectedCapabilities.every((name) => (h.capabilities || []).includes(name));
  const sourcePass = h.source?.repository === "Rilan-Dev/Doable"
    && h.source?.ref === "develop"
    && h.source?.commit === "a6036d1fd6dca83c08ee5affa141e5c85e45f5af";
  const manifestSourceRoots = Object.keys(immutableManifest.capturedRootTrees || {}).filter((p) => p.startsWith("doable-source/")).length;
  const manifestDependencyRoots = Object.keys(immutableManifest.capturedRootTrees || {}).filter((p) => p.startsWith("dependency-closure/")).length;
  const manifestUiRoots = Object.keys(immutableManifest.capturedRootTrees || {}).filter((p) => p.startsWith("ui-reference/")).length;
  const manifestDirectoryTrees = (immutableManifest.directoryTrees || []).length;
  const manifestRootTrees = Object.keys(immutableManifest.capturedRootTrees || {}).length;
  const immutableFileCount = (immutableManifest.files || []).length;
  const immutablePass = h.immutable?.sourceRoots === manifestSourceRoots
    && h.immutable?.dependencyClosureRoots === manifestDependencyRoots
    && h.immutable?.uiReferenceRoots === (Object.keys(immutableManifest.capturedRootTrees || {}).filter((p) => p.startsWith("ui-reference/")).length || h.immutable?.uiReferenceRoots)
    && h.immutable?.capturedDirectoryTrees === manifestDirectoryTrees
    && h.immutable?.capturedRootTrees === manifestRootTrees
    && h.immutable?.capturedTrees === manifestDirectoryTrees + manifestRootTrees
    && h.immutable?.immutableFiles === immutableFileCount;
  const targetPass = h.targetVerification?.requiredBeforeHostAdapters === true
    && h.targetVerification?.command === "node ai-platform-core/verification/verify-extraction.mjs";
  report.checks.packageHardening = {
    sourcePass, immutablePass, capabilityPass, targetPass,
    externalDependencyManifest: h.externalDependencies?.manifest,
    pass: sourcePass && immutablePass && capabilityPass && targetPass
  };
  report.pass &&= report.checks.packageHardening.pass;
}
 
const capabilityClosurePath = path.join(root, "verification/capability-closure.json");
if (fs.existsSync(capabilityClosurePath)) {
  const c = JSON.parse(fs.readFileSync(capabilityClosurePath, "utf8"));
  const expected = REQUIRED_CAPABILITIES;
  const capabilities = c.capabilities || {};
  const missing = expected.filter((name) => !capabilities[name] || capabilities[name].manifest !== `capabilities/${name}/MANIFEST.md`);
  const invalidRefs = [];
  for (const [name, spec] of Object.entries(capabilities)) {
    for (const group of ["runtime","dependencies","ui","reference"]) {
      for (const ref of spec[group] || []) {
        if (!exists(ref)) invalidRefs.push({ capability: name, group, ref });
      }
    }
  }
  report.checks.capabilityClosure = {
    expected: expected.length,
    present: Object.keys(capabilities).length,
    missing,
    invalidRefs,
    pass: missing.length === 0 && invalidRefs.length === 0
  };
  report.pass &&= report.checks.capabilityClosure.pass;
}

const dependencyVerifierPath = path.join(root, "external-dependencies/verify-external-dependencies.mjs");
if (fs.existsSync(dependencyVerifierPath)) {
  let dependencyCheck = null;
  try {
    const raw = execFileSync(process.execPath, [dependencyVerifierPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    dependencyCheck = JSON.parse(raw);
  } catch (error) {
    try { dependencyCheck = JSON.parse(error.stdout?.toString() || "{}"); } catch {}
    dependencyCheck ||= { pass: false, error: String(error.message || error) };
  }
  report.checks.externalDependencyInventory = dependencyCheck;
  report.pass &&= dependencyCheck?.pass === true;
}

const sourceManifest = path.join(root, "verification/source-and-ui-manifest.json");
if (fs.existsSync(sourceManifest)) {
  const m = JSON.parse(fs.readFileSync(sourceManifest, "utf8"));
  const uiFiles = Object.keys(m.uiReferenceAdditionalFiles || {});
  report.checks.uiReferenceFiles = {
    total: uiFiles.length,
    missing: uiFiles.filter((p) => !exists(`ui-reference/${p}`)),
    pass: uiFiles.every((p) => exists(`ui-reference/${p}`))
  };
  report.pass &&= report.checks.uiReferenceFiles.pass;
}

if (fs.existsSync(immutableManifestPath)) {
  const m = immutableManifest;
  const fileResults = [];
  for (const f of m.files || []) {
    const rel = normalizeManifestFilePath(f);
    if (!rel) {
      fileResults.push({ path: null, expected: f?.sha ?? null, actual: null, pass: false });
      continue;
    }
    const actualSha = gitAvailable() ? gitRevParse(`HEAD:ai-platform-core/${rel}`) : gitBlobSha(rel);
    fileResults.push({ path: rel, expected: f.sha, actual: actualSha, pass: actualSha === f.sha });
  }

  const treeResults = {};
  const allTreeEntries = [
    ...Object.entries(m.capturedRootTrees || {}).map(([path, sha]) => ({ path, sha, kind: "captured-root" })),
    ...(m.directoryTrees || []).map((entry) => ({ path: entry.destinationPath || entry.path, sha: entry.sha, kind: "directory" }))
  ];
  for (const entry of allTreeEntries) {
    const rel = entry.path;
    const actual = gitAvailable()
      ? gitRevParse(`HEAD:ai-platform-core/${rel}`)
      : (exists(rel) ? gitTreeSha(path.join(root, rel)) : null);
    treeResults[rel] = { expected: entry.sha, actual, kind: entry.kind, pass: actual === entry.sha };
  }

  // A captured tree is authoritative for its complete scope. The file list in
  // immutable-source-manifest.json is a provenance/sample list, not an
  // inventory of every blob inside each verified tree.
  const inventory = {};
  for (const scopeRoot of new Set((m.files || []).map(f => f.root))) {
    const entries = (m.files || []).filter(f => f.root === scopeRoot);
    const invalid = entries
      .map((f, i) => ({ f, i, path: normalizeManifestFilePath(f) }))
      .filter(x => !x.path || !x.f.sha);
    inventory[scopeRoot] = {
      manifestEntries: entries.length,
      invalidEntries: invalid.map(x => x.i),
      pass: invalid.length === 0,
    };
  }

  report.checks.immutableSource = {
    sourceCommit: m.source?.commit,
    currentExtractionCommit: m.currentExtractionCommit,
    totalFiles: fileResults.length,
    verifiedFiles: fileResults.filter(x => x.pass).length,
    fileFailures: fileResults.filter(x => !x.pass),
    trees: treeResults,
    treesExpected: allTreeEntries.length,
    treesVerified: Object.values(treeResults).filter(x => x.pass).length,
    treeFailures: Object.entries(treeResults).filter(([, x]) => !x.pass).map(([path, x]) => ({ path, expected: x.expected, actual: x.actual })),
    treesPass: Object.values(treeResults).every(x => x.pass),
    inventory,
    inventoryPass: Object.values(inventory).every(x => x.pass),
    filesPass: fileResults.every(x => x.pass),
    pass: fileResults.every(x => x.pass) && Object.values(treeResults).every(x => x.pass) && Object.values(inventory).every(x => x.pass)
  };
  report.pass &&= report.checks.immutableSource.pass;
}

for (const name of REQUIRED_CAPABILITIES) {
  const p = `capabilities/${name}/MANIFEST.md`;
  report.featureManifests[name] = { path: p, present: exists(p) };
  report.pass &&= report.featureManifests[name].present;
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);

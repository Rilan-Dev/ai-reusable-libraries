#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "ai-platform-core");
const immutableRoots = [
  "doable-source",
  "dependency-closure"
];
const sourceManifestDir = path.join(root, "external-dependencies", "source-manifests");

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const packageFiles = immutableRoots
  .flatMap((rel) => walk(path.join(root, rel)))
  .filter((file) => path.basename(file) === "package.json");

const sourcePackageFiles = walk(sourceManifestDir)
  .filter((file) => file.endsWith(".package.json"));

const manifests = [
  ...packageFiles.map((file) => ({ path: path.relative(root, file).split(path.sep).join("/"), data: readJson(file) })),
  ...sourcePackageFiles.map((file) => ({ path: path.relative(root, file).split(path.sep).join("/"), data: readJson(file) }))
];

const buckets = {
  workspacePackages: {},
  externalNpmPackages: {},
  peerDependencies: {},
  optionalDependencies: {},
  activepiecesPackages: {},
  packageOverrides: {},
  onlyBuiltDependencies: []
};

for (const manifest of manifests) {
  const data = manifest.data;
  const all = {
    ...(data.dependencies || {}),
    ...(data.optionalDependencies || {})
  };
  for (const [name, version] of Object.entries(all)) {
    if (String(version).startsWith("workspace:")) buckets.workspacePackages[name] = version;
    else {
      buckets.externalNpmPackages[name] = version;
      if (name.startsWith("@activepieces/piece-")) buckets.activepiecesPackages[name] = version;
    }
  }
  for (const [name, version] of Object.entries(data.peerDependencies || {})) {
    buckets.peerDependencies[name] = version;
  }
  for (const [name, version] of Object.entries(data.optionalDependencies || {})) {
    buckets.optionalDependencies[name] = version;
  }
  if (data.pnpm?.overrides) Object.assign(buckets.packageOverrides, data.pnpm.overrides);
  for (const name of data.pnpm?.onlyBuiltDependencies || []) {
    if (!buckets.onlyBuiltDependencies.includes(name)) buckets.onlyBuiltDependencies.push(name);
  }
}

const infrastructure = {
  runtime: [
    "Node.js 22+",
    "pnpm 9.x-compatible workspace tooling",
    "PostgreSQL 16-compatible database for DB-dependent paths"
  ],
  execution: [
    "Git CLI",
    "Puppeteer-compatible browser/Chromium",
    "OS sandbox/process primitives required by docore/dovault"
  ],
  security: [
    "secure secret/key storage",
    "tenant identity/RBAC",
    "network/egress policy for untrusted tool and integration execution"
  ],
  hostAdapters: [
    "project filesystem/root",
    "database schema and migrations",
    "authentication/session/tenant identity",
    "provider credentials and secret storage",
    "MCP server credentials/network/process policy",
    "integration OAuth/manual credentials and selected Activepieces pieces",
    "RAG/vector store",
    "streaming/transport layer",
    "object storage where attachments/artifacts are enabled"
  ],
  optional: [
    "GitHub Copilot CLI/SDK when Copilot-backed execution is enabled",
    "external MCP server packages selected by the host",
    "Activepieces piece packages selected by the host"
  ]
};

const out = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  manifests: manifests.map((m) => ({ path: m.path, packageName: m.data.name || null })),
  workspacePackages: Object.fromEntries(Object.entries(buckets.workspacePackages).sort()),
  externalNpmPackages: Object.fromEntries(Object.entries(buckets.externalNpmPackages).sort()),
  peerDependencies: Object.fromEntries(Object.entries(buckets.peerDependencies).sort()),
  optionalDependencies: Object.fromEntries(Object.entries(buckets.optionalDependencies).sort()),
  activepiecesPackages: Object.fromEntries(Object.entries(buckets.activepiecesPackages).sort()),
  packageOverrides: Object.fromEntries(Object.entries(buckets.packageOverrides).sort()),
  onlyBuiltDependencies: buckets.onlyBuiltDependencies.sort(),
  infrastructure,
  rule: "A capability is not considered portable until its package and infrastructure requirements are explicitly bound by the target project. Source-present packages are not the same as installed runtime dependencies."
};
const outPath = path.join(root, "external-dependencies", "external-dependencies.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));

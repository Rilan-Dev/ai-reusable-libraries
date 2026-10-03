#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "ai-platform-core");
const immutableRoots = ["doable-source", "dependency-closure"];
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
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function sortedObject(value) { return Object.fromEntries(Object.entries(value).sort()); }

const packageFiles = immutableRoots
  .flatMap((rel) => walk(path.join(root, rel)))
  .filter((file) => path.basename(file) === "package.json");
const sourcePackageFiles = walk(sourceManifestDir).filter((file) => file.endsWith(".package.json"));
const manifests = [
  ...packageFiles.map((file) => readJson(file)),
  ...sourcePackageFiles.map((file) => readJson(file))
];

const expected = {
  workspacePackages: {},
  externalNpmPackages: {},
  peerDependencies: {},
  optionalDependencies: {},
  activepiecesPackages: {},
  packageOverrides: {},
  onlyBuiltDependencies: []
};

for (const data of manifests) {
  for (const [name, version] of Object.entries({...data.dependencies, ...data.optionalDependencies})) {
    if (String(version).startsWith("workspace:")) expected.workspacePackages[name] = version;
    else {
      expected.externalNpmPackages[name] = version;
      if (name.startsWith("@activepieces/piece-")) expected.activepiecesPackages[name] = version;
    }
  }
  for (const [name, version] of Object.entries(data.peerDependencies || {})) expected.peerDependencies[name] = version;
  for (const [name, version] of Object.entries(data.optionalDependencies || {})) expected.optionalDependencies[name] = version;
  if (data.pnpm?.overrides) Object.assign(expected.packageOverrides, data.pnpm.overrides);
  for (const name of data.pnpm?.onlyBuiltDependencies || []) {
    if (!expected.onlyBuiltDependencies.includes(name)) expected.onlyBuiltDependencies.push(name);
  }
}

expected.workspacePackages = sortedObject(expected.workspacePackages);
expected.externalNpmPackages = sortedObject(expected.externalNpmPackages);
expected.peerDependencies = sortedObject(expected.peerDependencies);
expected.optionalDependencies = sortedObject(expected.optionalDependencies);
expected.activepiecesPackages = sortedObject(expected.activepiecesPackages);
expected.packageOverrides = sortedObject(expected.packageOverrides);
expected.onlyBuiltDependencies.sort();

const inventoryPath = path.join(root, "external-dependencies", "external-dependencies.json");
const actual = readJson(inventoryPath);
const fields = Object.keys(expected);
const failures = [];
for (const field of fields) {
  const a = JSON.stringify(actual[field] || (Array.isArray(expected[field]) ? [] : {}));
  const e = JSON.stringify(expected[field]);
  if (a !== e) failures.push(field);
}

const result = {
  pass: failures.length === 0,
  packageManifestCount: manifests.length,
  expectedCounts: {
    externalNpmPackages: Object.keys(expected.externalNpmPackages).length,
    activepiecesPackages: Object.keys(expected.activepiecesPackages).length,
    workspacePackages: Object.keys(expected.workspacePackages).length,
    peerDependencies: Object.keys(expected.peerDependencies).length
  },
  failures
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);

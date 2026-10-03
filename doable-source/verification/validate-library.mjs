#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];
const warnings = [];

function readJson(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    errors.push(`missing file: ${rel}`);
    return null;
  }
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { errors.push(`invalid JSON: ${rel} (${e.message})`); return null; }
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

const catalog = readJson("capabilities/CATALOG.json");
const graph = readJson("capabilities/DEPENDENCY_GRAPH.json");
const policy = readJson("verification/IMMUTABLE_PATHS.json");
const schema = readJson("capabilities/CAPABILITY_MANIFEST.schema.json");
const implementationIndex = readJson("capabilities/IMPLEMENTATION_INDEX.json");

if (catalog) {
  if (!Array.isArray(catalog.capabilities)) errors.push("CATALOG.json: capabilities must be an array");
  else {
    const ids = new Set();
    for (const c of catalog.capabilities) {
      if (!c.id || !c.manifest || !c.description) errors.push(`catalog entry missing id/manifest/description: ${JSON.stringify(c)}`);
      if (ids.has(c.id)) errors.push(`duplicate capability id: ${c.id}`);
      ids.add(c.id);
      if (c.manifest && !exists(c.manifest)) errors.push(`catalog manifest missing: ${c.id} -> ${c.manifest}`);
    }
    if (catalog.rules?.agentEntry && !exists(catalog.rules.agentEntry)) errors.push(`agent entry missing: ${catalog.rules.agentEntry}`);
  }
}

if (implementationIndex && catalog?.capabilities) {
  if (!Array.isArray(implementationIndex.capabilities)) errors.push("IMPLEMENTATION_INDEX.json: capabilities must be an array");
  else {
    const catalogIds = new Set(catalog.capabilities.map(c => c.id));
    const indexIds = new Set();
    for (const entry of implementationIndex.capabilities) {
      if (!entry.id || !entry.manifest || !Array.isArray(entry.signals)) errors.push(`implementation index entry missing id/manifest/signals: ${JSON.stringify(entry)}`);
      if (indexIds.has(entry.id)) errors.push(`duplicate implementation index capability id: ${entry.id}`);
      indexIds.add(entry.id);
      if (entry.id && !catalogIds.has(entry.id)) errors.push(`implementation index has unknown capability: ${entry.id}`);
      if (entry.manifest && !exists(entry.manifest)) errors.push(`implementation index manifest missing: ${entry.id} -> ${entry.manifest}`);
      if (entry.id && entry.manifest !== `capabilities/${entry.id}/MANIFEST.md`) errors.push(`implementation index manifest mismatch: ${entry.id} -> ${entry.manifest}`);
    }
    for (const id of catalogIds) if (!indexIds.has(id)) errors.push(`catalog capability missing from implementation index: ${id}`);
    for (const id of indexIds) if (!catalogIds.has(id)) errors.push(`implementation index capability not in catalog: ${id}`);
  }
}

if (graph && catalog?.capabilities) {
  const ids = new Set(catalog.capabilities.map(c => c.id));
  for (const e of graph.edges ?? []) {
    if (!ids.has(e.from)) errors.push(`graph edge has unknown from capability: ${e.from}`);
    if (!ids.has(e.to)) errors.push(`graph edge has unknown to capability: ${e.to}`);
    if (!e.type) warnings.push(`graph edge missing type: ${e.from} -> ${e.to}`);
  }
}

if (policy) {
  for (const rel of policy.immutable ?? []) {
    const base = rel.replace(/\/\*\*$/, "");
    if (!exists(base)) warnings.push(`immutable root does not currently exist: ${rel}`);
  }
}

if (schema) {
  const required = new Set(schema.required ?? []);
  for (const field of ["id","name","description","runtimeSource","requiredSystems","uiReference","requiredBehavior","hostBindings","completionCriteria"]) {
    if (!required.has(field)) errors.push(`manifest schema missing required field: ${field}`);
  }
}

const manifestPaths = catalog?.capabilities?.map(c => c.manifest) ?? [];
const discovered = [];
const capRoot = path.join(root, "capabilities");
if (fs.existsSync(capRoot)) {
  for (const id of fs.readdirSync(capRoot, {withFileTypes:true})) {
    if (!id.isDirectory()) continue;
    const m = path.join(capRoot, id.name, "MANIFEST.md");
    if (fs.existsSync(m)) discovered.push(`capabilities/${id.name}/MANIFEST.md`);
  }
}
for (const p of discovered) if (!manifestPaths.includes(p)) errors.push(`manifest exists but is not cataloged: ${p}`);
for (const p of manifestPaths) if (!discovered.includes(p)) errors.push(`catalog manifest is not discoverable: ${p}`);

console.log("Doable Source library validation");
console.log("=================================");
console.log(`Catalog capabilities: ${catalog?.capabilities?.length ?? 0}`);
console.log(`Discovered manifests: ${discovered.length}`);
console.log(`Graph edges:          ${graph?.edges?.length ?? 0}`);
console.log(`Implementation index: ${implementationIndex?.capabilities?.length ?? 0}`);
console.log(`Errors:               ${errors.length}`);
console.log(`Warnings:             ${warnings.length}`);
for (const e of errors) console.log(`ERROR: ${e}`);
for (const w of warnings) console.log(`WARN:  ${w}`);
if (errors.length) process.exit(1);
console.log("PASS: catalog, manifest paths, graph references, implementation index and manifest schema contract are internally consistent.");

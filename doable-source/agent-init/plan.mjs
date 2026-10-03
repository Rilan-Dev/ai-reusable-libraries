#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
function readJson(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) throw new Error(`missing file: ${rel}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const index = readJson("capabilities/IMPLEMENTATION_INDEX.json");
const graph = readJson("capabilities/DEPENDENCY_GRAPH.json");
const requested = process.argv.slice(2);
if (!requested.length) {
  console.log("Usage: node agent-init/plan.mjs <capability-id> [<capability-id> ...]");
  process.exit(1);
}

const entries = new Map(index.capabilities.map(c => [c.id, c]));
for (const id of requested) {
  if (!entries.has(id)) throw new Error(`unknown capability: ${id}`);
}

const edges = graph.edges ?? [];
const coreTypes = new Set(["required", "bridge", "protects", "packages"]);
const closure = new Set(requested);
const queue = [...requested];
while (queue.length) {
  const from = queue.shift();
  for (const edge of edges) {
    if (edge.from !== from || !coreTypes.has(edge.type) || closure.has(edge.to)) continue;
    closure.add(edge.to);
    queue.push(edge.to);
  }
}

const printEntry = (id) => {
  const e = entries.get(id);
  console.log(`- ${id}`);
  console.log(`  manifest: ${e.manifest}`);
  console.log(`  signals: ${e.signals.join(", ")}`);
};

console.log("Doable Source implementation plan");
console.log("==================================");
console.log("Requested:");
requested.forEach(printEntry);
console.log("");
console.log("Core implementation closure:");
[...closure].forEach(id => { if (!requested.includes(id)) printEntry(id); });
console.log("");
console.log("Execution order:");
console.log("1. Read AGENTS.md and validate-library.mjs requirements.");
console.log("2. Read every requested/core manifest recursively and treat each manifest as authoritative.");
console.log("3. Trace source imports, dependency-closure, persistence, security and host bindings.");
console.log("4. Inspect UI-reference for information architecture, state, streaming, loading/error/recovery and interaction behavior.");
console.log("5. Implement host adapters/contracts without editing immutable source/reference trees.");
console.log("6. Inventory external packages and credentials; do not silently vendor or install them.");
console.log("7. Verify source integrity, then run target-project typecheck/lint/tests/build and applicable runtime/browser checks.");
console.log("8. Report implemented paths, adapters, migrations, external dependencies, verification results and remaining host-specific work.");
console.log("");
console.log("Graph note: this plan is navigation guidance; capability manifests remain authoritative.");

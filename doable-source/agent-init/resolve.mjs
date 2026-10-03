#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const catalogPath = path.join(root, "capabilities", "CATALOG.json");
const graphPath = path.join(root, "capabilities", "DEPENDENCY_GRAPH.json");

function readJson(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Required file not found: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const catalog = readJson(catalogPath);
const graph = readJson(graphPath);
const requested = process.argv.slice(2).join(" ").trim();

if (!requested) {
  console.error("Usage: node agent-init/resolve.mjs <capability-id> [capability-id ...]");
  process.exit(1);
}

const ids = new Set(catalog.capabilities.map(c => c.id));
const requestedIds = requested
  .split(/[\s,]+/)
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

const unknown = requestedIds.filter(id => !ids.has(id));
if (unknown.length) {
  console.error(`Unknown capability id(s): ${unknown.join(", ")}`);
  console.error(`Known ids: ${[...ids].sort().join(", ")}`);
  process.exit(1);
}

const byId = new Map(catalog.capabilities.map(c => [c.id, c]));
const edges = graph.edges ?? [];
const outgoing = new Map();

for (const edge of edges) {
  if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
  outgoing.get(edge.from).push(edge);
}

const buckets = {
  core: new Map(),
  recommended: new Map(),
  optional: new Map(),
};

const coreTypes = new Set(["required", "bridge", "protects", "packages"]);
const recommendedTypes = new Set(["common", "related", "supports"]);

function walk(startIds) {
  const queue = [...startIds];
  const seen = new Set(startIds);

  while (queue.length) {
    const from = queue.shift();
    for (const edge of outgoing.get(from) ?? []) {
      const target = edge.to;
      if (!ids.has(target)) continue;

      const bucket = coreTypes.has(edge.type)
        ? "core"
        : recommendedTypes.has(edge.type)
          ? "recommended"
          : edge.type === "optional"
            ? "optional"
            : "recommended";

      if (!buckets[bucket].has(target)) {
        buckets[bucket].set(target, { id: target, via: [], reasons: [] });
      }
      const item = buckets[bucket].get(target);
      item.via.push(from);
      item.reasons.push(edge.type);

      if (!seen.has(target) && bucket === "core") {
        seen.add(target);
        queue.push(target);
      }
    }
  }
}

walk(requestedIds);

const requestedSet = new Set(requestedIds);
for (const bucket of Object.values(buckets)) {
  for (const id of requestedSet) bucket.delete(id);
}

function printBucket(title, items) {
  console.log(`\n${title}`);
  if (!items.length) {
    console.log("- none");
    return;
  }
  for (const item of items.sort((a, b) => a.id.localeCompare(b.id))) {
    const c = byId.get(item.id);
    console.log(`- ${item.id}: ${c.description}`);
    console.log(`  manifest: ${c.manifest}`);
    if (item.reasons.length) {
      console.log(`  relation: ${[...new Set(item.reasons)].join(", ")} via ${[...new Set(item.via)].join(", ")}`);
    }
  }
}

console.log("Doable Source capability closure");
console.log("================================");
console.log(`Requested: ${requestedIds.join(", ")}`);
console.log("The closure is guidance. Every selected manifest remains authoritative.");
console.log("Core closure = required runtime/bridge/protection/package relationships.");
console.log("Recommended = common/related/supporting review candidates.");
console.log("Optional = explicitly optional branches; include only when the feature requires them.");

printBucket("Requested capabilities", requestedIds.map(id => ({
  id,
  via: [],
  reasons: []
})));

printBucket("Core closure", [...buckets.core.values()]);
printBucket("Recommended review", [...buckets.recommended.values()]);
printBucket("Optional review", [...buckets.optional.values()]);

console.log("\nAgent execution order:");
console.log("1. Inspect the target project's architecture and boundaries.");
console.log("2. Open every requested + core-closure MANIFEST.md.");
console.log("3. Recursively trace source imports, persistence, auth, providers, network, UI and recovery.");
console.log("4. Review recommended/optional capabilities before deciding they are unnecessary.");
console.log("5. Build the host mapping and adapters before implementation.");
console.log("6. Implement outside immutable reference trees.");
console.log("7. Run target verification plus source integrity verification.");

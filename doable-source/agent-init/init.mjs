#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const catalogPath = path.join(root, "capabilities", "CATALOG.json");
const policyPath = path.join(root, "verification", "IMMUTABLE_PATHS.json");
const agentsPath = path.join(root, "AGENTS.md");

if (!fs.existsSync(catalogPath)) {
  console.error("Doable Source catalog not found. Run this from the library root.");
  process.exit(1);
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const request = process.argv.slice(2).join(" ").trim().toLowerCase();

console.log("Doable Source agent initialization");
console.log("=================================");
console.log(`Agent instructions: ${agentsPath}`);
console.log(`Immutable policy:    ${policyPath}`);
console.log(`Capabilities:        ${catalog.capabilities.length}`);
console.log("Closure resolver:    node agent-init/resolve.mjs <capability-id>");

if (!request) {
  console.log("\nNext steps:");
  console.log("1. Inspect AGENTS.md.");
  console.log("2. Identify the requested capability.");
  console.log("3. Open its MANIFEST.md.");
  console.log("4. Run agent-init/resolve.mjs for the known capability closure.");
  console.log("5. Trace the complete dependency/UI/security/persistence closure.");
  console.log("6. Map host boundaries before implementing.");
  console.log("7. Keep immutable source unchanged.");
  console.log("8. Verify the target project.");
  process.exit(0);
}

const terms = request.split(/[^a-z0-9]+/).filter(Boolean);
const scored = catalog.capabilities.map(c => {
  const haystack = (c.id + " " + c.name + " " + c.description).toLowerCase();
  const score = terms.reduce((n, term) => n + (haystack.includes(term) ? 1 : 0), 0);
  return {...c, score};
}).filter(c => c.score > 0).sort((a,b) => b.score - a.score || a.id.localeCompare(b.id));

console.log(`\nFeature request: ${request}`);
if (!scored.length) {
  console.log("No direct catalog match. Read SOURCE_COVERAGE_MATRIX.md and AGENTS.md for broader capability mapping.");
  process.exit(0);
}
console.log("\nCandidate capabilities:");
for (const c of scored.slice(0, 8)) {
  console.log(`- ${c.id}: ${c.manifest}`);
  console.log(`  ${c.description}`);
}
console.log("\nDo not treat this match as proof of completeness. Open the selected manifest and resolve its full closure.");

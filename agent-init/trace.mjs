#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'capabilities/CATALOG.json'), 'utf8'));
const graph = JSON.parse(fs.readFileSync(path.join(root, 'capabilities/DEPENDENCY_GRAPH.json'), 'utf8'));
const requested = process.argv.slice(2);
const ids = requested.length ? requested : catalog.capabilities.map(function (x) { return x.id; });
const byId = new Map(catalog.capabilities.map(function (x) { return [x.id, x]; }));

function fail(message) { console.error(message); process.exit(1); }
function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }
function exists(p) { return fs.existsSync(path.join(root, p)); }
function walk(p) {
  const full = path.join(root, p);
  if (!fs.existsSync(full)) return [];
  const stat = fs.statSync(full);
  if (stat.isFile()) return [p];
  const out = [];
  for (const name of fs.readdirSync(full)) out.push(...walk(path.join(p, name)));
  return out;
}
function seedsFromManifest(manifestPath) {
  const text = read(manifestPath);
  const re = /(?:doable-source|dependency-closure|ui-reference)\/[A-Za-z0-9_./-]+/g;
  return [...new Set((text.match(re) || []).map(function (x) { return x.replace(/[),.;:`]+$/g, ''); }))];
}
function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.normalize(path.join(path.dirname(from), spec));
  const candidates = [base, base + '.ts', base + '.tsx', base + '.js', base + '.jsx', base + '.mjs', base + '.cjs', path.join(base, 'index.ts'), path.join(base, 'index.tsx'), path.join(base, 'index.js'), path.join(base, 'index.jsx'), path.join(base, 'index.mjs')];
  for (const candidate of candidates) if (exists(candidate)) return candidate;
  return null;
}
function scanFile(file) {
  const text = read(file);
  const local = new Set();
  const unresolved = new Set();
  const external = new Set();
  const patterns = [/\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /\bimport\s*['"]([^'"]+)['"]/g, /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(text))) {
      const spec = match[1];
      if (spec.startsWith('.')) {
        const resolved = resolveImport(file, spec);
        if (resolved) local.add(resolved); else unresolved.add(spec);
      } else external.add(spec);
    }
  }
  return { local: [...local], unresolved: [...unresolved], external: [...external] };
}

for (const id of ids) if (!byId.has(id)) fail('Unknown capability: ' + id);
const reports = [];
for (const id of ids) {
  const manifest = byId.get(id).manifest;
  const seeds = seedsFromManifest(manifest);
  const scanned = new Set();
  const local = new Set();
  const unresolved = new Set();
  const external = new Set();
  const queue = [];
  for (const seed of seeds) queue.push(...walk(seed));
  while (queue.length) {
    const file = queue.shift();
    if (scanned.has(file)) continue;
    scanned.add(file);
    if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(file)) continue;
    const result = scanFile(file);
    for (const item of result.local) { local.add(item); if (!scanned.has(item)) queue.push(item); }
    for (const item of result.unresolved) unresolved.add(file + ' -> ' + item);
    for (const item of result.external) external.add(item);
  }
  const seedMissing = seeds.filter(function (p) { return !exists(p); });
  let evidence = 'manifest-addressable-files';
  if (seedMissing.length === 0 && unresolved.size === 0) evidence = 'local-import-closure';
  if (unresolved.size > 0) evidence = 'partial-local-closure';
  reports.push({ capabilityId: id, manifestPath: manifest, seedPaths: seeds, missingSeedPaths: seedMissing, scannedFiles: [...scanned], resolvedLocalImports: [...local], unresolvedLocalImports: [...unresolved], externalPackageImports: [...external], evidenceLevel: evidence, limitations: ['Static import extraction does not prove runtime, persistence, security, UI-state or host-binding closure.', 'Package aliases and generated/runtime imports may require manual review.', 'Only paths reachable from manifest-addressable source/reference seeds are scanned.'] });
}
const output = { schemaVersion: 1, generatedBy: 'agent-init/trace.mjs', requestedCapabilities: ids, graphRelationshipsUsed: graph.edges.filter(function (e) { return ids.includes(e.from); }), reports: reports };
const outDir = path.join(root, 'verification/reports');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'source-closure-report.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ capabilities: reports.length, evidenceLevels: reports.map(function (x) { return [x.capabilityId, x.evidenceLevel]; }), report: 'verification/reports/source-closure-report.json' }, null, 2));

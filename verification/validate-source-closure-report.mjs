#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'verification/reports/source-closure-report.json');
if (!fs.existsSync(file)) {
  console.error('Missing source closure report: ' + file);
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const required = ['capabilityId', 'manifestPath', 'seedPaths', 'missingSeedPaths', 'scannedFiles', 'resolvedLocalImports', 'unresolvedLocalImports', 'externalPackageImports', 'evidenceLevel', 'limitations'];
if (!Array.isArray(report.reports) || report.reports.length === 0) {
  console.error('Report must contain a non-empty reports array.');
  process.exit(1);
}
const allowed = new Set(['manifest-addressable-files', 'local-import-closure', 'partial-local-closure', 'runtime-closure-reviewed', 'target-verified']);
const errors = [];
for (const item of report.reports) {
  for (const key of required) if (!(key in item)) errors.push(item.capabilityId + ': missing ' + key);
  if (!allowed.has(item.evidenceLevel)) errors.push(item.capabilityId + ': invalid evidence level ' + item.evidenceLevel);
  for (const key of required.slice(2, 8)) if (key in item && !Array.isArray(item[key])) errors.push(item.capabilityId + ': ' + key + ' must be an array');
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Source closure report valid: ' + report.reports.length + ' capability report(s).');

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const pin = readJson('mailflow-source-library/source-pins/current.json');
const tree = readJson('mailflow-source-library/manifests/source-tree-2026-10-14.json');
const dispositions = readJson('mailflow-source-library/manifests/path-dispositions-2026-10-14.json');
const candidates = readJson('mailflow-source-library/manifests/capability-candidates-2026-10-14.json');
const architecture = readJson('mailflow-source-library/manifests/architecture-map-initial.json');

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
};
const assert = (condition, message) => { if (!condition) fail(message); };

assert(pin.source.commit === tree.source_pin.commit, 'pin commit differs from tree manifest');
assert(pin.source.tree === tree.source_pin.tree, 'pin tree differs from tree manifest');
assert(tree.complete === true, 'source tree manifest is not marked complete');
assert(pin.source.tree_truncated === false, 'source pin says the source tree was truncated');
assert(pin.source.entry_count === tree.entries.length, 'source pin entry count differs from manifest');
assert(new Set(tree.entries.map((entry) => entry.path)).size === tree.entries.length, 'duplicate paths in source tree manifest');

const blobs = tree.entries.filter((entry) => entry.type === 'blob');
const blobByPath = new Map(blobs.map((entry) => [entry.path, entry]));
assert(dispositions.files.length === blobs.length, 'disposition register does not cover every blob');
for (const entry of dispositions.files) {
  const source = blobByPath.get(entry.path);
  assert(Boolean(source), `disposition path is absent from source tree: ${entry.path}`);
  if (source) {
    assert(source.sha === entry.sha, `blob SHA mismatch for disposition path: ${entry.path}`);
    assert(source.mode === entry.mode, `mode mismatch for disposition path: ${entry.path}`);
  }
}
for (const area of candidates.areas) {
  for (const candidatePath of area.representative_paths) {
    assert(blobByPath.has(candidatePath), `candidate path is absent from source tree: ${candidatePath}`);
  }
}
for (const capability of architecture.capabilities) {
  for (const item of [...capability.paths, ...capability.tests]) {
    const source = blobByPath.get(item.path);
    assert(Boolean(source), `architecture path is absent from source tree: ${item.path}`);
    if (source) assert(source.sha === item.blob_sha, `architecture blob SHA mismatch: ${item.path}`);
  }
}
assert(architecture.status === 'PRELIMINARY_ARCHITECTURE_MAP', 'architecture map status unexpectedly changed');

if (process.exitCode) {
  console.error('Inventory consistency checks failed.');
} else {
  const unclassified = dispositions.files.filter((entry) => entry.disposition === 'UNCLASSIFIED').length;
  console.log('PASS: inventory manifests are internally consistent.');
  console.log(`Source pin: ${pin.source.commit} / ${pin.source.tree}`);
  console.log(`Tree entries: ${tree.entries.length}; blobs: ${blobs.length}; candidate areas: ${candidates.areas.length}; capabilities: ${architecture.capabilities.length}`);
  console.log(`Explicitly unclassified paths: ${unclassified} (expected during discovery; this is NOT an extraction gate PASS).`);
}

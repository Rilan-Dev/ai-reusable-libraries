# Verification State

## Verified baseline evidence
- GitHub Git Data API resolved main to commit e7a53760a7e4b15e0ee631533655d99dde657599.
- Commit root tree is 27059315bc16155f0064dc136aae94cd5097cb02.
- Recursive tree returned 1462 entries with truncated=false.
- Full path/mode/object-SHA inventory is stored in manifests/source-tree-2026-10-14.json.

## Not yet verified
- Per-path license/provenance.
- Capability/dependency closure.
- Independent reconciliation.
- Immutable source copy and copied blob/tree equality.
- Source watcher end-to-end issue creation.
- Any extraction PASS.

This is baseline identity/inventory evidence only, not full extraction verification.


## Additional artifacts — 2026-10-14
- Preliminary candidate map: manifests/capability-candidates-2026-10-14.json and CAPABILITY_CANDIDATES.md.
- Complete initial per-file disposition register: manifests/path-dispositions-2026-10-14.json; all 1,319 blob entries intentionally remain UNCLASSIFIED / UNREVIEWED / UNMAPPED.
- Change watcher: .github/workflows/mailflow-source-watch.yml authored. No end-to-end workflow run confirmed. Scheduled triggers require this workflow to be merged into the repository default branch; the current work is on extraction/mailflow-source-library.
- No immutable application source copy, path-level license pass, dependency closure pass or extraction PASS.

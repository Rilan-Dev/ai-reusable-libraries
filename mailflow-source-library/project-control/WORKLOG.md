# Worklog — Append-only

## 001 — 2026-10-14 — Initial MailFlow baseline
- Resolved main to commit e7a53760a7e4b15e0ee631533655d99dde657599.
- Captured root tree 27059315bc16155f0064dc136aae94cd5097cb02; recursive response complete with 1462 entries (1319 blobs, 143 directories).
- Saved full path/mode/type/object-SHA/size inventory in manifests/source-tree-2026-10-14.json.
- Inspected README, AGPL license, commercial license, CLA, contributing guidance and CI workflow.
- Identified dual-license notice and CLA; per-path license review remains pending.
- Added user guide, extraction/update prompts and project-control records.
- No application source copied; no extraction PASS claimed.
- Next: full capability discovery, path disposition, dependency closure, license/provenance review and independent reconciliation.


## 002 — 2026-10-14 — Add preliminary capability map and update watcher
- Added a preliminary capability candidate index from the complete source tree and an all-1,319-blob path-disposition register. Every path remains UNCLASSIFIED, license UNREVIEWED and closure UNMAPPED; these are explicit gaps, not a gate pass.
- Added a scheduled/manual GitHub Actions watcher to detect changes to upstream main and create or update a tracking issue with old/new commit/tree pins and a compare URL.
- Added the end-to-end user guide, initial extraction and update-review prompts, and source update playbook.
- The watcher has not been run end-to-end and will not run on schedule until the workflow is present on the repository default branch. Source-side instant dispatch is optional and not configured.
- Application source remains uncopied; no extraction PASS claimed.

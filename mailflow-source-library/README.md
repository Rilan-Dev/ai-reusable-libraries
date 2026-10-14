# MailFlow Source Workstream

This directory contains MailFlow-specific data and evidence managed by the global source extraction framework. Generic prompts, rules, templates, schemas and update workflows are canonical under [source-extraction-agent/](../source-extraction-agent/README.md); do not maintain a parallel MailFlow-specific prompt architecture.

## Current baseline and status

- Upstream: https://github.com/Rilan-Dev/mailflow
- Ref: main
- Proposed discovery commit: `e7a53760a7e4b15e0ee631533655d99dde657599`
- Root tree SHA: `27059315bc16155f0064dc136aae94cd5097cb02`
- Inventory: 1,462 entries, including 1,319 file blobs and 143 directory entries; recursive response complete.
- State: discovery, capability tracing, dependency closure and license review pending.
- No MailFlow application source has been copied. The recorded pin is a proposed initial discovery baseline, not an approved immutable snapshot.
- The path-disposition register currently leaves all 1,319 files unclassified and unreviewed for licensing/provenance.

## Recover and continue

1. Start with the repository-level [source-library state](../project-control/source-library/SOURCE_LIBRARY_STATE.md) and [next action](../project-control/source-library/SOURCE_LIBRARY_NEXT_ACTION.md).
2. Read this source's `project-control/CHAT_CONTINUITY.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, and `VERIFICATION_STATE.md`.
3. Use the canonical `source-extraction-agent` prompts and workflow; never infer permission from the source name or inventory completion.
4. Inspect `source-pins/current.json` and `manifests/source-tree-2026-10-14.json`.
5. Complete behavior/capability tracing, full dependency closure, per-path license/provenance classification and independent reconciliation.
6. Only after the required gate has evidence-backed PASS and the owner explicitly authorizes it, copy selected source byte-for-byte into a versioned immutable snapshot and run the actual verifier.

## Update capture

The generic registry-driven watcher uses `project-control/source-library/SOURCE_LIBRARY_CATALOG.json`. If MailFlow advances, it creates or updates a review issue and points to the global Prompt 11. It does not copy source or advance the pin. Watcher execution remains unverified until manually dispatched and inspected.

## Source-specific files

- `source-pins/current.json`: proposed source identity; copy authorization remains false.
- `manifests/`: source tree, capability candidates, initial architecture and per-path dispositions.
- `project-control/`: MailFlow-specific progress, decisions, blockers, verification and next action.
- `tools/verify-inventory.mjs`: consistency verifier for this inventory.
- `SOURCE_UPDATE_PLAYBOOK.md`: source-specific update notes that defer to the global update-capture workflow.

## License/provenance

MailFlow indicates AGPL-3.0 and a separate commercial licensing path, with a CLA. Review notices, path-level provenance, third-party assets and redistribution rights before any copy or publication. Legal uncertainty is a blocker, not a default permission.

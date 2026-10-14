# MailFlow Source Library

A provenance-first, continuously updateable source library for [Rilan-Dev/mailflow](https://github.com/Rilan-Dev/mailflow), operated with the reusable source-extraction-agent package in this repository.

## Current baseline

- Upstream branch: main
- Pinned commit: e7a53760a7e4b15e0ee631533655d99dde657599
- Root tree SHA: 27059315bc16155f0064dc136aae94cd5097cb02
- Initial inventory: 1462 entries (1319 files, 143 directory entries); recursive tree response was complete.
- Current phase: repository inventory and capability discovery.
- Application source has NOT yet been copied. Inventory capture is not an extraction PASS.

## Start here

1. Read USER_GUIDE.md.
2. Read project-control/CHAT_CONTINUITY.md, CURRENT_PHASE.md, NEXT_ACTION.md and VERIFICATION_STATE.md.
3. Use prompts/INITIAL_EXTRACTION.md with a repository-aware AI agent.
4. Inspect source-pins/current.json and manifests/source-tree-2026-10-14.json.
5. Complete capability discovery, dependency closure, path dispositions, license/provenance review and independent reconciliation.
6. Only after the gate passes, copy selected source byte-for-byte into a versioned immutable snapshot and verify against the pinned Git objects.
7. Use SOURCE_UPDATE_PLAYBOOK.md for every upstream change.

## Continuous update tracking

The workflow at ../.github/workflows/mailflow-source-watch.yml polls upstream main every six hours and supports manual dispatch. When a new commit is found, it opens or updates a tracking issue for AI-assisted impact review. The workflow must be merged to the repository default branch before scheduled runs become active; the workflow has not yet been end-to-end tested.

## Contents

- source-pins/current.json: current approved upstream identity proposal.
- manifests/source-tree-2026-10-14.json: full path, mode, object SHA and size inventory.
- project-control/: durable progress, evidence, decisions, issues, risks and next action.
- tools/verify-inventory.mjs: checks pin/manifest consistency, path coverage and candidate blob identities. Run with node mailflow-source-library/tools/verify-inventory.mjs.
- prompts/: initial extraction, capability discovery, upstream update review and verification.
- SOURCE_UPDATE_PLAYBOOK.md: human-guided and AI-assisted change capture.

## Non-negotiable rules

- Never alter upstream or an immutable captured source file.
- Never move the source pin forward silently.
- Preserve previous snapshots and evidence; append worklogs rather than deleting history.
- Automated change detection triggers AI review, not blind copying or auto-merge.
- Separate MailFlow source from host adapters, examples and generated capability documentation.
- Respect AGPL-3.0, the separate commercial license, CLA, third-party notices, fonts, icons and assets.

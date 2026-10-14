# Source Library Program Worklog

## 2026-10-14 — Global architecture clarification

- User clarified that extraction prompts, rules, agent controls, update-capture process and templates must be globally reusable for any upstream, not designed around MailFlow.
- Established the intended boundary: `source-extraction-agent/` is the canonical shared extraction framework; source workspaces hold source pins, inventories, evidence and source-specific project state.
- Added central source-library program navigation, catalog and roadmap under `project-control/source-library/`.
- Added generic upstream-change review prompt and workflow plus a registry-driven watcher design. Watcher execution and local verifier execution are pending.

## 2026-10-14 — Global framework PR merged

- PR #5: https://github.com/Rilan-Dev/ai-reusable-libraries/pull/5 merged to `main`.
- The global framework and catalog remain maintained here.

## 2026-10-14 — MailFlow workspace ownership clarified

- User requested that MailFlow's extraction, memory, sessions and related documents live in `Rilan-Dev/mailflow`, not as a second working copy in this repository.
- Opened MailFlow PR #1: https://github.com/Rilan-Dev/mailflow/pull/1. It copies the shared framework as a pinned versioned snapshot and migrates MailFlow-specific manifests/project-control/evidence into `extraction/`.
- This repository's MailFlow watcher entry is disabled until the watcher can safely read the pin from the external workspace. No source-copy authorization is implied.
- Next: remove the duplicate MailFlow-specific workstream records here and retain the central catalog entry and generic framework.

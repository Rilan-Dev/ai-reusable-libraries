# Source Library Program Worklog

## 2026-10-14 — Global architecture clarification

- User clarified that extraction prompts, rules, agent controls, update-capture process and templates must be globally reusable for any upstream, not designed around MailFlow.
- Established the intended boundary: `source-extraction-agent/` is the canonical engine; source-specific directories hold only source pins, inventories, evidence, source-specific license notes and workstream state.
- Added central source-library program navigation, catalog and roadmap under this repository's `project-control/source-library/`.
- Imported MailFlow inventory and workstream records onto the global architecture branch without importing its duplicate product-local prompts.
- Added generic upstream-change review prompt and workflow plus a registry-driven watcher design. Watcher execution and local verifier execution are pending.

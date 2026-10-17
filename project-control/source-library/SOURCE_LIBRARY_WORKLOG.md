# Source Library Worklog

## 2026-10-14 — Move MailFlow workstream ownership to source repository

- User requested that MailFlow extraction documents, memories, sessions and all related project-control live in `Rilan-Dev/mailflow`.
- Created migration PR https://github.com/Rilan-Dev/mailflow/pull/3 to vendor the shared `source-extraction-agent/` framework and move source-specific records under `extraction/`.
- Global framework remains canonical here; source-specific evidence should no longer be duplicated here.
- Updated the catalog design to point to MailFlow's source-owned workspace and the actual upstream `https://github.com/maathimself/mailflow`.
- Watcher will remain disabled for MailFlow until the source workspace PR is merged and the pin URL is live on the default branch.
- No upstream application source copied; no extraction PASS. The 1,319 upstream blobs remain unclassified and license/provenance, dependency closure and independent reconciliation are blockers.

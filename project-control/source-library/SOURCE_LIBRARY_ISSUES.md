# Source Library Program Issues

- **GSL-001 — MailFlow workspace migration pending:** MailFlow's extraction framework copy and source-specific records have been proposed in https://github.com/Rilan-Dev/mailflow/pull/1. Duplicate working records are proposed for removal here in https://github.com/Rilan-Dev/ai-reusable-libraries/pull/6. Both PRs remain open and unmerged at the last update.
- **GSL-002 — External pin watcher unsupported:** The current generic workflow expects pin files inside this repository. MailFlow monitoring is disabled until external repository pin retrieval and validation are implemented and tested.
- **GSL-003 — Watcher unverified:** Generalized workflow has not been executed end-to-end; scheduled workflow only activates after merge to the default branch.
- **GSL-004 — MailFlow closure/licensing:** 1,319 paths remain unclassified; AGPL-3.0, separate commercial license and CLA require explicit review.
- **GSL-005 — Other source pins:** Confirm Doable and Clara upstream pins before turning on automated monitoring for them.
